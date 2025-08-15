require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter username: ', (username) => {
  rl.question('Enter password: ', async (password) => {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const query = `
      INSERT INTO "processors" (username, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (username) DO UPDATE SET
        password_hash = $2;
    `;

    await db.query(query, [username, passwordHash]);
    console.log(`Processor '${username}' created/updated successfully.`);
    rl.close();
    process.exit();
  });
});
