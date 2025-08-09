(function() {
  console.log('[calendar.js] cargado');
  const calendarEl = document.getElementById('calendar');
  if (calendarEl) {
    fetch('/api/citas')
      .then(res => res.json())
      .then(citas => {
        const eventos = citas.map(cita => ({
          id: cita.id,
          title: cita.titulo,
          start: cita.fecha_inicio,
          end: cita.fecha_fin,
          extendedProps: {
            descripcion: cita.descripcion,
            origen: cita.origen,
            telefono: cita.telefono
          }
        }));

        const calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: 'dayGridMonth',
          locale: 'es',
          headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
          },
          events: eventos,
          eventClick: function (info) {
            const { title, start, end, extendedProps } = info.event;
            alert(
              `Título: ${title}\nDescripción: ${extendedProps.descripcion}\nInicio: ${start.toLocaleString()}\nFin: ${end.toLocaleString()}\nOrigen: ${extendedProps.origen}\nTeléfono: ${extendedProps.telefono || 'N/A'}`
            );
          }
        });

        calendar.render();
      })
      .catch(err => {
        calendarEl.innerHTML = '<div style="color: red;">Error al cargar el calendario.</div>';
        console.error('Error cargando citas:', err);
      });
  }
})();

// Botón y modal
const nuevaCitaBtn = document.getElementById('nueva-cita-btn');
const modalBg = document.getElementById('modal-cita-bg');
const cerrarModalBtn = document.getElementById('cerrar-modal-cita');
const formCita = document.getElementById('form-cita');
const msgCita = document.getElementById('msg-cita');

// Mostrar modal
nuevaCitaBtn.onclick = () => { modalBg.classList.remove('hidden'); }
// Cerrar modal
cerrarModalBtn.onclick = () => { 
  modalBg.classList.add('hidden');
  msgCita.textContent = '';
  formCita.reset();
}
// Guardar cita
formCita.onsubmit = async (e) => {
  e.preventDefault();
  msgCita.textContent = '';
  const body = {
    titulo: document.getElementById('cita-titulo').value,
    descripcion: document.getElementById('cita-desc').value,
    fecha_inicio: document.getElementById('cita-inicio').value,
    fecha_fin: document.getElementById('cita-fin').value,
    telefono: document.getElementById('cita-tel').value,
    email: document.getElementById('cita-email').value,
    origen: 'web'
  };
  try {
    const res = await fetch('/api/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Error al guardar');
    msgCita.textContent = '✅ Cita guardada y notificada';
    modalBg.classList.add('hidden');
    formCita.reset();
    // Recarga el calendario (o refetch events si usas FullCalendar avanzado)
    window.location.reload(); // o recarga sólo eventos si prefieres
  } catch (err) {
    msgCita.textContent = '❌ Error al guardar';
  }
}
