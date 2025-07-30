// services/procesarExcel.js
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const pool = require('../db');
const logger = require('../middlewares/logger');

const procesarExcelCompra = async (media, numero) => {
  const buffer = Buffer.from(media.data, 'base64');
  const filePath = path.join(__dirname, `../../temp_${numero}.xlsx`);
  fs.writeFileSync(filePath, buffer);

  try {
    const workbook = xlsx.readFile(filePath);
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const filas = xlsx.utils.sheet_to_json(hoja);

    let nuevosProductos = 0;
    let registrosInventario = 0;

    for (const fila of filas) {
      const {
        codigo_producto,
        nombre_producto,
        descripcion,
        categoria,
        precio_base,
        cantidad,
      } = fila;

      if (!codigo_producto || !nombre_producto || !cantidad) continue;

      const existe = await pool.query(
        'SELECT 1 FROM productos WHERE codigo_producto = $1',
        [codigo_producto]
      );

      if (existe.rowCount === 0) {
        await pool.query(
          `INSERT INTO productos (codigo_producto, nombre_producto, descripcion, categoria, precio_base)
           VALUES ($1, $2, $3, $4, $5)`,
          [codigo_producto, nombre_producto, descripcion || '', categoria || '', precio_base || 0]
        );
        nuevosProductos++;
      }

      await pool.query(
        'INSERT INTO inventario (codigo_producto, nombre_producto, cantidad, precio) VALUES ($1, $2, $3, $4)',
        [codigo_producto, nombre_producto, cantidad, precio_base]
      );
      registrosInventario++;
    }

    return {
      nuevosProductos,
      registrosInventario,
      mensaje: `✅ Productos nuevos: ${nuevosProductos}\n📦 Registros en inventario: ${registrosInventario}`
    };
  } catch (error) {
    logger.error(`❌ Error al procesar archivo Excel: ${error.message}`);
    throw new Error('Error al procesar el archivo');
  } finally {
    fs.unlinkSync(filePath);
  }
};

module.exports = { procesarExcelCompra };
