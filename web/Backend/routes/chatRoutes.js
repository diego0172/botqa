// /backend/routes/chatRoutes.js
const express = require('express');
const router = express.Router();

const botMenus = require('../config/botMenusEmpresas'); // ahora centralizado
const { procesarMensajeComoBot } = require('../controllers/botCore');

router.post('/', async (req, res) => {
  const { mensaje, empresa, usuario, esAdmin = false, estadoActual = null } = req.body;

  const menuConfig = botMenus[empresa];
  if (!menuConfig) {
    return res.status(400).json({ respuesta: 'Empresa no encontrada o sin menú configurado.' });
  }

  try {
    const { respuesta, nuevoEstado } = await procesarMensajeComoBot({
      mensaje,
      usuario,
      esAdmin,
      estadoActual,
      menuConfig
    });
    res.json({ respuesta, nuevoEstado });
  } catch (err) {
    console.error('❌ Error en /chat:', err.message);
    res.status(500).json({ respuesta: 'Error interno al procesar el mensaje.' });
  }
});

module.exports = router;
