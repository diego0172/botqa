// /backend/config/botMenus-ferreteria.js
module.exports = {
  nombre: "Ferretería Demo",
  menuPrincipal: "🛠️ Bienvenido al bot de Ferretería Demo.\n1️⃣ Ver productos\n2️⃣ Ofertas\n3️⃣ Hacer pedido\nEscriba el número de la opción.",
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
};
