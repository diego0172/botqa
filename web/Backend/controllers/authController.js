const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pool = require('../db');
const jwt = require('jsonwebtoken');

const bcrypt = require('bcrypt');
// Almacenamiento temporal de códigos de verificación (para demo; en producción usar un almacenamiento más robusto)
const resetCodes = {};

async function sendVerificationEmail(email, code) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GOOGLE_EMAIL,
            pass: process.env.GOOGLE_EMAIL_PASSWORD
        }
    });
//COLOR DE CUADROS PARA CODIGO
    const codeBoxes = code.split('').map(d => `
      <span style="display:inline-block;width:38px;height:48px;line-height:48px;margin:0 6px;
                   background:#67b7c3;color:#fff;font-size:2em;font-weight:bold;border-radius:8px;
                   box-shadow:0 2px 8px #b2dbe3;text-align:center;">
        ${d}
      </span>`).join('');
//IMAGEN  DEL BOT DEL CUERPO DEL CORREO CON
    const mailOptions = {
        from: process.env.GOOGLE_EMAIL,
        to: email,
        subject: 'Código de verificación para restablecer contraseña',
        html: `
          <div style="text-align:center;">
            <!-- Aquí quitamos <img> y usamos background -->
            <div style="
              width:180px;
              height:180px;
              margin:0 auto 18px auto;
              background-image:url('https://drive.google.com/uc?export=view&id=1r7M5HxKXKqD-aMLkKw_1-Ld93SiHOumA');
              background-size:contain;
              background-repeat:no-repeat;
              background-position:center;
            "></div>

            <h2 style="color:#205caa;">Botenginecorp</h2>
            <p style="font-size:1.1em;">Tu código de verificación para ingresar a Botenginecorp es:</p>
            <div style="margin:18px 0;">${codeBoxes}</div>
            <p style="color:#444;font-size:0.98em;">Si no solicitaste este código, puedes ignorar este correo.</p>
          </div>
        `
    };

    return transporter.sendMail(mailOptions);
}


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

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'El email es requerido' });

    try {
        const result = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }


  // Generar código de 6 dígitos numéricos
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  resetCodes[email] = code;

        await sendVerificationEmail(email, code);
        res.json({ message: 'Código de verificación enviado al correo' });
    } catch (error) {
        res.status(500).json({ error: 'Error al enviar correo de verificación' });
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'Email, código y nueva contraseña son requeridos' });

    try {
        if (resetCodes[email] !== code) {
            return res.status(400).json({ error: 'Código de verificación incorrecto' });
        }

  // Encriptar la nueva contraseña
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE usuarios SET password_hash = $1 WHERE email = $2', [passwordHash, email]);
  delete resetCodes[email];
  res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la contraseña' });
    }
};

exports.signup = async (req, res) => {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });

    try {
        const userCheck = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

    // Encriptar la contraseña antes de guardarla
    const passwordHash = await bcrypt.hash(password, 10);
    // Valores por defecto para rol_id y empresa_id (ajusta si tienes otros ids por defecto)
    const rolId = 1;
    const empresaId = 1;
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, activo, created_at, rol_id, empresa_id)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)
       RETURNING id, nombre, email, activo, created_at, rol_id, empresa_id`,
      [nombre, email, passwordHash, true, rolId, empresaId]
    );
    res.status(201).json({ message: 'Usuario creado exitosamente', user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el usuario' });
    }
};

// Reasignamos las funciones exportadas a variables locales para incluirlas en module.exports
const forgotPassword = exports.forgotPassword;
const resetPassword = exports.resetPassword;
const signup = exports.signup;

module.exports = { loginUser, googleLogin, forgotPassword, resetPassword, signup };