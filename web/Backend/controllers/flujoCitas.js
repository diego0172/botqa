// controllers/flujoCitas.js
const pool = require('../db');
const { DateTime } = require('luxon');
const { isFree, createEvent } = require('../services/googleCalendar');
const { sendAppointmentEmail } = require('../services/mailer');
const logger = require('../middlewares/logger');

// Estado en memoria por usuario
const estadosPorUsuario = new Map();

// ===== Helpers base =====
function norm(t){ return (t||'').toString().trim(); }
function lower(t){ return norm(t).toLowerCase(); }

// Compat: quedaba en versiones previas
function limpiarTimeout(from) {
  const s = estadosPorUsuario.get(from);
  if (s?.timeoutId) clearTimeout(s.timeoutId);
}

// ==== Timers e inactividad (borrado lógico) ====
function limpiarTimers(from) {
  const s = estadosPorUsuario.get(from);
  if (!s) return;
  if (s.timeoutRecordatorio) clearTimeout(s.timeoutRecordatorio);
  if (s.timeoutCierre) clearTimeout(s.timeoutCierre);
  delete s.timeoutRecordatorio;
  delete s.timeoutCierre;
}

// Marca inactiva la sesión sin borrar el estado
async function marcarInactiva({ client, from, msgCierre }) {
  const s = estadosPorUsuario.get(from);
  if (!s) return;
  s.inactiva = true;
  s.inactivoAt = Date.now();
  limpiarTimers(from);
  estadosPorUsuario.set(from, s);
  try { await client.sendMessage(from, msgCierre); } catch {}
}

// Programar recordatorio y cierre lógico según botConfig.cita.sesion
function programarInactividad(client, from, botConfig) {
  const cfg = botConfig?.cita?.sesion || {};
  const minRec = Number.isFinite(cfg.recordatorioMin) ? cfg.recordatorioMin : 5;
  const minCie = Number.isFinite(cfg.cierreMin) ? cfg.cierreMin : 15;
  const msgRec = cfg.msgRecordatorio || 'Sigues ahi. Si deseas continuar responde un mensaje o escribe cancelar para salir.';
  const msgCie = cfg.msgCierre || 'He marcado tu sesion como inactiva por falta de respuesta. Puedes escribir continuar para retomarla.';

  const msRec = Math.max(1, minRec) * 60 * 1000;
  const msCie = Math.max(minCie, minRec + 1) * 60 * 1000;

  limpiarTimers(from);

  const s = estadosPorUsuario.get(from) || { datos: {} };
  s.ultimaInteraccion = Date.now();

  s.timeoutRecordatorio = setTimeout(async () => {
    const cur = estadosPorUsuario.get(from);
    if (!cur || cur.inactiva) return;
    try { await client.sendMessage(from, msgRec); } catch {}
  }, msRec);

  s.timeoutCierre = setTimeout(async () => {
    const cur = estadosPorUsuario.get(from);
    if (!cur || cur.inactiva) return;
    await marcarInactiva({ client, from, msgCierre: msgCie });
  }, msCie);

  estadosPorUsuario.set(from, s);
}

// Purga pasiva de sesiones muy antiguas inactivas
function purgeOldSessions(botConfig) {
  const cfg = botConfig?.cita?.sesion || {};
  const ventanaMin = Number.isFinite(cfg.reanudarMin) ? cfg.reanudarMin : 120;
  const limite = ventanaMin * 60 * 1000;
  const ahora = Date.now();
  for (const [usuario, s] of estadosPorUsuario.entries()) {
    if (s?.inactiva && s?.inactivoAt && (ahora - s.inactivoAt > limite)) {
      limpiarTimers(usuario);
      estadosPorUsuario.delete(usuario);
    }
  }
}

// Si la sesión está inactiva y aun dentro de la ventana, reactivala
function reactivarSiInactiva(from, botConfig) {
  const s = estadosPorUsuario.get(from);
  if (!s || !s.inactiva) return s;
  const cfg = botConfig?.cita?.sesion || {};
  const ventanaMin = Number.isFinite(cfg.reanudarMin) ? cfg.reanudarMin : 120;
  const limite = ventanaMin * 60 * 1000;
  if (!s.inactivoAt || (Date.now() - s.inactivoAt) > limite) {
    limpiarTimers(from);
    estadosPorUsuario.delete(from);
    return null;
  }
  s.inactiva = false;
  delete s.inactivoAt;
  estadosPorUsuario.set(from, s);
  return s;
}

function fmt(dt) { return dt.setLocale('es').toFormat('dd/LL/yyyy HH:mm'); }
function fmtDia(dt) { return dt.setLocale('es').toFormat('dd/LL/yyyy'); }
function fmtHora(dt) { return dt.setLocale('es').toFormat('HH:mm'); }

// ===== Parseo estricto dd/mm/yyyy hh:mm =====
function parseHoraGuatemala(str) {
  const m = norm(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let [ , dd, mm, yyyy, HH, MM ] = m.map(Number);
  const dt = DateTime.fromObject(
    { day: dd, month: mm, year: yyyy, hour: HH, minute: MM },
    { zone: 'America/Guatemala' }
  );
  return dt.isValid ? dt : null;
}

// ===== Parseo natural ES: hoy, mañana, próximo sábado, 4 pm, etc. =====
const DOW = { domingo:0,lunes:1,martes:2,miercoles:3,'miércoles':3,jueves:4,viernes:5,sabado:6,'sábado':6 };
function nextDow(base, dow) {
  const baseDow = (base.weekday % 7);
  const delta = (dow + 7 - baseDow) % 7 || 7;
  return base.plus({ days: delta }).startOf('day');
}

function parseHoraNatural(txt) {
  const t = lower(txt).replace(/^a las\s+/, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2],10) : 0;
  const ampm = m[3];

  if (ampm) {
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
  } else {
    if (h >= 1 && h <= 7) h += 12; // heurística: tarde
  }
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hour: h, minute: min };
}

function parseFechaNatural(input, zona) {
  const txt = lower(input);
  const now = DateTime.now().setZone(zona);

  // hoy/mañana/pasado mañana [hora?]
  const m1 = txt.match(/^(hoy|ma[ñn]ana|pasado ma[ñn]ana)(?:\s+(.+))?$/i);
  if (m1) {
    const base = m1[1].includes('pasado') ? now.plus({ days: 2 }).startOf('day')
               : (m1[1].startsWith('ma') ? now.plus({ days: 1 }).startOf('day') : now.startOf('day'));
    if (m1[2]) {
      const h = parseHoraNatural(m1[2]);
      if (h) return { dt: base.set({ hour: h.hour, minute: h.minute }), precisaHora: true };
      return { dt: base, precisaHora: true, errorHora: true };
    }
    return { dt: base, precisaHora: false };
  }

  // próximo/siguiente + dow [hora?]
  const m2 = txt.match(/^(?:siguiente|prox|pr[oó]ximo)\s+(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado)(?:\s+(.+))?$/i);
  if (m2) {
    const dow = DOW[m2[1]];
    const base = nextDow(now, dow);
    if (m2[2]) {
      const h = parseHoraNatural(m2[2]);
      if (h) return { dt: base.set({ hour: h.hour, minute: h.minute }), precisaHora: true };
      return { dt: base, precisaHora: false, errorHora: true };
    }
    return { dt: base, precisaHora: false };
  }

  // dow [hora?]
  const m3 = txt.match(/^(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[áa]bado)(?:\s+(.+))?$/i);
  if (m3) {
    const dow = DOW[m3[1]];
    const base = nextDow(now, dow);
    if (m3[2]) {
      const h = parseHoraNatural(m3[2]);
      if (h) return { dt: base.set({ hour: h.hour, minute: h.minute }), precisaHora: true };
      return { dt: base, precisaHora: false };
    }
    return { dt: base, precisaHora: false };
  }

  // fallback: dd/mm/yyyy hh:mm
  const dtStrict = parseHoraGuatemala(txt);
  if (dtStrict) return { dt: dtStrict, precisaHora: true };

  // dd/mm/yyyy sin hora
  const m4 = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m4) {
    const dt = DateTime.fromFormat(txt, 'd/M/yyyy', { zone: zona });
    if (dt?.isValid) return { dt: dt.startOf('day'), precisaHora: false };
  }

  return { error: true };
}

// ===== Clientes =====
async function obtenerEmailDeUsuario(from) {
  try {
    const r = await pool.query(
      'SELECT email FROM clientes WHERE usuario = $1 ORDER BY actualizado_en DESC LIMIT 1',
      [from]
    );
    return r.rows?.[0]?.email || null;
  } catch {
    return null;
  }
}

async function upsertCliente({ usuario, nombre, email }) {
  try {
    await pool.query(
      `INSERT INTO clientes (usuario, nombre, email, actualizado_en)
       VALUES ($1,$2,$3, NOW())
       ON CONFLICT (usuario) DO UPDATE SET
         nombre = COALESCE(EXCLUDED.nombre, clientes.nombre),
         email  = COALESCE(EXCLUDED.email,  clientes.email),
         actualizado_en = NOW()`,
      [usuario, nombre || null, email || null]
    );
  } catch (e) {
    logger.warn(`No se pudo guardar cliente ${usuario}: ${e.message}`);
  }
}

// ===== Disponibilidad (BD + Calendar con timeout) =====
async function hayConflictoDB(empresa, inicio, duracionMin) {
  const fin = inicio.plus({ minutes: duracionMin });
  const res = await pool.query(
    `SELECT 1
     FROM citas
     WHERE empresa = $1
       AND ($2, $3) OVERLAPS (fecha, fecha + (interval '1 minute' * COALESCE(duracion_min, $4)))`,
    [empresa, inicio.toJSDate(), fin.toJSDate(), duracionMin]
  );
  return res.rowCount > 0;
}

async function isFreeSafe(calId, startISO, endISO, timeoutMs = 6000) {
  try {
    const p = isFree(calId, startISO, endISO);
    const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_calendar')), timeoutMs));
    const r = await Promise.race([p, t]);
    // Tu servicio isFree ya retorna boolean; normalizamos
    return r === true;
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (msg.includes('invalid_grant')) {
      logger.error('Calendar isFree invalid_grant → degradando a DB-only');
    } else {
      logger.warn(`Calendar isFree fallo/timeout: ${e?.message || e}`);
    }
    return null; // << clave: desconocido, no asumimos ocupado
  }
}

async function estaLibre({ empresa, calId, inicio, duracionMin }) {
  // 1) Primero BD (la fuente de verdad de tus reservas)
  const libreDB = !(await hayConflictoDB(empresa, inicio, duracionMin));
  if (!libreDB) return false;

  // 2) Luego Calendar (mejora), pero si falla, no bloquees
  const fin = inicio.plus({ minutes: duracionMin });
  const libreCal = await isFreeSafe(calId, inicio.toISO(), fin.toISO());

  // Si Calendar responde explícitamente "ocupado" (false) → ocupado.
  // Si responde "true" o "null" (desconocido por error/timeout) → permitimos seguir.
  return libreCal !== false;
}

// ===== Slots =====
function generarSlotsDelDia({ horario, diaDT }) {
  const [hIni, mIni] = horario.inicio.split(':').map(Number);
  const [hFin, mFin] = horario.fin.split(':').map(Number);
  const inicio = diaDT.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 });
  const fin = diaDT.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 });
  const slots = [];
  let cursor = inicio;
  while (cursor < fin) {
    slots.push(cursor);
    cursor = cursor.plus({ minutes: horario.duracionMin });
  }
  return slots;
}

async function slotsDisponiblesMismoDia({ empresa, horario, diaDT }) {
  const ahora = DateTime.now().setZone(horario.zona);
  const slots = generarSlotsDelDia({ horario, diaDT });
  const disponibles = [];
  for (const s of slots) {
    if (s <= ahora) continue;
    const libreDB = !(await hayConflictoDB(empresa, s, horario.duracionMin));
    if (libreDB) {
      disponibles.push(s);
      if (disponibles.length >= 6) break;
    }
  }
  return disponibles;
}

// Sugerir día siguiente si el día está lleno
async function sugerirDiaSiguiente({ empresa, horario, diaDT }) {
  const siguiente = diaDT.plus({ days: 1 }).startOf('day');
  const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: siguiente });
  return { dia: siguiente, libres };
}

// ===== Servicios/Precios (tomar de config.mensajes.precios) =====
function extraerServiciosDesdePreciosTexto(txt){
  if (!txt) return [];
  const lns = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const nombres = [];
  for (const ln of lns){
    const lnLow = ln.toLowerCase();
    if (lnLow.includes('lista de precios')) continue;
    if (lnLow.startsWith('escribe')) continue;
    let s = ln.replace(/^[\-\*\d\)\.\s]+/, '');
    const m = s.match(/^([^:–—\-]+?)(?::| -|–|—| Q|$)/);
    if (m){
      const name = m[1].trim();
      if (/[a-záéíóúñ]/i.test(name) && name.length >= 2) nombres.push(name);
    }
  }
  return [...new Set(nombres)];
}

function obtenerServiciosDeConfig(botConfig) {
  const arr =
    (Array.isArray(botConfig?.precios?.items) && botConfig.precios.items) ||
    (Array.isArray(botConfig?.servicios?.items) && botConfig.servicios.items) ||
    (Array.isArray(botConfig?.servicios) && botConfig.servicios) || [];
  const normalizados = arr
    .map(it => (typeof it === 'string' ? it : (it?.nombre || it?.titulo || it?.name || null)))
    .filter(Boolean);

  if (normalizados.length) return normalizados;

  const txt = botConfig?.mensajes?.precios;
  return extraerServiciosDesdePreciosTexto(txt);
}

function textoSeleccionServicios(botConfig) {
  const nombres = obtenerServiciosDeConfig(botConfig);
  if (!nombres.length) {
    const txt = botConfig?.mensajes?.precios;
    return txt ? `\n\n${txt}` : '';
    }
  const bullets = nombres.map((n, i) => `${i + 1}. ${n}`).join('\n');
  return `\n${bullets}`;
}

// ===== Flujo principal =====
async function gestionarFlujoCita({ client, from, texto, nombreCliente, empresa, botConfig }) {
  const horarioBase = botConfig?.horario || { inicio: '09:00', fin: '18:00', zona: 'America/Guatemala' };
  const duracionMin = (botConfig?.horario?.duracionMin ?? botConfig?.cita?.duracionMinutos ?? 60);
  const horario = { ...horarioBase, duracionMin };
  const calId = botConfig?.calendar?.id || 'primary';
  const now = DateTime.now().setZone(horario.zona);
  const low = lower(texto);

  // Purga pasiva de sesiones inactivas viejas
  purgeOldSessions(botConfig);

  // Reanudar por comando
  if (['continuar','reanudar','seguir'].includes(low)) {
    const re = reactivarSiInactiva(from, botConfig);
    const msgReanudado = botConfig?.cita?.sesion?.msgReanudado || 'Listo, he reanudado tu sesion anterior. Sigamos donde nos quedamos.';
    if (re) {
      programarInactividad(client, from, botConfig);
      return { finalizado: false, respuesta: msgReanudado };
    }
    estadosPorUsuario.delete(from);
    return { finalizado: false, respuesta: 'No encontre una sesion anterior. Escribe citas para iniciar.' };
  }

  // Cancelar siempre borra duro
  if (['salir', 'cancelar'].includes(low)) {
    limpiarTimers(from);
    estadosPorUsuario.delete(from);
    return { finalizado: true, respuesta: 'Flujo cancelado. Si deseas agendar mas tarde, escribe citas.' };
  }

  // Si hay sesion inactiva dentro de ventana, reactivar transparente
  const estado = reactivarSiInactiva(from, botConfig) || estadosPorUsuario.get(from) || { estado: 'INICIO', datos: {} };

  // Programa recordatorio y cierre lógico en cada mensaje
  programarInactividad(client, from, botConfig);

  // helper: resumen
  function resumenCita(dt) {
    const l = [
      'Por favor confirma tu cita:',
      `Nombre: ${estado.datos.nombre}`,
      `Servicio: ${estado.datos.servicio}`,
      `Fecha: ${fmt(dt)}`
    ];
    if (estado.datos.email) l.splice(3, 0, `Correo: ${estado.datos.email}`);
    return l.join('\n') + '\nResponde SI para confirmar o NO para corregir.';
  }

  // helper: si no hay correo, pedirlo
  function necesitaEmail() { return !estado.datos.email; }
  function pedirEmailState() {
    estado.estado = 'PEDIR_EMAIL';
    estadosPorUsuario.set(from, estado);
    return {
      finalizado: false,
      respuesta: 'Cual es tu correo para enviarte la confirmacion. Escribe omitir si no deseas recibir correo.'
    };
  }

  switch (estado.estado) {
    case 'INICIO': {
      estado.estado = 'PEDIR_SERVICIO';
      estado.datos = { empresa, nombre: nombreCliente, email: null };
      estadosPorUsuario.set(from, estado);

      // buscar email previo en BD (no bloquea el flujo)
      obtenerEmailDeUsuario(from).then(email => {
        const s = estadosPorUsuario.get(from);
        if (s) { s.datos.email = email || null; estadosPorUsuario.set(from, s); }
      }).catch(() => {});

      return {
        finalizado: false,
        respuesta:
          `Perfecto ${nombreCliente}. Vamos a agendar tu cita en ${botConfig?.nombre || 'nuestro negocio'}.\n` +
          `Ahora selecciona el servicio que deseas agendar` +
          textoSeleccionServicios(botConfig)
      };
    }

    case 'PEDIR_SERVICIO': {
      const servicios = obtenerServiciosDeConfig(botConfig);
      const entrada = norm(texto);

      // 1) Si respondió con un número válido, mapear inmediatamente
      const mNum = entrada.match(/^\d{1,2}$/);
      if (mNum && servicios.length) {
        const idx = parseInt(mNum[0], 10) - 1;
        if (idx >= 0 && idx < servicios.length) {
          estado.datos.servicio = servicios[idx];
          estado.estado = 'PEDIR_FECHA';
          estadosPorUsuario.set(from, estado);
          return {
            finalizado: false,
            respuesta: 'Indica la fecha y hora (ej: hoy 4 pm, mañana, 15/08/2025 14:30).'
          };
        }
      }

      // 2) Si no escribió nada o es muy corto → mostrar listado
      if (!entrada || entrada.length < 2) {
        const listado = servicios.length
          ? servicios.map((n, i) => `${i + 1}. ${n}`).join('\n')
          : (botConfig?.mensajes?.precios || 'Por favor escribe el nombre del servicio.');
        return { finalizado: false, respuesta: listado };
      }

      // 3) Si escribió texto → tomarlo como nombre del servicio
      estado.datos.servicio = entrada;
      estado.estado = 'PEDIR_FECHA';
      estadosPorUsuario.set(from, estado);
      return {
        finalizado: false,
        respuesta: 'Indica la fecha y hora (ej: hoy 4 pm, mañana, 15/08/2025 14:30).'
      };
    }

    case 'PEDIR_FECHA': {
      const r = parseFechaNatural(texto, horario.zona); 

      // Solo hora → hoy/mañana
      if (r.error) {
        const hSolo = parseHoraNatural(texto);
        if (!hSolo) {
          return { finalizado: false, respuesta: 'No entendi la fecha. Ej: hoy 4 pm, manana, siguiente sabado, 15/08/2025 14:30.' };
        }
        let base = now.startOf('day');
        let dt = base.set({ hour: hSolo.hour, minute: hSolo.minute, second: 0, millisecond: 0 });
        if (dt <= now) {
          base = now.plus({ days: 1 }).startOf('day');
          dt = base.set({ hour: hSolo.hour, minute: hSolo.minute, second: 0, millisecond: 0 });
        }
        const [hIni, mIni] = horario.inicio.split(':').map(Number);
        const [hFin, mFin] = horario.fin.split(':').map(Number);
        const inicioDia = dt.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 });
        const finDia = dt.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 });
        if (dt < inicioDia || dt.plus({ minutes: horario.duracionMin }) > finDia) {
          return { finalizado: false, respuesta: `El horario de atencion es de ${horario.inicio} a ${horario.fin}. Indica otra hora dentro del horario.` };
        }
        const libre = await estaLibre({ empresa, calId, inicio: dt, duracionMin: horario.duracionMin });
        if (!libre) {
          const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dt.startOf('day') });
          if (!libres.length) {
            const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: dt.startOf('day') });
            if (nextSlots.length) {
              const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
              estado.estado = 'ESPERANDO_ELECCION_SLOT';
              estado.datos.sugerencias = nextSlots;
              estado.datos.diaSugerencias = nextDia;
              estadosPorUsuario.set(from, estado);
              return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
            }
            estado.estado = 'ESPERANDO_FECHA_ALTERNATIVA';
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otra fecha.` };
          }
          const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
          estado.estado = 'ESPERANDO_ELECCION_SLOT';
          estado.datos.sugerencias = libres;
          estado.datos.diaSugerencias = dt.startOf('day');
          estadosPorUsuario.set(from, estado);
          return { finalizado: false, respuesta: `Esa hora no esta disponible.\nOpciones libres para el ${fmtDia(dt)}:\n${lista}\n\nEscribe la hora exacta que prefieras o di otro dia.` };
        }
        estado.datos.fecha = dt;
        if (necesitaEmail()) return pedirEmailState();
        estado.estado = 'CONFIRMAR';
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: resumenCita(dt) };
      }

      // Solo día → listar horas (o proponer día siguiente si está lleno)
      if (!r.precisaHora && !r.errorHora) {
        const dia = r.dt.startOf('day');
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dia });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: dia });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.estado = 'ESPERANDO_ELECCION_SLOT';
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
          }
          estado.estado = 'ESPERANDO_FECHA_ALTERNATIVA';
          estadosPorUsuario.set(from, estado);
          return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otra fecha (ej: viernes, 20/08/2025).` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.estado = 'ESPERANDO_ELECCION_SLOT';
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = dia;
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: `Opciones libres para el ${fmtDia(dia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
      }

      if (r.errorHora) {
        estado.estado = 'PEDIR_HORA';
        estado.datos.fechaBase = r.dt.startOf('day');
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: 'No reconoci la hora. Indica solo la hora, por ejemplo 4 pm, 16:00 o 4:30.' };
      }

      let dt = r.dt.setZone(horario.zona);
      if (dt <= now) return { finalizado: false, respuesta: 'La fecha y hora no pueden ser del pasado. Intenta otra vez.' };

      const [hIni, mIni] = horario.inicio.split(':').map(Number);
      const [hFin, mFin] = horario.fin.split(':').map(Number);
      const inicioDia = dt.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 });
      const finDia = dt.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 });
      if (dt < inicioDia || dt.plus({ minutes: horario.duracionMin }) > finDia) {
        return { finalizado: false, respuesta: `El horario de atencion es de ${horario.inicio} a ${horario.fin}. Indica otra hora dentro del horario.` };
      }

      const libre = await estaLibre({ empresa, calId, inicio: dt, duracionMin: horario.duracionMin });
      if (!libre) {
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dt.startOf('day') });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: dt.startOf('day') });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.estado = 'ESPERANDO_ELECCION_SLOT';
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
          }
          estado.estado = 'ESPERANDO_FECHA_ALTERNATIVA';
          estadosPorUsuario.set(from, estado);
          return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otra fecha.` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.estado = 'ESPERANDO_ELECCION_SLOT';
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = dt.startOf('day');
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: `Esa hora no esta disponible.\nOpciones libres para el ${fmtDia(dt)}:\n${lista}\n\nEscribe la hora exacta que prefieras o di otro dia.` };
      }

      estado.datos.fecha = dt;
      if (necesitaEmail()) return pedirEmailState();
      estado.estado = 'CONFIRMAR';
      estadosPorUsuario.set(from, estado);
      return { finalizado: false, respuesta: resumenCita(dt) };
    }

    case 'PEDIR_HORA': {
      // Acepta que escriba solo un DIA aqui → listar horas
      const rDia = parseFechaNatural(texto, horario.zona);
      if (!rDia.error && !rDia.precisaHora && !rDia.errorHora) {
        const dia = rDia.dt.startOf('day');
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dia });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: dia });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.estado = 'ESPERANDO_ELECCION_SLOT';
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
          }
          return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otro dia u hora.` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.estado = 'ESPERANDO_ELECCION_SLOT';
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = dia;
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: `Opciones libres para el ${fmtDia(dia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
      }

      const h = parseHoraNatural(texto);
      if (!h) return { finalizado: false, respuesta: 'No entendi la hora. Ej: 4 pm, 16:00 o 4:30.' };

      const base = estado.datos.fechaBase || now.startOf('day');
      let dt = base.set({ hour: h.hour, minute: h.minute, second: 0, millisecond: 0 });
      if (dt <= now) return { finalizado: false, respuesta: 'Esa hora ya paso. Indica otra por favor.' };

      const [hIni, mIni] = horario.inicio.split(':').map(Number);
      const [hFin, mFin] = horario.fin.split(':').map(Number);
      const inicioDia = dt.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 });
      const finDia = dt.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 });
      if (dt < inicioDia || dt.plus({ minutes: horario.duracionMin }) > finDia) {
        return { finalizado: false, respuesta: `El horario de atencion es de ${horario.inicio} a ${horario.fin}. Indica otra hora dentro del horario.` };
      }

      const libre = await estaLibre({ empresa, calId, inicio: dt, duracionMin: horario.duracionMin });
      if (!libre) {
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dt.startOf('day') });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: dt.startOf('day') });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.estado = 'ESPERANDO_ELECCION_SLOT';
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
          }
          return { finalizado: false, respuesta: `Esa hora esta ocupada y tampoco hay espacios ese dia. Indica otra fecha (ej: jueves 10 am).` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.estado = 'ESPERANDO_ELECCION_SLOT';
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = dt.startOf('day');
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: `Esa hora esta ocupada.\nOpciones libres para el ${fmtDia(dt)}:\n${lista}\n\nEscribe la hora exacta que prefieras o di otro dia.` };
      }

      estado.datos.fecha = dt;
      if (necesitaEmail()) return pedirEmailState();
      estado.estado = 'CONFIRMAR';
      estadosPorUsuario.set(from, estado);
      return { finalizado: false, respuesta: resumenCita(dt) };
    }

    case 'ESPERANDO_ELECCION_SLOT': {
      // Permitir "otro dia" para volver a pedir fecha
      const t = lower(texto);
      if (['otro dia','otro día','otra fecha','otro horario'].includes(t)) {
        estado.estado = 'PEDIR_FECHA';
        delete estado.datos.sugerencias;
        delete estado.datos.diaSugerencias;
        estadosPorUsuario.set(from, estado);
        return {
          finalizado: false,
          respuesta: 'Indica la fecha y hora (ej: manana 4 pm, viernes 10 am, 16/08/2025 14:30).'
        };
      }

      // Aceptar un DIA sin hora aqui mismo y volver a listar
      const rDiaSolo = parseFechaNatural(texto, horario.zona);
      if (!rDiaSolo.error && !rDiaSolo.precisaHora && !rDiaSolo.errorHora) {
        const dia = rDiaSolo.dt.startOf('day');
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dia });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } =
            await sugerirDiaSiguiente({ empresa, horario, diaDT: dia });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return {
              finalizado: false,
              respuesta:
                `Ese dia esta todo ocupado.\n` +
                `Opciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\n` +
                `Escribe la hora exacta que prefieras.`
            };
          }
          return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otra fecha.` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = dia;
        estadosPorUsuario.set(from, estado);
        return {
          finalizado: false,
          respuesta:
            `Opciones libres para el ${fmtDia(dia)}:\n${lista}\n\n` +
            `Escribe la hora exacta que prefieras.`
        };
      }

      const sugerencias = estado.datos.sugerencias || [];

      // Intentar interpretar fecha completa natural o solo hora
      let elegido = null;
      const r = parseFechaNatural(texto, horario.zona);
      if (!r.error && r.precisaHora) {
        elegido = r.dt;
      } else {
        const h = parseHoraNatural(texto);
        if (h && estado.datos.diaSugerencias) {
          elegido = estado.datos.diaSugerencias.set({ hour: h.hour, minute: h.minute });
        }
      }

      // Si no, intentar match directo contra la lista mostrada (HH:mm)
      if (!elegido) {
        const normalizado = norm(texto).replace(/\s+/g, '');
        elegido = sugerencias.find(x => fmtHora(x) === normalizado) || null;
      }
      if (!elegido) {
        return {
          finalizado: false,
          respuesta:
            'No pude reconocer esa hora. Escribe una de la lista (ej: 11:00) o una nueva fecha en formato natural o dd/mm/yyyy hh:mm.'
        };
      }

      // Validación de límites del día laboral
      const [hFin, mFin] = horario.fin.split(':').map(Number);
      const finDia = elegido.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 });
      if (elegido.plus({ minutes: horario.duracionMin }) > finDia) {
        return {
          finalizado: false,
          respuesta: `El horario de atencion es de ${horario.inicio} a ${horario.fin}. Elige otra hora.`
        };
      }

      // Si la hora viene de la lista ofrecida, confiar en esa lista (evita falso ocupado)
      const veniaDeLista = sugerencias.some(s => s.hasSame(elegido, 'minute'));
      if (!veniaDeLista) {
        // Solo si NO venia de la lista, verificar agenda en BD + Calendar
        const libre = await estaLibre({
          empresa,
          calId,
          inicio: elegido,
          duracionMin: horario.duracionMin
        });
        if (!libre) {
          return {
            finalizado: false,
            respuesta: 'Esa hora se acaba de ocupar. Prueba otra de la lista o escribe otra fecha.'
          };
        }
      }

      estado.datos.fecha = elegido;
      if (!estado.datos.email) {
        estado.estado = 'PEDIR_EMAIL';
        estadosPorUsuario.set(from, estado);
        return {
          finalizado: false,
          respuesta:
            'Cual es tu correo para enviarte la confirmacion. Escribe omitir si no deseas recibir correo.'
        };
      }
      estado.estado = 'CONFIRMAR';
      estadosPorUsuario.set(from, estado);
      return { finalizado: false, respuesta: resumenCita(elegido) };
    }

    case 'ESPERANDO_FECHA_ALTERNATIVA': {
      const r = parseFechaNatural(texto, horario.zona);
      if (r.error || (r.precisaHora && r.dt <= now)) {
        return { finalizado: false, respuesta: 'No entendi la fecha. Intenta manana 4 pm o 15/08/2025 14:30.' };
      }
      if (!r.precisaHora) {
        const dia = r.dt.startOf('day');
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: dia });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: dia });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.estado = 'ESPERANDO_ELECCION_SLOT';
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
          }
          return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otra fecha.` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.estado = 'ESPERANDO_ELECCION_SLOT';
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = dia;
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: `Opciones libres para el ${fmtDia(dia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
      }

      const [hFin, mFin] = horario.fin.split(':').map(Number);
      const finDia = r.dt.set({ hour: hFin, minute: mFin, second: 0, millisecond: 0 });
      if (r.dt.plus({ minutes: horario.duracionMin }) > finDia) {
        return { finalizado: false, respuesta: `El horario de atencion es de ${horario.inicio} a ${horario.fin}. Indica otra hora dentro del horario.` };
      }

      const libre = await estaLibre({ empresa, calId, inicio: r.dt, duracionMin: horario.duracionMin });
      if (!libre) {
        const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: r.dt.startOf('day') });
        if (!libres.length) {
          const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: r.dt.startOf('day') });
          if (nextSlots.length) {
            const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
            estado.estado = 'ESPERANDO_ELECCION_SLOT';
            estado.datos.sugerencias = nextSlots;
            estado.datos.diaSugerencias = nextDia;
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: `Ese dia esta todo ocupado.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
          }
          return { finalizado: false, respuesta: `Ese dia esta todo ocupado. Indica otra fecha.` };
        }
        const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
        estado.estado = 'ESPERANDO_ELECCION_SLOT';
        estado.datos.sugerencias = libres;
        estado.datos.diaSugerencias = r.dt.startOf('day');
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: `No disponible. Opciones libres para el ${fmtDia(r.dt)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
      }

      estado.datos.fecha = r.dt;
      if (necesitaEmail()) return pedirEmailState();
      estado.estado = 'CONFIRMAR';
      estadosPorUsuario.set(from, estado);
      return { finalizado: false, respuesta: resumenCita(r.dt) };
    }

    case 'PEDIR_EMAIL': {
      const t = lower(texto);
      if (['omitir','skip','no'].includes(t)) {
        estado.estado = 'CONFIRMAR';
        estadosPorUsuario.set(from, estado);
        return { finalizado: false, respuesta: resumenCita(estado.datos.fecha) };
      }
      const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
      if (!reEmail.test(texto)) {
        return { finalizado: false, respuesta: 'Parece que tu correo no es valido. Ej: nombre@dominio.com. Intenta de nuevo o escribe omitir.' };
      }
      estado.datos.email = norm(texto);
      upsertCliente({ usuario: from, nombre: estado.datos.nombre, email: estado.datos.email });
      estado.estado = 'CONFIRMAR';
      estadosPorUsuario.set(from, estado);
      return { finalizado: false, respuesta: resumenCita(estado.datos.fecha) };
    }

       case 'CONFIRMAR': {
      if (['si', 'sí', 'ok', 'confirmo', 'confirmar'].includes(low)) {
        const { nombre, servicio, fecha, email } = estado.datos;

        // Verificar disponibilidad solo si no venía validada de lista
        const debeRevalidar = !estado.datos.validadaDeLista;
        if (debeRevalidar) {
          const libre = await estaLibre({ empresa, calId, inicio: fecha, duracionMin: horario.duracionMin });
          if (!libre) {
            const libres = await slotsDisponiblesMismoDia({ empresa, horario, diaDT: fecha.startOf('day') });
            if (libres.length) {
              const lista = libres.map(x => `• ${fmtHora(x)}`).join('\n');
              estado.estado = 'ESPERANDO_ELECCION_SLOT';
              estado.datos.sugerencias = libres;
              estado.datos.diaSugerencias = fecha.startOf('day');
              estadosPorUsuario.set(from, estado);
              return { finalizado: false, respuesta: `Se acaba de ocupar esa hora.\nOpciones disponibles para el ${fmtDia(fecha)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
            }
            const { dia: nextDia, libres: nextSlots } = await sugerirDiaSiguiente({ empresa, horario, diaDT: fecha.startOf('day') });
            if (nextSlots.length) {
              const lista = nextSlots.map(x => `• ${fmtHora(x)}`).join('\n');
              estado.estado = 'ESPERANDO_ELECCION_SLOT';
              estado.datos.sugerencias = nextSlots;
              estado.datos.diaSugerencias = nextDia;
              estadosPorUsuario.set(from, estado);
              return { finalizado: false, respuesta: `Se acaba de ocupar esa hora y ese dia esta lleno.\nOpciones libres para el ${fmtDia(nextDia)}:\n${lista}\n\nEscribe la hora exacta que prefieras.` };
            }
            estado.estado = 'ESPERANDO_FECHA_ALTERNATIVA';
            estadosPorUsuario.set(from, estado);
            return { finalizado: false, respuesta: 'No hay espacios cercanos. Indica otra fecha.' };
          }
        }

        // Calendar (no rompe si falla)
        const startISO = fecha.toISO();
        const endISO = fecha.plus({ minutes: horario.duracionMin }).toISO();
        try {
          await createEvent(calId, {
            summary: `${servicio || 'Cita'} - ${nombre || ''}`,
            description: `Reservado por WhatsApp. Usuario: ${from}${email ? ' | ' + email : ''}`,
            startISO,
            endISO,
            attendees: email ? [{ email }] : []
          });
        } catch (e) {
          const msg = String(e?.message || e).toLowerCase();
          if (msg.includes('invalid_grant')) {
            logger.error('createEvent invalid_grant. La cita se guardó en BD; pendiente de reintento de Calendar.');
          } else {
            logger.warn(`createEvent fallo: ${e?.message || e}`);
          }
        }

        // DB cita
        await pool.query(
          `INSERT INTO citas (usuario, nombre, servicio, fecha, empresa, duracion_min)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [from, nombre || null, servicio || null, fecha.toJSDate(), empresa, horario.duracionMin]
        );

        // Guardar/actualizar cliente
        upsertCliente({ usuario: from, nombre, email: email || null });

        // Email
        if (email) {
          sendAppointmentEmail({
            to: email,
            nombre,
            servicio,
            fecha: fecha.toJSDate(),
            cfg: botConfig
          }).catch(() => {});
        }

        // Cierre duro al confirmar
        limpiarTimers(from);
        estadosPorUsuario.delete(from);
        return {
          finalizado: true,
          respuesta: `Listo ${nombre}. Tu cita para "${servicio}" quedo para ${fmt(fecha)}. Gracias por elegir ${botConfig?.nombre || 'nosotros'}.`
        };
      }

      if (['no', 'corregir', 'editar'].includes(low)) {
        estado.estado = 'PEDIR_SERVICIO';
        estadosPorUsuario.set(from, estado);
        const lista = textoSeleccionServicios(botConfig);
        return {
          finalizado: false,
          respuesta: 'De acuerdo. Selecciona nuevamente el servicio.' + (lista || '')
        };
      }

      return { finalizado: false, respuesta: 'Responde SI para confirmar o NO para corregir.' };
    }


    default:
      estadosPorUsuario.delete(from);
      return { finalizado: true, respuesta: 'He reiniciado el flujo. Escribe citas si deseas agendar.' };
  }
}

function resetFlujoCita(usuario) {
  limpiarTimers(usuario);
  estadosPorUsuario.delete(usuario);
}

module.exports = { gestionarFlujoCita, resetFlujoCita };
