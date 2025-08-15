const cron = require('node-cron');
const axios = require('axios');
const db = require('../db');
const shopify = require('./shopify');

// Schedule a job to run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily job to process pending balances...');
  const { rows } = await db.query('SELECT * FROM "shops" WHERE "subscription_line_item_id" IS NOT NULL');

  for (const shop of rows) {
    try {
      const today = new Date();
      const billingCycleStartDate = new Date(shop.billing_cycle_start_date);
      const daysSinceBillingStart = Math.floor((today - billingCycleStartDate) / (1000 * 60 * 60 * 24));

      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
      const rates = response.data.rates;
      const targetAmount = 250;
      const shopCurrency = shop.currency || 'USD';
      const rate = rates[shopCurrency] || 1;
      const threshold = targetAmount * rate;

      if (parseFloat(shop.pending_balance) >= threshold || (daysSinceBillingStart >= 29 && parseFloat(shop.pending_balance) > 0)) {
        const session = await shopify.config.sessionStorage.loadSession(shopify.session.getOfflineId(shop.shop));
        if (session) {
          const client = new shopify.clients.Graphql({ session });
          await client.query({
            data: `
              mutation {
                appUsageRecordCreate(
                  subscriptionLineItemId: "${shop.subscription_line_item_id}"
                  description: "Processor Fee - accumulated charges"
                  price: { amount: ${shop.pending_balance}, currencyCode: ${shopCurrency} }
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
          await db.query('UPDATE "shops" SET pending_balance = 0, billing_cycle_start_date = NOW() WHERE shop = $1', [shop.shop]);
        }
      }
    } catch (error) {
      console.error(`Failed to process pending balance for ${shop.shop}:`, error);
    }
  }
});
