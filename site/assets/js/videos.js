/* endutrak — vídeos y shorts del canal */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const PLAY = '<span class="play"><svg viewBox="0 0 24 24" width="40%" height="40%" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg></span>';
  const dateLabel = (s) => { if (!s) return ''; const d = new Date(s); return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`; };

  // Miniatura con fallback (no todos los vídeos tienen maxres / oar2).
  const img = (id, kind) => {
    const first = kind === 'short' ? `https://i.ytimg.com/vi/${id}/oar2.jpg` : `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    return `<img src="${first}" alt="" loading="lazy" onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg'">`;
  };

  function thumb(v, badge = '') {
    return `<button type="button" class="thumb" data-play="${esc(v.id)}" data-kind="${v.type}" aria-label="Reproducir: ${esc(v.title)}">
      ${img(v.id, v.type)}${badge ? `<span class="badge">${badge}</span>` : ''}${PLAY}</button>`;
  }

  // Botón «GPX» si el vídeo tiene una ruta publicada (data/rutas.json, lo abre gpx.js)
  let gpxByVideo = {};
  const gpxBtn = (v, cls) => {
    const r = gpxByVideo[v.id];
    return r ? `<button type="button" class="btn ${cls} gpx-btn" data-gpx="${esc(r.id)}">⤓ Descargar GPX</button>` : '';
  };

  function render(data) {
    const all = (data.videos || []).filter((v) => !v.hidden);
    const videos = all.filter((v) => v.type !== 'short');
    const shorts = all.filter((v) => v.type === 'short');
    const area = $('#video-area');

    if (!all.length) {
      area.innerHTML = `<div class="v-empty">
        <img src="assets/img/logo-mark.webp" alt="">
        <div><p class="mono kicker">Calentando motores</p><h3>El primer vídeo<br>está en camino</h3>
        <p>Suscríbete al canal y serás el primero en verlo. Rutas, trazadas y mucho barro.</p>
        <a class="btn btn-mud" href="https://www.youtube.com/@endutrak?sub_confirmation=1" target="_blank" rel="noopener">Suscribirme en YouTube</a></div></div>`;
      return;
    }

    if (videos.length) {
      const feat = videos.find((v) => v.featured) || videos[0];
      const rest = videos.filter((v) => v !== feat).slice(0, 9);
      area.innerHTML = `
        <div class="feature">
          ${thumb(feat, feat.featured ? 'Destacado' : 'Último vídeo')}
          <div><p class="mono">${dateLabel(feat.published)}</p><h3>${esc(feat.title)}</h3>
            <div class="feature-actions"><a class="btn btn-paper" href="https://www.youtube.com/watch?v=${esc(feat.id)}" target="_blank" rel="noopener">Ver en YouTube ↗</a>${gpxBtn(feat, 'btn-mud')}</div></div>
        </div>
        ${rest.length ? `<div class="vgrid">${rest.map((v) => `<article class="vcard">${thumb(v)}<h4>${esc(v.title)}</h4><div class="meta">${dateLabel(v.published)}</div>${gpxBtn(v, 'btn-mud btn-sm')}</article>`).join('')}</div>` : ''}`;
    } else area.innerHTML = '';

    if (shorts.length) {
      $('#shorts-area').innerHTML = `
        <div class="shorts-head"><h3>Shorts</h3><a class="mono" href="https://www.youtube.com/@endutrak/shorts" target="_blank" rel="noopener" style="color:var(--mud-2)">Ver todos →</a></div>
        <div class="shorts">${shorts.slice(0, 16).map((v) => `<div>${thumb(v)}<p class="cap">${esc(v.title)}</p></div>`).join('')}</div>`;
    }
  }

  // Reproductor en modal (youtube-nocookie, se carga solo al pulsar)
  const player = $('#player');
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-play]');
    if (t) {
      const vertical = t.dataset.kind === 'short';
      player.classList.toggle('vertical', vertical);
      $('#player-frame').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.dataset.play)}?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Vídeo de endutrak"></iframe>`;
      player.showModal();
    }
    if (e.target.closest('#player [data-close]') || e.target === player) player.close();
  });
  player.addEventListener('close', () => { $('#player-frame').innerHTML = ''; });

  const getJson = (u, fallback) => fetch(u, { cache: 'no-cache' }).then((r) => r.json()).catch(() => fallback);
  Promise.all([getJson('data/videos.json', { videos: [] }), getJson('data/rutas.json', { rutas: [] })])
    .then(([videos, { rutas = [] }]) => {
      gpxByVideo = Object.fromEntries(rutas.filter((r) => r.video).map((r) => [r.video, r]));
      render(videos);
    });

  // Intro del hero: se reproduce una vez y se queda en el logo
  const intro = $('#intro');
  const replay = $('#replay');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { intro.removeAttribute('autoplay'); intro.pause(); replay.hidden = false; }
  intro.addEventListener('ended', () => { replay.hidden = false; });
  replay.addEventListener('click', () => { replay.hidden = true; intro.currentTime = 0; intro.play(); });
})();
