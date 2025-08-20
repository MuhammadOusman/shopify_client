const express = require('express');
const router = express.Router();
const shopify = require('../services/shopify');

router.get('/auth', async (req, res) => {
  console.log('--- /auth route hit ---');
  console.log('Request Query:', req.query);
  console.log('Request Headers (Cookie):', req.headers.cookie);
  try {
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(req.query.shop, true),
      callbackPath: '/auth/callback',
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

router.get('/auth/callback', async (req, res) => {
  console.log('--- /auth/callback route hit ---');
  console.log('Request Query:', req.query);
  console.log('Request Headers (Cookie):', req.headers.cookie);
  console.log('Parsed Cookies (req.cookies):', req.cookies);

  // If charge_id is present, it means the user is returning from subscription approval
  if (req.query.charge_id) {
    console.log('Redirecting to login after subscription approval.');
    req.session.shop = req.query.shop; // Ensure shop is in session for login redirect
    return res.redirect('/processor/login');
  }

  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
      cookies: req.cookies, // Explicitly pass parsed cookies
    });

    const { session } = callback;

    // Save the session and shop data
    await shopify.config.sessionStorage.storeSession(session);
    
    const shopData = {
      shop: session.shop,
      access_token: session.accessToken,
    };

    const db = require('../db');
    const client = new shopify.clients.Graphql({ session }); // Declare client once

    const shopResponse = await client.query({
      data: `{ shop { currencyCode } }`
    });
    const shopCurrencyCode = shopResponse.body.data.shop.currencyCode;

    const query = `
      INSERT INTO "shops" (shop, access_token, currency)
      VALUES ($1, $2, $3)
      ON CONFLICT (shop) DO UPDATE SET
        access_token = $2,
        currency = $3;
    `;
    await db.query(query, [shopData.shop, shopData.access_token, shopCurrencyCode]);

    // Create recurring application charge
    const response = await client.query({ // Reuse client
      data: `
        mutation {
          appSubscriptionCreate(
            name: "Processor Fee Plan"
            lineItems: [
              {
                plan: {
                  appUsagePricingDetails: {
                    terms: "0.5 – 4 % per order, billed in USD 250 blocks"
                    cappedAmount: { amount: 1000000, currencyCode: USD }
                  }
                }
              }
            ]
            returnUrl: "${process.env.HOST}/auth/callback?shop=${session.shop}"
            test: true
          ) {
            userErrors {
              field
              message
            }
            confirmationUrl
            appSubscription {
              id
              lineItems {
                id
              }
            }
          }
        }
      `,
    });

    if (response.body.data.appSubscriptionCreate.userErrors.length > 0) {
      console.error(response.body.data.appSubscriptionCreate.userErrors);
      return res.status(400).send('Error creating subscription');
    }

    const confirmationUrl = response.body.data.appSubscriptionCreate.confirmationUrl;
    const subscriptionLineItemId = response.body.data.appSubscriptionCreate.appSubscription.lineItems[0].id;
    const updateQuery = 'UPDATE "shops" SET subscription_line_item_id = $1, billing_cycle_start_date = NOW() WHERE shop = $2';
    await db.query(updateQuery, [subscriptionLineItemId, session.shop]);

    // Manually register the ORDERS_PAID webhook
    const webhookCallbackUrl = `${process.env.HOST}/webhooks/orders-paid`;
    const webhookMutation = `
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          userErrors {
            field
            message
          }
          webhookSubscription {
            id
          }
        }
      }
    `;

    const webhookResponse = await client.query({
      data: {
        query: webhookMutation,
        variables: {
          topic: "ORDERS_PAID",
          webhookSubscription: {
            callbackUrl: webhookCallbackUrl,
            format: "JSON"
          }
        }
      }
    });

    if (webhookResponse.body.data.webhookSubscriptionCreate.userErrors.length > 0) {
      console.error('Failed to register ORDERS_PAID webhook:', webhookResponse.body.data.webhookSubscriptionCreate.userErrors);
    } else {
      console.log('Successfully registered ORDERS_PAID webhook!');
    }

    req.session.shop = session.shop;

    // Redirect to the confirmation URL
    return res.redirect(confirmationUrl);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

module.exports = router;
