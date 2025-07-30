// /services/procesarMensaje.js
const pool = require('../db');

async function procesarMensaje(pregunta) {
  if (!pregunta) return { error: 'Pregunta vacía' };

  const respuesta = `Esta es una respuesta simulada a: "${pregunta}"`;

  try {
    await pool.query(
      'INSERT INTO historial_chat (pregunta, respuesta, fecha) VALUES ($1, $2, NOW())',
      [pregunta, respuesta]
    );
    return { respuesta };
  } catch (error) {
    console.error('❌ Error en procesarMensaje:', error);
    return { error: 'Error al guardar en historial' };
  }
}

module.exports = procesarMensaje;
