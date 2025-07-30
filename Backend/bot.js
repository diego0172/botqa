const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('📲 Escaneá este QR con tu WhatsApp para iniciar sesión.');
});

client.on('ready', () => {
  console.log('✅ Bot conectado a WhatsApp');
});

client.on('message', async message => {
  const texto = message.body.toLowerCase().trim();
  const numero = message.from;

  if (texto === 'menu') {
    await client.sendMessage(numero,
      `📋 *Menú principal disponible:*\n\n` +
      `1️⃣ Consultas 🔍\n` +
      `2️⃣ Registro de productos ➕\n` +
      `3️⃣ Compras 🛒\n` +
      `4️⃣ Ver historial 🗂️\n\n` +
      `✏️ Escribí el número de la opción para continuar.`
    );
  }

  // Aquí vamos a ir agregando más comandos paso a paso
});

client.initialize();
