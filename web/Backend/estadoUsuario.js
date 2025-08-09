const pool = require('./db');
const logger = require('./middlewares/logger');

const TIEMPO_EXPIRACION_MS = 5 * 60 * 1000; // 15 minutos

// Obtener estado del usuario y verificar si expiró
async function getEstadoUsuario(telefono) {
  try {
    const result = await pool.query(
      'SELECT estado, timestamp FROM estado_usuario WHERE telefono = $1',
      [telefono]
    );

    if (result.rowCount === 0) return null;

    const { estado, timestamp } = result.rows[0];

    const ahora = new Date();
    const ultimaActividad = new Date(timestamp);
    const diferencia = ahora - ultimaActividad;

   if (diferencia > TIEMPO_EXPIRACION_MS) {
  if (estado && estado.startsWith('cita_')) {
    logger.info(`⏳ Estado expirado para ${telefono}, pero se mantiene por estar en flujo de cita`);
    return estado;
  }

  // Estado expirado, eliminar
  await pool.query(
    'UPDATE estado_usuario SET estado = NULL, timestamp = NOW() WHERE telefono = $1',
    [telefono]
  );
  logger.info(`⏳ Estado expirado para ${telefono}, se reinició a null`);
  return null;
}

    return estado;
  } catch (error) {
    logger.error(`❌ Error al obtener estado del usuario (${telefono}): ${error.message}`);
    return null;
  }
}

// Establecer o actualizar estado y timestamp
async function setEstadoUsuario(telefono, estado) {
  try {
    const existe = await pool.query(
      'SELECT 1 FROM estado_usuario WHERE telefono = $1',
      [telefono]
    );

    if (existe.rowCount > 0) {
      await pool.query(
        'UPDATE estado_usuario SET estado = $1, timestamp = NOW() WHERE telefono = $2',
        [estado, telefono]
      );
    } else {
      await pool.query(
        'INSERT INTO estado_usuario (telefono, estado, timestamp) VALUES ($1, $2, NOW())',
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
