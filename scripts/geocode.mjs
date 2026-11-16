// Geocodificación de eventos con OpenStreetMap (Nominatim), con caché en disco.
// - scripts/geocache.json      caché de consultas (se sube al repo: cada lugar se busca una sola vez)
// - scripts/geo-overrides.json correcciones manuales: por texto de consulta o por organizador
// Política de Nominatim: máx. 1 petición/segundo y User-Agent propio.
import { readFile, writeFile } from 'node:fs/promises';

const CACHE = new URL('./geocache.json', import.meta.url);
const OVERRIDES = new URL('./geo-overrides.json', import.meta.url);
const UA = 'calendar-geocoder/1.0 (static site weekly sync)';

const ACCEPTED = new Set([
  'city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'quarter', 'neighbourhood',
  'county', 'state', 'province', 'region', 'state_district', 'island', 'locality', 'isolated_dwelling',
  'natural', 'peak', 'mountain_range', 'ridge', 'valley', 'desert', 'nature_reserve', 'protected_area', 'national_park',
]);
const SETTLEMENTS = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'locality']);

// Palabras que no son lugar: se quitan antes de buscar por el nombre del evento.
const NOISE = /\b(roadbook|road ?book|off ?road|trail|tour|ruta|rutas|travesia|travesía|expedicion|expedición|desert|challenge|adventure|discover|festival|solidari[oa]|campestre|experiences?|raid|rally|book|xtrem\d*|benefica|benéfica|edicion|edición|\d{2,4}|[ivxlc]+)\b/gi;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

async function readJSON(url, fallback) {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch { return fallback; }
}

let lastCall = 0;
async function nominatim(q) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&countrycodes=es,pt,ad&accept-language=es&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
  return r.json();
}

function pick(results, settlementsOnly) {
  for (const r of results || []) {
    const type = r.addresstype || r.type;
    if (settlementsOnly ? !SETTLEMENTS.has(type) : !ACCEPTED.has(type) && r.category !== 'natural' && r.category !== 'place') continue;
    const a = r.address || {};
    return {
      lat: +(+r.lat).toFixed(4),
      lng: +(+r.lon).toFixed(4),
      region: a.state || a.region || a.province || a.country || null,
      province: a.province || a.state_district || a.county || null,
    };
  }
  return null;
}

export async function createGeocoder() {
  const cache = await readJSON(CACHE, {});
  const overrides = await readJSON(OVERRIDES, { byQuery: {}, byOrganizer: {} });
  const byQuery = Object.fromEntries(Object.entries(overrides.byQuery || {}).map(([k, v]) => [norm(k), v]));
  const byOrganizer = Object.fromEntries(Object.entries(overrides.byOrganizer || {}).map(([k, v]) => [norm(k), v]));
  let calls = 0;
  let dirty = false;

  async function lookup(q, settlementsOnly) {
    const key = `${settlementsOnly ? 's:' : ''}${norm(q)}`;
    if (norm(q).length < 3) return null;
    if (byQuery[norm(q)]) return byQuery[norm(q)];
    if (key in cache) return cache[key];
    let hit = null;
    try {
      hit = pick(await nominatim(q), settlementsOnly);
      calls++;
    } catch (err) {
      console.warn(`  geocode: fallo buscando "${q}": ${err.message}`);
      return null; // no se cachea un error de red: se reintenta la semana siguiente
    }
    cache[key] = hit;
    dirty = true;
    return hit;
  }

  // distancia aproximada en km
  const km = (a, b) => {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  async function geocode(e) {
    // 0) corrección manual por lugar, nombre o título
    for (const k of [e.place, e.name, e.title]) {
      const o = k && byQuery[norm(k)];
      if (o) return { ...o, geo: o.geo || 'exact' };
    }
    const org = e.organizer && byOrganizer[norm(e.organizer)];
    // 1) lugar explícito
    if (e.place) {
      const hit = await lookup(e.place, false);
      if (hit) return { ...hit, geo: 'exact' };
    }
    // 2) nombre del evento sin «ruido»
    const cleaned = (e.name || e.title || '').replace(NOISE, ' ').replace(/[-–(),.]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 4) {
      const hit = await lookup(cleaned, true);
      // Un nombre ambiguo puede caer en otra punta de España: si está muy lejos
      // de la base conocida del organizador, nos fiamos más de la base.
      if (hit && !(org && km(hit, org) > 200)) return { ...hit, geo: 'name' };
    }
    // 3) base del organizador (aproximado)
    if (org) return { ...org, geo: 'approx' };
    return null;
  }

  async function save() {
    if (!dirty) return;
    const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(CACHE, JSON.stringify(sorted, null, 2) + '\n');
  }

  return { geocode, save, stats: () => ({ calls }) };
}
