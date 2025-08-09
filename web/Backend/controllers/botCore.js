const { obtenerBotConfig } = require('../config/botMenusEmpresas');
const { gestionarFlujoCita} = require('../controllers/flujoCitas');

async function procesarMensajeComoBot({
  mensaje,
  usuario,
  empresa = 'default',
  esAdmin = false,
  estadoActual = null,
  nombre = 'cliente'
}) {
  const msgLower = (mensaje || '').trim().toLowerCase();
  const menuConfig = obtenerBotConfig(empresa);

  if (!menuConfig) {
    return {
      respuesta: '⚠️ No hay configuración disponible para esta empresa.',
      nuevoEstado: 'en_menu'
    };
  }

  const bienvenida = typeof menuConfig.menuPrincipal === 'function'
    ? menuConfig.menuPrincipal(nombre)
    : menuConfig.menuPrincipal;

  // Comandos globales
  if (['menu', 'menú', 'volver'].includes(msgLower)) {
    return {
      respuesta: bienvenida,
      nuevoEstado: 'en_menu'
    };
  }

  if (msgLower === 'salir') {
    return {
      respuesta: `👋 Gracias por contactarnos ${nombre}. Escriba "menu" para empezar de nuevo.`,
      nuevoEstado: null
    };
  }

  // Flujo especial: agendamiento paso a paso

  if (estadoActual === 'cita_conflicto') {
    if (['sí', 'si'].includes(msgLower)) {
      const datos = flujoTemporal[usuario];
      if (datos) {
        return await aceptarHoraSugerida({ usuario, temporal: datos });
      } else {
        return {
          respuesta: '❌ No se encontró la cita pendiente. Escriba "menu" para empezar de nuevo.',
          nuevoEstado: 'en_menu'
        };
      }
    }

    if (msgLower === 'otra fecha') {
      delete flujoTemporal[usuario];
      return {
        respuesta: '📅 Indica otro día y hora para la cita:',
        nuevoEstado: 'reservar_cita'
      };
    }

    return {
      respuesta: '❓ Por favor responde con "sí" para aceptar o "otra fecha".',
      nuevoEstado: 'cita_conflicto'
    };
  }

  // Si está en menú o sin estado aún
  if (estadoActual === 'en_menu' || !estadoActual) {
    if (menuConfig.opciones[msgLower]) {
      const { respuesta, siguiente } = menuConfig.opciones[msgLower];
      return {
        respuesta,
        nuevoEstado: siguiente || 'en_menu'
      };
    }

    return {
      respuesta: bienvenida,
      nuevoEstado: 'en_menu'
    };
  }

  // Flujos interactivos genéricos
  if (menuConfig.flujos && menuConfig.flujos[estadoActual]) {
    const flujo = menuConfig.flujos[estadoActual];

    if (flujo.procesa) {
      const respuesta = flujo.procesa(mensaje);
      return {
        respuesta,
        nuevoEstado: 'en_menu'
      };
    }

    return {
      respuesta: flujo.prompt || '¿En qué puedo ayudarte?',
      nuevoEstado: estadoActual
    };
  }

  // Fallback
  return {
    respuesta: `No entendí ${nombre}. Escriba "menu" para volver al inicio.`,
    nuevoEstado: 'en_menu'
  };
}
function resetFlujoCita(usuario) {
  delete citasTemporales[usuario];
}

module.exports = { procesarMensajeComoBot };