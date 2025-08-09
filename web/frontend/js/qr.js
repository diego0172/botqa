function cargarHistorial() {
  const chatBox = document.getElementById('chat-historial');
  if (!chatBox) {
    console.warn('[chat.js] No se encontró el contenedor #chat-historial');
    return;
  }
  fetch('/api/chat/historial')
    .then(res => res.json())
    .then(historial => {
      chatBox.innerHTML = '';
      if (!Array.isArray(historial) || !historial.length) {
        chatBox.innerHTML = '<div style="color:#888;"><em>No hay mensajes en el historial.</em></div>';
        return;
      }
      historial.reverse().forEach(msg => {
        if (msg.pregunta) {
          chatBox.innerHTML += `<div class="mensaje mensaje-usuario">${msg.pregunta}</div>`;
        }
        if (msg.respuesta) {
          chatBox.innerHTML += `<div class="mensaje mensaje-bot">${msg.respuesta}</div>`;
        }
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    })
    .catch(e => {
      chatBox.innerHTML = '<div style="color:red;"><em>No se pudo cargar el historial</em></div>';
    });
}

// Llama cargarHistorial() siempre que este script sea cargado
cargarHistorial();
document.addEventListener('DOMContentLoaded', () => {
  const qrDiv = document.getElementById('qr-wa');
  const chatForm = document.getElementById('formulario-chat');
  const chatBox = document.getElementById('chat-historial');

  let qrInterval; // Guarda el intervalo para refrescar QR

  async function renderQrWhatsApp() {
    try {
      const res = await fetch('/api/whatsapp/qrimg', { cache: 'reload' });
      if (!res.ok) throw new Error('QR no disponible');
      const data = await res.json();

      qrDiv.innerHTML = `
        <div class="qr-popup">
          <div class="qr-popup-title">Escanea este código QR con WhatsApp Web</div>
          <img src="${data.qr}" alt="QR WhatsApp" />
        </div>
      `;
      if (chatForm) chatForm.style.display = 'none';
      if (chatBox) chatBox.style.display = 'none';
      qrDiv.style.display = 'flex';
    } 
    catch (e) {
      console.log('Ocultando overlay QR, mostrando chat y sidebar');
      // Solo oculta el overlay, NO lo elimines
      if (qrDiv) qrDiv.style.display = 'none';
      if (qrInterval) clearInterval(qrInterval);

      // Mostrar el chat si existe (opcional)
      const tryShowChat = () => {
        const chatForm = document.getElementById('formulario-chat');
        const chatBox = document.getElementById('chat-historial');
        if (chatForm) chatForm.style.display = 'flex';
        if (chatBox) chatBox.style.display = 'block';
      };
      tryShowChat();

      // REACTIVA LOS BOTONES DE LA SIDEBAR DESPUÉS DE OCULTAR EL QR
      setTimeout(() => {
        if (typeof activarBotonesNavegacion === 'function') activarBotonesNavegacion();
      }, 250);
    }
  }

  if (qrDiv) {
    renderQrWhatsApp();
    qrInterval = setInterval(renderQrWhatsApp, 10000);
  }
});
