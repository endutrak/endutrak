/* endutrak — formulario «Quiero mi vídeo» (edición de motologs) → Notion «Montajes» vía /api/form */
(() => {
  const $ = (s) => document.querySelector(s);
  const dlg = $('#edit'), form = $('#edit-form'), msg = $('#edit-msg');
  const btn = form.querySelector('[type=submit]');

  $('#edit-open').addEventListener('click', () => { msg.textContent = ''; dlg.showModal(); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close-edit]')) dlg.close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const f = Object.fromEntries(fd);
    if (f.botcheck) return;
    f.trade = fd.getAll('trade'); // varias casillas con el mismo nombre
    btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
    try {
      const r = await fetch('/api/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ form: 'montaje', ...f }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.success === false) throw new Error(data.message || 'Error');
      form.reset();
      msg.textContent = '¡Recibido! Te escribo pronto y lo hablamos.';
      btn.textContent = 'Enviado ✓';
      setTimeout(() => { dlg.close(); btn.disabled = false; btn.textContent = 'Enviar'; }, 2400);
    } catch {
      msg.textContent = 'No se pudo enviar. Inténtalo de nuevo o escríbeme a endutrak@gmail.com.';
      btn.disabled = false; btn.textContent = 'Enviar';
    }
  });
})();
