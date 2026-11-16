/* endutrak — Instagram en la web + formulario «Proponer evento» */
(() => {
  const $ = (s) => document.querySelector(s);
  const CFG = window.ENDUTRAK || {};

  // ---------- Posts de Instagram elegidos desde el panel ----------
  // Usa el embed oficial de Instagram; el script de Meta solo se carga
  // cuando la sección está a punto de verse.
  fetch('data/instagram.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { posts: [] }))
    .then(({ posts = [] }) => {
      const list = posts.filter((p) => !p.hidden).slice(0, 6);
      if (!list.length) return;
      const grid = $('#ig-grid');
      grid.innerHTML = list
        .map((p) => `<blockquote class="instagram-media" data-instgrm-permalink="${p.url}?utm_source=ig_embed" data-instgrm-version="14"><a href="${p.url}" target="_blank" rel="noopener">Ver en Instagram</a></blockquote>`)
        .join('');
      grid.hidden = false;
      const load = () => {
        if (window.instgrm) return window.instgrm.Embeds.process();
        const s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.instagram.com/embed.js';
        document.body.appendChild(s);
      };
      new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { load(); obs.disconnect(); }
      }, { rootMargin: '600px' }).observe(grid);
    })
    .catch(() => {});

  // ---------- Proponer evento ----------
  if (!CFG.web3formsKey) return; // sin clave, el botón no aparece
  const dlg = $('#propose');
  const form = $('#propose-form');
  const msg = $('#propose-msg');
  $('#propose-open').hidden = false;
  $('#propose-open').addEventListener('click', () => { msg.textContent = ''; dlg.showModal(); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close-propose]')) dlg.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (f.botcheck) return; // bot
    if (f.end && f.end < f.start) { msg.textContent = 'La fecha de fin es anterior al inicio.'; return; }

    // Enlace que abre el panel con el evento ya relleno para aprobarlo en un clic.
    const draft = { name: f.name, organizer: f.organizer, place: f.place, start: f.start, end: f.end || f.start, url: f.url || '' };
    const approve = new URL('admin.html', location.href);
    approve.hash = 'nuevo=' + encodeURIComponent(JSON.stringify(draft));

    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
    try {
      const r = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: CFG.web3formsKey,
          subject: `Nuevo evento propuesto: ${f.name}`,
          from_name: 'Web endutrak',
          replyto: f.email,
          'Evento': f.name,
          'Organizador': f.organizer,
          'Tipo': f.type,
          'Fechas': f.end && f.end !== f.start ? `${f.start} → ${f.end}` : f.start,
          'Lugar': f.place,
          'Web': f.url || '—',
          'Detalles': f.details || '—',
          'Email de contacto': f.email,
          '✅ APROBAR (abre el panel con el evento relleno)': approve.href,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.success === false) throw new Error(data.message || 'Error');
      form.reset();
      msg.textContent = '¡Recibido! Gracias, lo revisamos pronto.';
      btn.textContent = 'Enviado ✓';
      setTimeout(() => { dlg.close(); btn.disabled = false; btn.textContent = 'Enviar propuesta'; }, 2200);
    } catch {
      msg.textContent = 'No se pudo enviar. Inténtalo de nuevo en un rato.';
      btn.disabled = false; btn.textContent = 'Enviar propuesta';
    }
  });
})();
