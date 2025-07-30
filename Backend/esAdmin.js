const pool = require('../../db');
const logger = require('./middlewares/logger');

const esAdmin = async (numero) => {
  try {
   const limpio = numero.replace(/^whatsapp:/, '').replace(/@c\.us$/, '');
    const result = await pool.query(
      'SELECT 1 FROM usuarios_admin WHERE telefono = $1',
      [limpio]
    );
    return result.rowCount > 0;
  } catch (error) {
    logger.error(`❌ Error al verificar admin (${numero}): ${error.message}`);
    return false;
  }
};

module.exports = esAdmin;
