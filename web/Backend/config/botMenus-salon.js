module.exports = {
  nombre: "Salón Belleza Total",
  menuPrincipal: `
    💇‍♀️ *Bienvenida a Salón Belleza Total:*
    1️⃣ Ver servicios
    2️⃣ Reservar cita
    3️⃣ Consultar promociones
    4️⃣ Ubicación y horarios
    ✏️ Escriba el número de la opción o "salir".
  `,
  opciones: {
    '1': { respuesta: "💅 Servicios disponibles:\n- Corte de cabello\n- Uñas acrílicas\n- Tinte y más.\n¿Te interesa alguno? Escribe el nombre del servicio para detalles.", siguiente: "detalle_servicio" },
    '2': { respuesta: "📅 Por favor indica el servicio y la fecha/hora deseada:", siguiente: "reservar_cita" },
    '3': { respuesta: "✨ Promociones:\n- 15% en uñas gelish\n- 2x1 en cejas y pestañas\n...", siguiente: "en_menu" },
    '4': { respuesta: "📍 7a avenida 12-34 zona 2. Lunes a sábado, 8am a 6pm. Tel: 2233-8899", siguiente: "en_menu" }
  },
  flujos: {
    detalle_servicio: {
      prompt: "Escribe el servicio para más información:",
      procesa: (mensaje) => `Detalles del servicio "${mensaje}":\nPrecio y descripción aquí. (Simulado)`
    },
    reservar_cita: {
      prompt: "📅 Indica el nombre, fecha y hora para la reserva:",
      procesa: (mensaje) => `¡Listo! Tu cita para "${mensaje}" ha sido registrada. Pronto recibirás confirmación.`
    }
  }
};
