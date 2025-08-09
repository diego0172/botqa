// --- UNA SOLA VEZ EL LISTENER PRINCIPAL ---
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('tokenBot');
  document.getElementById('topbar-container').innerHTML = '';
  document.getElementById('sidebar-container').innerHTML = '';
  if (!token) {
    await cargarComponente('main-content', 'components/login.html');
  } else {
    await cargarComponente('topbar-container', 'components/topbar.html');
    await cargarComponente('sidebar-container', 'components/sidebar.html');
    await cargarComponente('main-content', 'components/dashboard.html');
  }
  const tema = localStorage.getItem('temaBot') || 'light';
  aplicarTema(tema);

  // Config botón ajustes (siempre disponible)
  const configBtn = document.getElementById('bot-config-btn');
  if (configBtn) {
    configBtn.addEventListener('click', async () => {
      if (!document.getElementById('config-modal')) {
        const res = await fetch('components/configuracion.html');
        const html = await res.text();
        document.body.insertAdjacentHTML('beforeend', html);
        activarConfiguracionPopup();
      } else {
        document.getElementById('config-modal').classList.remove('hidden');
        document.getElementById('config-modal-bg').classList.remove('hidden');
      }
    });
  }
});

// --- CARGA COMPONENTES SPA ---
async function cargarComponente(idContenedor, ruta) {
  try {
    const contenedor = document.getElementById(idContenedor);

    // Animación de fade SOLO en main-content
    if (idContenedor === 'main-content') {
      contenedor.classList.add('fade');
      setTimeout(async () => {
        await _insertarHTMLYScript(contenedor, ruta);
        contenedor.classList.remove('fade');
      }, 150);
    } else {
      await _insertarHTMLYScript(contenedor, ruta);
      // Sidebar siempre activa sus botones
      if (idContenedor === 'sidebar-container') {
        activarToggleSidebar();
        activarBotonesNavegacion();
      }
    }
  } catch (error) {
    console.error(`Error cargando ${ruta}:`, error);
  }
}

async function _insertarHTMLYScript(contenedor, ruta) {
  const respuesta = await fetch(ruta);
  const html = await respuesta.text();
  contenedor.innerHTML = html;

  if (ruta.endsWith('login.html')) {
    // ... login.js
  }
  if (ruta.endsWith('chat.html')) {
  const scripts = Array.from(document.querySelectorAll('script[src$="js/chat.js"]'));
  scripts.forEach(s => s.remove());
  const script = document.createElement('script');
  script.src = 'js/chat.js';
  script.onload = () => {
    console.log('[chat.js] inyectado');
    // Espera un poco y luego llama a cargarHistorial si existe
    setTimeout(() => {
      if (typeof cargarHistorial === 'function') cargarHistorial();
    }, 100);
  };
  document.body.appendChild(script);
}

  if (ruta.endsWith('calendar.html')) {
    // LIMPIA y CARGA SIEMPRE calendar.js
    const scripts = Array.from(document.querySelectorAll('script[src$="js/calendar.js"]'));
    scripts.forEach(s => s.remove());
    const script = document.createElement('script');
    script.src = 'js/calendar.js';
    script.onload = () => console.log('[calendar.js] inyectado');
    document.body.appendChild(script);
  }
}

// --- NAVEGACION PROTEGIDA SPA ---
async function navegarProtegido(ruta, tituloClave = null) {
  const token = localStorage.getItem('tokenBot');
  if (!token) {
    await cargarComponente('main-content', 'components/login.html');
    return;
  }
  await cargarComponente('main-content', ruta);
  if (tituloClave) {
    const titulos = {
      chat: '💬 Chat',
      calendar: '📅 Calendario',
      dashboard: '📊 Dashboard'
    };
    const titulo = document.getElementById('titulo-seccion');
    if (titulo && titulos[tituloClave]) {
      titulo.textContent = titulos[tituloClave];
    }
  }
}

// --- SIDEBAR Y BOTONES ---
function activarToggleSidebar() {
  const btn = document.getElementById('toggle-menu');
  const sidebar = document.getElementById('sidebar');
  const appContainer = document.querySelector('.app-container');
  if (btn && sidebar && appContainer) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      sidebar.classList.toggle('anim-hide');
      appContainer.classList.toggle('sidebar-open', !sidebar.classList.contains('anim-hide'));
    });
    document.addEventListener('click', function(e) {
      if (!sidebar.classList.contains('anim-hide') &&
          !sidebar.contains(e.target) &&
          e.target !== btn) {
        sidebar.classList.add('anim-hide');
        appContainer.classList.remove('sidebar-open');
      }
    });
  }
}
function activarBotonesNavegacion() {
  const items = document.querySelectorAll('.sidebar-item');
  const sidebar = document.getElementById('sidebar');
  const appContainer = document.querySelector('.app-container');
  const titulo = document.getElementById('titulo-seccion');
  const titulos = {
    chat: '💬 Chat',
    calendar: '📅 Calendario',
    dashboard: '📊 Dashboard'
  };
  items.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      navegarProtegido(`components/${section}.html`, section);
      if (titulo && titulos[section]) {
        titulo.textContent = titulos[section];
      }
      if (sidebar && appContainer) {
        sidebar.classList.add('anim-hide');
        appContainer.classList.remove('sidebar-open');
      }
    });
  });
}

// --- TEMAS Y LOGOUT ---
function aplicarTema(tema) {
  const root = document.documentElement;
  if (tema === 'dark') {
    root.classList.add('modo-oscuro');
    root.classList.remove('modo-claro');
  } else if (tema === 'light') {
    root.classList.add('modo-claro');
    root.classList.remove('modo-oscuro');
  } else if (tema === 'auto') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('modo-oscuro');
      root.classList.remove('modo-claro');
    } else {
      root.classList.add('modo-claro');
      root.classList.remove('modo-oscuro');
    }
  }
}
function logout() {
  localStorage.removeItem('tokenBot');
  localStorage.removeItem('usuarioBot');
  document.getElementById('topbar-container').innerHTML = '';
  document.getElementById('sidebar-container').innerHTML = '';
  cargarComponente('main-content', 'components/login.html');
}

// --- CONFIGURACION MODAL ---
function activarConfiguracionPopup() {
  const cerrarBtn = document.getElementById('cerrar-config-modal');
  const modal = document.getElementById('config-modal');
  const modalBg = document.getElementById('config-modal-bg');
  const empresaSelect = document.getElementById('empresa-select');
  const idiomaSelect = document.getElementById('idioma-select');
  const temaSelect = document.getElementById('tema-select');
  const msg = document.getElementById('config-msg');
  empresaSelect.value = localStorage.getItem('empresaBot') || 'zapateria';
  idiomaSelect.value = localStorage.getItem('idiomaBot') || 'es';
  temaSelect.value = localStorage.getItem('temaBot') || 'light';
  cerrarBtn.onclick = modalBg.onclick = () => {
    modal.classList.add('hidden');
    modalBg.classList.add('hidden');
    msg.textContent = '';
  };
  empresaSelect.onchange = () => {
    localStorage.setItem('empresaBot', empresaSelect.value);
    msg.textContent = 'Empresa cambiada a: ' + empresaSelect.options[empresaSelect.selectedIndex].text;
    setTimeout(() => msg.textContent = '', 2000);
  };
  idiomaSelect.onchange = () => {
    localStorage.setItem('idiomaBot', idiomaSelect.value);
    msg.textContent = 'Idioma cambiado a: ' + idiomaSelect.options[idiomaSelect.selectedIndex].text;
    setTimeout(() => msg.textContent = '', 2000);
  };
  temaSelect.onchange = () => {
    localStorage.setItem('temaBot', temaSelect.value);
    msg.textContent = 'Tema cambiado a: ' + temaSelect.options[temaSelect.selectedIndex].text;
    setTimeout(() => msg.textContent = '', 2000);
    aplicarTema(temaSelect.value);
  };
  aplicarTema(temaSelect.value);
}
