// Descarga un feed iCal de eventos y lo convierte en site/data/events.json.
// La URL del feed NO está en el código: se pasa en la variable EVENTS_ICS_URL
// (secret del repo en GitHub, o fichero .env en local, que no se sube).
// Uso: node --env-file=.env scripts/sync-events.mjs
import { writeFile, readFile } from 'node:fs/promises';

const ICS_URL = process.env.EVENTS_ICS_URL;
if (!ICS_URL) {
  console.error('Falta la variable EVENTS_ICS_URL');
  process.exit(1);
}
const OUT = new URL('../site/data/events.json', import.meta.url);
const CUSTOM = new URL('../site/data/events-custom.json', import.meta.url);

// Guardamos desde el 1 de enero del año pasado para poder navegar algo hacia atrás.
const SINCE = `${new Date().getFullYear() - 1}-01-01`;

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(v = '') {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function stripHtml(v = '') {
  return v
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "20261114" o "20261114T090000Z" -> "2026-11-14"
function toISODate(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "Atalaya Experiences - Off Road (Casas de Ves)" -> organizador / nombre / lugar
function splitTitle(title) {
  let rest = title.trim();
  let place = null;
  const p = rest.match(/\(([^)]+)\)\s*$/);
  if (p) {
    place = p[1].trim();
    rest = rest.slice(0, p.index).trim();
  }
  let organizer = null;
  let name = rest;
  const dash = rest.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (dash) {
    organizer = dash[1].trim();
    name = dash[2].trim();
  }
  if (organizer) organizer = ORGANIZER_ALIASES[normKey(organizer)] || organizer;
  return { organizer, name, place };
}

// Erratas habituales en el feed.
const normKey = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const ORGANIZER_ALIASES = {
  'fosil trips': 'Fósil Trips',
  'fosil ttips': 'Fósil Trips',
  'desert challeng': 'Desert Challenge',
};

function parseICS(text) {
  const events = [];
  for (const block of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const props = {};
    for (const line of body.split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].toUpperCase();
      if (!(key in props)) props[key] = line.slice(i + 1);
    }
    if (!props.DTSTART || !props.SUMMARY) continue;
    if ((props.STATUS || '').toUpperCase() === 'CANCELLED') continue;

    const start = toISODate(props.DTSTART);
    const isAllDay = !props.DTSTART.includes('T');
    // En iCal el DTEND de eventos de día completo es exclusivo: lo pasamos a inclusivo.
    let end = props.DTEND ? toISODate(props.DTEND) : start;
    if (isAllDay && props.DTEND) end = addDays(end, -1);
    if (end < start) end = start;

    const title = unescapeText(props.SUMMARY).trim();
    const description = stripHtml(unescapeText(props.DESCRIPTION || ''));
    const url = (description.match(/https?:\/\/[^\s<>"']+/) || [null])[0];
    events.push({
      id: (props.UID || `${start}-${title}`).replace(/@.*$/, ''),
      title,
      ...splitTitle(title),
      start,
      end,
      url,
      location: unescapeText(props.LOCATION || '') || null,
    });
  }
  return events;
}

async function readCustom() {
  try {
    const data = JSON.parse(await readFile(CUSTOM, 'utf8'));
    return (data.events || []).map((e) => ({ ...e, custom: true }));
  } catch {
    return [];
  }
}

const res = await fetch(ICS_URL);
if (!res.ok) throw new Error(`No se pudo descargar el feed: HTTP ${res.status}`);
const parsed = parseICS(await res.text());

const seen = new Set();
const events = [...parsed, ...(await readCustom())]
  .filter((e) => e.end >= SINCE)
  .filter((e) => {
    const k = `${e.start}|${e.title.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

let previous = null;
try {
  previous = JSON.parse(await readFile(OUT, 'utf8'));
} catch {}
if (previous && JSON.stringify(previous.events) === JSON.stringify(events)) {
  console.log(`events.json: sin cambios (${events.length} eventos)`);
} else {
  await writeFile(
    OUT,
    JSON.stringify({ updatedAt: new Date().toISOString(), events }, null, 2) + '\n',
  );
  console.log(`events.json: ${events.length} eventos (de ${parsed.length} en el feed)`);
}
