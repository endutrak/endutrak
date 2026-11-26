// endutrak — Worker de Cloudflare.
// Sirve la web estática (carpeta site/) y atiende POST /api/form, que guarda los
// formularios en las bases de datos de Notion. El token de Notion es un secreto del
// Worker (NOTION_TOKEN) y nunca llega al navegador.

// Ruta → página de Notion y archivo GPX (lo genera scripts/sync-routes.mjs; no es público).
import ROUTES from './rutas.json';

const NOTION = 'https://api.notion.com/v1/pages';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// ---------- utilidades para propiedades de Notion ----------
const clip = (v, n = 1900) => String(v ?? '').trim().slice(0, n);
const text = (v) => ({ rich_text: v ? [{ text: { content: clip(v) } }] : [] });
const title = (v) => ({ title: [{ text: { content: clip(v, 200) || '(sin nombre)' } }] });
const select = (v) => (v ? { select: { name: clip(v, 90) } } : { select: null });
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const httpUrl = (v) => (/^https?:\/\/\S+$/i.test(v || '') ? clip(v, 1900) : null);

function eventPage(f, env) {
  if (!f.name || !f.organizer || !isDate(f.start) || !f.place || !isEmail(f.email)) return null;
  const end = isDate(f.end) && f.end >= f.start ? f.end : null;
  return {
    parent: { database_id: env.NOTION_DB_EVENTS },
    properties: {
      Evento: title(f.name),
      Estado: select('Nuevo'),
      Origen: select('Propuesta web'),
      Fechas: { date: { start: f.start, end } },
      Organizador: text(f.organizer),
      Lugar: text(f.place),
      Tipo: select(f.type),
      Web: { url: httpUrl(f.url) },
      Email: { email: f.email },
      Detalles: text(f.details),
    },
  };
}

function sponsorPage(f, env) {
  if (!f.brand || !f.person || !isEmail(f.email) || !f.details) return null;
  return {
    parent: { database_id: env.NOTION_DB_SPONSORS },
    properties: {
      Marca: title(f.brand),
      Estado: select('Nuevo'),
      Contacto: text(f.person),
      Email: { email: f.email },
      'Teléfono': { phone_number: clip(f.phone, 30) || null },
      'Web / Instagram': text(f.url),
      'Colaboración': select(f.kind),
      Propuesta: text(f.details),
    },
  };
}

const TRADES = ['Finde rodando juntos', 'Otro intercambio', 'Pago'];

function editPage(f, env) {
  if (!f.name || !isEmail(f.email) || !f.details) return null;
  const trades = (Array.isArray(f.trade) ? f.trade : [f.trade]).filter((t) => TRADES.includes(t));
  return {
    parent: { database_id: env.NOTION_DB_EDITS },
    properties: {
      Nombre: title(f.name),
      Estado: select('Nuevo'),
      'A cambio': { multi_select: trades.map((name) => ({ name })) },
      Tipo: select(f.type),
      Zona: text(f.zone),
      Email: { email: f.email },
      'Teléfono': { phone_number: clip(f.phone, 30) || null },
      Redes: text(f.social),
      Material: text(f.footage),
      'Enlace al material': { url: httpUrl(f.link) },
      'Para cuándo': isDate(f.deadline) ? { date: { start: f.deadline } } : { date: null },
      Detalles: text(f.details),
    },
  };
}

const FORMS = { evento: eventPage, patrocinio: sponsorPage, montaje: editPage };

// ---------- descarga de GPX: guarda el email en «Suscriptores» y devuelve el archivo ----------
const notionApi = (env, path, body, method = 'POST') =>
  fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function saveSubscriber(env, email, routePage, news) {
  // Si el email ya existe, se le añade la ruta (y Novedades si ahora lo marca) en vez de duplicarlo.
  const q = await notionApi(env, `databases/${env.NOTION_DB_SUBSCRIBERS}/query`, {
    filter: { property: 'Email', title: { equals: email } }, page_size: 1,
  });
  if (!q.ok) throw new Error(`query ${q.status} ${await q.text()}`);
  const prev = (await q.json()).results[0];
  if (prev) {
    const rel = prev.properties.Ruta?.relation || [];
    const r = await notionApi(env, `pages/${prev.id}`, {
      properties: {
        Ruta: { relation: rel.some((x) => x.id.replace(/-/g, '') === routePage.replace(/-/g, '')) ? rel : [...rel, { id: routePage }] },
        Novedades: { checkbox: !!(prev.properties.Novedades?.checkbox || news) },
      },
    }, 'PATCH');
    if (!r.ok) throw new Error(`update ${r.status} ${await r.text()}`);
    return;
  }
  const r = await notionApi(env, 'pages', {
    parent: { database_id: env.NOTION_DB_SUBSCRIBERS },
    properties: {
      Email: title(email),
      Ruta: { relation: [{ id: routePage }] },
      Novedades: { checkbox: !!news },
      Origen: select('Descarga GPX'),
    },
  });
  if (!r.ok) throw new Error(`create ${r.status} ${await r.text()}`);
}

async function handleGpx(f, env) {
  const route = Object.hasOwn(ROUTES, f.route) ? ROUTES[f.route] : null;
  if (!route) return json({ success: false, message: 'Ruta no encontrada' }, 404);
  const email = clip(f.email, 200).toLowerCase();
  if (!isEmail(email) || !f.consent) return json({ success: false, message: 'Faltan campos obligatorios' }, 400);
  try {
    await saveSubscriber(env, email, route.page, f.news);
  } catch (e) {
    // Si Notion falla, la persona recibe igualmente su GPX; el error queda en los logs.
    console.error('Notion suscriptor', e.message);
  }
  return json({ success: true, file: route.file });
}

async function handleForm(request, env) {
  if (request.method !== 'POST') return json({ success: false, message: 'Método no permitido' }, 405);
  // Solo se aceptan envíos desde la propia web (mismo dominio que sirve el Worker).
  const origin = request.headers.get('Origin');
  let sameSite = false;
  try { sameSite = new URL(origin).host === new URL(request.url).host; } catch {}
  if (!sameSite) return json({ success: false, message: 'Origen no permitido' }, 403);
  let f;
  try {
    f = await request.json();
  } catch {
    return json({ success: false, message: 'Datos no válidos' }, 400);
  }
  if (f.botcheck) return json({ success: true }); // trampa para bots: se ignora en silencio
  if (f.form === 'gpx') return handleGpx(f, env);
  const build = FORMS[f.form];
  if (!build) return json({ success: false, message: 'Formulario desconocido' }, 400);
  const page = build(f, env);
  if (!page) return json({ success: false, message: 'Faltan campos obligatorios' }, 400);

  const r = await fetch(NOTION, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(page),
  });
  if (!r.ok) {
    console.error('Notion', r.status, await r.text());
    return json({ success: false, message: 'No se pudo guardar' }, 502);
  }
  return json({ success: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/form') return handleForm(request, env);
    return env.ASSETS.fetch(request);
  },
};
