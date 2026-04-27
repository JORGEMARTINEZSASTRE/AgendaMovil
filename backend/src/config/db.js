'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      20,
  idleTimeoutMillis:      30000,
connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('❌ Error crítico en pool PostgreSQL:', err.message);
  process.exit(1);
});

async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[DB ERROR]', err.message);
    throw err;
  }
}

async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };