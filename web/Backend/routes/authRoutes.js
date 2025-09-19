// /backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const SECRET = process.env.JWT_SECRET || 'supersecreto';
const passport = require('passport');
const { forgotPassword, resetPassword, signup } = require('../controllers/authController');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT u.*, r.nombre AS rol, e.nombre AS empresa
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       JOIN empresas e ON u.empresa_id = e.id
       WHERE u.email = $1 AND u.activo = TRUE`, [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Usuario o contraseña incorrectos' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ mensaje: 'Usuario o contraseña incorrectos' });
    }
    const token = jwt.sign({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      empresa_id: user.empresa_id,
      empresa: user.empresa,
      rol: user.rol
    }, SECRET, { expiresIn: '10h' });

    res.json({
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        empresa: user.empresa,
        rol: user.rol
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error de servidor' });
  }
});

// --- OAuth Google ---
router.get('/google',
  passport.authenticate('google', { scope: ['openid', 'email', 'profile'], prompt: 'consent', accessType: 'offline' })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' })
);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/signup', signup);

module.exports = router;
