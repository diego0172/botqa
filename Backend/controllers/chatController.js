const express = require('express');
const router = express.Router();
const procesarMensaje = require('../services/procesarMensaje');
const pool = require('../db');

// GET /api/chat/historial?usuario_id=12345
router.get('/historial', async (req, res) => {
  const { usuario_id } = req.query;
  console.log('Historial solicitado para usuario:', usuario_id);

  if (!usuario_id) {
    return res.status(400).json({ error: 'Falta usuario_id' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM historial_chat WHERE usuario_id = $1 ORDER BY fecha DESC LIMIT 50',
      [usuario_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener historial:', err);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});



// POST /api/chat/enviar
router.post('/enviar', async (req, res) => {
  const { pregunta } = req.body;
  const resultado = await procesarMensaje(pregunta);

  if (resultado.error) {
    return res.status(500).json({ error: resultado.error });
  }

  res.json({ respuesta: resultado.respuesta });
});

module.exports = router;
