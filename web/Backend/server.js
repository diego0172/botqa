'use strict';

// Load env from bd.env if present
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'bd.env') });

// -------------------- Imports (single declarations only) --------------------
const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const logger = require('./middlewares/logger');
const handleMessage = require('./controllers/whatsappController');
const pool = require('./db');

const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Optional calendar service (do not crash if it doesn't exist)
let calendarService = {};
try {
  calendarService = require('./services/googleCalendar');
} catch (e) {
  console.warn('googleCalendar service not found (optional):', e.message);
}

// Try to load OAuth client json if present (fallback to ENV)
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
    if ((fromFile.redirect_uris && fromFile.redirect_uris.length) && (!process.env.GOOGLE_CALLBACK_URL)) {
      cfg.redirect_uris = fromFile.redirect_uris;
    }
  } catch (e) {
    // file optional
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

// Google OAuth strategy (only register once)
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

      // Optionally persist tokens through calendarService if provided
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

// -------------------- Routes --------------------
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Auth routes (declared ONCE)
try {
  const authRoutes = require('./routes/authRoutes');
  app.use('/auth', authRoutes);
} catch (e) {
  console.warn('routes/authRoutes not found (optional):', e.message);
  // Minimal fallback
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['email', 'profile'] })
  );

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/auth/google' }),
    (req, res) => {
      res.send('Authenticated');
    }
  );
}

// ------- WhatsApp client -------
let lastQr = null;

const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

waClient.on('qr', async (qr) => {
  try {
    lastQr = await QRCode.toDataURL(qr);
    console.log('QR actualizado para WhatsApp');
  } catch (e) {
    console.error('Error generando QR:', e);
  }
});

waClient.on('ready', () => {
  console.log('WhatsApp client READY.');
});

waClient.on('message_create', (msg) => {
  try {
    handleMessage(waClient, msg);
  } catch (e) {
    console.error('Error en handleMessage:', e);
  }
});

waClient.initialize();

// endpoint para mostrar el QR actual
app.get('/qr', async (_req, res) => {
  if (!lastQr) return res.status(202).json({ status: 'pending' });
  res.json({ dataUrl: lastQr });
});

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
