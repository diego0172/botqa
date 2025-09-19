

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


waClient.initialize();


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



