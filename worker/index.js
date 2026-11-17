// endutrak — Worker de Cloudflare.
// Sirve la web estática (carpeta site/) y atiende POST /api/form, que guarda los
// formularios en las bases de datos de Notion. El token de Notion es un secreto del
// Worker (NOTION_TOKEN) y nunca llega al navegador.

const NOTION = 'https://api.notion.com/v1/pages';
const SITE = 'https://endutrak.es';

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
  // Enlace que abre el panel con el evento ya relleno para publicarlo en un clic.
  const draft = { name: clip(f.name, 120), organizer: clip(f.organizer, 80), place: clip(f.place, 100), start: f.start, end: end || f.start, url: httpUrl(f.url) || '' };
  return {
    parent: { database_id: env.NOTION_DB_EVENTS },
    properties: {
      Evento: title(f.name),
      Estado: select('Nuevo'),
      Fechas: { date: { start: f.start, end } },
      Organizador: text(f.organizer),
      Lugar: text(f.place),
      Tipo: select(f.type),
      Web: { url: httpUrl(f.url) },
      Email: { email: f.email },
      Detalles: text(f.details),
      Aprobar: { url: `${SITE}/admin.html#nuevo=${encodeURIComponent(JSON.stringify(draft))}` },
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

const FORMS = { evento: eventPage, patrocinio: sponsorPage };

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
