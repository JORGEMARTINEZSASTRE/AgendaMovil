'use strict';

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const { corsOrigin, isProd } = require('./config/env');

const authRoutes     = require('./routes/auth.routes');
const turnosRoutes   = require('./routes/turnos.routes');
const serviciosRoutes= require('./routes/servicios.routes');
const adminRoutes    = require('./routes/admin.routes');
const configRoutes   = require('./routes/config.routes');
const publicaRoutes   = require('./routes/publica.routes'); 
const seniaRoutes = require('./routes/senia.routes');
const waRoutes = require('./routes/wa.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');

const app = express();

// ─── SEGURIDAD BÁSICA ────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false
}));
app.set('trust proxy', 1);

// ─── CORS ────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
  if (!origin) return cb(null, true); // permite Postman, mobile, etc.
  if (origin === corsOrigin) return cb(null, true);
  cb(new Error('No permitido por CORS'));
},
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ─── BODY PARSING ────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ─── RUTAS ───────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/turnos',    turnosRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/config',    configRoutes);
app.use('/api/publica',   publicaRoutes);
app.use('/api/senia', seniaRoutes);
app.use('/api/wa', waRoutes);
app.use('/api/whatsapp', whatsappRoutes);



// ─── HEALTH CHECK ────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'DEPIMÓVIL PRO API', ts: new Date().toISOString() });
});
// ─── TEST RECORDATORIO (TEMPORAL, borrar después) ──────────
const { testRecordatorioManual } = require('../../recordatorios');

app.post('/api/test-recordatorio/:turnoId', async (req, res) => {
  const { turnoId } = req.params;
  const { tipo = '2h' } = req.body || {};

  const resultado = await testRecordatorioManual(turnoId, tipo);
  res.json(resultado);
});

// ─── STATIC FRONTEND ─────────────────────────────
const path = require('path');
const fs = require('fs');

const frontendPath = path.join(__dirname, '../public');
console.log('[STATIC] path:', frontendPath);
console.log('[STATIC] existe?', fs.existsSync(frontendPath));
console.log('[STATIC] archivos:', fs.existsSync(frontendPath) ? fs.readdirSync(frontendPath) : 'N/A');

app.use(express.static(frontendPath));
// Redirigir raíz al login
app.get('/', (_req, res) => {
  res.redirect('/login.html');
});

// ─── 404 ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});
// ─── ERROR GLOBAL ────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  if (err.message === 'No permitido por CORS') {
    return res.status(403).json({ ok: false, error: 'Origen no permitido' });
  }
  res.status(500).json({
    ok: false,
    error: isProd ? 'Error interno del servidor' : err.message
  });
});



module.exports = app;