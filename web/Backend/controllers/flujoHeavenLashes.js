// controllers/flujoHeavenLashes.js
const { sendMediaGroup } = require('../services/mediaSender');

function norm(t){ return (t||'').toString().trim().toLowerCase(); }
const emojiMap = { '1️⃣':'1','2️⃣':'2','3️⃣':'3','4️⃣':'4','5️⃣':'5' };

function renderSaludo(saludoCfg, nombre='cliente'){
  if (typeof saludoCfg === 'function') return saludoCfg(nombre);
  if (typeof saludoCfg === 'string') return saludoCfg.replace(/\$\{nombre\}/g, nombre);
  return 'Hola';
}

async function sendMenu({ client, message, configEmpresa, nombreCliente }){
  const saludo = renderSaludo(configEmpresa?.saludo, nombreCliente);
  await client.sendMessage(message.from, `${saludo}\n\n${configEmpresa?.mensajes?.menu || ''}`);
  return { finalizado: true };
}

async function handlePrecios({ client, message, configEmpresa }){
  await client.sendMessage(message.from, configEmpresa?.mensajes?.precios || 'Precios no configurados');
  return { finalizado: true };
}

async function handleEstilos({ client, message, configEmpresa }){
  const bloque = configEmpresa?.media?.estilos;
  if (!bloque?.items?.length){
    await client.sendMessage(message.from, configEmpresa?.mensajes?.estilosIntro || 'Estilos disponibles');
    return { finalizado: true };
  }
  const intro = configEmpresa?.mensajes?.estilosIntro || bloque.caption || 'Estilos disponibles';
  await client.sendMessage(message.from, intro);
  await sendMediaGroup({ client, to: message.from, items: bloque.items, caption: bloque.caption || '' });
  return { finalizado: true };
}

async function handlePromos({ client, message, configEmpresa }){
  const bloque = configEmpresa?.media?.promociones;
  const texto = configEmpresa?.mensajes?.promociones || bloque?.caption || 'Sin promociones activas';
  await client.sendMessage(message.from, texto);
  if (bloque?.items?.length){
    await sendMediaGroup({ client, to: message.from, items: bloque.items, caption: bloque.caption || '' });
  }
  return { finalizado: true };
}

async function handleCancelMod(){ return { delegarAFlujoCitas: true, action: 'CANCEL_MOD' }; }

async function handleCitas({ client, message }){
  //await client.sendMessage(message.from, 'Perfecto, vamos a agendar tu cita.');
  return { delegarAFlujoCitas: true, action: 'NUEVA_CITA' };
}

async function procesarMensajeHeaven(ctx){
  const { client, message, configEmpresa, nombreCliente } = ctx;
  const raw = (message.body || '').trim();
  const normalized = emojiMap[raw] || raw;
  const msg = norm(normalized);

  const kw = configEmpresa?.keywords || {};
  if (kw.precios?.some(k => msg.includes(k))) return handlePrecios(ctx);
  if (kw.estilos?.some(k => msg.includes(k))) return handleEstilos(ctx);
  if (kw.promos?.some(k => msg.includes(k))) return handlePromos(ctx);
  if (kw.cancelar?.some(k => msg.includes(k))) return handleCancelMod(ctx);
  if (kw.citas?.some(k => msg.includes(k))) return handleCitas(ctx);

  switch (msg) {
    case '1': return handlePrecios(ctx);
    case '2': return handleCitas(ctx);
    case '3': return handleEstilos(ctx);
    case '4': return handlePromos(ctx);
    case '5': return handleCancelMod(ctx);
    default:  return sendMenu({ client, message, configEmpresa, nombreCliente });
  }
}

module.exports = { procesarMensajeHeaven };
