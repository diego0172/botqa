'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'bd.env') });

// -------------------- Imports --------------------
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const logger = require('./middlewares/logger');
const handleMessage = require('./controllers/whatsappController');
const pool = require('./db');

// -------------------- Servicios opcionales --------------------
let calendarService = {};
try {
  calendarService = require('./services/googleCalendar'); // opcional
} catch (e) {
  console.warn('googleCalendar service not found (optional):', e.message);
}

// -------------------- Google OAuth config --------------------
function loadGoogleClientConfig() {
  const cfg = {
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uris: [process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'],
  };
  try {
    const clientJson = require('./config/google-oauth-client.json');
    const fromFile = clientJson.installed || clientJson.web || {};
    cfg.client_id = cfg.client_id || fromFile.client_id || '';
    cfg.client_secret = cfg.client_secret || fromFile.client_secret || '';
    if (fromFile.redirect_uris?.length && !process.env.GOOGLE_CALLBACK_URL) {
      cfg.redirect_uris = fromFile.redirect_uris;
    }
  } catch {
    // archivo opcional
  }
  return cfg;
}

const googleClient = loadGoogleClientConfig();
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || googleClient.redirect_uris[0];

// -------------------- App --------------------
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(logger);

// -------------------- Session & Passport --------------------
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_session_key',
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id || user));
passport.deserializeUser(async (id, done) => {
  try {
    const r = await pool.query('SELECT id, nombre, email FROM usuarios WHERE id = $1', [id]);
    done(null, r.rows[0] || { id });
  } catch (err) {
    done(err);
  }
});

passport.use('google', new GoogleStrategy(
  {
    clientID: googleClient.client_id,
    clientSecret: googleClient.client_secret,
    callbackURL: GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || null;
      const nombre = profile.displayName || 'Usuario';

      // Upsert usuario
      let result = await pool.query(
        'SELECT id, nombre, email, activo FROM usuarios WHERE email = $1',
        [email]
      );

      let user = result.rows[0];
      if (!user) {
        const ins = await pool.query(
          `INSERT INTO usuarios (nombre, email, activo, created_at)
           VALUES ($1, $2, $3, NOW())
           RETURNING id, nombre, email, activo`,
          [nombre, email, true]
        );
        user = ins.rows[0];
      }

      // Guarda tokens si el servicio está disponible
      if (calendarService.saveTokens) {
        await calendarService.saveTokens(user.id, { accessToken, refreshToken });
      }

      return done(null, user);
    } catch (err) {
      console.error('OAuth verification error:', err);
      return done(err);
    }
  }
));

// -------------------- Rutas básicas --------------------
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Auth (usa router si existe; si no, fallback mínimo)
let authRoutes;
try {
  authRoutes = require('./routes/authRoutes');
} catch (e) {
  console.warn('routes/authRoutes not found (optional):', e.message);
}
if (authRoutes) {
  app.use('/api/auth', authRoutes);
} else {
  app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/auth/google' }),
    (req, res) => res.send('Authenticated')
  );
}

// -------------------- WhatsApp --------------------
let lastQr = null;
let empresaActual = 'HEAVEN_LASHES';

const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

waClient.on('qr', async (qr) => {
  try {
    lastQr = await QRCode.toDataURL(qr);
    console.log('QR actualizado para WhatsApp');
  } catch (e) {
    console.error('Error generando QR:', e);
  }
});

waClient.on('authenticated', () => logger.info('✅ Autenticado en WhatsApp'));
waClient.on('auth_failure', (m) => logger.error(`❌ Fallo de autenticación: ${m}`));
waClient.on('disconnected', (r) => logger.warn(`⚠️ Desconectado: ${r}`));

async function obtenerEmpresaPorNumeroBot(numero) {
  try {
    const result = await pool.query(
      'SELECT empresa FROM bots_registrados WHERE numero = $1',
      [numero]
    );
    return result.rows[0]?.empresa || null;
  } catch (err) {
    logger.error(`Error consultando empresa por número: ${err.message}`);
    return null;
  }
}

waClient.on('ready', async () => {
  console.log('WhatsApp client READY.');
  const botNumero = waClient.info?.wid?.user;
  logger.info(`🤖 Bot conectado con número: ${botNumero}`);

  const desdeBD = await obtenerEmpresaPorNumeroBot(botNumero);
  if (desdeBD) empresaActual = desdeBD;
  logger.info(`🏢 Empresa activa: ${empresaActual}`);

  lastQr = null; // una vez listo, ya no necesitamos el QR
});

waClient.on('message_create', (msg) => {
  try {
    handleMessage(waClient, msg);
  } catch (e) {
    console.error('Error en handleMessage:', e);
  }
});

waClient.initialize();

// -------------------- Endpoints utilitarios --------------------
app.get('/api/whatsapp/qrimg', async (_req, res) => {
  if (!lastQr) return res.status(404).json({ error: 'No QR disponible' });
  try {
    // lastQr ya es un dataURL; si lo quisieras regenerar desde texto, usa QRCode.toDataURL
    res.json({ qr: lastQr });
  } catch {
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// Consultar/cambiar empresa activa
app.get('/api/empresa', (_req, res) => res.json({ empresaActual }));
app.post('/api/empresa', (req, res) => {
  const { empresa } = req.body || {};
  if (!empresa) return res.status(400).json({ error: 'Falta campo empresa' });
  empresaActual = empresa;
  logger.info(`🏢 Empresa cambiada manualmente a: ${empresaActual}`);
  res.json({ ok: true, empresaActual });
});

// -------------------- API REST (chat, bot, citas) --------------------
const chatRoutes = require('./controllers/chatController');
const chatRoutesApi = require('./routes/chatRoutes');
const citasRoutes = require('./routes/citas');

app.use('/api/chat', chatRoutes);
app.use('/api/bot', chatRoutesApi);
app.use('/api/citas', citasRoutes);

// -------------------- Server start --------------------
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor escuchando en puerto ${port}`);
  console.log('ENV check ->', {
    ID: !!googleClient.client_id,
    SECRET: !!googleClient.client_secret,
    CB: GOOGLE_CALLBACK_URL,
  });
});

module.exports = app;

