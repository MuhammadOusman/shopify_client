const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

router.post('/orders-paid', async (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const body = req.rawBody;
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8', 'hex')
    .digest('base64');

  if (hash === hmac) {
    const order = req.body;
    const shop = req.get('X-Shopify-Shop-Domain');

    const { rows } = await db.query('SELECT * FROM "shops" WHERE shop = $1', [shop]);
    if (rows.length > 0) {
      const shopData = rows[0];
      const fee = parseFloat(order.total_price) * (parseFloat(shopData.commission_rate) / 100);
      const newBalance = parseFloat(shopData.pending_balance) + fee;

      await db.query('UPDATE "shops" SET pending_balance = $1, currency = $2 WHERE shop = $3', [newBalance, order.currency, shop]);

      const orderData = {
        shop_id: shopData.id,
        order_id: order.id,
        total_price: order.total_price,
        fee: fee,
      };
      const query = `
        INSERT INTO "processed_orders" (shop_id, order_id, total_price, fee)
        VALUES ($1, $2, $3, $4);
      `;
      await db.query(query, [orderData.shop_id, orderData.order_id, orderData.total_price, orderData.fee]);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});

module.exports = router;
