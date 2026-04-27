'use strict';

const required = [
  'DB_HOST','DB_NAME','DB_USER',
  'DB_PASSWORD','JWT_SECRET','CORS_ORIGIN'
];

const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('❌ Variables de entorno faltantes:', missing.join(', '));
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET debe tener al menos 32 caracteres');
  process.exit(1);
}

module.exports = {
  port:         parseInt(process.env.PORT) || 3001,
  nodeEnv:      process.env.NODE_ENV || 'development',
  jwtSecret:    process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin:   process.env.CORS_ORIGIN,
  isProd:       process.env.NODE_ENV === 'production',
};