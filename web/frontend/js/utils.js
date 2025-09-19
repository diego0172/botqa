// Detecta el tema actual y lo guarda en localStorage
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  // Detectar si ya hay un tema guardado
  let tema = localStorage.getItem('tema-botqa');
  if (!tema) {
    // Si no hay, detecta el preferido del sistema
    tema = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
    localStorage.setItem('tema-botqa', tema);
  }
  root.classList.remove('modo-claro', 'modo-oscuro');
  root.classList.add(tema === 'oscuro' ? 'modo-oscuro' : 'modo-claro');
});

// Permite cambiar el tema y lo guarda en localStorage
function setTemaBotQA(tema) {
  const root = document.documentElement;
  root.classList.remove('modo-claro', 'modo-oscuro');
  root.classList.add(tema === 'oscuro' ? 'modo-oscuro' : 'modo-claro');
  localStorage.setItem('tema-botqa', tema);
}
window.setTemaBotQA = setTemaBotQA;
