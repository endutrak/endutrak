// Lee el feed RSS público del canal (no necesita API key) y añade a site/data/videos.json
// los vídeos y shorts nuevos. Respeta lo que hayas tocado a mano desde el panel
// (destacado, oculto, vídeos añadidos manualmente).
// Uso: node scripts/sync-youtube.mjs
import { readFile, writeFile } from 'node:fs/promises';

const CHANNEL_ID = process.env.YT_CHANNEL_ID || 'UCs98YopPgOKwtsYQ4EXA5NQ'; // @endutrak
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const FILE = new URL('../site/data/videos.json', import.meta.url);

const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : '';
};

// Un short responde 200 en /shorts/ID; un vídeo normal redirige a /watch.
async function isShort(id, link) {
  if (link.includes('/shorts/')) return true;
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function load() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return { channelId: CHANNEL_ID, videos: [] };
  }
}

const res = await fetch(FEED);
if (!res.ok) throw new Error(`No se pudo leer el feed de YouTube: HTTP ${res.status}`);
const xml = await res.text();
const entries = xml.split('<entry>').slice(1).map((e) => e.split('</entry>')[0]);

const data = await load();
const byId = new Map(data.videos.map((v) => [v.id, v]));
let added = 0;

for (const e of entries) {
  const id = tag(e, 'yt:videoId');
  if (!id) continue;
  const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [, ''])[1];
  const prev = byId.get(id);
  const fresh = {
    id,
    title: tag(e, 'title'),
    published: tag(e, 'published'),
    type: prev?.type || ((await isShort(id, link)) ? 'short' : 'video'),
  };
  if (prev) {
    // Actualiza título/fecha, mantiene flags manuales.
    Object.assign(prev, { title: fresh.title, published: fresh.published, type: fresh.type });
  } else {
    byId.set(id, { ...fresh, source: 'auto', featured: false, hidden: false });
    added++;
  }
}

data.channelId = CHANNEL_ID;
data.videos = [...byId.values()].sort((a, b) => (b.published || '').localeCompare(a.published || ''));
await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`videos.json: ${data.videos.length} vídeos (${added} nuevos)`);
