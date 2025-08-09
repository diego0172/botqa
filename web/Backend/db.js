// db.js
const { Pool } = require('pg');
const logger = require('./middlewares/logger');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'inventario',
  password: '46W6WEyC',
  port: 5432,
});

// Probar conexión una vez al iniciar
pool.connect()
  .then(client => {
    client.release();
    logger.info('✅ Conexión a PostgreSQL exitosa');
  })
  .catch(error => {
    logger.error('❌ Error al conectar con PostgreSQL: ' + error.message);
  });

module.exports = pool;
