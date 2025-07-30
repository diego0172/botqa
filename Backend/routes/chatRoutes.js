// /backend/routes/chatRoutes.js
const express = require('express');
const router = express.Router();

const botMenus = {
  zapateria: require('../config/botMenus-zapateria'),
  salon: require('../config/botMenus-salon'),
  ferreteria: require('../config/botMenus-ferreteria'),
  // ...
};
const { procesarMensajeComoBot } = require('../controllers/botCore');

router.post('/', async (req, res) => {
  const { mensaje, empresa, usuario, esAdmin, estadoActual } = req.body;
  const menuConfig = botMenus[empresa] || botMenus['zapateria'];
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
    res.status(500).json({ respuesta: 'Error interno.' });
  }
});

module.exports = router;
