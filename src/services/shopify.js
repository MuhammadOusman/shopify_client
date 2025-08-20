const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const PGSessionStorage = require('./pgSessionStorage');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_orders', 'write_own_subscription_contracts', 'read_own_subscription_contracts'],
  hostName: process.env.HOST.replace(/https?:\/\//, ""),
  apiVersion: '2024-04',
  isEmbeddedApp: true,
  sessionStorage: new PGSessionStorage(),
  future: {
    v3_oauth_cookie_secure: true,
  },
});

module.exports = shopify;
