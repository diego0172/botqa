// /backend/controllers/botCore.js
async function procesarMensajeComoBot({ mensaje, usuario, esAdmin = false, estadoActual = null, menuConfig }) {
  const msgLower = (mensaje || '').trim().toLowerCase();

  // Si no viene menú, da error básico
  if (!menuConfig) {
    return { respuesta: 'No hay menú configurado.', nuevoEstado: null };
  }

  // --- Resto igual que antes ---
  if (['menu', 'volver'].includes(msgLower)) {
    return {
      respuesta: menuConfig.menuPrincipal,
      nuevoEstado: 'en_menu'
    };
  }
  if (msgLower === 'salir') {
    return {
      respuesta: '👋 Gracias por contactarnos. Escriba "menu" para empezar de nuevo.',
      nuevoEstado: null
    };
  }
  if (estadoActual === 'en_menu' || !estadoActual) {
    if (menuConfig.opciones[msgLower]) {
      const { respuesta, siguiente } = menuConfig.opciones[msgLower];
      return {
        respuesta,
        nuevoEstado: siguiente
      };
    }
    return {
      respuesta: 'Opción no válida. Escriba el número de la opción o "menu".',
      nuevoEstado: 'en_menu'
    };
  }
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
  return {
    respuesta: 'No entendí. Escriba "menu" para volver al inicio.',
    nuevoEstado: 'en_menu'
  };
}

module.exports = { procesarMensajeComoBot };
