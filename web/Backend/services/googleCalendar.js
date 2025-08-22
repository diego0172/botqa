// services/googleCalendar.js
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.resolve(__dirname, '..');
const CREDENTIALS_PATH = path.join(process.cwd(), 'config', 'google-oauth-client.json');
const TOKENS_PATH      = path.join(process.cwd(), 'config', 'google-oauth-tokens.json');

function getOAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error('No encuentro config/google-oauth-client.json');
  const cred = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const cfg  = cred.web || cred.installed;
  if (!cfg?.client_id || !cfg?.client_secret) throw new Error('Credenciales OAuth sin client_id/client_secret');

  const redirectUri =
    (cred.web && cred.web.redirect_uris?.[0]) ||
    (cred.installed && cred.installed.redirect_uris?.[0]) ||
    'http://localhost:3001/api/google/callback';

  const oAuth2Client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);

  if (fs.existsSync(TOKENS_PATH)) {
    try { oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'))); } catch {}
  }
  return oAuth2Client;
}

function getCalendarClient() {
  return google.calendar({ version: 'v3', auth: getOAuthClient() });
}

function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });
}

async function saveCode(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  return true;
}

// --- NUEVO: disponibilidad ---
async function isFree(calendarId, startISO, endISO) {
  const cal = getCalendarClient();
  const res = await cal.freebusy.query({
    requestBody: {
      items: [{ id: calendarId || 'primary' }],
      timeMin: startISO,
      timeMax: endISO
    }
  });
  const busy = res.data.calendars?.[calendarId || 'primary']?.busy || [];
  return busy.length === 0;
}

// --- NUEVO: crear evento ---
async function createEvent(calendarId, { summary, description, startISO, endISO, attendees = [] }) {
  const cal = getCalendarClient();
 const res = await cal.events.insert({
  calendarId: calendarId || 'primary',
  sendUpdates: 'all', // ⬅️ hace que Google envíe invitaciones
  requestBody: {
    summary,
    description,
    start: { dateTime: startISO },
    end:   { dateTime: endISO },
    attendees // [{ email: datos.email }]
  }
});
  return res.data; // contiene event.id
}

module.exports = { getAuthUrl, saveCode, isFree, createEvent };
