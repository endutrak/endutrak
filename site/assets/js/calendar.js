/* endutrak — calendario de eventos off-road */
(() => {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MON3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MAX_LANES = 3;

  const $ = (s) => document.querySelector(s);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // --- fechas como "YYYY-MM-DD" (sin líos de zona horaria) ---
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const now = new Date();
  const TODAY = iso(now.getFullYear(), now.getMonth(), now.getDate());

  const state = { y: now.getFullYear(), m: now.getMonth(), q: '', org: null, day: null, events: [] };

  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const matches = (e) =>
    (!state.org || e.organizer === state.org) &&
    (!state.q || norm(`${e.title} ${e.organizer} ${e.place}`).includes(norm(state.q)));
  const visible = () => state.events.filter(matches);

  function rangeLabel(e, long = false) {
    const s = parse(e.start), en = parse(e.end);
    const M = long ? MONTHS : MON3;
    if (e.start === e.end) return `${s.getUTCDate()} ${M[s.getUTCMonth()]}`;
    if (s.getUTCMonth() === en.getUTCMonth()) return `${s.getUTCDate()}–${en.getUTCDate()} ${M[s.getUTCMonth()]}`;
    return `${s.getUTCDate()} ${M[s.getUTCMonth()]} – ${en.getUTCDate()} ${M[en.getUTCMonth()]}`;
  }
  function countdown(e) {
    if (e.end < TODAY) return { big: 'Pasado', small: 'terminado' };
    if (e.start <= TODAY) return { big: 'Hoy', small: 'en marcha' };
    const d = diffDays(TODAY, e.start);
    if (d === 1) return { big: 'Mañana', small: 'faltan' };
    return { big: `${d} días`, small: 'faltan' };
  }

  // ---------- TEMPORADA ----------
  function renderSeason() {
    const ev = visible();
    const counts = Array.from({ length: 12 }, (_, m) => {
      const key = `${state.y}-${pad(m + 1)}`;
      return ev.filter((e) => e.start.slice(0, 7) === key).length;
    });
    const max = Math.max(4, ...counts);
    const nowKey = now.getFullYear() * 12 + now.getMonth();
    $('#season').innerHTML = counts
      .map((n, m) => {
        const key = state.y * 12 + m;
        const h = n ? 6 + (n / max) * 34 : 3;
        return `<button type="button" role="tab" data-m="${m}" aria-selected="${m === state.m}"
          class="${key < nowKey ? 'past' : ''}" aria-label="${MONTHS[m]}: ${n} eventos">
          ${key === nowKey ? '<i class="now-dot"></i>' : ''}
          <span class="n">${n || ''}</span>
          <span class="bar" style="height:${h}px"></span>
          <span class="m">${MON3[m]}</span></button>`;
      })
      .join('');
  }

  // ---------- MES ----------
  function renderMonth() {
    $('#month-label').textContent = `${MONTHS[state.m]} ${state.y}`;
    const first = iso(state.y, state.m, 1);
    const lastDay = new Date(Date.UTC(state.y, state.m + 1, 0)).getUTCDate();
    const last = iso(state.y, state.m, lastDay);
    const offset = (parse(first).getUTCDay() + 6) % 7;
    let ws = addDays(first, -offset);
    const ev = visible();
    let html = '';

    while (ws <= last) {
      const we = addDays(ws, 6);
      // días
      let days = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i);
        const cls = [
          d.slice(0, 7) !== first.slice(0, 7) && 'out',
          i >= 5 && 'weekend',
          d === TODAY && 'today',
          d < TODAY && 'past',
          d === state.day && 'selected',
        ].filter(Boolean).join(' ');
        const n = ev.filter((e) => e.start <= d && e.end >= d).length;
        days += `<button type="button" class="day ${cls}" data-day="${d}" aria-label="${parse(d).getUTCDate()} de ${MONTHS[parse(d).getUTCMonth()]}${n ? `, ${n} eventos` : ''}"><span class="num">${parse(d).getUTCDate()}</span></button>`;
      }
      // barras de eventos con carriles
      const segs = ev
        .filter((e) => e.start <= we && e.end >= ws)
        .map((e) => {
          const s = e.start < ws ? 0 : diffDays(ws, e.start);
          const t = e.end > we ? 6 : diffDays(ws, e.end);
          return { e, s, t, cl: e.start < ws, cr: e.end > we };
        })
        .sort((a, b) => a.s - b.s || b.t - b.s - (a.t - a.s));
      const laneEnd = [];
      const hidden = Array(7).fill(0);
      let bars = '';
      for (const g of segs) {
        let lane = laneEnd.findIndex((end) => end < g.s);
        if (lane === -1) lane = laneEnd.length;
        laneEnd[lane] = g.t;
        if (lane >= MAX_LANES) {
          for (let i = g.s; i <= g.t; i++) hidden[i]++;
          continue;
        }
        const cls = ['ev', g.cl && 'cont-l', g.cr && 'cont-r', g.e.end < TODAY && 'is-past', g.e.custom && 'custom'].filter(Boolean).join(' ');
        bars += `<button type="button" class="${cls}" data-id="${esc(g.e.id)}" style="grid-column:${g.s + 1}/${g.t + 2};grid-row:${lane + 1};animation-delay:${lane * 40 + g.s * 15}ms" title="${esc(g.e.title)} · ${rangeLabel(g.e)}">${esc(g.e.name || g.e.title)}</button>`;
      }
      hidden.forEach((n, i) => {
        if (n) bars += `<button type="button" class="more" data-day="${addDays(ws, i)}" style="grid-column:${i + 1};grid-row:${MAX_LANES + 1}">+${n} más</button>`;
      });
      html += `<div class="week"><div class="week-days">${days}</div><div class="week-evs">${bars}</div></div>`;
      ws = addDays(ws, 7);
    }
    $('#weeks').innerHTML = html;
  }

  // ---------- AGENDA ----------
  function renderAgenda() {
    const first = iso(state.y, state.m, 1);
    const last = iso(state.y, state.m, new Date(Date.UTC(state.y, state.m + 1, 0)).getUTCDate());
    let list = visible();
    if (state.day) {
      list = list.filter((e) => e.start <= state.day && e.end >= state.day);
      const d = parse(state.day);
      $('#agenda-title').textContent = `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON3[d.getUTCMonth()]} · ${list.length}`;
    } else {
      list = list.filter((e) => e.start <= last && e.end >= first);
      $('#agenda-title').textContent = `${MONTHS[state.m]} · ${list.length} evento${list.length === 1 ? '' : 's'}`;
    }
    $('#agenda-clear').hidden = !state.day;

    if (!list.length) {
      $('#agenda').innerHTML = `<li class="empty"><b>Sin eventos</b>${state.q || state.org ? 'Prueba con otro filtro.' : 'Toca rodar por libre. Mira el mes siguiente →'}</li>`;
      return;
    }
    $('#agenda').innerHTML = list
      .map((e) => {
        const s = parse(e.start);
        const c = countdown(e);
        const multi = e.start !== e.end ? ` · ${diffDays(e.start, e.end) + 1} días` : '';
        return `<li><button type="button" class="ag ${e.end < TODAY ? 'past' : ''}" data-id="${esc(e.id)}">
          <span class="d"><small>${DOW[s.getUTCDay()]}</small><b>${s.getUTCDate()}</b><small>${MON3[s.getUTCMonth()]}</small></span>
          <span><span class="t">${esc(e.name || e.title)}</span>
            <span class="s" style="display:block">${esc([e.organizer, e.place].filter(Boolean).join(' · ') || rangeLabel(e))}${multi}</span>
            ${e.end >= TODAY ? `<span class="tag">${c.big === 'Hoy' || c.big === 'Mañana' ? c.big : 'en ' + c.big}</span>` : ''}
          </span></button></li>`;
      })
      .join('');
  }

  function renderChips() {
    const counts = {};
    state.events.forEach((e) => e.organizer && (counts[e.organizer] = (counts[e.organizer] || 0) + 1));
    const orgs = Object.entries(counts).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([o]) => o);
    $('#chips').innerHTML =
      `<button type="button" class="chip" data-org="" aria-pressed="${!state.org}">Todos</button>` +
      orgs.map((o) => `<button type="button" class="chip" data-org="${esc(o)}" aria-pressed="${state.org === o}">${esc(o)}</button>`).join('');
  }

  function render() {
    renderSeason();
    renderMonth();
    renderAgenda();
  }

  function go(y, m) {
    if (m < 0) { y--; m = 11; } else if (m > 11) { y++; m = 0; }
    state.y = y; state.m = m; state.day = null;
    render();
  }

  // ---------- FICHA ----------
  const gcalDate = (s) => s.replace(/-/g, '');
  function icsFile(e) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//endutrak//ES', 'BEGIN:VEVENT',
      `UID:${e.id}@endutrak`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${gcalDate(e.start)}`, `DTEND;VALUE=DATE:${gcalDate(addDays(e.end, 1))}`,
      `SUMMARY:${e.title.replace(/[,;]/g, '\\$&')}`,
      e.place ? `LOCATION:${e.place.replace(/[,;]/g, '\\$&')}` : '',
      e.url ? `URL:${e.url}` : '', 'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean);
    return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  }

  function openEvent(id, push = true) {
    const e = state.events.find((x) => x.id === id);
    if (!e) return;
    const c = countdown(e);
    const days = diffDays(e.start, e.end) + 1;
    const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${gcalDate(e.start)}/${gcalDate(addDays(e.end, 1))}&details=${encodeURIComponent(e.url || '')}&location=${encodeURIComponent(e.place || '')}`;
    const s = parse(e.start);
    $('#sheet-body').innerHTML = `
      <div class="sheet-top">
        <button class="sheet-close" type="button" aria-label="Cerrar" data-close>✕</button>
        <p class="mono">${DOW[s.getUTCDay()]} · ${rangeLabel(e, true)} ${s.getUTCFullYear()}</p>
        <h3 id="sheet-title">${esc(e.name || e.title)}</h3>
        <div class="org">${esc([e.organizer, e.place].filter(Boolean).join(' · ') || '')}</div>
      </div>
      <div class="sheet-body">
        <div class="facts">
          <div class="fact"><small>Fecha</small><b>${rangeLabel(e)}</b></div>
          <div class="fact"><small>Duración</small><b>${days} día${days > 1 ? 's' : ''}</b></div>
          <div class="fact hl"><small>${c.small}</small><b>${c.big}</b></div>
        </div>
        <div class="actions">
          ${e.url ? `<a class="btn btn-ink" href="${esc(e.url)}" target="_blank" rel="noopener">Web e inscripción ↗</a>` : ''}
          <a class="btn btn-ghost" href="${gcal}" target="_blank" rel="noopener">+ Google Calendar</a>
          <a class="btn btn-ghost" href="${icsFile(e)}" download="${esc((e.name || 'evento').replace(/[^\w-]+/g, '_'))}.ics">Descargar .ics</a>
          ${e.place ? `<a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.place + ', España')}" target="_blank" rel="noopener">Mapa</a>` : ''}
          <button class="btn btn-ghost" type="button" data-share="${esc(e.id)}">Compartir</button>
        </div>
      </div>`;
    const dlg = $('#sheet');
    if (!dlg.open) dlg.showModal();
    if (push) history.replaceState(null, '', `#evento=${encodeURIComponent(e.id)}`);
  }

  async function share(id) {
    const e = state.events.find((x) => x.id === id);
    const url = `${location.origin}${location.pathname}#evento=${encodeURIComponent(id)}`;
    const btn = document.querySelector(`[data-share="${CSS.escape(id)}"]`);
    try {
      if (navigator.share) await navigator.share({ title: e.title, text: `${e.title} · ${rangeLabel(e)}`, url });
      else { await navigator.clipboard.writeText(url); btn.textContent = '¡Enlace copiado!'; }
    } catch {}
  }

  // ---------- HERO: próximo evento ----------
  function renderNext() {
    const next = state.events.find((e) => e.end >= TODAY);
    const el = $('#next-card');
    if (!next) return;
    const s = parse(next.start);
    const c = countdown(next);
    el.href = `#evento=${encodeURIComponent(next.id)}`;
    el.innerHTML = `
      <span class="nc-date"><small>${MON3[s.getUTCMonth()]}</small><b>${s.getUTCDate()}</b></span>
      <span><span class="mono" style="display:block;color:var(--mud)">Próximo evento</span>
        <span class="nc-title">${esc(next.name || next.title)}</span>
        <span class="nc-sub" style="display:block">${esc([next.organizer, next.place].filter(Boolean).join(' · '))}</span></span>
      <span class="nc-count"><small>${c.small}</small>${c.big}</span>`;
    el.hidden = false;
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      go(s.getUTCFullYear(), s.getUTCMonth());
      $('#calendario').scrollIntoView();
      openEvent(next.id);
    });
  }

  // ---------- eventos de UI ----------
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-id],[data-day],[data-m],[data-org],[data-close],[data-share]');
    if (!t) return;
    if (t.dataset.close !== undefined && t.closest('#sheet')) { $('#sheet').close(); return; }
    if (t.dataset.share) return share(t.dataset.share);
    if (t.dataset.id && t.closest('#cal, #agenda')) return openEvent(t.dataset.id);
    if (t.dataset.day) {
      const d = t.dataset.day;
      if (d.slice(0, 7) !== iso(state.y, state.m, 1).slice(0, 7)) {
        const p = parse(d); go(p.getUTCFullYear(), p.getUTCMonth());
      }
      state.day = state.day === d ? null : d;
      renderMonth(); renderAgenda();
      if (matchMedia('(max-width: 1000px)').matches && state.day) document.querySelector('.agenda').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (t.dataset.m !== undefined && t.closest('#season')) return go(state.y, +t.dataset.m);
    if (t.dataset.org !== undefined && t.closest('#chips')) {
      state.org = t.dataset.org || null;
      renderChips(); render();
    }
  });

  $('#prev').onclick = () => go(state.y, state.m - 1);
  $('#next').onclick = () => go(state.y, state.m + 1);
  $('#today').onclick = () => go(now.getFullYear(), now.getMonth());
  $('#agenda-clear').onclick = () => { state.day = null; renderMonth(); renderAgenda(); };
  $('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); render(); });
  $('#sheet').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') e.target.close(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea') || document.querySelector('dialog[open]')) return;
    const r = $('#calendario').getBoundingClientRect();
    if (r.top > innerHeight * 0.6 || r.bottom < innerHeight * 0.3) return;
    if (e.key === 'ArrowLeft') go(state.y, state.m - 1);
    if (e.key === 'ArrowRight') go(state.y, state.m + 1);
  });

  // swipe en móvil
  let sx = null, sy = null;
  $('#cal').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('#cal').addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(state.y, state.m + (dx < 0 ? 1 : -1));
    sx = null;
  });

  // ---------- carga ----------
  fetch('data/events.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      state.events = data.events.map((e) => ({ ...e, id: String(e.id) }));
      if (data.updatedAt) {
        const u = new Date(data.updatedAt);
        $('#updated').textContent = `${u.getDate()} ${MON3[u.getMonth()]} ${u.getFullYear()}`;
      }
      renderChips();
      render();
      renderNext();
      const m = location.hash.match(/^#evento=(.+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const e = state.events.find((x) => x.id === id);
        if (e) {
          const p = parse(e.start);
          go(p.getUTCFullYear(), p.getUTCMonth());
          $('#calendario').scrollIntoView();
          openEvent(id, false);
        }
      }
    })
    .catch(() => {
      $('#agenda').innerHTML = '<li class="empty"><b>Ups</b>No se pudo cargar el calendario.</li>';
    });

  $('#year').textContent = now.getFullYear();
})();
