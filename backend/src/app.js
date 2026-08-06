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
const sucursalesRoutes = require('./routes/sucursales.routes');
const fichasRoutes = require('./routes/fichas.routes');
const clientesRoutes = require('./routes/clientes.routes');
const profesionalesRoutes = require('./routes/profesionales.routes');


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
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/fichas', fichasRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/profesionales', profesionalesRoutes);
app.use('/api/cuponeras',     require('./routes/cuponeras.routes'));



// ─── HEALTH CHECK ────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, servicio: 'DEPIMÓVIL PRO API', ts: new Date().toISOString() });
});
// ─── TEST RECORDATORIO (TEMPORAL, borrar después) ──────────
const { testRecordatorioManual } = require('../recordatorios');

app.post('/api/test-recordatorio/:turnoId', async (req, res) => {
  const { turnoId } = req.params;
  const { tipo = '2h' } = req.body || {};

  const resultado = await testRecordatorioManual(turnoId, tipo);
  res.json(resultado);
});

/// ─── STATIC FRONTEND ─────────────────────────────
const path = require('path');
const fs = require('fs');

const frontendPath = path.join(__dirname, '../public');
console.log('[STATIC] path:', frontendPath);
console.log('[STATIC] existe?', fs.existsSync(frontendPath));
console.log('[STATIC] archivos:', fs.existsSync(frontendPath) ? fs.readdirSync(frontendPath) : 'N/A');

// ─── VITRINA PÚBLICA ─────────────────────────────
// Va ANTES de express.static para poder inyectar los metadatos Open
// Graph de cada negocio: así, al compartir el link por WhatsApp o
// Instagram, se ve el logo y el nombre de la operadora en vez de un
// texto genérico. Un HTML estático no puede hacer eso.
//
// Si algo falla, se sirve el archivo tal cual: la vitrina se ve igual,
// solo pierde la previsualización linda. Nunca deja de funcionar.
app.get(['/vitrina', '/vitrina.html'], async (req, res) => {
  const archivo = path.join(frontendPath, 'vitrina.html');

  const escaparAtributo = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

  try {
    const userId = String(req.query.u || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return res.sendFile(archivo);
    }

    const { query } = require('./config/db');
    const { rows } = await query(
      `SELECT nombre, nombre_negocio, logo_url
         FROM usuarios
        WHERE id = $1 AND activo = true AND rol = 'cliente'`,
      [userId]
    );
    if (!rows.length) return res.sendFile(archivo);

    const negocio     = rows[0];
    const nombre      = escaparAtributo(negocio.nombre_negocio || negocio.nombre);
    const descripcion = escaparAtributo(`Mirá los servicios de ${negocio.nombre_negocio || negocio.nombre} y reservá tu turno.`);
    const urlAbsoluta = escaparAtributo(`${req.protocol}://${req.get('host')}/vitrina.html?u=${userId}`);

    let html = fs.readFileSync(archivo, 'utf8')
      .replace('<title>Mis servicios</title>', `<title>${nombre}</title>`)
      .replace('content="Mis servicios"', `content="${nombre}"`)
      .replace('content="Mirá los servicios y reservá tu turno."', `content="${descripcion}"`)
      .replace('<meta property="og:type" content="website">',
        `<meta property="og:type" content="website">\n  <meta property="og:url" content="${urlAbsoluta}">` +
        (negocio.logo_url ? `\n  <meta property="og:image" content="${escaparAtributo(negocio.logo_url)}">` : ''));

    return res.type('html').send(html);
  } catch (err) {
    console.error('[VITRINA] no se pudo personalizar:', err.message);
    return res.sendFile(archivo);
  }
});

app.use(express.static(frontendPath));
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