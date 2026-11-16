/* endutrak — panel de administración.
   No hay servidor: lee y escribe los JSON del repo con la API de GitHub usando
   un token personal guardado solo en este navegador. Cada "Guardar" es un commit,
   que dispara el workflow que regenera y publica la web. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const WORKFLOW = 'sync-deploy.yml';
  const FILES = { videos: 'site/data/videos.json', events: 'site/data/events-custom.json' };
  const KEY = 'endutrak-admin';

  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem(KEY)); } catch {}

  const store = {
    videos: { data: null, sha: null, original: '' },
    events: { data: null, sha: null, original: '' },
  };

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    const r = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    });
    if (!r.ok && r.status !== 404) {
      const msg = (await r.json().catch(() => ({}))).message || r.statusText;
      throw new Error(`GitHub ${r.status}: ${msg}`);
    }
    return r.status === 204 ? null : r.status === 404 ? { notFound: true } : r.json();
  }
  const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
  const b64encode = (s) => { let bin = ''; new TextEncoder().encode(s).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };

  async function load(kind, fallback) {
    const res = await gh(`/contents/${FILES[kind]}?ref=${cfg.branch}`);
    const data = res.notFound ? fallback : JSON.parse(b64decode(res.content));
    store[kind] = { data, sha: res.notFound ? null : res.sha, original: JSON.stringify(data) };
  }
  async function save(kind, message) {
    const content = JSON.stringify(store[kind].data, null, 2) + '\n';
    const res = await gh(`/contents/${FILES[kind]}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: b64encode(content), branch: cfg.branch, ...(store[kind].sha ? { sha: store[kind].sha } : {}) }),
    });
    store[kind].sha = res.content.sha;
    store[kind].original = JSON.stringify(store[kind].data);
  }

  // ---------- UI helpers ----------
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
  }
  const dirty = () => ['videos', 'events'].some((k) => store[k].data && JSON.stringify(store[k].data) !== store[k].original);
  const updateSavebar = () => ($('#savebar').hidden = !dirty());
  const dateLabel = (s) => { if (!s) return ''; const d = new Date(s); return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`; };

  // ---------- vídeos ----------
  function parseYouTube(url) {
    url = url.trim();
    const m =
      url.match(/youtube\.com\/shorts\/([\w-]{11})/) ||
      url.match(/youtu\.be\/([\w-]{11})/) ||
      url.match(/[?&]v=([\w-]{11})/) ||
      url.match(/youtube\.com\/(?:embed|live)\/([\w-]{11})/) ||
      url.match(/^([\w-]{11})$/);
    if (!m) return null;
    return { id: m[1], type: /\/shorts\//.test(url) ? 'short' : 'video' };
  }

  function renderVideos() {
    const list = store.videos.data.videos;
    $('#rows').innerHTML = list.length
      ? list.map((v, i) => `
        <li class="row ${v.hidden ? 'is-hidden' : ''} ${v.featured ? 'is-featured' : ''}">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy">
          <div>
            <div class="t">${esc(v.title || v.id)}</div>
            <div class="m">
              <span class="pill ${v.type === 'short' ? 'mud' : ''}">${v.type === 'short' ? 'Short' : 'Vídeo'}</span>
              <span class="pill">${v.source === 'manual' ? 'Manual' : 'Auto'}</span>
              <span>${dateLabel(v.published)}</span>
              <a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener">abrir ↗</a>
            </div>
          </div>
          <div class="acts">
            <button class="act" data-act="type" data-i="${i}" title="Cambiar entre vídeo y short">⇄</button>
            <button class="act" data-act="featured" data-i="${i}" aria-pressed="${!!v.featured}" title="Destacar en portada">★</button>
            <button class="act" data-act="hidden" data-i="${i}" aria-pressed="${!!v.hidden}" title="Ocultar de la web">${v.hidden ? '◌' : '◉'}</button>
            ${v.source === 'manual' ? `<button class="act" data-act="del" data-i="${i}" title="Eliminar">✕</button>` : ''}
          </div>
        </li>`).join('')
      : '<li class="card help">Aún no hay vídeos. Cuando subas uno al canal aparecerá aquí solo (o pega un enlace arriba).</li>';
    updateSavebar();
  }

  $('#rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const list = store.videos.data.videos;
    const v = list[+b.dataset.i];
    if (b.dataset.act === 'type') v.type = v.type === 'short' ? 'video' : 'short';
    if (b.dataset.act === 'featured') { const on = !v.featured; list.forEach((x) => (x.featured = false)); v.featured = on; }
    if (b.dataset.act === 'hidden') v.hidden = !v.hidden;
    if (b.dataset.act === 'del' && confirm(`¿Eliminar "${v.title}"?`)) list.splice(+b.dataset.i, 1);
    renderVideos();
  });

  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#add-err').textContent = '';
    const raw = $('#add-url').value;
    const p = parseYouTube(raw);
    if (!p) return ($('#add-err').textContent = 'No reconozco ese enlace de YouTube.');
    const list = store.videos.data.videos;
    if (list.some((v) => v.id === p.id)) return ($('#add-err').textContent = 'Ese vídeo ya está en la lista.');
    let title = '';
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${p.id}`)}`);
      if (r.ok) title = (await r.json()).title;
    } catch {}
    if (!title) title = prompt('No pude leer el título. Escríbelo:') || p.id;
    list.unshift({ id: p.id, title, published: new Date().toISOString(), type: p.type, source: 'manual', featured: false, hidden: false });
    $('#add-url').value = '';
    renderVideos();
  });

  // ---------- eventos propios ----------
  function renderEvents() {
    const list = store.events.data.events.slice().sort((a, b) => a.start.localeCompare(b.start));
    store.events.data.events = list;
    $('#ev-rows').innerHTML = list.length
      ? list.map((ev, i) => {
          const d = new Date(ev.start + 'T00:00:00');
          return `<li class="row ev-row">
            <span class="date"><b>${d.getDate()}</b><small>${MON3[d.getMonth()]} ${d.getFullYear()}</small></span>
            <div><div class="t">${esc(ev.name)}</div><div class="m">${esc([ev.organizer, ev.place].filter(Boolean).join(' · '))}${ev.end !== ev.start ? ` · hasta ${esc(ev.end)}` : ''}</div></div>
            <div class="acts"><button class="act" data-del="${i}" title="Eliminar">✕</button></div>
          </li>`;
        }).join('')
      : '<li class="card help">No tienes eventos propios todavía.</li>';
    updateSavebar();
  }

  $('#ev-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (b && confirm('¿Eliminar este evento?')) { store.events.data.events.splice(+b.dataset.del, 1); renderEvents(); }
  });

  $('#ev-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const end = f.end && f.end >= f.start ? f.end : f.start;
    const title = `${f.organizer ? f.organizer + ' - ' : ''}${f.name}${f.place ? ` (${f.place})` : ''}`;
    store.events.data.events.push({
      id: `custom-${Date.now().toString(36)}`, title, name: f.name, organizer: f.organizer || null,
      place: f.place || null, start: f.start, end, url: f.url || null, location: null,
    });
    e.target.reset();
    renderEvents();
  });

  // ---------- guardar / sincronizar ----------
  $('#save').addEventListener('click', async () => {
    const btn = $('#save');
    btn.disabled = true; btn.textContent = 'Publicando…';
    try {
      if (JSON.stringify(store.videos.data) !== store.videos.original) await save('videos', 'admin: actualizar vídeos');
      if (JSON.stringify(store.events.data) !== store.events.original) await save('events', 'admin: actualizar eventos propios');
      toast('Guardado ✓ La web se actualiza en 1–2 minutos');
      setTimeout(pollRun, 4000);
    } catch (err) {
      toast(err.message.includes('409') ? 'Alguien cambió el archivo a la vez. Recarga la página.' : err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar y publicar'; updateSavebar();
    }
  });

  $('#discard').addEventListener('click', async () => { await init(); toast('Cambios descartados'); });

  $('#sync').addEventListener('click', async () => {
    try {
      await gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: cfg.branch }) });
      toast('Sincronizando… en un par de minutos estará publicado');
      setTimeout(pollRun, 4000);
    } catch (err) { toast(err.message); }
  });

  let pollT;
  async function pollRun() {
    clearTimeout(pollT);
    try {
      const r = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
      const run = r.workflow_runs?.[0];
      if (!run) return ($('#run-status').textContent = 'sin ejecuciones');
      const when = new Date(run.updated_at);
      const label = run.status !== 'completed' ? '⏳ publicando…' : run.conclusion === 'success' ? '✓ publicado' : `✕ ${run.conclusion}`;
      $('#run-status').innerHTML = `<a href="${run.html_url}" target="_blank" rel="noopener">${label}</a> · ${when.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
      if (run.status !== 'completed') pollT = setTimeout(pollRun, 6000);
    } catch { $('#run-status').textContent = '—'; }
  }

  // ---------- tabs / sesión ----------
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', x === t));
      document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
    }),
  );

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    cfg = { repo: f.repo.trim(), token: f.token.trim(), branch: 'main' };
    $('#login-err').textContent = '';
    try {
      const repo = await gh('');
      if (repo.notFound) throw new Error('No encuentro ese repositorio (¿nombre correcto? ¿el token tiene acceso?)');
      cfg.branch = repo.default_branch || 'main';
      localStorage.setItem(KEY, JSON.stringify(cfg));
      await init();
    } catch (err) { $('#login-err').textContent = err.message; cfg = null; }
  });

  $('#logout').addEventListener('click', () => {
    if (!confirm('¿Olvidar el token en este navegador?')) return;
    localStorage.removeItem(KEY); location.reload();
  });

  window.addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });

  async function init() {
    if (!cfg) { $('#login').hidden = false; $('#app').hidden = true; return; }
    $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
    $('#whoami').textContent = cfg.repo;
    try {
      await Promise.all([load('videos', { videos: [] }), load('events', { events: [] })]);
      store.videos.data.videos ||= [];
      store.events.data.events ||= [];
      renderVideos(); renderEvents(); pollRun();
    } catch (err) {
      toast(err.message);
      if (/401|403/.test(err.message)) { $('#login').hidden = false; $('#app').hidden = true; $('#login-err').textContent = 'El token no es válido o le faltan permisos.'; }
    }
  }
  init();
})();
