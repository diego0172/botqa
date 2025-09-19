const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { MessageMedia } = require('whatsapp-web.js');

function fileExists(absPath) {
  try { return fs.existsSync(absPath) && fs.statSync(absPath).isFile(); }
  catch { return false; }
}

async function sendLocalFile({ client, to, absPath, caption }) {
  const buffer = fs.readFileSync(absPath);
  const mimeType = mime.lookup(absPath) || 'application/octet-stream';
  const b64 = buffer.toString('base64');
  const filename = path.basename(absPath);
  const media = new MessageMedia(mimeType, b64, filename);
  await client.sendMessage(to, media, { caption });
}

async function sendRemoteUrl({ client, to, url, caption }) {
  await client.sendMessage(to, url, { caption });
}

async function sendMediaItem({ client, to, item, caption }) {
  const isUrl = /^https?:\/\//i.test(item.path);
  const finalCaption = caption || item.label || '';
  if (isUrl) {
    return sendRemoteUrl({ client, to, url: item.path, caption: finalCaption });
  } else {
    const absPath = path.isAbsolute(item.path) ? item.path : path.join(process.cwd(), item.path);
    if (!fileExists(absPath)) {
      await client.sendMessage(to, `No encuentro el archivo ${item.label || ''}. Continua con el menu mientras lo cargamos.`);
      return;
    }
    return sendLocalFile({ client, to, absPath, caption: finalCaption });
  }
}

async function sendMediaGroup({ client, to, items = [], caption }) {
  for (const it of items) {
    await sendMediaItem({ client, to, item: it, caption });
  }
}

module.exports = { sendMediaItem, sendMediaGroup };