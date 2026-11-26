/* ============================================================
   "What's implemented" — live feature status from the Apace README.
   Pure vanilla, no dependencies: fetch + regex + inline SVG.
   - Fetches RAW README from branch `main` (cache-busted), falls
     back to `dev` with a small footnote when main is unreachable.
   - Parses the `| Feature | Status | Notes |` markdown table.
   - Renders an SVG donut + status bars + a compact feature table.
   - Charts animate once, on scroll-into-view (IntersectionObserver).
   ============================================================ */
(function () {
  'use strict';

  var MAIN_URL = 'https://raw.githubusercontent.com/ApaceProject/Apace/main/README.md';
  var DEV_URL  = 'https://raw.githubusercontent.com/ApaceProject/Apace/dev/README.md';
  var README_LINK = 'https://github.com/ApaceProject/Apace/blob/main/README.md';

  // The ONLY status markers we recognize — GitHub :shortcode: form and
  // the raw emoji form, for resilience against either convention.
  var MARKERS = [
    { token: ':white_check_mark:', emoji: '\u2705', key: 'done',    label: 'Done' },
    { token: ':construction:',     emoji: '\uD83D\uDEA7', key: 'wip',  label: 'In progress' },
    { token: ':x:',                emoji: '\u274C', key: 'not',     label: 'Not implemented' },
    { token: ':grey_question:',    emoji: '\u2754', key: 'unclear', label: 'Unclear' }
  ];

  var RING_R = 52;                       // donut circle radius (viewBox 120)
  var CIRC = 2 * Math.PI * RING_R;       // circumference -> stroke-dasharray

  var root, refreshBtn, metaEl;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- fetching ---------------- */

  function fetchReadme(url) {
    // cache-bust so GitHub Pages/CDN edge caches never serve stale README
    return fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      });
  }

  function loadData() {
    return fetchReadme(MAIN_URL)
      .then(function (text) {
        return { markdown: text, branch: 'main' };
      })
      .catch(function () {
        // main failed (404 / offline / rate limit) -> try dev
        return fetchReadme(DEV_URL).then(function (text) {
          return { markdown: text, branch: 'dev' };
        });
      })
      .then(function (data) {
        var rows = parseFeatureTable(data.markdown);
        if (!rows.length) throw new Error('No feature table found');
        return { rows: rows, branch: data.branch };
      });
  }

  /* ---------------- parsing ---------------- */

  function detectStatus(cell) {
    if (!cell) return null;
    for (var i = 0; i < MARKERS.length; i++) {
      var m = MARKERS[i];
      if (cell.indexOf(m.token) !== -1 || cell.indexOf(m.emoji) !== -1) return m;
    }
    return null;
  }

  function isSeparator(cells) {
    return cells.length > 0 && cells.every(function (c) { return /^:?-{2,}:?$/.test(c); });
  }

  function cleanNote(note) {
    if (!note) return '';
    return note
      .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1') // [text](url) -> text
      .replace(/\*\*([^*]+)\*\*/g, '$1')         // **bold** -> text
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseFeatureTable(md) {
    var lines = md.split(/\r?\n/);
    var rows = [];
    var inTable = false;
    var headerRe = /^\s*\|\s*feature\s*\|\s*status\s*\|?\s*notes/i;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!inTable) {
        if (headerRe.test(line)) inTable = true;
        continue;
      }
      if (!/^\s*\|/.test(line)) break; // table ended
      var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
      if (cells.length < 2) continue;
      if (isSeparator(cells)) continue;
      var status = detectStatus(cells[1]);
      if (!status) continue; // unknown marker -> not counted
      rows.push({ name: cells[0], status: status.key, label: status.label, note: cleanNote(cells[2] || '') });
    }
    return rows;
  }

  function summarize(rows) {
    var c = { done: 0, wip: 0, not: 0, unclear: 0 };
    rows.forEach(function (r) { c[r.status]++; });
    return {
      counts: c,
      total: rows.length,
      pct: rows.length ? Math.round((c.done / rows.length) * 100) : 0
    };
  }

  /* ---------------- rendering ---------------- */

  function barRow(key, label, count, total) {
    var pct = total ? Math.round((count / total) * 100) : 0;
    return '' +
      '<div class="bar-row">' +
        '<span class="bar-label">' + escapeHtml(label) + '</span>' +
        '<div class="bar-track"><div class="bar-fill fstat-fill-' + key + '" style="--w:' + pct + '%"></div></div>' +
        '<span class="bar-count">' + count + '</span>' +
      '</div>';
  }

  function statusBadge(row) {
    return '<span class="fstat s-' + row.status + '">' + escapeHtml(row.label) + '</span>';
  }

  function render(data) {
    var rows = data.rows;
    var s = summarize(rows);
    var aria = s.pct + '% implemented — ' + s.counts.done + ' of ' + s.total + ' features done';

    var html = '' +
      '<div class="feat-grid">' +
        '<div class="feat-donut">' +
          '<div class="feat-donut-wrap">' +
            '<svg class="feat-donut-svg" viewBox="0 0 120 120" role="img" aria-label="' + escapeHtml(aria) + '" focusable="false">' +
              '<circle class="feat-donut-track" cx="60" cy="60" r="' + RING_R + '"></circle>' +
              '<circle class="feat-donut-fill" cx="60" cy="60" r="' + RING_R + '" style="--o:' + (CIRC * (1 - s.pct / 100)).toFixed(2) + '"></circle>' +
            '</svg>' +
            '<div class="feat-donut-center"><span class="feat-pct">' + s.pct + '%</span><span class="feat-pct-label">implemented</span></div>' +
          '</div>' +
          '<p class="feat-total">' + s.total + ' features tracked</p>' +
        '</div>' +
        '<div class="feat-bars" role="list" aria-label="Feature status breakdown">' +
          barRow('done', 'Done', s.counts.done, s.total) +
          barRow('wip', 'In progress', s.counts.wip, s.total) +
          barRow('not', 'Not implemented', s.counts.not, s.total) +
          barRow('unclear', 'Unclear', s.counts.unclear, s.total) +
          '<p class="feat-bars-note">' + s.counts.done + ' of ' + s.total + ' features are fully working.</p>' +
        '</div>' +
      '</div>' +
      '<table class="feat-table">' +
        '<thead><tr><th scope="col">Feature</th><th scope="col">Status</th><th scope="col" class="feat-col-notes">Notes</th></tr></thead>' +
        '<tbody>';

    rows.forEach(function (r) {
      html += '' +
        '<tr>' +
          '<th scope="row" class="feat-name">' + escapeHtml(r.name) + '</th>' +
          '<td>' + statusBadge(r) + '</td>' +
          '<td class="feat-note feat-col-notes">' + (r.note ? escapeHtml(r.note) : '<span class="feat-note-empty">&mdash;</span>') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';

    if (data.branch !== 'main') {
      html += '<p class="feat-branch-note">Showing dev branch data &mdash; the main branch README could not be fetched.</p>';
    }

    html += '' +
      '<p class="feat-meta">Data fetched live from the README (branch: ' + escapeHtml(data.branch) + ')' +
      ' &middot; last refresh <time id="featTime">' + currentTime() + '</time>' +
      ' <button type="button" class="btn btn-sm btn-secondary feat-refresh" id="featRefresh">Refresh</button></p>';

    root.innerHTML = html;

    refreshBtn = $('featRefresh');
    metaEl = $('featTime');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { load(true); });
    }

    armAnimation();
  }

  function renderLoading() {
    root.innerHTML = '<div class="feat-msg"><p>Loading feature status from the README&hellip;</p></div>';
  }

  function renderError() {
    root.innerHTML = '' +
      '<div class="feat-msg feat-error">' +
        '<p>Could not load the live feature status &mdash; the README was unreachable.</p>' +
        '<p>You can read the full feature table directly on ' +
        '<a href="' + README_LINK + '" target="_blank" rel="noopener">GitHub &rarr; README.md</a>.</p>' +
        '<button type="button" class="btn btn-sm btn-secondary feat-refresh" id="featRefresh">Try again</button>' +
      '</div>';
    var btn = $('featRefresh');
    if (btn) btn.addEventListener('click', function () { load(true); });
  }

  function currentTime() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------------- animation on scroll-into-view ---------------- */

  function armAnimation() {
    var el = root;
    var done = false;
    var observer = null;
    var timer = null;

    function nearViewport() {
      var r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.9 && r.bottom > 0;
    }

    function animate() {
      if (done) return;
      done = true;
      el.classList.add('animate');
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    }

    // Safety net if IO never fires (some embedded webviews): check geometry
    // on scroll instead.
    function onScroll() {
      if (nearViewport()) animate();
    }

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { animate(); break; }
        }
      }, { threshold: 0.25 });
      observer.observe(el);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Last-resort safety net: shortly after render, animate if the section is
    // already on screen. Charts must never stay hidden forever.
    timer = setTimeout(function () {
      if (nearViewport()) animate();
    }, 2500);
  }

  /* ---------------- orchestration ---------------- */

  function load(isRefresh) {
    if (refreshBtn) { refreshBtn.disabled = true; }
    if (isRefresh) renderLoading();
    loadData()
      .then(render)
      .catch(function (err) {
        if (window.console && console.warn) console.warn('Apace features: ' + err);
        renderError();
      });
  }

  // Start after full page load — never blocks first render.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      root = $('featStatus');
      if (!root) return;
      renderLoading();
      window.addEventListener('load', function () { load(false); });
    });
  } else {
    root = $('featStatus');
    if (!root) return;
    renderLoading();
    if (document.readyState === 'complete') { load(false); }
    else { window.addEventListener('load', function () { load(false); }); }
  }
})();
