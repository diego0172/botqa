// estadoUsuario.js
const pool = require('../../db');
const logger = require('./middlewares/logger');

// Obtener el estado actual de un usuario por su número de teléfono
async function getEstadoUsuario(telefono) {
  try {
    const result = await pool.query(
      'SELECT estado FROM estado_usuario WHERE telefono = $1',
      [telefono]
    );
    return result.rows[0]?.estado || null;
  } catch (error) {
    logger.error(`❌ Error al obtener estado del usuario (${telefono}): ${error.message}`);
    return null;
  }
}

// Establecer o actualizar el estado del usuario
async function setEstadoUsuario(telefono, estado) {
  try {
    const existe = await pool.query(
      'SELECT 1 FROM estado_usuario WHERE telefono = $1',
      [telefono]
    );

    if (existe.rowCount > 0) {
      await pool.query(
        'UPDATE estado_usuario SET estado = $1 WHERE telefono = $2',
        [estado, telefono]
      );
    } else {
      await pool.query(
        'INSERT INTO estado_usuario (telefono, estado) VALUES ($1, $2)',
        [telefono, estado]
      );
    }
  } catch (error) {
    logger.error(`❌ Error al establecer estado del usuario (${telefono}): ${error.message}`);
  }
}

module.exports = {
  getEstadoUsuario,
  setEstadoUsuario
}; 