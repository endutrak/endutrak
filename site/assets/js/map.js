/* endutrak — vista de mapa de eventos por zonas.
   Leaflet + teselas CARTO (claras) se cargan solo la primera vez que se abre el mapa. */
(() => {
  const $ = (s) => document.querySelector(s);
  const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  const SPAIN = [[35.9, -9.4], [43.9, 4.4]]; // península + Baleares

  const ui = { view: 'cal', range: 'upcoming', region: null };
  let map = null, layer = null, leafletLoading = null;
  let current = []; // eventos que se están mostrando en el mapa

  const cal = () => window.EndutrakCal;

  // ---------- carga perezosa de Leaflet ----------
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    leafletLoading = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = LEAFLET_JS; s.onload = ok; s.onerror = ko;
      document.head.appendChild(s);
    });
    return leafletLoading;
  }

  function initMap() {
    map = L.map('map', { zoomControl: false, scrollWheelZoom: false, attributionControl: true, minZoom: 4, maxZoom: 13 });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: 'Tiles © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> — Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    map.on('zoomend', draw);
    map.fitBounds(SPAIN);
    layer = L.layerGroup().addTo(map);
    // la rueda solo hace zoom tras hacer clic en el mapa (no secuestra el scroll de la página)
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
  }

  // ---------- datos ----------
  function eventsInRange() {
    const { state, visible, util } = cal();
    const ev = visible();
    if (state.q) return ev; // buscando: todas las fechas
    if (ui.range === 'upcoming') return ev.filter((e) => e.end >= util.TODAY);
    if (ui.range === 'month') {
      const key = `${state.y}-${String(state.m + 1).padStart(2, '0')}`;
      return ev.filter((e) => e.start.slice(0, 7) <= key && e.end.slice(0, 7) >= key);
    }
    return ev.filter((e) => e.start.slice(0, 4) <= String(state.y) && e.end.slice(0, 4) >= String(state.y));
  }

  // ---------- render ----------
  function render() {
    if (ui.view !== 'map' || !cal()) return;
    const { state, util } = cal();
    const { esc, parse, MON3, MONTHS, TODAY } = util;
    $('#range-month').textContent = MONTHS[state.m][0].toUpperCase() + MONTHS[state.m].slice(1);
    $('#range-year').textContent = `Todo ${state.y}`;
    const searching = !!state.q;
    document.querySelectorAll('.map-range button').forEach((b) => b.setAttribute('aria-selected', !searching && b.dataset.range === ui.range));

    const all = eventsInRange();
    const located = all.filter((e) => e.lat != null);
    const missing = all.length - located.length;

    // --- panel de zonas ---
    const byRegion = {};
    located.forEach((e) => (byRegion[e.region || 'Otras'] ||= []).push(e));
    if (ui.region && !byRegion[ui.region]) ui.region = null;
    const shown = ui.region ? byRegion[ui.region] : located;

    if (!ui.region) {
      const rows = Object.entries(byRegion).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
      const max = Math.max(1, ...rows.map(([, l]) => l.length));
      $('#regions-title').textContent = `${located.length} ${searching ? 'resultado' : 'evento'}${located.length === 1 ? '' : 's'} · ${rows.length} zona${rows.length === 1 ? '' : 's'}`;
      $('#regions').innerHTML = rows.length
        ? rows.map(([r, l]) => `<li><button type="button" class="region" data-region="${esc(r)}">
            <span class="rn">${esc(r)}</span><span class="rc">${l.length}</span>
            <span class="rb"><i style="width:${(l.length / max) * 100}%"></i></span></button></li>`).join('')
        : `<li class="empty"><b>Sin eventos</b>${ui.range === 'upcoming' ? 'Prueba con «Todo el año».' : 'Cambia de periodo o de filtro.'}</li>`;
    } else {
      const list = byRegion[ui.region].slice().sort((a, b) => a.start.localeCompare(b.start));
      $('#regions-title').textContent = `${ui.region} · ${list.length}`;
      $('#regions').innerHTML = list.map((e) => {
        const s = parse(e.start);
        return `<li><button type="button" class="ag ${e.end < TODAY ? 'past' : ''}" data-id="${esc(e.id)}" data-focus="${e.lat},${e.lng}">
          <span class="d"><small>${util.DOW[s.getUTCDay()]}</small><b>${s.getUTCDate()}</b><small>${MON3[s.getUTCMonth()]}</small></span>
          <span><span class="t">${esc(e.name || e.title)}</span>
          <span class="s" style="display:block">${esc([e.organizer, e.place || e.province].filter(Boolean).join(' · '))}${e.geo === 'approx' ? ' · <i>zona aprox.</i>' : ''}</span></span></button></li>`;
      }).join('');
    }
    $('#region-clear').hidden = !ui.region;
    $('#map-note').textContent = [
      searching ? 'Resultados de todas las fechas.' : '',
      missing ? `${missing} evento${missing === 1 ? '' : 's'} sin ubicación no aparece${missing === 1 ? '' : 'n'} en el mapa.` : '',
    ].filter(Boolean).join(' ');

    // --- marcadores ---
    current = shown;
    if (!map) return;
    const pts = current.map((e) => [e.lat, e.lng]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 30], maxZoom: ui.region ? 9 : 7, duration: 0.6 });
    else map.flyToBounds(SPAIN, { duration: 0.6 });
    draw();
  }

  // Agrupa los eventos cuyos marcadores se pisarían a este zoom (≈ 46 px).
  function draw() {
    if (!map || !layer) return;
    const { util } = cal();
    const { esc, parse, MON3, TODAY } = util;
    layer.clearLayers();
    const clusters = [];
    for (const e of current.slice().sort((a, b) => a.start.localeCompare(b.start))) {
      const p = map.latLngToLayerPoint([e.lat, e.lng]);
      const c = clusters.find((k) => k.p.distanceTo(p) < 46);
      if (c) c.events.push(e); else clusters.push({ p, events: [e] });
    }
    for (const { events: g } of clusters) {
      const first = g.find((e) => e.end >= TODAY) || g[0];
      const d = parse(first.start);
      const past = g.every((e) => e.end < TODAY);
      const approx = g.every((e) => e.geo === 'approx');
      const samePlace = g.every((e) => e.lat === first.lat && e.lng === first.lng);
      const icon = L.divIcon({
        className: '',
        html: `<span class="pin${past ? ' past' : ''}${approx ? ' approx' : ''}${g.some((e) => e.custom) ? ' custom' : ''}"><b>${d.getUTCDate()}</b><small>${MON3[d.getUTCMonth()]}</small>${g.length > 1 ? `<i>+${g.length - 1}</i>` : ''}</span>`,
        iconSize: [44, 50], iconAnchor: [22, 50], popupAnchor: [0, -46],
      });
      const m = L.marker([first.lat, first.lng], { icon, title: g.map((e) => e.name || e.title).join(' · '), riseOnHover: true });
      m.eventPoints = g.map((e) => `${e.lat},${e.lng}`);
      if (g.length === 1) m.on('click', () => cal().openEvent(first.id));
      else if (!samePlace && map.getZoom() < 11) {
        // varios sitios cercanos: acercar para separarlos
        m.on('click', () => map.flyToBounds(L.latLngBounds(g.map((e) => [e.lat, e.lng])).pad(0.5), { duration: 0.5 }));
      } else {
        m.bindPopup(`<div class="pop"><p class="mono">${esc(first.province || first.region || '')}</p>${g.map((e) => {
          const s = parse(e.start);
          const yr = g.some((x) => x.start.slice(0, 4) !== first.start.slice(0, 4)) ? ` ${s.getUTCFullYear()}` : '';
          return `<button type="button" data-id="${esc(e.id)}"><b>${s.getUTCDate()} ${MON3[s.getUTCMonth()]}${yr}</b> ${esc(e.name || e.title)}</button>`;
        }).join('')}</div>`, { closeButton: false, className: 'pop-wrap', maxWidth: 260 });
      }
      m.addTo(layer);
    }
  }

  // ---------- cambio de vista ----------
  async function setView(view, scroll) {
    ui.view = view;
    document.querySelectorAll('.viewtoggle button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === view));
    $('.cal-layout').hidden = view === 'map';
    $('#map-view').hidden = view !== 'map';
    if (scroll) $('#calendario').scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', view === 'map' ? '#mapa' : location.pathname + location.search);
    if (view !== 'map') return;
    try {
      await loadLeaflet();
      if (!map) initMap(); else map.invalidateSize();
      render();
    } catch {
      $('#regions').innerHTML = '<li class="empty"><b>Ups</b>No se pudo cargar el mapa.</li>';
    }
  }

  document.querySelectorAll('.viewtoggle button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('.map-range button').forEach((b) =>
    b.addEventListener('click', () => { ui.range = b.dataset.range; ui.region = null; render(); }));
  // navegar por meses (barra de temporada / flechas) en vista mapa = ver ese mes
  ['#season', '#prev', '#next', '#today'].forEach((sel) =>
    $(sel).addEventListener('click', () => { if (ui.view === 'map') { ui.range = 'month'; ui.region = null; } }, true));
  $('#region-clear').addEventListener('click', () => { ui.region = null; render(); });
  $('#regions').addEventListener('click', (e) => {
    const r = e.target.closest('[data-region]');
    if (r) { ui.region = r.dataset.region; render(); }
  });
  $('#regions').addEventListener('mouseover', (e) => {
    const f = e.target.closest('[data-focus]');
    if (f && map) {
      const [lat, lng] = f.dataset.focus.split(',').map(Number);
      layer.eachLayer((m) => m.getElement()?.classList.toggle('hl', (m.eventPoints || []).includes(`${lat},${lng}`)));
    }
  });
  document.querySelectorAll('a[href="#mapa"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setView('map', true); }));

  const start = () => {
    cal().onRender(render);
    if (location.hash === '#mapa') setView('map', true);
  };
  if (window.EndutrakCal) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
