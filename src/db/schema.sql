CREATE TABLE "shops" (
  "id" SERIAL PRIMARY KEY,
  "shop" VARCHAR(255) NOT NULL UNIQUE,
  "access_token" VARCHAR(255) NOT NULL,
  "subscription_line_item_id" VARCHAR(255),
  "commission_rate" DECIMAL(5, 2) DEFAULT 2.00,
  "pending_balance" DECIMAL(10, 2) DEFAULT 0.00,
  "currency" VARCHAR(10),
  "billing_cycle_start_date" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "sessions" (
  "id" VARCHAR(255) PRIMARY KEY,
  "shop" VARCHAR(255) NOT NULL,
  "state" VARCHAR(255) NOT NULL,
  "isOnline" BOOLEAN DEFAULT false,
  "scope" VARCHAR(255),
  "expires" TIMESTAMPTZ,
  "accessToken" VARCHAR(255),
  "userId" BIGINT
);

CREATE TABLE "processors" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(255) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255) NOT NULL
);

CREATE TABLE "processed_orders" (
  "id" SERIAL PRIMARY KEY,
  "shop_id" INTEGER NOT NULL REFERENCES "shops"("id"),
  "order_id" BIGINT NOT NULL,
  "total_price" DECIMAL(10, 2) NOT NULL,
  "fee" DECIMAL(10, 2) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "user_sessions" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
