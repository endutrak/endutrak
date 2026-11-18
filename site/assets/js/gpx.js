/* endutrak — descargar el GPX de una ruta dejando el email.
   Las rutas salen de data/rutas.json (base «Rutas» de Notion, casilla Publicada).
   Se abre con cualquier botón [data-gpx="id"] o con un enlace directo:
   endutrak.es/#gpx=<id>  (para la descripción de YouTube o la bio de Instagram). */
(() => {
  const $ = (s) => document.querySelector(s);
  const dlg = $('#gpx'), form = $('#gpx-form'), msg = $('#gpx-msg');
  const btn = form.querySelector('[type=submit]');
  let routes = {};

  const MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dateLabel = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+d} ${MON3[m - 1]} ${y}`; };

  function download(file) {
    const a = document.createElement('a');
    a.href = file; a.download = '';
    document.body.append(a); a.click(); a.remove();
  }

  function open(id) {
    // vale el id de la ruta o el id del vídeo de YouTube
    if (!routes[id]) id = Object.keys(routes).find((k) => routes[k].video === id);
    const r = routes[id];
    if (!r) return;
    $('#gpx-title').textContent = r.name;
    $('#gpx-meta').textContent = [r.zone, r.km ? `${r.km} km` : '', dateLabel(r.date)].filter(Boolean).join(' · ');
    const desc = $('#gpx-desc');
    desc.textContent = r.description || '';
    desc.hidden = !r.description;
    form.route.value = id;
    msg.textContent = '';
    btn.disabled = false; btn.textContent = 'Descargar GPX';
    if (!dlg.open) dlg.showModal();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-gpx]');
    if (t) { e.preventDefault(); open(t.dataset.gpx); }
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close-gpx]')) dlg.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (f.botcheck) return;
    btn.disabled = true; btn.textContent = 'Preparando…'; msg.textContent = '';
    try {
      const r = await fetch('/api/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ form: 'gpx', ...f, news: !!f.news, consent: !!f.consent }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.file) throw new Error(data.message || 'Error');
      download(data.file);
      msg.innerHTML = '';
      msg.append('¡Listo! Si la descarga no empieza, ');
      const a = Object.assign(document.createElement('a'), { href: data.file, textContent: 'pulsa aquí' });
      a.download = '';
      msg.append(a, '.');
      btn.textContent = 'Descargado ✓';
      form.email.value = '';
    } catch {
      msg.textContent = 'No se pudo preparar la descarga. Inténtalo de nuevo en un rato.';
      btn.disabled = false; btn.textContent = 'Descargar GPX';
    }
  });

  // Enlace directo: endutrak.es/#gpx=<id>
  const fromHash = () => {
    const m = location.hash.match(/^#gpx[=-](.+)$/);
    if (m) open(decodeURIComponent(m[1]));
  };
  window.addEventListener('hashchange', fromHash);

  fetch('data/rutas.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then(({ rutas = [] }) => {
      routes = Object.fromEntries(rutas.map((r) => [r.id, r]));
      fromHash();
    })
    .catch(() => {});
})();
