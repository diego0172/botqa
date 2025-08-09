// frontend/js/chat.js

// Función robusta para cargar historial
function cargarHistorial() {
  const chatBox = document.getElementById('chat-historial');
  if (!chatBox) {
    console.warn('[chat.js] No se encontró el contenedor #chat-historial');
    return;
  }

  // Obtén el id del usuario desde localStorage (ajusta si usas otra variable)
  const usuarioId = localStorage.getItem('usuario_id'); // Cambia 'usuario_id' por tu clave real
console.log('Usuario ID para historial:', usuarioId);
  fetch('/api/chat/historial?usuario_id=' + encodeURIComponent(usuarioId))
    .then(res => res.json())
    .then(historial => {
      chatBox.innerHTML = '';
      if (!Array.isArray(historial) || !historial.length) {
        chatBox.innerHTML = '<div style="color:#888;"><em>No hay mensajes en el historial.</em></div>';
        return;
      }
      historial.reverse().forEach(msg => {
        if (msg.pregunta) {
          chatBox.innerHTML += `<div class="wa-message sent">${msg.pregunta}</div>`;
        }
        if (msg.respuesta) {
          let textoRespuesta;
          try {
            const obj = JSON.parse(msg.respuesta);
            textoRespuesta = obj.respuesta || msg.respuesta;
          } catch {
            textoRespuesta = msg.respuesta;
          }
          chatBox.innerHTML += `<div class="wa-message received">${textoRespuesta}</div>`;
        }
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    })
    .catch(e => {
      chatBox.innerHTML = '<div style="color:red;"><em>No se pudo cargar el historial</em></div>';
    });
}

// Maneja envío de mensajes
document.addEventListener('DOMContentLoaded', () => {
  const chatBox = document.getElementById('chat-historial');
  const chatForm = document.getElementById('formulario-chat');
  const chatInput = document.getElementById('input-mensaje');

  if (chatForm && chatInput && chatBox) {
    chatForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const mensaje = chatInput.value.trim();
      if (!mensaje) return;

      chatBox.innerHTML += `<div class="wa-message sent">${mensaje}</div>`;
      chatInput.value = '';
      chatBox.scrollTop = chatBox.scrollHeight;

      const loadingId = 'cargando-' + Date.now();
      chatBox.innerHTML += `<div id="${loadingId}" class="wa-message received"><em>Escribiendo...</em></div>`;
      chatBox.scrollTop = chatBox.scrollHeight;

      // Obtén el usuario_id para enviarlo al backend
      const usuarioId = localStorage.getItem('usuario_id'); // Ajusta si usas otra clave

      try {
        const response = await fetch('/api/chat/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta: mensaje, usuario_id: usuarioId })
        });
        const data = await response.json();

        let textoRespuesta;
        try {
          const obj = JSON.parse(data.respuesta);
          textoRespuesta = obj.respuesta || data.respuesta;
        } catch {
          textoRespuesta = data.respuesta;
        }

        document.getElementById(loadingId).remove();
        chatBox.innerHTML += `<div class="wa-message received">${textoRespuesta}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      } catch (err) {
        document.getElementById(loadingId).remove();
        chatBox.innerHTML += `<div class="wa-message received" style="color:red;"><em>Error de conexión</em></div>`;
      }
    });
  }
});

// ¡NO LLAMES cargarHistorial aquí!
// Solo llama cargarHistorial() DESPUÉS de que tu SPA haya cargado el chat en el DOM, 
// por ejemplo, desde tu index.js, después de inyectar el HTML y el script del chat.
