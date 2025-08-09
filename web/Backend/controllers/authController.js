const pool = require('../db');
const jwt = require('jsonwebtoken');

const loginUser = async (req, res) => {
  const { telefono } = req.body;

  try {
    const result = await pool.query('SELECT * FROM usuarios_admin WHERE telefono = $1', [telefono]);

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const user = result.rows[0];

    const token = jwt.sign({ id: user.id, telefono: user.telefono }, process.env.JWT_SECRET, {
      expiresIn: '8h',
    });

    res.json({
      token,
      user: {
        id: user.id,
        telefono: user.telefono,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

module.exports = { loginUser };
