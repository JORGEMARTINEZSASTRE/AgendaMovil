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

// El servidor de Postgres corre en UTC, pero fecha/hora de los turnos se
// cargan y se piensan en hora de Uruguay. Sin esto, cualquier comparación
// contra NOW() (recordatorios, avisos de regreso, avisos de cobro) queda
// desfasada por el huso horario completo (UTC-3): el sistema termina
// mandando el aviso de "2 horas" cuando en realidad faltan 5.
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Montevideo'").catch((err) => {
    console.error('❌ No se pudo fijar el huso horario de la conexión:', err.message);
  });
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