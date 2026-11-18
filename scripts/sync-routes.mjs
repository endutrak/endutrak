// Rutas con GPX desde Notion (base «Rutas», casilla Publicada marcada).
// - Descarga cada GPX a site/gpx/<ruta>-<código>.gpx (el código hace que no se pueda adivinar la URL).
// - site/data/rutas.json: datos públicos de cada ruta (sin el enlace al GPX).
// - worker/rutas.json: ruta → archivo GPX; solo lo conoce el Worker, que lo entrega
//   después de que la persona deje su email.
// Sin NOTION_TOKEN no toca nada (útil en local).
import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { DB, queryAll, val } from './notion.mjs';

const ROOT = new URL('../', import.meta.url);
const GPX_DIR = new URL('site/gpx/', ROOT);

if (!process.env.NOTION_TOKEN) {
  console.log('rutas: sin NOTION_TOKEN, no se sincroniza');
  process.exit(0);
}

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ruta';

// ID de YouTube a partir de cualquier enlace (watch?v=, youtu.be/, shorts/, embed/)
const youtubeId = (u) => (u || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1] || null;

const rows = await queryAll(DB.routes, { property: 'Publicada', checkbox: { equals: true } });
await mkdir(GPX_DIR, { recursive: true });

const pub = [];
const priv = {};
const keep = new Set();
const used = new Set();

for (const r of rows) {
  const p = r.properties;
  const name = val(p.Ruta);
  const file = (val(p.GPX) || []).find((f) => f.url);
  if (!name || !file) { console.warn(`rutas: «${name || r.id}» sin nombre o sin GPX, se omite`); continue; }

  let slug = slugify(name);
  while (used.has(slug)) slug += '-2';
  used.add(slug);

  const res = await fetch(file.url);
  if (!res.ok) { console.warn(`rutas: no se pudo descargar el GPX de «${name}» (${res.status})`); continue; }
  const gpx = Buffer.from(await res.arrayBuffer());
  const code = createHash('sha256').update(r.id).digest('hex').slice(0, 10);
  const fname = `${slug}-${code}.gpx`;
  await writeFile(new URL(fname, GPX_DIR), gpx);
  keep.add(fname);

  const fecha = val(p.Fecha);
  pub.push({
    id: slug,
    name,
    video: youtubeId(val(p['Vídeo'])),
    zone: val(p.Zona),
    km: val(p.Km),
    date: fecha?.start || null,
    description: val(p['Descripción']),
  });
  priv[slug] = { page: r.id, file: `/gpx/${fname}` };
}

// Borra GPX de rutas que ya no están publicadas
for (const f of await readdir(GPX_DIR)) if (f.endsWith('.gpx') && !keep.has(f)) await rm(new URL(f, GPX_DIR));

pub.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
await writeFile(new URL('site/data/rutas.json', ROOT), JSON.stringify({ rutas: pub }, null, 2) + '\n');
await writeFile(new URL('worker/rutas.json', ROOT), JSON.stringify(priv, null, 2) + '\n');
console.log(`rutas: ${pub.length} publicadas`);
