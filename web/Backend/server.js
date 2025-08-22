// server.js
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('./middlewares/logger');
const handleMessage = require('./controllers/whatsappController');
const pool = require('./db');
const { getAuthUrl, saveCode } = require('./services/googleCalendar');

// Inicializa Express
const app = express();
const port = process.env.PORT || 3001;
app.use(express.json());

// --- Sirve el frontend ---
app.use(express.static(path.join(__dirname, '../frontend')));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- Variables globales ---
let empresaActual = null;
let lastQr = null;

// --- Inicializa cliente WhatsApp ---
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

// --- Evento: Cliente listo ---
client.on('ready', async () => {
  const botNumero = client.info?.wid?.user;
  logger.info(`🤖 Bot conectado con número: ${botNumero}`);

  const desdeBD = await obtenerEmpresaPorNumeroBot(botNumero);
  empresaActual = desdeBD || EMPRESA_DEFECTO; // fallback sólido
  logger.info(`🏢 Empresa activa: ${empresaActual}`);

  lastQr = null;
});

// --- Evento: Mensaje entrante ---
client.on('message', async (message) => {
  try {
    const empresaParaMensaje = empresaActual || EMPRESA_DEFECTO; // defensivo
    await handleMessage(client, message, empresaParaMensaje);
  } catch (error) {
    logger.error(`❌ Error en el controlador: ${error.message}`);
  }
});

// --- Inicializa WhatsApp ---
client.initialize();

// --- ENDPOINT: QR como base64 ---
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
    const result = await pool.query('SELECT * FROM citas ORDER BY fecha_inicio');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// --- POST crear cita ---
app.post('/api/citas', async (req, res) => {
  const { titulo, descripcion, fecha_inicio, fecha_fin, origen, telefono } = req.body;
  if (!titulo || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO citas (titulo, descripcion, fecha_inicio, fecha_fin, origen, telefono)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [titulo, descripcion, fecha_inicio, fecha_fin, origen || 'web', telefono]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cita' });
  }
});

// --- Verificación básica ---
app.get('/', (req, res) => {
  res.send('Servidor y bot de WhatsApp activos 🚀');
});

// --- Conexión a base de datos ---
pool.connect()
  .then(() => logger.info('✅ Conexión a PostgreSQL exitosa'))
  .catch((err) => logger.error('❌ Error al conectar con PostgreSQL', err));

// --- Inicio del servidor ---
app.listen(port, () => {
  logger.info(`🚀 Servidor escuchando en http://localhost:${port}`);
});
