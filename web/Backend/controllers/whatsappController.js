// controllers/whatsappController.js
const { getEstadoUsuario, setEstadoUsuario } = require('../estadoUsuario');
const pool = require('../db');
const logger = require('../middlewares/logger');
const { procesarExcelCompra } = require('../services/procesarExcel');
const { generarInformeInventario } = require('../services/generarInforme');
const fs = require('fs');
const path = require('path');
const { MessageMedia, List } = require('whatsapp-web.js');
const { procesarMensajeComoBot } = require('../controllers/botCore');
const { obtenerBotConfig } = require('../config/botMenusEmpresas');
const { gestionarFlujoCita, resetFlujoCita } = require('../controllers/flujoCitas');
const { procesarMensajeHeaven } = require('../controllers/flujoHeavenLashes');

// Puente cliente ↔ asesor
const { asesores, comandos } = require('../config/asesores');
const {
  iniciarPuente,
  estaEnPuente,
  obtenerSesion,
  vincularAsesor,
  finalizarPuente,
  registrarMensaje,
  formatearResumen,
} = require('./puenteAsesor');

const estados = {};

// Cancelacion de cita: memoria corta por usuario
const cancelPendientes = new Map(); // usuarioId -> { id?, servicio, fecha, empresa }
const TRIGGERS_CANCELAR_CITA = ['cancelar cita','anular cita','eliminar cita','borrar cita'];

function obtenerNombreCliente(message) {
  return message._data?.notifyName || message._data?.pushName || 'cliente';
}

// Frases para evitar eco en flujo de citas
const FRASES_IGNORAR_CITA = [
  'flujo cancelado',
  'por favor confirma tu cita',
  'responde si para confirmar',
  'esa hora no esta disponible',
  'no disponible. opciones libres',
  'el horario de atencion es de',
  'la fecha y hora no pueden ser del pasado',
  'formato invalido. usa dd/mm/yyyy hh:mm',
  'escribe el servicio que deseas',
  'gracias por elegir',
  'escribe la hora exacta que prefieras',
  'indica otra fecha'
];

// Frases para evitar eco en puente
const FRASES_IGNORAR_PUENTE = [
  'un asesor te atendera en breve',
  'modo ayuda finalizado',
  'cliente',
  'asesor',
];

// ===== Helpers de asesores (con soporte a formato viejo o nuevo) =====
function normalizarAsesores() {
  return (asesores || []).map(a =>
    typeof a === 'string' ? { id: a, nombre: 'Asesor' } : a
  );
}
function esAsesor(waId) {
  return normalizarAsesores().some(a => a.id === waId);
}
function nombreDeAsesor(waId) {
  const a = normalizarAsesores().find(x => x.id === waId);
  return a?.nombre || 'Asesor';
}
async function notificarAsesores(client, texto) {
  for (const a of normalizarAsesores()) {
    try { await client.sendMessage(a.id, texto); } catch {}
  }
}
async function notificarAsesoresExcept(client, texto, exceptId) {
  for (const a of normalizarAsesores()) {
    if (a.id === exceptId) continue;
    try { await client.sendMessage(a.id, texto); } catch {}
  }
}

function toWaId(num) {
  const n = (num || '').replace(/\D/g, '');
  if (!n) return null;
  return n.endsWith('@c.us') ? n : `${n}@c.us`;
}
function parseCmd(msgLower) {
  const parts = msgLower.trim().split(/\s+/);
  const [first, ...rest] = parts;
  const arg = rest.join(' ').trim();

  if (Array.isArray(comandos?.tomar) && comandos.tomar.includes(first)) return { cmd: 'tomar', arg };
  if (Array.isArray(comandos?.liberar) && comandos.liberar.includes(first)) return { cmd: 'liberar', arg };
  if (Array.isArray(comandos?.ver) && comandos.ver.includes(first)) return { cmd: 'ver', arg };
  return null;
}

// Vinculos asesor -> clientes tomados para enrutar mensajes libres
const cacheVinculos = new Map(); // asesorId -> Set(clienteIds)
function registrarVinculo(asesorId, clienteId) {
  if (!cacheVinculos.has(asesorId)) cacheVinculos.set(asesorId, new Set());
  cacheVinculos.get(asesorId).add(clienteId);
}
function desvincularVinculo(asesorId, clienteId) {
  if (cacheVinculos.has(asesorId)) cacheVinculos.get(asesorId).delete(clienteId);
}
function clientesDeAsesor(asesorId) {
  return [...(cacheVinculos.get(asesorId) || new Set())];
}

const handleMessage = async (client, message, empresaActual) => {
  try {
    const numeroUsuario = message.from;
    if (numeroUsuario.includes('@g.us') || message.fromMe) return;

    const msg = typeof message.body === 'string' ? message.body.trim() : '';
    const msgLower = msg.toLowerCase();
    const contacto = await message.getContact();
    const nombreCliente = contacto?.pushName || obtenerNombreCliente(message);

    logger.info(`📨 Mensaje recibido de: ${numeroUsuario} (${nombreCliente}) | Contenido: ${msg}`);

    // 0) Evitar ecos del propio bot
    if (message.fromMe) {
      const limpio = msgLower.trim();
      if (FRASES_IGNORAR_CITA.some(f => limpio.includes(f)) || FRASES_IGNORAR_PUENTE.some(f => limpio.includes(f))) {
        logger.warn(`⚠️ Eco propio ignorado: ${msg}`);
        return;
      }
    }

    // A) Confirmacion de cancelacion si esta en estado cancelando_cita
    const estadoCancel = await getEstadoUsuario(numeroUsuario);
    if (estadoCancel === 'cancelando_cita') {
      const siList = new Set(['si','sí','si.','sí.','confirmar','confirmo']);
      const noList = new Set(['no','no.','conservar','volver','menu','menú']);

      if (siList.has(msgLower)) {
        const pend = cancelPendientes.get(numeroUsuario);
        if (!pend) {
          await setEstadoUsuario(numeroUsuario, null);
          await client.sendMessage(numeroUsuario, 'No hay una cita pendiente de cancelacion.');
          return;
        }
        try {
          if (pend.id) {
            await pool.query('DELETE FROM citas WHERE id = $1', [pend.id]);
          } else {
            await pool.query(
              'DELETE FROM citas WHERE usuario = $1 AND empresa = $2 AND fecha = $3 AND servicio = $4',
              [numeroUsuario, empresaActual, pend.fecha, pend.servicio || null]
            );
          }
          await client.sendMessage(numeroUsuario, 'Listo. Tu cita fue cancelada.');
        } catch (e) {
          logger.error(`Error cancelando cita: ${e.message}`);
          await client.sendMessage(numeroUsuario, 'No pude cancelar la cita. Intenta de nuevo o escribe ayuda.');
        } finally {
          cancelPendientes.delete(numeroUsuario);
          await setEstadoUsuario(numeroUsuario, null); // no regresar al menu
        }
        return;
      }

      if (noList.has(msgLower)) {
        cancelPendientes.delete(numeroUsuario);
        await setEstadoUsuario(numeroUsuario, null); // no regresar al menu
        await client.sendMessage(numeroUsuario, 'Perfecto, conservamos tu cita.');
        return;
      }

      await client.sendMessage(numeroUsuario, 'Por favor confirma con SI para cancelar o NO para conservar.');
      return;
    }

    // B) Iniciar cancelacion de cita con confirmacion
    if (TRIGGERS_CANCELAR_CITA.includes(msgLower)) {
      try {
        const { rows } = await pool.query(
          `SELECT id, servicio, fecha, empresa
           FROM citas
           WHERE usuario = $1 AND empresa = $2 AND fecha >= NOW()
           ORDER BY fecha ASC
           LIMIT 1`,
          [numeroUsuario, empresaActual]
        );

        if (!rows || rows.length === 0) {
          await client.sendMessage(numeroUsuario, 'No encuentro citas activas para cancelar.');
          return;
        }

        const cita = rows[0];
        cancelPendientes.set(numeroUsuario, cita);
        await setEstadoUsuario(numeroUsuario, 'cancelando_cita');

        const fechaStr = new Date(cita.fecha).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
        await client.sendMessage(
          numeroUsuario,
          `Vas a cancelar tu cita de ${cita.servicio || 'servicio'} para ${fechaStr}. Escribe SI para confirmar o NO para conservarla.`
        );
      } catch (e) {
        logger.error(`Error localizando cita a cancelar: ${e.message}`);
        await client.sendMessage(numeroUsuario, 'Ocurrio un error al buscar tu cita. Intenta de nuevo o escribe ayuda.');
      }
      return;
    }

    // 1) ACTIVAR PUENTE: 'ayuda [modulo]'
    if (msgLower.startsWith('ayuda')) {
      const modulo = msgLower.split(/\s+/)[1] || 'general';

      iniciarPuente(numeroUsuario, { modulo, empresa: empresaActual });
      await client.sendMessage(numeroUsuario, 'Un asesor te atendera en breve. Gracias por tu paciencia.');

      const aviso = `📢 Alerta soporte\nCliente: ${nombreCliente} (${numeroUsuario})\nModulo: ${modulo}\nEmpresa: ${empresaActual || '-'}\nMensaje: "${msg}"\n\nUse: #tomar ${numeroUsuario.replace('@c.us', '')}`;
      await notificarAsesores(client, aviso);

      await registrarMensaje({ clienteId: numeroUsuario, de: 'cliente', id: message.id._serialized, texto: msg });
      return;
    }

    // 2) MENSAJES DESDE UN ASESOR: comandos y enrutamiento
    if (esAsesor(numeroUsuario)) {
      const cmd = parseCmd(msgLower);

      // 2.1 Comandos
      if (cmd?.cmd === 'tomar') {
        const objetivo = toWaId(cmd.arg);
        if (!objetivo) { await client.sendMessage(numeroUsuario, 'Formato: #tomar 502XXXXXXXX'); return; }
        if (!estaEnPuente(objetivo)) { await client.sendMessage(numeroUsuario, `No hay sesion activa para ${objetivo}.`); return; }

        vincularAsesor(objetivo, numeroUsuario);
        registrarVinculo(numeroUsuario, objetivo);

        const nombreAsesor = nombreDeAsesor(numeroUsuario);

        await client.sendMessage(numeroUsuario, `Sesion tomada: ${objetivo}`);
        await client.sendMessage(objetivo, `${nombreAsesor} esta en linea contigo ahora.`);

        // Alerta interna al resto de asesores
        const avisoTomada = `🔔 Sesion tomada por ${nombreAsesor} -> ${objetivo}`;
        await notificarAsesoresExcept(client, avisoTomada, numeroUsuario);
        return;
      }

      if (cmd?.cmd === 'liberar') {
        const objetivo = toWaId(cmd.arg);
        if (!objetivo) { await client.sendMessage(numeroUsuario, 'Formato: #liberar 502XXXXXXXX'); return; }
        finalizarPuente(objetivo);
        desvincularVinculo(numeroUsuario, objetivo);
        await client.sendMessage(numeroUsuario, `Sesion liberada: ${objetivo}`);
        await client.sendMessage(objetivo, 'Modo ayuda finalizado por el asesor. Puedes volver al menu cuando gustes.');
        return;
      }

      if (cmd?.cmd === 'ver') {
        const objetivo = toWaId(cmd.arg);
        if (!objetivo || !estaEnPuente(objetivo)) {
          await client.sendMessage(numeroUsuario, 'Formato: #ver 502XXXXXXXX con sesion activa.');
          return;
        }
        const s = obtenerSesion(objetivo);
        await client.sendMessage(numeroUsuario, 'Resumen:\n' + formatearResumen(s));
        return;
      }

      // 2.2 Mensajes libres desde asesor → cliente(s)
      const nombreAsesor = nombreDeAsesor(numeroUsuario);
      const clientes = clientesDeAsesor(numeroUsuario);
      if (clientes.length === 0) {
        await client.sendMessage(numeroUsuario, 'No tienes sesiones tomadas. Usa: #tomar 502XXXXXXXX');
        return;
      }

      if (clientes.length > 1) {
        const match = msg.match(/@(\d{8,15})/);
        if (!match) {
          await client.sendMessage(numeroUsuario, 'Tienes varias sesiones. Antepon un @502XXXXXXXX para elegir el cliente objetivo.');
          return;
        }
        const objetivo = toWaId(match[1]);
        if (!objetivo || !clientes.includes(objetivo)) {
          await client.sendMessage(numeroUsuario, 'Ese cliente no esta en tus sesiones tomadas.');
          return;
        }
        await client.sendMessage(objetivo, `${nombreAsesor}: ${msg.replace(match[0], '').trim()}`);
        await registrarMensaje({ clienteId: objetivo, de: 'asesor', id: message.id._serialized, texto: msg });
        return;
      } else {
        const objetivo = clientes[0];
        await client.sendMessage(objetivo, `${nombreAsesor}: ${msg}`);
        await registrarMensaje({ clienteId: objetivo, de: 'asesor', id: message.id._serialized, texto: msg });
        return;
      }
    }

    // 3) MENSAJES DEL CLIENTE MIENTRAS EL PUENTE ESTA ACTIVO
    if (estaEnPuente(numeroUsuario)) {
      const s = obtenerSesion(numeroUsuario);
      await registrarMensaje({ clienteId: numeroUsuario, de: 'cliente', id: message.id._serialized, texto: msg });

      if (s?.asesorId) {
        await client.sendMessage(s.asesorId, `Cliente ${numeroUsuario}: ${msg}`);
      } else {
        await notificarAsesores(client, `Cliente ${numeroUsuario} (pendiente): ${msg}\nUsa: #tomar ${numeroUsuario.replace('@c.us', '')}`);
      }
      return; // No procesar mas flujos mientras hay puente
    }

    // 4) FLUJOS EXISTENTES: Excel, Informes, Salir/Menu, Citas, Heaven, Fallback

    // Archivos Excel
    if (message.hasMedia && estados[numeroUsuario] === 'esperando_excel') {
      try {
        const media = await message.downloadMedia();
        if (media.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          return client.sendMessage(numeroUsuario, '❌ Solo se permite formato .xlsx');
        }
        const resultado = await procesarExcelCompra(media, numeroUsuario);
        await client.sendMessage(numeroUsuario, resultado.mensaje);
      } catch (err) {
        logger.error(`❌ Error al procesar Excel: ${err.message}`);
        await client.sendMessage(numeroUsuario, '⚠️ Error al procesar el archivo.');
      } finally {
        delete estados[numeroUsuario];
      }
      return;
    }

    if (!msg && !message.hasMedia) return;

    if (msgLower === 'cargar compra') {
      estados[numeroUsuario] = 'esperando_excel';
      return client.sendMessage(numeroUsuario, '📄 Envia ahora el archivo Excel (.xlsx) con los datos de compra.');
    }

    // Informes PDF
    if (msgLower === 'generar informe') {
      try {
        const buffer = await generarInformeInventario();
        const nombreArchivo = `informe_inventario_${Date.now()}.pdf`;
        const ruta = path.join(__dirname, `../temp/${nombreArchivo}`);
        fs.writeFileSync(ruta, Buffer.from(buffer));
        const archivoBase64 = fs.readFileSync(ruta).toString('base64');
        const media = new MessageMedia('application/pdf', archivoBase64, nombreArchivo);
        await client.sendMessage(numeroUsuario, '📤 Informe generado. Enviando PDF...');
        await client.sendMessage(numeroUsuario, media, { sendMediaAsDocument: true });
        fs.unlinkSync(ruta);
        logger.info(`📎 Informe enviado correctamente a ${numeroUsuario}: ${nombreArchivo}`);
      } catch (err) {
        logger.error(`❌ Error al generar PDF: ${err.message}`);
        await client.sendMessage(numeroUsuario, '⚠️ No se pudo generar ni enviar el informe.');
      }
      return;
    }

    // Salir / Menu
    if (msgLower === 'salir') {
      await setEstadoUsuario(numeroUsuario, null);
      return client.sendMessage(numeroUsuario, '👋 Saliste del menu. Escribi menu para volver a empezar.');
    }

    if (['menu', 'menú', 'volver'].includes(msgLower)) {
      await setEstadoUsuario(numeroUsuario, 'en_menu');
      logger.info(`${numeroUsuario} ingreso al menu principal`);
    }

    // Cancelar (flujo de cita) - sale del flujo sin forzar menu
    if (msgLower === 'cancelar') {
      try { resetFlujoCita(numeroUsuario); } catch (_) {}
      await setEstadoUsuario(numeroUsuario, null);
      await client.sendMessage(numeroUsuario, 'Flujo de cita cancelado. Escribe menu cuando quieras ver opciones.');
      return;
    }

    let estadoActual = await getEstadoUsuario(numeroUsuario);
    logger.info(`Estado actual de ${numeroUsuario}: ${estadoActual}`);
    const botConfig = await obtenerBotConfig(empresaActual);

    // Atajo "cita"
    if (msgLower === 'cita') {
      await setEstadoUsuario(numeroUsuario, 'en_cita');
      const r = await gestionarFlujoCita({
        client,
        from: numeroUsuario,
        texto: '',
        nombreCliente,
        empresa: empresaActual,
        botConfig
      });
      if (r?.respuesta) await client.sendMessage(numeroUsuario, r.respuesta);
      if (r?.finalizado) await setEstadoUsuario(numeroUsuario, 'en_menu');
      return;
    }

    // Evitar eco propio en cita
    if (estadoActual === 'en_cita' && message.fromMe) {
      const mensajeLimpio = msgLower.trim();
      if (FRASES_IGNORAR_CITA.some(f => mensajeLimpio.includes(f))) {
        logger.warn(`⚠️ Mensaje propio ignorado para evitar bucle en cita: ${msg}`);
        return;
      }
    }

    // Flujo de citas activo
    if (estadoActual?.startsWith('cita_') || estadoActual === 'en_cita') {
      if (estadoActual !== 'en_cita') await setEstadoUsuario(numeroUsuario, 'en_cita');

      logger.info(`🤖 Usuario en flujo de cita: ${numeroUsuario}`);
      const respuestaFlujo = await gestionarFlujoCita({
        client,
        from: numeroUsuario,
        texto: msg,
        nombreCliente,
        empresa: empresaActual,
        botConfig
      });

      if (respuestaFlujo) {
        if (respuestaFlujo.respuesta) {
          await client.sendMessage(numeroUsuario, respuestaFlujo.respuesta);
        }
        if (respuestaFlujo.finalizado) {
          await setEstadoUsuario(numeroUsuario, 'en_menu');

          if (empresaActual === 'HEAVEN_LASHES') {
            const cfg = await obtenerBotConfig(empresaActual);
            if (cfg?.mensajes?.preparacion) {
              await client.sendMessage(numeroUsuario, cfg.mensajes.preparacion);
            }
            if (cfg?.mensajes?.pagos) {
              await client.sendMessage(numeroUsuario, cfg.mensajes.pagos);
            }
          }
        }
        return;
      }
    }

    // Heaven Lashes: router dedicado
    if (empresaActual === 'HEAVEN_LASHES') {
      const r = await procesarMensajeHeaven({
        client,
        message,
        configEmpresa: botConfig,
        nombreCliente
      });

      if (r?.delegarAFlujoCitas) {
        await setEstadoUsuario(numeroUsuario, 'en_cita');
        const primera = await gestionarFlujoCita({
          client,
          from: numeroUsuario,
          texto: '',
          nombreCliente,
          empresa: empresaActual,
          botConfig
        });
        if (primera?.respuesta) await client.sendMessage(numeroUsuario, primera.respuesta);
        if (primera?.finalizado) await setEstadoUsuario(numeroUsuario, 'en_menu');
        return;
      }
      return;
    }

    // Fallback generico
    const respuesta = await procesarMensajeComoBot({
      mensaje: msg,
      usuario: numeroUsuario,
      empresa: empresaActual,
      estadoActual,
      nombre: nombreCliente
    });

    if (respuesta) {
      if (respuesta.botones) {
        await client.sendMessage(numeroUsuario, respuesta.botones);
      } else {
        await client.sendMessage(numeroUsuario, respuesta.respuesta);
      }
      const textoRespuesta = respuesta.respuesta || '[Respuesta enviada]';
      await pool.query(
        'INSERT INTO historial_chat (usuario_id, pregunta, respuesta, fecha) VALUES ($1, $2, $3, NOW())',
        [numeroUsuario, msg, textoRespuesta]
      );
      logger.info(`💾 Mensaje guardado en historial para ${numeroUsuario}`);
    }
  } catch (err) {
    logger.error(`❌ Error en el controlador: ${err.message}`);
  }
};

module.exports = handleMessage;
