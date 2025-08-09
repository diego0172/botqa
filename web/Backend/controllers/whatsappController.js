// Ajustado para enviar respuestas tipo texto o listas
const { getEstadoUsuario, setEstadoUsuario } = require('../estadoUsuario');
const pool = require('../db');
const logger = require('../middlewares/logger');
//const esAdmin = require('../esAdmin');
const { procesarExcelCompra } = require('../services/procesarExcel');
const { generarInformeInventario } = require('../services/generarInforme');
const fs = require('fs');
const path = require('path');
const { MessageMedia, List } = require('whatsapp-web.js');
const { procesarMensajeComoBot } = require('../controllers/botCore');
const { obtenerBotConfig } = require('../config/botMenusEmpresas');
const { gestionarFlujoCita, resetFlujoCita } = require('../controllers/flujoCitas');

const estados = {};

function obtenerNombreCliente(message) {
  return message._data?.notifyName || message._data?.pushName || 'cliente';
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
      return client.sendMessage(numeroUsuario, '📄 Enviá ahora el archivo Excel (.xlsx) con los datos de compra.');
    }

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

    if (msgLower === 'salir') {
      await setEstadoUsuario(numeroUsuario, null);
      return client.sendMessage(numeroUsuario, '👋 Saliste del menú. Escribí "menu" para volver a empezar.');
    }

    if (["menu", "menú", "volver"].includes(msgLower)) {
      await setEstadoUsuario(numeroUsuario, 'en_menu');
      logger.info(`${numeroUsuario} ingresó al menú principal`);
    }

    if (msgLower === 'cancelar') {
      await setEstadoUsuario(numeroUsuario, 'en_menu');
      return client.sendMessage(numeroUsuario, '❌ Flujo de cita cancelado. Escribí "menu" para volver al inicio.');
    }

    let estadoActual = await getEstadoUsuario(numeroUsuario);
    logger.info(`Estado actual de ${numeroUsuario}: ${estadoActual}`);
    const botConfig = await obtenerBotConfig(empresaActual);

    if (msgLower === 'cita') {
      await setEstadoUsuario(numeroUsuario, 'cita_nombre');
      estadoActual = 'cita_nombre';
    }

if (!estadoActual && !estadoActual?.startsWith('cita_')) {
  await setEstadoUsuario(numeroUsuario, 'en_menu');
  logger.info(`🤖 Usuario nuevo. Mostrando opciones a ${numeroUsuario}`);

  const menuData = botConfig.menuPrincipal(nombreCliente);
  const tipoRespuesta = menuData.tipoRespuesta;
  const texto = menuData.texto;
  const opciones = Object.keys(menuData.opciones || botConfig.opciones || {});

  if (tipoRespuesta === 'lista') {
    const listMessage = new List(
      texto,
      'Ver opciones',
      [{ title: 'Opciones', rows: opciones.map(k => ({ id: k, title: k })) }],
      botConfig.nombre,
      'Seleccioná una opción:'
    );
    await client.sendMessage(numeroUsuario, listMessage);
  } else {
    await client.sendMessage(numeroUsuario, texto);
  }
  return;
}


    if (estadoActual?.startsWith('cita_')) {
      const frasesBotQueDebemosIgnorar = [
        'ahora indica el servicio que deseas agendar',
        'indica la fecha y hora para tu cita',
        'tu cita ha sido registrada exitosamente',
        'por favor indica otra fecha y hora',
        'ya hay una cita en esa hora'
      ];
      if(message.fromMe) {
      const mensajeLimpio = msgLower.trim();
      if (frasesBotQueDebemosIgnorar.some(f => mensajeLimpio.startsWith(f))) {
        logger.warn(`⚠️ Mensaje ignorado para evitar bucle en cita: ${msg}`);
        return;
      }
    }

      logger.info(`🤖 Usuario en flujo de cita: ${numeroUsuario} - Estado: ${estadoActual}`)  ;
      const respuestaFlujo = await gestionarFlujoCita(
        numeroUsuario,
        msg,
        estadoActual,
        empresaActual
      );

      if (respuestaFlujo) {
        if (respuestaFlujo.nuevoEstado) {
          await setEstadoUsuario(numeroUsuario, respuestaFlujo.nuevoEstado);
        }

        if (respuestaFlujo.finalizado) {
          await setEstadoUsuario(numeroUsuario, 'en_menu');
        }

        await client.sendMessage(numeroUsuario, respuestaFlujo.respuesta);
        return;
      }
    }

    const respuesta = await procesarMensajeComoBot({
      mensaje: msg,
      usuario: numeroUsuario,
      empresa: empresaActual,
      estadoActual,
      nombre: nombreCliente
    });
    console.log(`Estado actual: ${estadoActual} | Mensaje: ${msgLower}`);


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
