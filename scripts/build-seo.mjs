// Genera las páginas estáticas para buscadores a partir de site/data:
//   /eventos/                 listado de próximos eventos (por meses) y zonas
//   /eventos/<slug>/          una página por evento, con datos estructurados Event
//   /eventos/zona/<region>/   eventos de cada comunidad autónoma
//   /sitemap.xml y /robots.txt
// y actualiza en index.html los datos estructurados (web, canal, próximos eventos, vídeos)
// y los enlaces a las zonas del pie. Sin dependencias: node scripts/build-seo.mjs
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const SITE = 'https://endutrak.es';
const ROOT = new URL('../site/', import.meta.url);
const OG = `${SITE}/assets/img/og.jpg`;

const { events: allEvents, updatedAt } = JSON.parse(await readFile(new URL('data/events.json', ROOT), 'utf8'));
const { videos = [] } = JSON.parse(await readFile(new URL('data/videos.json', ROOT), 'utf8'));
const LASTMOD = (updatedAt || new Date().toISOString()).slice(0, 10);
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // AAAA-MM-DD
const YEAR = Number(TODAY.slice(0, 4));

// ---------- utilidades ----------
const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' y ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const parse = (iso) => new Date(`${iso}T12:00:00Z`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const httpUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

function dateText(e) {
  const s = parse(e.start), f = parse(e.end);
  const d = (x) => `${x.getUTCDate()} de ${MONTHS[x.getUTCMonth()]}`;
  if (e.start === e.end) return `el ${DOW[s.getUTCDay()]} ${d(s)} de ${s.getUTCFullYear()}`;
  if (s.getUTCFullYear() !== f.getUTCFullYear()) return `del ${d(s)} de ${s.getUTCFullYear()} al ${d(f)} de ${f.getUTCFullYear()}`;
  if (s.getUTCMonth() === f.getUTCMonth()) return `del ${s.getUTCDate()} al ${d(f)} de ${f.getUTCFullYear()}`;
  return `del ${d(s)} al ${d(f)} de ${f.getUTCFullYear()}`;
}
const shortDate = (e) => {
  const s = parse(e.start), f = parse(e.end);
  return e.start === e.end ? `${s.getUTCDate()} ${MON3[s.getUTCMonth()]}`
    : s.getUTCMonth() === f.getUTCMonth() ? `${s.getUTCDate()}–${f.getUTCDate()} ${MON3[f.getUTCMonth()]}`
      : `${s.getUTCDate()} ${MON3[s.getUTCMonth()]}–${f.getUTCDate()} ${MON3[f.getUTCMonth()]}`;
};
function placeText(e) {
  if (e.place) {
    const p = e.place;
    return e.province && !p.toLowerCase().includes(e.province.toLowerCase()) ? `${p} (${e.province})` : p;
  }
  if (e.province) return `zona de ${e.province}`;
  return e.region || '';
}
const name = (e) => e.name || e.title;

// ---------- datos ----------
const events = allEvents.slice().sort((a, b) => a.start.localeCompare(b.start) || name(a).localeCompare(name(b)));
const used = new Set();
for (const e of events) {
  let s = `${slugify(name(e)) || 'evento'}-${e.start}`;
  if (used.has(s)) s = `${s}-${slugify(String(e.id)).slice(0, 6)}`;
  used.add(s);
  e.slug = s;
  e.path = `/eventos/${s}/`;
  e.past = e.end < TODAY;
}
const regions = {};
for (const e of events) if (e.region) (regions[e.region] ||= []).push(e);
const regionSlug = (r) => slugify(r);
const regionPath = (r) => `/eventos/zona/${regionSlug(r)}/`;
const upcoming = events.filter((e) => !e.past);
const recentPast = events.filter((e) => e.past && e.end >= `${YEAR - 1}-${TODAY.slice(5)}`).reverse();

function description(e) {
  const where = placeText(e);
  const parts = [`${name(e)} es un evento off-road${e.organizer ? ` organizado por ${e.organizer}` : ''} que ${e.past ? 'se celebró' : 'se celebra'} ${dateText(e)}${where ? ` en ${where}` : ''}${e.region && !where.includes(e.region) ? `, ${e.region}` : ''}.`];
  parts.push(e.past
    ? 'Esta edición ya se ha celebrado; en la web del organizador suelen anunciar la siguiente.'
    : 'En la web del organizador tienes la inscripción, el precio y los detalles del recorrido.');
  return parts.join(' ');
}

function eventLd(e) {
  const where = e.place || e.province || e.region || 'España';
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: name(e),
    startDate: e.start,
    endDate: e.end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    description: description(e),
    image: [OG],
    url: `${SITE}${e.path}`,
    location: {
      '@type': 'Place',
      name: where,
      address: {
        '@type': 'PostalAddress',
        addressLocality: (e.place || '').split(',')[0].trim() || e.province || undefined,
        addressRegion: e.province || e.region || undefined,
        addressCountry: 'ES',
      },
      ...(e.lat != null && e.geo !== 'approx' ? { geo: { '@type': 'GeoCoordinates', latitude: e.lat, longitude: e.lng } } : {}),
    },
  };
  if (e.organizer) obj.organizer = { '@type': 'Organization', name: e.organizer, ...(httpUrl(e.url) ? { url: e.url } : {}) };
  return obj;
}

// ---------- plantilla ----------
function page({ title, desc, path, body, jsonld = [], kicker }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${SITE}${path}">
  <meta property="og:site_name" content="endutrak">
  <meta property="og:locale" content="es_ES">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${OG}">
  <meta property="og:image:secure_url" content="${OG}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="endutrak: logo sobre un paisaje de montaña con una moto de trail">
  <meta property="og:url" content="${SITE}${path}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#f1efea">
  <link rel="icon" href="/assets/img/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/styles.css">
  ${jsonld.map(ld).join('\n  ')}
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/" aria-label="endutrak, inicio">
      <img src="/assets/img/logo-mark.webp" alt="" width="40" height="40">
      <span>endutrak</span>
    </a>
    <nav class="nav">
      <a href="/eventos/">Eventos</a>
      <a href="/#videos">Vídeos</a>
      <a href="/#comunidad">Comunidad</a>
      <a href="/#patrocinadores">Patrocinadores</a>
    </nav>
  </header>
  <main class="section evp">
${body.replace('<!--kicker-->', kicker ? `<p class="mono kicker">${kicker}</p>` : '')}
  </main>
  <footer class="footer">
    <a href="/"><img src="/assets/img/logo-full.webp" alt="endutrak" width="300" height="171" loading="lazy"></a>
    <p class="mono">TRAILS // RIDES // EXPLORATION // BEYOND</p>
    <p class="small"><a href="/eventos/">Calendario de eventos off-road</a> · <a href="https://www.youtube.com/@endutrak" rel="noopener">YouTube</a> · <a href="https://www.instagram.com/endutrak/" rel="noopener">Instagram</a></p>
  </footer>
</body>
</html>
`;
}

const crumbs = (items) => {
  const html = `<nav class="crumbs mono" aria-label="Migas de pan">${items.map(([t, p], i) => (i < items.length - 1 ? `<a href="${p}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join(' / ')}</nav><!--kicker-->`;
  const json = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([t, p], i) => ({ '@type': 'ListItem', position: i + 1, name: t, item: `${SITE}${p}` })),
  };
  return { html, json };
};

const row = (e) => {
  const s = parse(e.start);
  return `<li><a class="evp-row${e.past ? ' past' : ''}" href="${e.path}">
        <span class="d"><small>${DOW[s.getUTCDay()].slice(0, 3)}</small><b>${s.getUTCDate()}</b><small>${MON3[s.getUTCMonth()]}${s.getUTCFullYear() !== YEAR ? ` ${String(s.getUTCFullYear()).slice(2)}` : ''}</small></span>
        <span><span class="t">${esc(name(e))}</span><span class="s">${esc([e.organizer, placeText(e)].filter(Boolean).join(' · '))}${e.start !== e.end ? ` · ${shortDate(e)}` : ''}</span></span>
      </a></li>`;
};

const byMonth = (list) => {
  const groups = {};
  for (const e of list) (groups[e.start.slice(0, 7)] ||= []).push(e);
  return Object.entries(groups).map(([k, l]) => {
    const [y, m] = k.split('-').map(Number);
    return `    <h2 class="evp-month">${cap(MONTHS[m - 1])} ${y} <small>${l.length}</small></h2>
    <ul class="evp-list">${l.map(row).join('')}</ul>`;
  }).join('\n');
};

const zoneChips = (current) => `<ul class="evp-zones">${Object.entries(regions)
  .sort((a, b) => a[0].localeCompare(b[0], 'es'))
  .map(([r, l]) => {
    const n = l.filter((e) => !e.past).length;
    return `<li><a href="${regionPath(r)}"${r === current ? ' aria-current="page"' : ''}>${esc(r)} <small>${n}</small></a></li>`;
  }).join('')}</ul>`;

const pages = []; // [path, html]
const sitemap = [['/', 'weekly', '1.0'], ['/eventos/', 'weekly', '0.9']];

// ---------- /eventos/ ----------
{
  const c = crumbs([['endutrak', '/'], ['Eventos', '/eventos/']]);
  const title = `Calendario de rutas trail y eventos off-road en España ${YEAR} | endutrak`;
  const desc = `${upcoming.length} próximas rutas trail, enduro, raids y quedadas off-road en España, ordenadas por fecha y por comunidad autónoma. Lo actualizo cada semana.`;
  const body = `    ${c.html}
    <h1>Calendario de eventos off-road ${YEAR}</h1>
    <p class="lede">Rutas trail, enduro, raids y quedadas en moto por toda España. Lo actualizo cada semana. Si prefieres verlo en calendario o en mapa, está en la <a href="/#calendario">portada</a>.</p>
    <h2 class="evp-sub">Por zonas</h2>
    ${zoneChips()}
    <h2 class="evp-sub">Próximos eventos</h2>
${byMonth(upcoming)}
    ${recentPast.length ? `<details class="evp-past"><summary>Eventos ya celebrados (${recentPast.length})</summary><ul class="evp-list">${recentPast.map(row).join('')}</ul></details>` : ''}
    <p class="evp-cta">¿Organizas un evento y no está? <a class="btn btn-ink" href="/#calendario">Proponer evento</a></p>`;
  pages.push(['/eventos/', page({
    title, desc, path: '/eventos/', body, kicker: 'Calendario off-road · España',
    jsonld: [c.json, {
      '@context': 'https://schema.org', '@type': 'ItemList', name: `Próximos eventos off-road en España`,
      itemListElement: upcoming.slice(0, 50).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${e.path}`, name: name(e) })),
    }],
  })]);
}

// ---------- /eventos/zona/<region>/ ----------
for (const [r, list] of Object.entries(regions)) {
  const path = regionPath(r);
  const up = list.filter((e) => !e.past);
  const past = list.filter((e) => e.past).reverse();
  const provinces = [...new Set(list.map((e) => e.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const c = crumbs([['endutrak', '/'], ['Eventos', '/eventos/'], [r, path]]);
  const title = `Rutas trail y eventos off-road en ${r} ${YEAR} | endutrak`;
  const desc = up.length
    ? `${up.length} próximo${up.length === 1 ? '' : 's'} evento${up.length === 1 ? '' : 's'} off-road en ${r}${provinces.length ? ` (${provinces.slice(0, 4).join(', ')})` : ''}: rutas trail, enduro y raids en moto, con fechas y enlace a la inscripción.`
    : `Rutas trail, enduro y eventos off-road en ${r}: los últimos celebrados y los próximos en cuanto se anuncien.`;
  const body = `    ${c.html}
    <h1>Eventos off-road en ${esc(r)}</h1>
    <p class="lede">Rutas trail, enduro, raids y quedadas en moto en ${esc(r)}${provinces.length ? ` (${esc(provinces.join(', '))})` : ''}. Lo actualizo cada semana.</p>
    ${up.length ? byMonth(up) : '<p class="evp-empty">Ahora mismo no hay próximos eventos anunciados en esta zona. Vuelve en unos días o mira otras zonas.</p>'}
    ${past.length ? `<h2 class="evp-sub">Ya celebrados</h2><ul class="evp-list">${past.map(row).join('')}</ul>` : ''}
    <h2 class="evp-sub">Otras zonas</h2>
    ${zoneChips(r)}`;
  pages.push([path, page({
    title, desc, path, body, kicker: `Calendario off-road · ${esc(r)}`,
    jsonld: [c.json, ...(up.length ? [{
      '@context': 'https://schema.org', '@type': 'ItemList', name: `Eventos off-road en ${r}`,
      itemListElement: up.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${e.path}`, name: name(e) })),
    }] : [])],
  })]);
  sitemap.push([path, 'weekly', '0.8']);
}

// ---------- /eventos/<slug>/ ----------
for (const e of events) {
  const trail = [['endutrak', '/'], ['Eventos', '/eventos/']];
  if (e.region) trail.push([e.region, regionPath(e.region)]);
  trail.push([name(e), e.path]);
  const c = crumbs(trail);
  const y = parse(e.start).getUTCFullYear();
  const where = placeText(e);
  const title = `${name(e)}${name(e).includes(String(y)) ? '' : ` ${y}`}${where ? ` · ${where}` : ''} | endutrak`;
  const desc = description(e);
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(name(e))}&dates=${e.start.replace(/-/g, '')}/${new Date(parse(e.end).getTime() + 864e5).toISOString().slice(0, 10).replace(/-/g, '')}&details=${encodeURIComponent(httpUrl(e.url) || `${SITE}${e.path}`)}&location=${encodeURIComponent(where)}`;
  const more = (e.region ? regions[e.region] : []).filter((x) => x !== e && !x.past).slice(0, 6);
  const fallback = more.length ? more : upcoming.filter((x) => x !== e).slice(0, 6);
  const body = `    ${c.html}
    <h1>${esc(name(e))}</h1>
    <dl class="evp-facts">
      <div><dt>Fecha</dt><dd>${esc(cap(dateText(e).replace(/^el /, '')))}${e.past ? ' <em>· ya celebrado</em>' : ''}</dd></div>
      ${where ? `<div><dt>Lugar</dt><dd>${esc(where)}${e.geo === 'approx' ? ' <em>· zona aproximada</em>' : ''}</dd></div>` : ''}
      ${e.region ? `<div><dt>Zona</dt><dd><a href="${regionPath(e.region)}">${esc(e.region)}</a></dd></div>` : ''}
      ${e.organizer ? `<div><dt>Organiza</dt><dd>${esc(e.organizer)}</dd></div>` : ''}
    </dl>
    <p class="evp-desc">${esc(desc)}</p>
    <div class="evp-actions">
      ${httpUrl(e.url) ? `<a class="btn btn-ink" href="${esc(e.url)}" target="_blank" rel="noopener nofollow">Información e inscripción ↗</a>` : ''}
      <a class="btn btn-ghost" href="/#evento=${encodeURIComponent(e.id)}">Ver en el calendario</a>
      ${e.past ? '' : `<a class="btn btn-ghost" href="${esc(gcal)}" target="_blank" rel="noopener nofollow">Añadir a Google Calendar</a>`}
    </div>
    ${fallback.length ? `<h2 class="evp-sub">${more.length ? `Más eventos en ${esc(e.region)}` : 'Próximos eventos'}</h2>
    <ul class="evp-list">${fallback.map(row).join('')}</ul>` : ''}
    <p class="evp-back"><a href="/eventos/">← Todos los eventos off-road</a></p>`;
  pages.push([e.path, page({ title, desc, path: e.path, body, kicker: esc(e.organizer || 'Evento off-road'), jsonld: [eventLd(e), c.json] })]);
  sitemap.push([e.path, e.past ? 'yearly' : 'weekly', e.past ? '0.3' : '0.7']);
}

// ---------- escribir ----------
await rm(new URL('eventos/', ROOT), { recursive: true, force: true });
for (const [path, html] of pages) {
  const dir = new URL(`.${path}`, ROOT);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html);
}

await writeFile(new URL('sitemap.xml', ROOT), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(([p, f, pr]) => `  <url><loc>${SITE}${p}</loc><lastmod>${LASTMOD}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);
await writeFile(new URL('robots.txt', ROOT), `User-agent: *
Allow: /
Disallow: /admin.html

Sitemap: ${SITE}/sitemap.xml
`);

// ---------- index.html: datos estructurados + zonas del pie ----------
const indexUrl = new URL('index.html', ROOT);
let index = await readFile(indexUrl, 'utf8');
const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE}/#web`, url: `${SITE}/`, name: 'endutrak', inLanguage: 'es-ES', publisher: { '@id': `${SITE}/#org` } },
    {
      '@type': 'Organization', '@id': `${SITE}/#org`, name: 'endutrak', url: `${SITE}/`,
      logo: `${SITE}/assets/img/favicon.png`, image: OG,
      sameAs: ['https://www.youtube.com/@endutrak', 'https://www.instagram.com/endutrak/'],
    },
    {
      '@type': 'ItemList', name: 'Próximos eventos off-road en España',
      itemListElement: upcoming.slice(0, 20).map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${e.path}`, name: name(e) })),
    },
    ...videos.filter((v) => !v.hidden).slice(0, 12).map((v) => ({
      '@type': 'VideoObject', name: v.title, description: `${v.title} — vídeo de endutrak, rutas de enduro y trail en moto.`,
      thumbnailUrl: [`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`],
      uploadDate: v.published, embedUrl: `https://www.youtube.com/embed/${v.id}`,
      contentUrl: v.type === 'short' ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
    })),
  ],
};
const between = (html, tag, content) => html.replace(
  new RegExp(`(<!-- seo:${tag} -->)[\\s\\S]*?(<!-- /seo:${tag} -->)`),
  `$1\n  ${content}\n  $2`,
);
index = between(index, 'jsonld', ld(graph));
index = between(index, 'zonas', `<nav class="footer-zones" aria-label="Eventos por zona"><a href="/eventos/">Todos los eventos</a>${Object.keys(regions).sort((a, b) => a.localeCompare(b, 'es')).map((r) => `<a href="${regionPath(r)}">${esc(r)}</a>`).join('')}</nav>`);
await writeFile(indexUrl, index);

console.log(`seo: ${pages.length} páginas (${events.length} eventos, ${Object.keys(regions).length} zonas), sitemap con ${sitemap.length} URLs`);
