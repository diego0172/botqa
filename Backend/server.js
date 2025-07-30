const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('./middlewares/logger');
const handleMessage = require('./controllers/whatsappController');
const pool = require('./db');
const path = require('path');
const QRCode = require('qrcode'); // <--- AGREGADO
const citasRoutes = require('./routes/citas'); // <--- AGREGADO

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Sirve los archivos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Redirige todo lo que NO sea /api/* a index.html (SPA)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- WhatsApp Bot ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

let lastQr = null;
client.on('qr', (qr) => {
  lastQr = qr;
  logger.info(`🔳 Código QR generado (listo para el frontend).`);
  // Ya NO uses qrcode-terminal aquí
});

client.on('ready', () => {
  logger.info('🤖 Bot de WhatsApp está listo.');
  lastQr = null;
});

client.on('message', async (message) => {
  try {
    await handleMessage(client, message);
  } catch (error) {
    logger.error(`❌ Error en el controlador: ${error.message}`);
  }
});

client.initialize();

// --- ENDPOINT DE QR COMO JSON ---
app.get('/api/whatsapp/qrimg', async (req, res) => {
  if (lastQr) {
    try {
      const dataUrl = await QRCode.toDataURL(lastQr); // base64
      res.json({ qr: dataUrl });
    } catch (e) {
      res.status(500).json({ error: 'Error generando QR' });
    }
  } else {
    res.status(404).json({ error: 'No QR disponible' });
  }
});

//--- ENDPOINT DE QR COMO IMAGEN PNG ---
//app.get('/api/whatsapp/qrimg', async (req, res) => {
 // if (!lastQr) {
 //   return res.status(404).send('No QR');
  //}
 // try {
  //  res.setHeader('Content-Type', 'image/png');
  //  QRCode.toFileStream(res, lastQr, { width: 380, margin: 2 });
 // } catch (e) {
  //  res.status(500).send('Error generando QR');
  //}
//});

// --- API REST ---
app.get('/', (req, res) => {
  res.send('Servidor y bot de WhatsApp activos 🚀');
});

// Rutas de API (login, chat, etc.)
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./controllers/chatController');
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

const chatRoutesApi = require('./routes/chatRoutes');
app.use('/api/bot', chatRoutesApi);


// DB
pool.connect()
  .then(() => logger.info('✅ Conexión a PostgreSQL exitosa'))
  .catch((err) => logger.error('❌ Error al conectar con PostgreSQL', err));

// Start
app.listen(port, () => {
  logger.info(`🚀 Servidor escuchando en http://localhost:${port}`);
});

app.use('/api/citas', citasRoutes); // <--- AGREGADO
//CALENDARIO GET

app.get('/api/citas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citas ORDER BY fecha_inicio');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// CALENDARIO POST\
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

