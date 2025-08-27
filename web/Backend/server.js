'use strict';

/**
 * Server robusto:
 * - Carga .env desde bd.env (si existe)
 * - Evita dobles requires / dobles app.use
 * - logger opcional con fallback
 * - Google OAuth opcional
 * - WhatsApp client consistente (waClient)
 * - Rutas opcionales (se registran solo si exportan middleware)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'bd.env') });

const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

let logger = require('./middlewares/logger');
if (typeof logger !== 'function') {
  // Fallback si tu logger no exporta un middleware
  logger = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  };
}

const pool = require('./db'); // Debe exportar un Pool de pg

// --- Google Calendar (opcional) ---
let calendarService = {};
try {
  calendarService = require('./services/googleCalendar');
} catch (_) {
  console.warn('[optional] services/googleCalendar no encontrado (OK).');
}

// --- Session & Passport (OAuth opcional) ---
const session = require('express-session');
const passport = require('passport');
let GoogleStrategy;
try {
  GoogleStrategy = require('passport-google-oauth20').Strategy;
} catch (_) {
  console.warn('[optional] passport-google-oauth20 no instalado (OK).');
}

// Carga de credenciales OAuth (env + archivo opcional)
function loadGoogleClientConfig() {
  const cfg = {
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uris: [process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'],
  };
  try {
    const clientJson = require('./config/google-oauth-client.json'); // opcional
    const fromFile = clientJson.installed || clientJson.web || {};
    cfg.client_id ||= fromFile.client_id || '';
    cfg.client_secret ||= fromFile.client_secret || '';
    if (fromFile.redirect_uris && fromFile.redirect_uris.length && !process.env.GOOGLE_CALLBACK_URL) {
      cfg.redirect_uris = fromFile.redirect_uris;
    }
  } catch (_) {/* opcional */}
  return cfg;
}

const googleClient = loadGoogleClientConfig();
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || googleClient.redirect_uris[0];

// --- App base ---
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(logger);

// --- Sesión y Passport (si están disponibles) ---
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

// Registra estrategia Google solo si hay credenciales y el paquete está presente
if (GoogleStrategy && googleClient.client_id && googleClient.client_secret) {
  passport.use('google', new GoogleStrategy(
    {
      clientID: googleClient.client_id,
      clientSecret: googleClient.client_secret,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile?.emails?.[0]?.value || null;
        const nombre = profile?.displayName || 'Usuario';

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

// --- Rutas base ---
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Auth routes (router opcional)
try {
  const authRoutes = require('./routes/authRoutes');
  if (typeof authRoutes === 'function') {
    app.use('/auth', authRoutes);
    app.use('/api/auth', authRoutes); // soporta ambos prefijos
  } else {
    console.warn('routes/authRoutes no exporta un middleware. Se omite.');
  }
} catch (e) {
  console.warn('[optional] routes/authRoutes no encontrado:', e.message);
  // Fallback mínimo si hay OAuth configurado
  if (GoogleStrategy && googleClient.client_id && googleClient.client_secret) {
    app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));
    app.get('/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/auth/google' }),
      (req, res) => res.send('Authenticated'));
  }
}

// --- WhatsApp ---
let lastQr = null;
const EMPRESA_DEFECTO = 'HEAVEN_LASHES';
let empresaActual = EMPRESA_DEFECTO;

const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    // Si instalas chromium del sistema, puedes fijar executablePath
    // executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// QR
waClient.on('qr', async (qr) => {
  try {
    lastQr = await QRCode.toDataURL(qr);
    console.log('QR actualizado para WhatsApp');
  } catch (e) {
    console.error('Error generando QR:', e);
  }
});

// Logs útiles
waClient.on('authenticated', () => console.log('✅ Autenticado en WhatsApp'));
waClient.on('auth_failure', (m) => console.error(`❌ Fallo de autenticación: ${m}`));
waClient.on('disconnected', (r) => console.warn(`⚠️ Desconectado: ${r}`));

async function obtenerEmpresaPorNumeroBot(numero) {
  try {
    const result = await pool.query(
      'SELECT empresa FROM bots_registrados WHERE numero = $1',
      [numero]
    );
    return result.rows.length > 0 ? result.rows[0].empresa : null;
  } catch (err) {
    console.error(`Error consultando empresa por número: ${err.message}`);
    return null;
  }
}

waClient.on('ready', async () => {
  console.log('WhatsApp client READY.');
  try {
    const botNumero = waClient.info?.wid?.user;
    console.log(`🤖 Bot conectado con número: ${botNumero || 'desconocido'}`);

    const desdeBD = botNumero ? await obtenerEmpresaPorNumeroBot(botNumero) : null;
    empresaActual = desdeBD || EMPRESA_DEFECTO;
    console.log(`🏢 Empresa activa: ${empresaActual}`);
    lastQr = null;
  } catch (e) {
    console.error('Error en ready():', e);
  }
});

// Manejo de mensajes (opcional)
try {
  const handleMessage = require('./controllers/whatsappController');
  if (typeof handleMessage === 'function') {
    waClient.on('message_create', (msg) => {
      try { handleMessage(waClient, msg); }
      catch (e) { console.error('Error en handleMessage:', e); }
    });
  } else {
    console.warn('controllers/whatsappController no exporta una función. Se omite.');
  }
} catch (e) {
  console.warn('[optional] controllers/whatsappController no encontrado:', e.message);
}

waClient.initialize();

// --- Endpoints auxiliares ---
app.get('/api/whatsapp/qrimg', async (_req, res) => {
  if (!lastQr) return res.status(404).json({ error: 'No QR disponible' });
  try {
    const dataUrl = await QRCode.toDataURL(lastQr);
    res.json({ qr: dataUrl });
  } catch {
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// empresa activa
app.get('/api/empresa', (_req, res) => {
  res.json({ empresaActual: empresaActual || EMPRESA_DEFECTO });
});
app.post('/api/empresa', (req, res) => {
  const { empresa } = req.body || {};
  if (!empresa) return res.status(400).json({ error: 'Falta campo empresa' });
  empresaActual = empresa;
  console.log(`🏢 Empresa cambiada manualmente a: ${empresaActual}`);
  res.json({ ok: true, empresaActual });
});

// --- API REST opcionales (solo si exportan router) ---
function useIfRouter(prefix, maybeRouter, name) {
  if (typeof maybeRouter === 'function') {
    app.use(prefix, maybeRouter);
    return true;
  }
  console.warn(`${name} no exporta middleware. Omitido ${prefix}`);
  return false;
}

try {
  const chatRoutes = require('./controllers/chatController');
  useIfRouter('/api/chat', chatRoutes, 'controllers/chatController');
} catch (e) {
  console.warn('[optional] controllers/chatController no encontrado:', e.message);
}

try {
  const chatRoutesApi = require('./routes/chatRoutes');
  useIfRouter('/api/bot', chatRoutesApi, 'routes/chatRoutes');
} catch (e) {
  console.warn('[optional] routes/chatRoutes no encontrado:', e.message);
}

try {
  const citasRoutes = require('./routes/citas');
  useIfRouter('/api/citas', citasRoutes, 'routes/citas');
} catch (e) {
  console.warn('[optional] routes/citas no encontrado:', e.message);
}

// --- Endpoint simple para QR actual (debug) ---
app.get('/qr', (_req, res) => {
  if (!lastQr) return res.status(202).json({ status: 'pending' });
  res.json({ dataUrl: lastQr });
});

// --- Start ---
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor escuchando en puerto ${port}`);
  console.log('ENV check ->', {
    ID: !!googleClient.client_id,
    SECRET: !!googleClient.client_secret,
    CB: GOOGLE_CALLBACK_URL,
  });
});

module.exports = app;



