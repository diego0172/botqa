const { obtenerBotConfig } = require('../config/botMenusEmpresas');
const { procesarMensajeHeaven } = require('./flujoHeavenLashes');

async function procesarMensajeComoBot({ mensaje, usuario, empresa, estadoActual, nombre }) {
  const configEmpresa = obtenerBotConfig(empresa);
  if (empresa === 'HEAVEN_LASHES') {
    // este flujo maneja los envíos directo en whatsappController (delegado)
    return { respuesta: configEmpresa?.mensajes?.menu || 'Hola', nuevoEstado: 'en_menu' };
  }
  if (!configEmpresa) {
    return { respuesta: 'Hola. Menú no configurado. Escribe ayuda para un asesor.', nuevoEstado: 'en_menu' };
  }
  const opcionesTxt = (configEmpresa?.opciones || []).map(o => `${o.clave} ${o.etiqueta}`).join('\n');
  const saludo = typeof configEmpresa?.saludo === 'function' ? configEmpresa.saludo(nombre) : (configEmpresa?.saludo || 'Hola');
  return { respuesta: `${saludo}\n\n${opcionesTxt}`, nuevoEstado: 'en_menu' };
}

module.exports = { procesarMensajeComoBot };
