/* endutrak — patrocinadores: logos (data/sponsors.json) + formulario «Quiero ser patrocinador» */
(() => {
  const $ = (s) => document.querySelector(s);
  const CFG = window.ENDUTRAK || {};
  const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

  // ---------- logos ----------
  fetch('data/sponsors.json', { cache: 'no-cache' })
    .then((r) => r.json()).catch(() => ({}))
    .then(({ sponsors = [] }) => {
      const box = $('#sponsors');
      if (!sponsors.length) {
        box.innerHTML = '<div class="sp-empty"><span class="mono">Próximamente</span><b>Aquí irán los logos de quienes apoyan endutrak</b></div>';
        return;
      }
      box.innerHTML = sponsors.map((s) => {
        const img = `<img src="${esc(s.logo)}" alt="${esc(s.name)}" loading="lazy">`;
        const url = safeUrl(s.url);
        return url
          ? `<a class="sp-logo" href="${esc(url)}" target="_blank" rel="noopener sponsored" title="${esc(s.name)}">${img}</a>`
          : `<span class="sp-logo" title="${esc(s.name)}">${img}</span>`;
      }).join('');
    });

  // ---------- formulario ----------
  if (!CFG.web3formsKey) return;
  const dlg = $('#sponsor'), form = $('#sponsor-form'), msg = $('#sponsor-msg');
  $('#sponsor-open').hidden = false;
  $('#sponsor-open').addEventListener('click', () => { msg.textContent = ''; dlg.showModal(); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close-sponsor]')) dlg.close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (f.botcheck) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
    try {
      const r = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: CFG.web3formsKey,
          subject: `Propuesta de patrocinio: ${f.brand}`,
          from_name: 'Web endutrak',
          replyto: f.email,
          'Marca': f.brand,
          'Persona de contacto': f.person,
          'Email': f.email,
          'Teléfono': f.phone || '—',
          'Web / Instagram': f.url || '—',
          'Tipo de colaboración': f.kind,
          'Propuesta': f.details,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.success === false) throw new Error(data.message || 'Error');
      form.reset();
      msg.textContent = '¡Recibido! Gracias, te respondo pronto.';
      btn.textContent = 'Enviado ✓';
      setTimeout(() => { dlg.close(); btn.disabled = false; btn.textContent = 'Enviar propuesta'; }, 2200);
    } catch {
      msg.textContent = 'No se pudo enviar. Inténtalo de nuevo en un rato.';
      btn.disabled = false; btn.textContent = 'Enviar propuesta';
    }
  });
})();
