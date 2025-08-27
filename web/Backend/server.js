'use strict';

// -------------------- Carga de entorno --------------------
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'bd.env') });

// -------------------- Imports --------------------
const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const logger = require('./middlewares/logger');         // puede ser objeto; NO middleware
const handleMessage = require('./controllers/whatsappController'); // handler de chat
const pool = require('./db');

// OAuth opcional
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Servicio de calendario opcional
let calendarService = {};
try {
  calendarService = require('./services/googleCalendar');
} catch (e) {
  console.warn('[opt] googleCalendar no encontrado:', e.message);
}

// -------------------- Config Google OAuth (opcional) --------------------
function loadGoogleClientConfig() {
  const cfg = {
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uris: [process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'],
  };
  try {
    // Archivo opcional: Backend/config/google-oauth-client.json
    const clientJson = require('./config/google-oauth-client.json');
    const fromFile = clientJson.installed || clientJson.web || {};
    cfg.client_id = cfg.client_id || fromFile.client_id || '';
    cfg.client_secret = cfg.client_secret || fromFile.client_secret || '';
    if (fromFile.redirect_uris && fromFile.redirect_uris.length && !process.env.GOOGLE_CALLBACK_URL) {
      cfg.redirect_uris = fromFile.redirect_uris;
    }
  } catch (_) {
    // sin archivo, seguimos con ENV
  }
  return cfg;
}
const googleClient = loadGoogleClientConfig();
const GOOGLE_CALLBACK_URL = (googleClient.redirect_uris && googleClient.redirect_uris[0]) || 'http://localhost:3000/auth/google/callback';

// -------------------- App base --------------------
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Logger como middleware simple (sin romper si logger no tiene .info)
app.use((req, _res, next) => {
  try { logger.info ? logger.info(`${req.method} ${req.originalUrl}`) : console.log(req.method, req.originalUrl); }
  catch { console.log(req.method, req.originalUrl); }
  next();
});

// -------------------- Sesión + Passport (solo si hay credenciales) --------------------
const oauthEnabled = Boolean(googleClient.client_id && googleClient.client_secret);
if (oauthEnabled) {
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
        const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || null;
        const nombre = profile.displayName || 'Usuario';

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
}

// -------------------- Salud --------------------
app.get('/health', (_req, res) => res.status(200).send('ok'));

// -------------------- Rutas (montajes seguros) --------------------
function safeMountUse(route, mod, name = route) {
  try {
    if (!mod) return console.warn(`[warn] ${name}: módulo vacío, no se monta`);
    if (typeof mod === 'function') {
      app.use(route, mod);        // Express Router o middleware
    } else if (mod.router && typeof mod.router === 'function') {
      app.use(route, mod.router); // algunos exportan {router}
    } else {
      console.warn(`[warn] ${name}: no es middleware/router, omitido`);
    }
  } catch (e) {
    console.warn(`[warn] fallo montando ${name}:`, e.message);
  }
}

// /api/auth (si existe)
try {
  const authRoutes = require('./routes/authRoutes');
  safeMountUse('/api/auth', authRoutes, 'authRoutes');
} catch (e) {
  console.warn('[opt] routes/authRoutes no encontrado:', e.message);
}

// /api/bot (router de chat)
try {
  const chatRoutesApi = require('./routes/chatRoutes');
  safeMountUse('/api/bot', chatRoutesApi, 'chatRoutes');
} catch (e) {
  console.warn('[opt] routes/chatRoutes no encontrado:', e.message);
}

// /api/citas (router)
try {
  const citasRoutes = require('./routes/citas');
  safeMountUse('/api/citas', citasRoutes, 'citasRoutes');
} catch (e) {
  console.warn('[opt] routes/citas no encontrado:', e.message);
}

// /api/chat (controlador simple: normalmente función)
try {
  const chatController = require('./controllers/chatController');
  if (typeof chatController === 'function') {
    app.post('/api/chat', chatController);
  } else if (chatController && typeof chatController.handle === 'function') {
    app.post('/api/chat', chatController.handle);
  } else if (chatController && typeof chatController.router === 'function') {
    app.use('/api/chat', chatController.router);
  } else {
    console.warn('[warn] chatController no es función ni router, omitido');
  }
} catch (e) {
  console.warn('[opt] controllers/chatController no encontrado:', e.message);
}

// -------------------- Gestión de empresa activa --------------------
const EMPRESA_DEFECTO = process.env.EMPRESA_DEFECTO || 'HEAVEN_LASHES';
let empresaActual = EMPRESA_DEFECTO;

async function obtenerEmpresaPorNumeroBot(numero) {
  try {
    const result = await pool.query(
      'SELECT empresa FROM bots_registrados WHERE numero = $1',
      [numero]
    );
    return result.rows.length > 0 ? result.rows[0].empresa : null;
  } catch (err) {
    try { logger.error ? logger.error(`Error consultando empresa: ${err.message}`) : console.error(err); } catch {}
    return null;
  }
}

app.get('/api/empresa', (_req, res) => {
  res.json({ empresaActual });
});

app.post('/api/empresa', (req, res) => {
  const { empresa } = req.body || {};
  if (!empresa) return res.status(400).json({ error: 'Falta campo empresa' });
  empresaActual = empresa;
  try { logger.info ? logger.info(`Empresa cambiada manualmente a: ${empresaActual}`) : console.log('Empresa ->', empresaActual); } catch {}
  res.json({ ok: true, empresaActual });
});

// -------------------- WhatsApp --------------------
let lastQrDataUrl = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', async (qr) => {
  try {
    lastQrDataUrl = await QRCode.toDataURL(qr);
    console.log('[WA] QR actualizado');
  } catch (e) {
    console.error('[WA] Error generando QR:', e);
  }
});

client.on('authenticated', () => console.log('[WA] Autenticado'));
client.on('auth_failure', (m) => console.error('[WA] Fallo de auth:', m));
client.on('disconnected', (r) => console.warn('[WA] Desconectado:', r));

client.on('ready', async () => {
  console.log('[WA] READY');
  const botNumero = client.info?.wid?.user;
  console.log('[WA] Bot número:', botNumero);
  const desdeBD = botNumero ? await obtenerEmpresaPorNumeroBot(botNumero) : null;
  empresaActual = desdeBD || EMPRESA_DEFECTO;
  lastQrDataUrl = null; // ya autenticado
});

client.on('message_create', async (msg) => {
  try {
    await handleMessage(client, msg);
  } catch (e) {
    console.error('[WA] Error en handleMessage:', e);
  }
});

client.initialize();

// Endpoints para ver el QR
app.get('/api/whatsapp/qrimg', async (_req, res) => {
  if (!lastQrDataUrl) return res.status(202).json({ status: 'pending' });
  res.json({ qr: lastQrDataUrl });
});

app.get('/qr', async (_req, res) => {
  if (!lastQrDataUrl) return res.status(202).json({ status: 'pending' });
  res.json({ dataUrl: lastQrDataUrl });
});

// -------------------- Inicio del servidor --------------------
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor escuchando en puerto ${port}`);
  console.log('ENV check ->', {
    ID: !!googleClient.client_id,
    SECRET: !!googleClient.client_secret,
    CB: GOOGLE_CALLBACK_URL,
    OAUTH_ENABLED: oauthEnabled,
  });
});

module.exports = app;


