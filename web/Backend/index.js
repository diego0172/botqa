// /frontend/js/index.js
document.addEventListener('DOMContentLoaded', function() {
  const token = localStorage.getItem('tokenBot');
  if (!token) {
    cargarComponente('main-content', 'components/login.html');
  } else {
    cargarComponente('main-content', 'components/dashboard.html');
  }
});

// Función para navegación protegida
function navegarProtegido(ruta) {
  const token = localStorage.getItem('tokenBot');
  if (!token) {
    cargarComponente('main-content', 'components/login.html');
  } else {
    cargarComponente('main-content', ruta);
  }
}

// Ejemplo de cargarComponente (debes tenerla definida)
async function cargarComponente(idContenedor, ruta) {
  try {
    const respuesta = await fetch(ruta);
    const html = await respuesta.text();
    document.getElementById(idContenedor).innerHTML = html;

    // Si el componente es login, activa la lógica de login
    if (ruta.endsWith('login.html')) {
      const script = document.createElement('script');
      script.src = 'js/login.js';
      script.onload = activarLogin;
      document.body.appendChild(script);
    }
    // Si el componente es dashboard, podrías activar más lógica aquí
  } catch (error) {
    console.error('Error cargando componente:', ruta, error);
  }
}
