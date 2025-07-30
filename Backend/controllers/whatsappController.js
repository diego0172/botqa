const { getEstadoUsuario, setEstadoUsuario } = require('../estadoUsuario');
const pool = require('../db');
const logger = require('../middlewares/logger');
const esAdmin = require('../esAdmin');
const { procesarExcelCompra } = require('../services/procesarExcel');
const { generarInformeInventario } = require('../services/generarInforme');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { procesarMensajeComoBot } = require('./botCore');

const estados = {};

const handleMessage = async (client, message) => {
  const numeroUsuario = message.from;

  // Ignora grupos y mensajes de uno mismo
  if (numeroUsuario.includes('@g.us') || message.fromMe) return;

  const msg = typeof message.body === 'string' ? message.body.trim() : '';
  const msgLower = msg.toLowerCase();

  logger.info(`📨 Mensaje recibido de: ${numeroUsuario} | Contenido: ${msg}`);

  // Verifica si es admin
  const autorizado = await esAdmin(numeroUsuario);
  if (!autorizado) {
    logger.warn(`⛔ Usuario no autorizado: ${numeroUsuario}`);
    return;
  }

  // Sub-flujo: espera archivo Excel
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

  // Mensaje vacío sin media
  if (!msg && !message.hasMedia) {
    logger.info(`📭 Mensaje vacío ignorado de: ${numeroUsuario}`);
    return;
  }

  // Comandos rápidos que solo manipulan estados
  if (msgLower === 'cargar compra' && autorizado) {
    estados[numeroUsuario] = 'esperando_excel';
    return client.sendMessage(numeroUsuario, '📄 Enviá ahora el archivo Excel (.xlsx) con los datos de compra.');
  }

  if (msgLower === 'generar informe' && autorizado) {
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

  if (['menu', 'menú', 'volver'].includes(msgLower)) {
    await setEstadoUsuario(numeroUsuario, 'en_menu');
    logger.info(`${numeroUsuario} ingresó al menú principal`);
    // No respondas aquí: deja que el bot core lo gestione abajo
  }

  // Estado actual del usuario
  const estadoActual = await getEstadoUsuario(numeroUsuario);

  // Aquí conectas el core del bot (multiempresa, menús, flujos)
  const respuesta = await procesarMensajeComoBot({
    mensaje: msg,
    usuario: numeroUsuario,
    esAdmin: autorizado,
    estadoActual
    // Puedes pasar otros flags aquí si los necesitas en el core
  });

  // Responde lo que diga el core
 if (respuesta) {
  await client.sendMessage(numeroUsuario, respuesta);

  // Guarda en historial_chat:
  try {
    await pool.query(
      'INSERT INTO historial_chat (usuario_id, pregunta, respuesta, fecha) VALUES ($1, $2, $3, NOW())',
      [numeroUsuario, msg, respuesta]
    );
    logger.info(`💾 Mensaje guardado en historial para ${numeroUsuario}`);
  } catch (err) {
    logger.error(`❌ Error al guardar historial: ${err.message}`);
  }

 }

 };
module.exports = handleMessage;