// /frontend/js/login.js
function activarLogin() {
  const form = document.getElementById('login-form');
  const email = document.getElementById('login-email');
  const password = document.getElementById('login-password');
  const errorDiv = document.getElementById('login-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    form.querySelector('#btn-login').disabled = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim(),
          password: password.value
        })
      });

      if (!res.ok) {
        let msg = 'Error de inicio de sesión.';
        try {
          const data = await res.json();
          msg = data.mensaje || msg;
        } catch {}
        errorDiv.textContent = msg;
        form.querySelector('#btn-login').disabled = false;
        return;
      }

      const data = await res.json();
      localStorage.setItem('tokenBot', data.token);
      localStorage.setItem('usuarioBot', JSON.stringify(data.usuario));

      // Al hacer login, carga la app completa (sin reload)
      if (typeof cargarComponente === 'function') {
        await cargarComponente('topbar-container', 'components/topbar.html');
        await cargarComponente('sidebar-container', 'components/sidebar.html');
        await cargarComponente('main-content', 'components/dashboard.html');
      } else {
        location.reload();
      }
    } catch (err) {
      errorDiv.textContent = 'Error de red o servidor.';
      form.querySelector('#btn-login').disabled = false;
    }
  };
}

// 👇 Hace que activarLogin esté disponible globalmente
window.activarLogin = activarLogin;
