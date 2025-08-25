
// server.js
const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'bd.env') });

// server.js
const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('./middlewares/logger');
const handleMessage = require('./controllers/whatsappController');
const pool = require('./db');
const { getAuthUrl, saveCode } = require('./services/googleCalendar');

const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

console.log('ENV check ->',
  'ID?', !!process.env.GOOGLE_CLIENT_ID,
  'SECRET?', !!process.env.GOOGLE_CLIENT_SECRET,
  'CB?', process.env.GOOGLE_CALLBACK_URL
);

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// Sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_session_key',
  resave: false,
  saveUninitialized: false,
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Serialize/Deserialize
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, empresa_id, rol_id, activo FROM usuarios WHERE id = $1',
      [id]
    );
    done(null, rows[0] || null);
  } catch (e) {
    done(e);
  }
});

// Strategy Google
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
    // Local: http://localhost:3000/api/auth/google/callback
    // Prod : https://botenginecorp.com/api/auth/google/callback
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const nombre = profile.displayName || 'Usuario Google';
      if (!email) return done(new Error('No email in Google profile'));

      let result = await pool.query(
        `SELECT id, nombre, email, password_hash, empresa_id, rol_id, activo, created_at
         FROM usuarios WHERE email = $1`, [email]
      );

      let user = result.rows[0];
      if (!user) {
        const ins = await pool.query(
          `INSERT INTO usuarios (nombre, email, activo, created_at)
           VALUES ($1, $2, $3, NOW())
           RETURNING id, nombre, email, password_hash, empresa_id, rol_id, activo, created_at`, // para aceptar datos null ejecutar esto en postgres ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;
          [nombre, email, true]                                                                 // validar el estado en blanco con el comando \d usuarios
        );
        user = ins.rows[0];
      }
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

// ⚠️ Quité las rutas /api/auth/google aquí para evitar duplicados.
// Se usan las de routes/authRoutes.js
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./controllers/chatController');
const chatRoutesApi = require('./routes/chatRoutes');
const citasRoutes = require('./routes/citas');

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/bot', chatRoutesApi);
app.use('/api/citas', citasRoutes);

// Frontend estático (ajusta ruta si tu frontend está en otro lado)
app.use(express.static(path.join(__dirname, '../frontend')));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// WhatsApp
let empresaActual = null;
let lastQr = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});
// ENDPOINTS de autorización Google OAuth (una sola vez para guardar tokens)
app.get('/api/google/authurl', (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (e) {
    console.error('[OAuth] getAuthUrl error:', e); // <-- verás el detalle en consola
    res.status(500).json({ error: e.message || 'No se pudo generar URL de autorización' });
  }
});

app.get('/api/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Falta code');
    const { saveCode } = require('./services/googleCalendar');
    await saveCode(code);
    res.send('✅ Autorizado. Ya puedes cerrar esta pestaña.');
  } catch (e) {
    res.status(500).send('Error guardando tokens: ' + e.message);
  }
});

// Fallback por si no hay registro en BD
const EMPRESA_DEFECTO = 'HEAVEN_LASHES';


// --- Asocia número del bot a empresa ---
async function obtenerEmpresaPorNumeroBot(numero) {

  try {
    const result = await pool.query(
      'SELECT empresa FROM bots_registrados WHERE numero = $1',
      [numero]
    );
    return result.rows.length > 0 ? result.rows[0].empresa : null;
  } catch (err) {
    logger.error(`Error consultando empresa por número: ${err.message}`);
    return null;
  }

}

// --- Evento: QR generado ---
client.on('qr', (qr) => {
  lastQr = qr;
  logger.info('🔳 Código QR generado');
});

// Logs útiles
client.on('authenticated', () => logger.info('✅ Autenticado en WhatsApp'));
client.on('auth_failure', (m) => logger.error(`❌ Fallo de autenticación: ${m}`));
client.on('disconnected', (r) => logger.warn(`⚠️ Desconectado: ${r}`));


client.on('ready', async () => {
  const botNumero = client.info?.wid?.user;
  logger.info(`🤖 Bot conectado con número: ${botNumero}`);

  const desdeBD = await obtenerEmpresaPorNumeroBot(botNumero);
  empresaActual = desdeBD || EMPRESA_DEFECTO; // fallback sólido
  logger.info(`🏢 Empresa activa: ${empresaActual}`);

  lastQr = null;
});

client.on('message', async (message) => {
  try {
    const empresaParaMensaje = empresaActual || EMPRESA_DEFECTO; // defensivo
    await handleMessage(client, message, empresaParaMensaje);
  } catch (error) {
    logger.error(`❌ Error en el controlador: ${error.message}`);
  }
});

client.initialize();

app.get('/api/whatsapp/qrimg', async (req, res) => {

  if (lastQr) {
    try {
      const dataUrl = await QRCode.toDataURL(lastQr);
      res.json({ qr: dataUrl });
    } catch (e) {
      res.status(500).json({ error: 'Error generando QR' });
    }
  } else {
    res.status(404).json({ error: 'No QR disponible' });
  }
});

// Depuración: consultar/cambiar empresa activa
app.get('/api/empresa', (req, res) => {
  res.json({ empresaActual: empresaActual || EMPRESA_DEFECTO });
});
app.post('/api/empresa', (req, res) => {
  const { empresa } = req.body || {};
  if (!empresa) return res.status(400).json({ error: 'Falta campo empresa' });
  empresaActual = empresa;
  logger.info(`🏢 Empresa cambiada manualmente a: ${empresaActual}`);
  res.json({ ok: true, empresaActual });
});

// --- API REST (auth, chat, citas) ---
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./controllers/chatController');
const chatRoutesApi = require('./routes/chatRoutes');
const citasRoutes = require('./routes/citas');

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/bot', chatRoutesApi);
app.use('/api/citas', citasRoutes);

// --- GET citas calendario ---
app.get('/api/citas', async (req, res) => {
  try {
    const dataUrl = await QRCode.toDataURL(lastQr);
    res.json({ qr: dataUrl });
  } catch {
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// Depuración: consultar/cambiar empresa activa
app.get('/api/empresa', (req, res) => {
  res.json({ empresaActual: empresaActual || EMPRESA_DEFECTO });
});
app.post('/api/empresa', (req, res) => {
  const { empresa } = req.body || {};
  if (!empresa) return res.status(400).json({ error: 'Falta campo empresa' });
  empresaActual = empresa;
  logger.info(`🏢 Empresa cambiada manualmente a: ${empresaActual}`);
  res.json({ ok: true, empresaActual });
});

// Depuración: consultar/cambiar empresa activa
app.get('/api/empresa', (req, res) => {
  res.json({ empresaActual: empresaActual || EMPRESA_DEFECTO });
});
app.post('/api/empresa', (req, res) => {
  const { empresa } = req.body || {};
  if (!empresa) return res.status(400).json({ error: 'Falta campo empresa' });
  empresaActual = empresa;
  logger.info(`🏢 Empresa cambiada manualmente a: ${empresaActual}`);
  res.json({ ok: true, empresaActual });
});

// Healthcheck (evita chocar con el handler de SPA)
app.get('/health', (req, res) => res.send('OK'));

pool.connect()
  .then(() => logger.info('Conexion a PostgreSQL exitosa'))
  .catch((err) => logger.error('Error al conectar con PostgreSQL', err));

app.listen(port, () => {
  logger.info(`Servidor escuchando en http://localhost:${port}`);
});
