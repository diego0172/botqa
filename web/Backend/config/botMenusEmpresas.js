const botMenus = {
  ferreteria: {
    nombre: "Ferretería Demo",
    menuPrincipal:
      "🛠️ Bienvenido al bot de Ferretería Demo.\n" +
      "1️⃣ Ver productos\n" +
      "2️⃣ Ofertas\n" +
      "3️⃣ Hacer pedido\n" +
      "Escriba el número de la opción.",
    opciones: {
      '1': { respuesta: "Lista de productos (simulada)", siguiente: "en_menu" },
      '2': { respuesta: "No hay ofertas activas.", siguiente: "en_menu" },
      '3': { respuesta: "¿Qué desea pedir?", siguiente: "hacer_pedido" }
    },
    flujos: {
      hacer_pedido: {
        prompt: "Por favor, escriba su pedido:",
        procesa: (mensaje) => `¡Pedido recibido! "${mensaje}". Pronto lo contactaremos.`
      }
    }
  },

  salon: {
    nombre: "Salón Belleza Total",
    menuPrincipal:
      "💇‍♀️ *Bienvenida a Salón Belleza Total:*\n" +
      "1️⃣ Ver servicios\n" +
      "2️⃣ Reservar cita\n" +
      "3️⃣ Consultar promociones\n" +
      "4️⃣ Ubicación y horarios\n" +
      "✏️ Escriba el número de la opción o \"salir\".",
    opciones: {
      '1': {
        respuesta:
          "💅 Servicios disponibles:\n" +
          "- Corte de cabello\n" +
          "- Uñas acrílicas\n" +
          "- Tinte y más.\n" +
          "¿Te interesa alguno? Escribe el nombre del servicio para detalles.",
        siguiente: "detalle_servicio"
      },
      '2': {
        respuesta: "📅 Por favor indica el servicio y la fecha/hora deseada:",
        siguiente: "reservar_cita"
      },
      '3': {
        respuesta: "✨ Promociones:\n- 15% en uñas gelish\n- 2x1 en cejas y pestañas\n...",
        siguiente: "en_menu"
      },
      '4': {
        respuesta:
          "📍 7a avenida 12-34 zona 2. Lunes a sábado, 8am a 6pm. Tel: 2233-8899",
        siguiente: "en_menu"
      }
    },
    flujos: {
      detalle_servicio: {
        prompt: "Escribe el servicio para más información:",
        procesa: (mensaje) =>
          `Detalles del servicio "${mensaje}":\nPrecio y descripción aquí. (Simulado)`
      },
      reservar_cita: {
        prompt: "📅 Indica el nombre, fecha y hora para la reserva:",
        procesa: (mensaje) =>
          `¡Listo! Tu cita para "${mensaje}" ha sido registrada. Pronto recibirás confirmación.`
      }
    }
  },

  zapateria: {
    nombre: "Zapatería Demo",
    menuPrincipal:
      "👟 Bienvenido a Zapatería Demo.\n" +
      "1️⃣ Ver catálogo\n" +
      "2️⃣ Consultar tallas\n" +
      "3️⃣ Realizar compra\n" +
      "Escriba el número de la opción.",
    opciones: {
      '1': { respuesta: "Catálogo: deportivos, casuales, formales.", siguiente: "en_menu" },
      '2': { respuesta: "Tenemos tallas del 34 al 45.", siguiente: "en_menu" },
      '3': { respuesta: "Indique modelo y talla que desea comprar.", siguiente: "realizar_compra" }
    },
    flujos: {
      realizar_compra: {
        prompt: "Modelo y talla:",
        procesa: (mensaje) => `Compra registrada: "${mensaje}". Te confirmaremos por este medio.`
      }
    }
  },

  BotEngine: {
    nombre: "BotEngine",
    menuPrincipal: (nombre) => ({
      tipoRespuesta: 'texto',
      texto:
        `Hola ${nombre}, 👋 soy el asistente virtual de *BotEngine* 🤖.\n` +
        `No solo estoy aqui para ayudarte, tambien soy una muestra real de lo que nuestro bot puede hacer.\n\n` +
        "¿Qué te gustaría hacer hoy?\n\n" +
        "*1️⃣* Precios\n" +
        "*2️⃣* Citas\n" +
        "*3️⃣* Servicios\n\n" +
        "O escribe *ayuda* y un asesor te atenderá en breve."
    }),
    opciones: {
      '1': { respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?", siguiente: "en_menu" },
      '1️⃣': { respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?", siguiente: "en_menu" },
      'precios': { respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?", siguiente: "en_menu" },
      'consultar precios': { respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?", siguiente: "en_menu" },

      '2': { respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.", siguiente: "cita_nombre" },
      '2️⃣': { respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.", siguiente: "cita_nombre" },
      'citas': { respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.", siguiente: "cita_nombre" },
      'quiero una cita': { respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.", siguiente: "cita_nombre" },
      'agendar cita': { respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.", siguiente: "cita_nombre" },

      '3': { respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.", siguiente: "detalle_servicio" },
      '3️⃣': { respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.", siguiente: "detalle_servicio" },
      'servicios': { respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.", siguiente: "detalle_servicio" },
      'ver servicios': { respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.", siguiente: "detalle_servicio" },

      'ayuda': { respuesta: "🧑‍💼 Un asesor te atenderá en breve. Gracias por escribirnos.", siguiente: "en_menu" }
    },
    flujos: {
      detalle_servicio: {
        prompt: "✉️ Escribe el servicio del que deseas más información:",
        procesa: (mensaje) => `Información del servicio \"${mensaje}\": descripción simulada.`
      }
    }
  },

  HEAVEN_LASHES: {
    nombre: 'Heaven Lashes',
    saludo: (nombre) => `Hola ${nombre}, soy tu asistente virtual de Heaven Lashes. Estoy aqui para apoyarte a resolver tus dudas y agendar tu proxima cita.`,
    opciones: [
      { clave: '1', etiqueta: 'Precios 💰', intent: 'PRECIOS' },
      { clave: '2', etiqueta: 'Citas 📅', intent: 'CITAS' },
      { clave: '3', etiqueta: 'Estilos 💅', intent: 'ESTILOS' },
      { clave: '4', etiqueta: 'Promociones 🔥', intent: 'PROMOS' },
      { clave: '5', etiqueta: 'Cancelacion o modificacion de cita ❌', intent: 'CANCEL_MOD' },
    ],
     horario: { inicio: '09:00', fin: '18:00', diasHabiles: [1,2,3,4,5,6], zona: 'America/Guatemala' },
  cita: { 
    duracionMinutos: 60,
    sesion: {                              // 👈 NUEVO
      recordatorioMin: 5,                  // minutos para enviar recordatorio
      cierreMin: 15,                       // minutos para cerrar flujo
      reanudarMin: 120, 
      msgRecordatorio: '¿Sigues ahi? Si deseas continuar con tu cita responde un mensaje, o escribe cancelar para salir.',
      msgCierre: 'He cerrado tu sesion por inactividad. Si deseas agendar mas tarde, escribe *citas*.',
       msgReanudado: 'Listo, he reanudado tu sesion anterior. Sigamos donde nos quedamos.'
    }
  },
     calendar: {
        id: 'primary',              // o el ID del calendario tipo xxxxx@group.calendar.google.com
        tz: 'America/Guatemala',    // zona horaria IANA
        slotMinutes: 60             // duración por cita
      },
    keywords: {
      precios: ['precio','precios','tarifas','costo'],
      estilos: ['estilos','efectos','catalogo'],
      citas: ['cita','agendar','reservar','agenda','reprogramar'],
      promos: ['promo','promocion','promociones'],
      cancelar: ['cancelar','cancelacion','modificar','cambiar fecha']
    },
    mensajes: {
      menu: [
        '¿Cómo te puedo apoyar hoy?',
        '',
        '1️⃣ Precios 💰',
        '2️⃣ Citas 📅',
        '3️⃣ Estilos 💅',
        '4️⃣ Promociones 🔥',
        '5️⃣ Cancelación o modificación de cita ❌',
        '',
        'O escribe "ayuda" y un asesor te atenderá'
      ].join('\n'),
      precios: [
        '*Lista de precios* 💰',
        '',
        'Clásico:       Q. 399.00',
        'Mojado:       Q. 399.00',
        'Híbridas:     Q. 500.00',
        'Volumen:     Q. 700.00',
        'Hawaianas: Q. 350.00',
        'Efectos:       Q. 400.00',
        '',
        'Escribe 2 para agendar tu cita 📅'
      ].join('\n'),
      estilosIntro: 'Estos son los estilos. Si tienes otra idea puedes hacérmela saber o escribe 2 y agendate tu cita. 📅',
      promociones: [
        'Promociones activas ✨',
        '',
        '1️⃣ Set hawaiano a Q. 299.00',
        '',
        'Escribe  2 para agendar 📅'
      ].join('\n'),
      pagos: [
        'Nuestras formas de pago son:',
        'Efectivo.',
        'Transferencia a:',
        'Cuenta Banco Industrial 2830069700 Monetaria'
      ].join('\n'),
      preparacion: [
        '*Antes de tu cita*',
        '☑ No traer maquillaje en tus ojitos.',
        '☑ Me encantaría que en tu visita pueda permanecer un solo acompañante contigo.',
        '☑ No haberse realizado lash lifting o algún procedimiento en las pestañas por dos meses antes.',
        '☑ No usar rimel a prueba de agua en 24 horas previas.',
        '☑ Si usas lentes de contacto debes retirarlos para el procedimiento.',
        '☑ Y sobre todo, estar lista de quedar estupenda 😍.'
      ].join('\n'),
      confirmacionCita: 'Tu cita ha sido programada. Enviare recordatorio y lineamientos de preparacion.',
      reprogramacion: 'Entendido. Vamos a cambiar la fecha. Por favor ingresa nueva fecha y hora en formato dd/mm/yyyy hh:mm',
      cancelacion: 'Tu cita ha sido cancelada. Si deseas una nueva fecha escribe 2 o la palabra cita'
    },
    media: {
      estilos: {
        caption: 'Catálogo de estilos 💅',
        items: [
          //{ type: 'image', label: 'Clásico',  path: 'storage/media/heavenlashes/estilo_clasico.jpg' },
          //{ type: 'image', label: 'Híbridas', path: 'storage/media/heavenlashes/estilo_hibridas.jpg' },
          //{ type: 'image', label: 'Volumen',  path: 'storage/media/heavenlashes/estilo_volumen.jpg' },
          { type: 'pdf',   label: 'Catálogo completo', path: 'storage/media/heavenlashes/catalogo_estilos.pdf' }
        ]
      },
      promociones: {
        caption: 'Promociones 🔥',
        items: [
          //{ type: 'image', label: 'Primera visita -20%', path: 'storage/media/heavenlashes/promo_primera.jpg' },
         // { type: 'image', label: 'Happy Hour -15%', path: 'storage/media/heavenlashes/promo_happy.jpg' }
        ]
      },
    }
  }
};

function obtenerBotConfig(empresa) {
  return botMenus[empresa] || null;
}

module.exports = { obtenerBotConfig, botMenus };