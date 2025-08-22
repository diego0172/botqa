// controllers/puenteAsesor.js
const pool = require('../db');
// Sesiones de soporte en memoria
// key: clienteId (whatsapp id, ej 502xxxxxxx@c.us)
// value: {
//   activa: boolean,
//   desde: epoch_ms,
//   clienteId: string,
//   asesorId: string|null,
//   modulo: string,
//   empresa: string|null,
//   transcript: Array<{ts:number, de:'cliente'|'asesor', id:string, texto:string}>
// }
const sesionesPorCliente = new Map(); // key: clienteId, value: { asesorId, activa, desde, modulo, empresa, transcript: [] }
// transcript: [{ts, de: 'cliente'|'asesor', id, texto}]

function iniciarPuente(clienteId, { modulo = 'general', empresa = null } = {}) {
  const ses = sesionesPorCliente.get(clienteId);
  const base = ses && ses.activa ? ses : {};
  sesionesPorCliente.set(clienteId, {
    ...base,
    activa: true,
    desde: Date.now(),
    clienteId,
    asesorId: base.asesorId || null,
    modulo,
    empresa,
    transcript: base.transcript || [],
  });
}

function estaEnPuente(clienteId) {
  const s = sesionesPorCliente.get(clienteId);
  return Boolean(s?.activa);
}

function obtenerSesion(clienteId) {
  return sesionesPorCliente.get(clienteId) || null;
}

function vincularAsesor(clienteId, asesorId) {
  const s = sesionesPorCliente.get(clienteId);
  if (!s) return null;
  s.asesorId = asesorId;
  sesionesPorCliente.set(clienteId, s);
  return s;
}

function finalizarPuente(clienteId) {
  const s = sesionesPorCliente.get(clienteId);
  if (!s) return;
  s.activa = false;
  sesionesPorCliente.set(clienteId, s);
}

async function registrarMensaje({ clienteId, de, id, texto }) {
  const s = sesionesPorCliente.get(clienteId);
  if (!s) return;

  const item = { ts: Date.now(), de, id, texto };
  s.transcript.push(item);

  // Opcional: persistir en PostgreSQL si tienes tabla
  // Crea esta tabla si quieres persistencia:
  // CREATE TABLE IF NOT EXISTS puente_chat (
  //   id SERIAL PRIMARY KEY,
  //   cliente_id TEXT NOT NULL,
  //   asesor_id TEXT,
  //   direccion TEXT NOT NULL, -- 'cliente' o 'asesor'
  //   mensaje TEXT NOT NULL,
  //   creado_en TIMESTAMP DEFAULT NOW()
  // );
  try {
    await pool.query(
      'INSERT INTO puente_chat (cliente_id, asesor_id, direccion, mensaje) VALUES ($1,$2,$3,$4)',
      [clienteId, s.asesorId || null, de, texto]
    );
  } catch (e) {
    // Si no hay DB o tabla, puedes ignorar este error o loguearlo
  }
}

function formatearResumen(s) {
  if (!s) return 'No hay sesion.';
  const inicioIso = new Date(s.desde).toISOString();
  const head =
    `Sesion cliente: ${s.clienteId}\n` +
    `Asesor: ${s.asesorId || 'sin asignar'}\n` +
    `Modulo: ${s.modulo}\n` +
    `Empresa: ${s.empresa || '-'}\n` +
    `Desde: ${inicioIso}\n` +
    `Activa: ${s.activa ? 'si' : 'no'}\n---\n`;

  const ultimos = s.transcript.slice(-20); // últimos 20
  const cuerpo = ultimos
    .map(x => `[${new Date(x.ts).toLocaleString()}] ${x.de}: ${x.texto}`)
    .join('\n');

  return head + (cuerpo || 'Sin mensajes.');
}

module.exports = {
  iniciarPuente,
  estaEnPuente,
  obtenerSesion,
  vincularAsesor,
  finalizarPuente,
  registrarMensaje,
  formatearResumen,
};
