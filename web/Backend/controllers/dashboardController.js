const pool = require('../db');

const getDashboardData = async (req, res) => {
  try {
    const totalUsuarios = await pool.query('SELECT COUNT(*) FROM usuarios_admin');
    const totalMensajes = await pool.query('SELECT COUNT(*) FROM historial_operaciones');
    const mensajesHoy = await pool.query(
      'SELECT COUNT(*) FROM historial_operaciones WHERE fecha::date = CURRENT_DATE'
    );

    res.json({
      totalUsuarios: parseInt(totalUsuarios.rows[0].count),
      totalMensajes: parseInt(totalMensajes.rows[0].count),
      mensajesHoy: parseInt(mensajesHoy.rows[0].count),
    });
  } catch (error) {
    console.error('Error en estadísticas:', error);
    res.status(500).json({ error: 'Error en estadísticas' });
  }
};

module.exports = { getDashboardData };
