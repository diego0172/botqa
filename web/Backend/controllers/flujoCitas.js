const moment = require('moment');
const pool = require('../db');

const citasTemporales = {}; // clave: usuario, valor: { nombre, servicio, fecha, empresa }

const gestionarFlujoCita = async (usuario, mensaje, estadoActual, empresa) => {
  console.log(`Gestionando flujo de cita para usuario: ${usuario}, estado: ${estadoActual}, mensaje: ${mensaje}`);
  const msgLower = mensaje.trim().toLowerCase();
  let datos = citasTemporales[usuario] || { empresa };

  // Paso 1: Pedir nombre
  if (estadoActual === 'cita_nombre') {
    if (!datos.nombre) {
      if (mensaje.trim()) {
        datos.nombre = mensaje.trim();
        citasTemporales[usuario] = datos;
        console.log(`✅ Nombre registrado: ${datos.nombre}`);
        return {
          respuesta: '📌 Ahora indica el servicio que deseas agendar:',
          nuevoEstado: 'cita_servicio'
        };
      } else {
        return {
          respuesta: '✍️ Por favor escribe tu nombre para agendar la cita:',
          nuevoEstado: 'cita_nombre'
        };
      }
    } else {
      return {
        respuesta: '📌 Ya tengo tu nombre. Ahora indicá el servicio que deseas agendar:',
        nuevoEstado: 'cita_servicio'
      };
    }
  }

  // Paso 2: Pedir servicio
  if (estadoActual === 'cita_servicio' && !datos.servicio) {
    datos.servicio = mensaje.trim();
    citasTemporales[usuario] = datos;
    return {
      respuesta: '📅 Indica la fecha y hora para tu cita (por ejemplo: 15/08/2025 14:30):',
      nuevoEstado: 'cita_fecha'
    };
  }

  // Paso 3: Pedir fecha y validar
  if (estadoActual === 'cita_fecha' && !datos.fecha) {
    const fechaIngresada = moment(mensaje, 'DD/MM/YYYY HH:mm', true);

    if (!fechaIngresada.isValid()) {
      return {
        respuesta: '⚠️ Formato de fecha inválido. Usa este formato: 15/08/2025 14:30',
        nuevoEstado: 'cita_fecha'
      };
    }

    if (fechaIngresada.isBefore(moment())) {
      return {
        respuesta: '⏰ No se pueden agendar citas en el pasado. Intenta otra fecha.',
        nuevoEstado: 'cita_fecha'
      };
    }

    const { rows } = await pool.query(
      'SELECT * FROM citas WHERE fecha = $1 AND empresa = $2',
      [fechaIngresada.toDate(), empresa]
    );

    if (rows.length > 0) {
      let nuevaFecha = fechaIngresada.clone().add(1, 'hour');
      let conflicto = true;
      let intentos = 0;

      while (conflicto && intentos < 5) {
        const res = await pool.query(
          'SELECT * FROM citas WHERE fecha = $1 AND empresa = $2',
          [nuevaFecha.toDate(), empresa]
        );

        if (res.rows.length === 0) {
          conflicto = false;
        } else {
          nuevaFecha.add(1, 'hour');
          intentos++;
        }
      }

      if (!conflicto) {
        datos.fecha = nuevaFecha.toDate();
        citasTemporales[usuario] = datos;

        return {
          respuesta: `⚠️ Ya hay una cita en esa hora. ¿Te parece bien esta otra opción disponible: ${nuevaFecha.format('DD/MM/YYYY HH:mm')}? (responde "sí" para confirmar o escribe otra fecha)`,
          nuevoEstado: 'cita_fecha_confirmacion'
        };
      } else {
        return {
          respuesta: '⚠️ Todas las horas cercanas están ocupadas. ¿Deseas agendar otro día?',
          nuevoEstado: 'cita_fecha'
        };
      }
    }

    datos.fecha = fechaIngresada.toDate();
    citasTemporales[usuario] = datos;

    await pool.query(
      'INSERT INTO citas (usuario, nombre, servicio, fecha, empresa) VALUES ($1, $2, $3, $4, $5)',
      [usuario, datos.nombre, datos.servicio, datos.fecha, empresa]
    );

    delete citasTemporales[usuario];

    return {
      respuesta: '✅ Tu cita ha sido registrada exitosamente. ¡Gracias!',
      nuevoEstado: 'en_menu'
    };
  }

  // Confirmación desde sugerencia
  if (estadoActual === 'cita_fecha_confirmacion') {
    if (msgLower === 'sí' || msgLower === 'si') {
      const { nombre, servicio, fecha } = citasTemporales[usuario];

      await pool.query(
        'INSERT INTO citas (usuario, nombre, servicio, fecha, empresa) VALUES ($1, $2, $3, $4, $5)',
        [usuario, nombre, servicio, fecha, empresa]
      );

      delete citasTemporales[usuario];

      return {
        respuesta: '✅ Tu cita ha sido registrada con la nueva hora. ¡Gracias!',
        nuevoEstado: 'en_menu'
      };
    } else {
      delete citasTemporales[usuario].fecha;
      return {
        respuesta: '📅 Por favor indica otra fecha y hora (por ejemplo: 15/08/2025 14:30):',
        nuevoEstado: 'cita_fecha'
      };
    }
  }

  return {
    respuesta: 'Algo salió mal en el proceso de cita. Escribí "menu" para reiniciar.',
    nuevoEstado: 'en_menu'
  };
};

module.exports = { gestionarFlujoCita };
