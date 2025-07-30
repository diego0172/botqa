// routes/citas.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta según tu estructura
const nodemailer = require('nodemailer');
// Listar todas las citas
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM citas ORDER BY fecha_inicio');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// Crear nueva cita
router.post('/', async (req, res) => {
  const { titulo, descripcion, fecha_inicio, fecha_fin, origen, telefono } = req.body;
  if (!titulo || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO citas (titulo, descripcion, fecha_inicio, fecha_fin, origen, telefono)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [titulo, descripcion, fecha_inicio, fecha_fin, origen || 'web', telefono]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear cita' });
  }
});
router.post('/', async (req, res) => {
  const { titulo, descripcion, fecha_inicio, fecha_fin, origen, telefono, email } = req.body;
  if (!titulo || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    // Guardar cita
    const result = await pool.query(
      `INSERT INTO citas (titulo, descripcion, fecha_inicio, fecha_fin, origen, telefono)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [titulo, descripcion, fecha_inicio, fecha_fin, origen || 'web', telefono]
    );
    const cita = result.rows[0];

    // 1. Notificación por WhatsApp (ejemplo simple)
    if (telefono) {
      // Aquí asumes que tienes una función o servicio para enviar WhatsApp (ejemplo básico)
      enviarWhatsApp(telefono, `Nueva cita: ${titulo} el ${fecha_inicio}`);
    }

    // 2. Notificación por correo (con nodemailer)
    if (email) {
      await enviarCorreo(email, 'Nueva cita registrada', `
        <b>Título:</b> ${titulo}<br>
        <b>Descripción:</b> ${descripcion}<br>
        <b>Inicio:</b> ${fecha_inicio}<br>
        <b>Fin:</b> ${fecha_fin}
      `);
    }

    res.status(201).json(cita);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear cita' });
  }
});
async function enviarWhatsApp(telefono, mensaje) {
  // Llama a tu bot o API aquí (por ejemplo usando twilio, whatsapp-web.js, etc)
  // Ejemplo: client.sendMessage(`whatsapp:+${telefono}`, mensaje)
  console.log(`[WhatsApp] Mensaje a ${telefono}: ${mensaje}`);
}
async function enviarCorreo(para, asunto, html) {
  // Configura tu transporter solo una vez en tu app
  const transporter = nodemailer.createTransport({
    service: 'gmail', // O el que uses
    auth: {
      user: 'carloschamaleramirez@gmail.com',
      pass: 'abcdefghijklmnop'
    }
  });
  await transporter.sendMail({
    from: '"Agenda de Citas" <TU_CORREO@gmail.com>',
    to: para,
    subject: asunto,
    html: html
  });
}

module.exports = router;
