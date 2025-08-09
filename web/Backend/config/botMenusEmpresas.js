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
    // Opción 1: Precios
    '1': {
      respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?",
      siguiente: "en_menu"
    },
    '1️⃣': {
      respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?",
      siguiente: "en_menu"
    },
    'precios': {
      respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?",
      siguiente: "en_menu"
    },
    'consultar precios': {
      respuesta: "💰 Nuestros precios varían según el servicio. ¿Qué deseas cotizar?",
      siguiente: "en_menu"
    },

    // Opción 2: Citas
    '2': {
      respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.",
      siguiente: "cita_nombre"
    },
    '2️⃣': {
      respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.",
      siguiente: "cita_nombre"
    },
    'citas': {
      respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.",
      siguiente: "cita_nombre"
    },
    'quiero una cita': {
      respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.",
      siguiente: "cita_nombre"
    },
    'agendar cita': {
      respuesta: "📆 Empecemos a agendar tu cita.\nIndica tu *nombre completo* por favor.",
      siguiente: "cita_nombre"
    },

    // Opción 3: Servicios
    '3': {
      respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.",
      siguiente: "detalle_servicio"
    },
    '3️⃣': {
      respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.",
      siguiente: "detalle_servicio"
    },
    'servicios': {
      respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.",
      siguiente: "detalle_servicio"
    },
    'ver servicios': {
      respuesta: "🛎️ Ofrecemos: Consultoría, Desarrollo Web y Automatización.",
      siguiente: "detalle_servicio"
    },

    // Ayuda
    'ayuda': {
      respuesta: "🧑‍💼 Un asesor te atenderá en breve. Gracias por escribirnos.",
      siguiente: "en_menu"
    }
  },
  flujos: {
    detalle_servicio: {
      prompt: "✉️ Escribe el servicio del que deseas más información:",
      procesa: (mensaje) =>
        `Información del servicio \"${mensaje}\": descripción simulada.`
    }
  }
}
};
// Función para obtener el menú de una empresa
function obtenerBotConfig(empresa) {
  return botMenus[empresa] || null;
}

module.exports = {
  obtenerBotConfig
};
