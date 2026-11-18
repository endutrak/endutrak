// Lectura de las bases de datos de Notion (token en NOTION_TOKEN: secret del repo o .env local).
export const DB = {
  events: '41b73702-8600-81f8-bd8a-fc51a1aa1db2',
  routes: '41b73702-8600-8137-b471-db2c675fe18f',
  subscribers: '41b73702-8600-81c3-a712-f0d07b50d0ae',
};

export async function notion(path, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('Falta la variable NOTION_TOKEN');
  const r = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Notion ${r.status}: ${d.message}`);
  return d;
}

// Todas las filas de una base de datos que cumplan el filtro (pagina sola).
export async function queryAll(db, filter) {
  const rows = [];
  let cursor;
  do {
    const d = await notion(`databases/${db}/query`, { page_size: 100, ...(filter ? { filter } : {}), ...(cursor ? { start_cursor: cursor } : {}) });
    rows.push(...d.results);
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return rows;
}

// Valor "plano" de una propiedad de Notion.
export function val(p) {
  if (!p) return null;
  switch (p.type) {
    case 'title': case 'rich_text': return p[p.type].map((t) => t.plain_text).join('').trim() || null;
    case 'select': return p.select?.name || null;
    case 'date': return p.date ? { start: p.date.start?.slice(0, 10), end: p.date.end?.slice(0, 10) || null } : null;
    case 'url': case 'email': case 'phone_number': case 'number': case 'checkbox': return p[p.type];
    case 'files': return p.files.map((f) => ({ name: f.name, url: f.file?.url || f.external?.url }));
    default: return null;
  }
}

// Eventos con Estado = Publicado, en el mismo formato que los del feed.
export async function publishedEvents() {
  const rows = await queryAll(DB.events, { property: 'Estado', select: { equals: 'Publicado' } });
  const out = [];
  for (const r of rows) {
    const p = r.properties;
    const name = val(p.Evento);
    const fechas = val(p.Fechas);
    if (!name || !fechas?.start) continue;
    const organizer = val(p.Organizador);
    const place = val(p.Lugar);
    const end = fechas.end && fechas.end >= fechas.start ? fechas.end : fechas.start;
    out.push({
      id: `notion-${r.id.replace(/-/g, '')}`,
      title: `${organizer ? organizer + ' - ' : ''}${name}${place ? ` (${place})` : ''}`,
      name,
      organizer,
      place,
      start: fechas.start,
      end,
      url: val(p.Web) || null,
      location: null,
      custom: true,
    });
  }
  return out;
}
