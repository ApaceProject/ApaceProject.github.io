/* ============================================================
   "What's implemented" — live feature status from the Apace README.
   Minimal version: one colored donut (green done / yellow in
   progress / red not implemented / grey unclear) + a collapsible
   <details> panel with the full feature list. Vanilla JS, no
   dependencies, no animation — the chart is visible immediately.
   - Fetches RAW README from branch `main` (cache-busted), falls
     back to `dev` with a small footnote when main is unreachable.
   - Parses the `| Feature | Status | Notes |` markdown table.
   ============================================================ */
(function () {
  'use strict';

  var MAIN_URL = 'https://raw.githubusercontent.com/ApaceProject/Apace/main/README.md';
  var DEV_URL  = 'https://raw.githubusercontent.com/ApaceProject/Apace/dev/README.md';
  var README_LINK = 'https://github.com/ApaceProject/Apace/blob/main/README.md#features';

  // The ONLY status markers we recognize — GitHub :shortcode: form and
  // the raw emoji form, for resilience against either convention.
  var MARKERS = [
    { token: ':white_check_mark:', emoji: '\u2705', key: 'done',    label: 'Done',            color: '#3fb950' },
    { token: ':construction:',     emoji: '\uD83D\uDEA7', key: 'wip',  label: 'In progress',     color: '#e3b341' },
    { token: ':x:',                emoji: '\u274C', key: 'not',     label: 'Not implemented', color: '#f85149' },
    { token: ':grey_question:',    emoji: '\u2754', key: 'unclear', label: 'Unclear',         color: '#9aa0a6' }
  ];

  var RING_R = 52;                       // donut circle radius (viewBox 120)
  var CIRC = 2 * Math.PI * RING_R;       // circumference -> stroke-dasharray

  var root, refreshBtn;

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
      rows.push({ name: cells[0], status: status.key, label: status.label, emoji: status.emoji, note: cleanNote(cells[2] || '') });
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

  // One <circle> per status segment; colors are plain SVG attributes so
  // the chart can never render in a wrong palette or stay invisible.
  function donutSvg(counts, total, aria) {
    var segs = '';
    var start = 0;
    for (var i = 0; i < MARKERS.length; i++) {
      var m = MARKERS[i];
      var count = counts[m.key] || 0;
      if (!count || !total) continue;
      var frac = count / total;
      segs += '<circle class="feat-donut-circle" cx="60" cy="60" r="' + RING_R + '"' +
        ' stroke="' + m.color + '"' +
        ' stroke-dasharray="' + (frac * CIRC).toFixed(2) + ' ' + CIRC.toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-(start * CIRC)).toFixed(2) + '"></circle>';
      start += frac;
    }
    return '<svg viewBox="0 0 120 120" role="img" aria-label="' + escapeHtml(aria) + '" focusable="false">' +
      '<g transform="rotate(-90 60 60)">' +
        '<circle class="feat-donut-circle feat-donut-track" cx="60" cy="60" r="' + RING_R + '"></circle>' +
        segs +
      '</g></svg>';
  }

  function render(data) {
    var rows = data.rows;
    var s = summarize(rows);
    var aria = s.pct + '% done — ' + s.counts.done + ' of ' + s.total + ' features done, ' +
      s.counts.wip + ' in progress, ' + s.counts.not + ' not implemented';

    // legend line: "17 done · 3 in progress · 1 not implemented"
    var legendParts = [];
    for (var i = 0; i < MARKERS.length; i++) {
      var m = MARKERS[i];
      var count = s.counts[m.key] || 0;
      if (!count) continue;
      legendParts.push('<span><span class="dot" style="background:' + m.color + '"></span>' +
        count + ' ' + escapeHtml(m.label.toLowerCase()) + '</span>');
    }

    var html = '' +
      '<div class="feat-donut-wrap">' + donutSvg(s.counts, s.total, aria) +
        '<div class="feat-donut-center"><span class="feat-pct">' + s.pct + '%</span>' +
        '<span class="feat-pct-label">done</span></div>' +
      '</div>' +
      '<p class="feat-legend">' + legendParts.join(' <span class="feat-legend-sep">&middot;</span> ') + '</p>' +

      '<details class="feat-details">' +
        '<summary>Show the full feature list <span class="feat-summary-hint">' + s.total + ' features</span></summary>' +
        '<div class="feat-tablewrap"><table class="feat-table"><thead>' +
          '<tr><th scope="col">Feature</th><th scope="col">Status</th><th scope="col">Notes</th></tr>' +
        '</thead><tbody>';

    rows.forEach(function (r) {
      html += '<tr>' +
        '<th scope="row" class="feat-name">' + escapeHtml(r.name) + '</th>' +
        '<td class="feat-status-cell"><span class="feat-emoji" title="' + escapeHtml(r.label) + '">' + r.emoji + '</span>' + escapeHtml(r.label) + '</td>' +
        '<td class="feat-note">' + (r.note ? escapeHtml(r.note) : '<span class="feat-note-empty">&mdash;</span>') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div></details>';

    if (data.branch !== 'main') {
      html += '<p class="feat-branch-note">Showing dev branch data &mdash; the main branch README could not be fetched.</p>';
    }

    html += '' +
      '<p class="feat-meta">Data fetched live from the README (branch: ' + escapeHtml(data.branch) + ')' +
      ' &middot; last refresh <time id="featTime">' + currentTime() + '</time>' +
      ' <button type="button" class="btn btn-sm btn-secondary feat-refresh" id="featRefresh">Refresh</button></p>';

    root.innerHTML = html;

    refreshBtn = $('featRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { load(true); });
    }
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
