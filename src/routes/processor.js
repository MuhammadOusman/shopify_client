const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const shopify = require('../services/shopify');

const authMiddleware = (req, res, next) => {
  if (req.session.processorAuthed) {
    next();
  } else {
    res.redirect('/processor/login');
  }
};

router.get('/settings', authMiddleware, async (req, res) => {
  const shop = req.session.shop;
  const { rows } = await db.query('SELECT * FROM "shops" WHERE shop = $1', [shop]);
  if (rows.length === 0) {
    return res.status(404).send('Shop not found');
  }
  const shopData = rows[0];

  const usageCharges = parseFloat(shopData.pending_balance || 0);

  const processedOrdersResult = await db.query(
    'SELECT * FROM "processed_orders" WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 30',
    [shopData.id]
  );
  const processedOrders = processedOrdersResult.rows.map(order => ({
    ...order,
    total_price: parseFloat(order.total_price),
    fee: parseFloat(order.fee),
  }));

  res.render('settings', {
    commissionRate: parseFloat(shopData.commission_rate),
    usageCharges,
    processedOrders,
  });
});

router.post('/settings', authMiddleware, async (req, res) => {
  const { commissionRate } = req.body;
  const shop = req.session.shop;
  await db.query('UPDATE "shops" SET commission_rate = $1 WHERE shop = $2', [commissionRate, shop]);
  res.redirect('/processor/settings');
});

router.post('/reconnect', authMiddleware, (req, res) => {
  // This should redirect to the OAuth flow
  res.redirect(`/auth?shop=${req.session.shop}`);
});

router.post('/trigger-billing', authMiddleware, async (req, res) => {
  const shop = req.session.shop;
  const { rows } = await db.query('SELECT * FROM "shops" WHERE shop = $1', [shop]);
  if (rows.length === 0) {
    return res.status(404).send('Shop not found');
  }
  const shopData = rows[0];

  try {
    const session = await shopify.config.sessionStorage.loadSession(shopify.session.getOfflineId(shopData.shop));
    console.log('Session loaded for billing trigger:', session ? 'Found' : 'Not Found');
    console.log('Shop pending_balance for billing trigger:', shopData.pending_balance); // Added log
    if (!shopData.subscription_line_item_id) {
      console.error('No subscription line item ID found for shop:', shopData.shop);
      return res.status(400).send('No subscription line item ID found. Please reinstall the app.');
    }
    if (session && parseFloat(shopData.pending_balance) > 0) {
      const client = new shopify.clients.Graphql({ session });
      const response = await client.query({
        data: `
          mutation {
            appUsageRecordCreate(
              subscriptionLineItemId: "${shopData.subscription_line_item_id}"
              description: "Processor Fee - manual trigger"
              price: { amount: ${shopData.pending_balance}, currencyCode: ${shopData.currency} }
            ) {
              userErrors {
                field
                message
              }
              appUsageRecord {
                id
              }
            }
          }
        `,
      });

      if (response.body.data.appUsageRecordCreate.userErrors && response.body.data.appUsageRecordCreate.userErrors.length > 0) {
        const errorMessage = response.body.data.appUsageRecordCreate.userErrors.map(e => e.message).join(', ');
        console.error('Error creating usage record:', errorMessage);
        return res.status(400).send(`Error creating usage record: ${errorMessage}`);
      }

      await db.query('UPDATE "shops" SET pending_balance = 0, billing_cycle_start_date = NOW() WHERE shop = $1', [shopData.shop]);
      console.log(`Successfully posted usage record for ${shopData.shop}. Pending balance reset.`);
    } else {
      console.log(`No pending balance to process or session not found for ${shopData.shop}.`);
    }
  } catch (error) {
    console.error(`Failed to process pending balance for ${shopData.shop}:`, error.message || error);
    return res.status(500).send(`Failed to process pending balance: ${error.message || 'Unknown error'}`);
  }

  res.redirect('/processor/settings');
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await db.query('SELECT * FROM "processors" WHERE username = $1', [username]);

  if (rows.length === 0) {
    return res.status(401).send('Invalid username or password');
  }

  const processor = rows[0];
  const isValid = await bcrypt.compare(password, processor.password_hash);

  if (!isValid) {
    return res.status(401).send('Invalid username or password');
  }

  req.session.processorAuthed = true;
  res.redirect('/processor/settings');
});

module.exports = router;
