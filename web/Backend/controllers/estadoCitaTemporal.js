const estadoCitasTemporales = {};

function iniciarFlujoCita(numeroUsuario, empresa) {
  estadoCitasTemporales[numeroUsuario] = {
    empresa,
    paso: 'nombre',
    datos: {}
  };
}

function actualizarPasoCita(numeroUsuario, campo, valor) {
  if (estadoCitasTemporales[numeroUsuario]) {
    estadoCitasTemporales[numeroUsuario].datos[campo] = valor;

    // Avanza al siguiente paso
    const pasos = ['nombre', 'servicio', 'fecha'];
    const index = pasos.indexOf(campo);
    estadoCitasTemporales[numeroUsuario].paso = pasos[index + 1] || 'completo';
  }
}

function obtenerEstadoCita(numeroUsuario) {
  return estadoCitasTemporales[numeroUsuario];
}

function eliminarCitaTemporal(numeroUsuario) {
  delete estadoCitasTemporales[numeroUsuario];
}

module.exports = {
  iniciarFlujoCita,
  actualizarPasoCita,
  obtenerEstadoCita,
  eliminarCitaTemporal
};
