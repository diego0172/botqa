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

    const token = jwt.sign({ id: user.id, telefono: user.telefono }, 'tu_clave_secreta', {
      expiresIn: '1h',
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

//  funcion para inciar sesion con google
const googleLogin = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  res.json({ user: req.user });
};

module.exports = { loginUser, googleLogin };
