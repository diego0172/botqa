// services/generarInforme.js
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const pool = require('../db');
const logger = require('../middlewares/logger');

const generarInformeInventario = async () => {
  const doc = new jsPDF();
  const fecha = new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' });

  doc.setFontSize(14);
  doc.text('📦 INFORME DE INVENTARIO', 14, 15);
  doc.setFontSize(10);
  doc.text(`Generado: ${fecha}`, 14, 22);

  // Consultar datos
  const result = await pool.query('SELECT codigo_producto, nombre_producto, cantidad, precio FROM inventario');
  const registros = result.rows;

  const rows = [];
  let totalGeneral = 0;

  registros.forEach(reg => {
    const cantidad = Number(reg.cantidad) || 0;
    const precio = Number(reg.precio) || 0;
    const totalLinea = cantidad * precio;
    totalGeneral += totalLinea;

    rows.push([
      reg.codigo_producto || '',
      reg.nombre_producto || '',
      cantidad,
      `Q${precio.toFixed(2)}`,
      `Q${totalLinea.toFixed(2)}`
    ]);
  });

  doc.autoTable({
    startY: 30,
    head: [['Código', 'Nombre', 'Cantidad', 'Precio', 'Total']],
    body: rows,
    styles: { fontSize: 9 },
  });

  doc.setFontSize(11);
  doc.text(`💰 Total general del inventario: Q${totalGeneral.toFixed(2)}`, 14, doc.lastAutoTable.finalY + 10);

  // Asegurar que la carpeta temp exista
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Guardar el archivo por si se necesita
  const nombreArchivo = `informe_inventario_${Date.now()}.pdf`;
  const ruta = path.join(tempDir, nombreArchivo);
  const buffer = doc.output('arraybuffer');
  fs.writeFileSync(ruta, Buffer.from(buffer));

  return buffer; // para enviar por WhatsApp
};

module.exports = { generarInformeInventario };
