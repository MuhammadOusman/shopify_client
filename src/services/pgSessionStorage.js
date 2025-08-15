const db = require('../db');

class PGSessionStorage {
  async storeSession(session) {
    const { id, shop, state, isOnline, scope, expires, accessToken, userId } = session;
    const query = `
      INSERT INTO "sessions" (id, shop, state, "isOnline", scope, expires, "accessToken", "userId")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        shop = $2,
        state = $3,
        "isOnline" = $4,
        scope = $5,
        expires = $6,
        "accessToken" = $7,
        "userId" = $8;
    `;
    await db.query(query, [id, shop, state, isOnline, scope, expires, accessToken, userId]);
    return true;
  }

  async loadSession(id) {
    const { rows } = await db.query('SELECT * FROM "sessions" WHERE id = $1', [id]);
    if (rows.length === 0) {
      return undefined;
    }
    const session = rows[0];
    // Manually construct the session object to match what shopify-api-js expects
    const result = {
        id: session.id,
        shop: session.shop,
        state: session.state,
        isOnline: session.isOnline,
        scope: session.scope,
        accessToken: session.accessToken,
        userId: session.userId,
    };
    if(session.expires) {
        result.expires = new Date(session.expires);
    }
    return result;
  }

  async deleteSession(id) {
    await db.query('DELETE FROM "sessions" WHERE id = $1', [id]);
    return true;
  }
}

module.exports = PGSessionStorage;
