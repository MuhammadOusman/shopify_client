require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pg = require('pg');
const pgSession = require('connect-pg-simple')(session);
const shopify = require('./services/shopify');
const cookieParser = require('cookie-parser'); // Add cookie-parser
const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET)); // Use cookie-parser with your session secret

// This is required to run in an iframe, which is how embedded Shopify apps work
app.set('trust proxy', 1);

const pgPool = new pg.Pool({
  connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
});

app.use(session({
  store: new pgSession({
    pool: pgPool,
    tableName: 'user_sessions', // It's good practice to use a different table for user sessions
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // Must be true for sameSite: 'none'
    sameSite: 'none', // Required for cross-site cookies in embedded apps
    httpOnly: true,
  },
}));

const authRouter = require('./routes/auth');
const processorRouter = require('./routes/processor');
const webhooksRouter = require('./routes/webhooks');
require('./services/cron');

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

app.use('/', authRouter);
app.use('/processor', processorRouter);
app.use('/webhooks', webhooksRouter);

app.get('/', (req, res) => {
  // If the shop parameter is present, redirect to the auth route to begin OAuth
  if (req.query.shop) {
    res.redirect(`/auth?shop=${req.query.shop}&host=${req.query.host}`);
    return;
  }
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
