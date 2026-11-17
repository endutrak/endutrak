/* endutrak — formulario «Proponer evento» (se guarda en Notion a través de /api/form) */
(() => {
  const $ = (s) => document.querySelector(s);

  // ---------- Proponer evento ----------
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

    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
    try {
      const r = await fetch('/api/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ form: 'evento', ...f }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.success === false) throw new Error(data.message || 'Error');
      form.reset();
      msg.textContent = '¡Recibido! Gracias, lo reviso pronto.';
      btn.textContent = 'Enviado ✓';
      setTimeout(() => { dlg.close(); btn.disabled = false; btn.textContent = 'Enviar propuesta'; }, 2200);
    } catch {
      msg.textContent = 'No se pudo enviar. Inténtalo de nuevo en un rato.';
      btn.disabled = false; btn.textContent = 'Enviar propuesta';
    }
  });
})();
