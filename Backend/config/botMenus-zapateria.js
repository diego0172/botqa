module.exports = {
  nombre: "Zapatería Paso Fino",
  menuPrincipal: `
    👟 *Bienvenido a Zapatería Paso Fino:*
    1️⃣ Consultar productos
    2️⃣ Ver promociones
    3️⃣ Realizar pedido
    4️⃣ Ubicación y contacto
    ✏️ Escriba el número de la opción o "salir".
  `,
  opciones: {
    '1': { respuesta: "🔎 ¿Qué modelo, talla o color buscas?", siguiente: "consultar_producto" },
    '2': { respuesta: "🔥 Promociones:\n- 2x1 en sandalias\n- 20% off en deportivos\n...", siguiente: "en_menu" },
    '3': { respuesta: "📝 Escribe el modelo, talla y cantidad del zapato que deseas pedir:", siguiente: "hacer_pedido" },
    '4': { respuesta: "📍 Estamos en 4a calle 3-15 zona 1, Tel: 5555-4321", siguiente: "en_menu" }
  },
  flujos: {
    consultar_producto: {
      prompt: "🔎 Escribe el modelo, talla o color:",
      procesa: (mensaje) => `Resultado de búsqueda: "${mensaje}" (consulta simulada; aquí integrarías tu sistema de inventario)`
    },
    hacer_pedido: {
      prompt: "📝 Detalla tu pedido:",
      procesa: (mensaje) => `¡Gracias! Tu pedido ha sido recibido: "${mensaje}". Un asesor te contactará para confirmar.`
    }
  }
};
