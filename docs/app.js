/**
 * SQL course playground.
 *
 * Boots PGlite (Postgres compiled to WASM), loads the gzipped CSV sample of
 * the Spotify dataset via COPY, and gives the class an editor to run against
 * it. Everything is in-memory: a reload is a clean database, which is exactly
 * what you want when a lecture has just dropped a table.
 */

import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js';

const MAX_ROWS = 500;          // rows rendered per result set
const SCHEMA_URL = 'schema.sql';

const $ = (id) => document.getElementById(id);

let db;
let editor;
/** Decompressed CSV bytes, kept so "Reset DB" doesn't re-download. */
const csvCache = new Map();
let manifest;
let schemaSql;

/* ------------------------------------------------------------------ boot */

function step(msg, pct) {
  $('boot-step').textContent = msg;
  if (pct != null) $('boot-bar').style.width = `${pct}%`;
}

function badge(text, kind) {
  const el = $('db-badge');
  el.textContent = text;
  el.className = `badge badge-${kind}`;
}

/** GitHub Pages serves .gz as an opaque body, but some proxies transparently
 *  decompress it. Sniff the magic bytes instead of assuming either way. */
async function fetchCsv(file) {
  if (csvCache.has(file)) return csvCache.get(file);

  const res = await fetch(`data/${file}`);
  if (!res.ok) throw new Error(`Could not fetch data/${file} (HTTP ${res.status})`);
  let bytes = new Uint8Array(await res.arrayBuffer());

  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  csvCache.set(file, bytes);
  return bytes;
}

async function loadData(onStep) {
  await db.exec(schemaSql);

  const total = manifest.tables.reduce((n, t) => n + t.rows, 0);
  let done = 0;
  for (const t of manifest.tables) {
    onStep(`Loading ${t.table}…`, done / total);
    const bytes = await fetchCsv(t.file);
    await db.query(
      `COPY ${t.table} (${t.columns.join(', ')}) FROM '/dev/blob' WITH (FORMAT csv)`,
      [], { blob: new Blob([bytes]) },
    );
    done += t.rows;
    onStep(`Loaded ${t.table}`, done / total);
  }
  await db.exec('ANALYZE;');
}

async function boot() {
  try {
    step('Fetching data manifest…', 5);
    [manifest, schemaSql] = await Promise.all([
      fetch('data/manifest.json').then((r) => {
        if (!r.ok) throw new Error(`manifest.json missing (HTTP ${r.status})`);
        return r.json();
      }),
      fetch(SCHEMA_URL).then((r) => r.text()),
    ]);

    step('Starting Postgres (WebAssembly)…', 15);
    db = await PGlite.create();

    await loadData((msg, frac) => step(msg, 20 + frac * 70));

    step('Building schema browser…', 95);
    await renderSchema();
    await renderExamples();
    await initLectures();
    initEditor();

    step('Ready', 100);
    $('boot').hidden = true;
    $('app').hidden = false;
    editor.refresh();
    editor.focus();
    const rows = manifest.tables.reduce((n, t) => n + t.rows, 0);
    badge(`${rows.toLocaleString()} rows ready`, 'ready');
  } catch (err) {
    console.error(err);
    step('Failed to start.');
    const box = $('boot-error');
    box.hidden = false;
    box.textContent = String(err && err.message ? err.message : err);
  }
}

/* ---------------------------------------------------------------- editor */

function initEditor() {
  editor = CodeMirror.fromTextArea($('editor'), {
    mode: 'text/x-pgsql',
    lineNumbers: true,
    lineWrapping: false,
    indentUnit: 2,
    smartIndent: true,
    viewportMargin: Infinity,
    extraKeys: {
      'Cmd-Enter': run,
      'Ctrl-Enter': run,
      'Shift-Cmd-Enter': run,
      'Shift-Ctrl-Enter': run,
    },
  });
  editor.setValue(
    '-- Welcome. Press ⌘↵ (or Ctrl+Enter) to run.\n\n' +
    'SELECT name, popularity, release_date\nFROM tracks\nORDER BY popularity DESC\nLIMIT 20;\n',
  );
  $('run').addEventListener('click', run);
}

/* --------------------------------------------------------------- running */

function run() {
  const sql = (editor.getSelection() || editor.getValue()).trim();
  if (!sql || !db) return;
  execute(sql);
}

async function execute(sql) {
  const out = $('results');
  const runBtn = $('run');
  runBtn.disabled = true;
  badge('running…', 'busy');
  $('timing').textContent = '';

  const notices = [];
  const t0 = performance.now();
  let results;
  let error;
  try {
    results = await db.exec(sql, { onNotice: (n) => notices.push(n) });
  } catch (err) {
    error = err;
  }
  const ms = performance.now() - t0;

  out.innerHTML = '';
  for (const n of notices) {
    out.append(el('div', 'notice', [
      el('b', null, [`${n.severity || 'NOTICE'}: `]), n.message || String(n),
    ]));
  }

  if (error) {
    const box = el('div', 'error');
    box.append(el('b', null, ['Query failed']), String(error.message || error));
    out.append(box);
    badge('error', 'loading');
  } else {
    if (!results.length) out.append(el('div', 'placeholder', ['Statement ran. No results returned.']));
    results.forEach((r, i) => out.append(renderResult(r, i, results.length)));
    badge('ready', 'ready');
    // DDL can change the schema out from under the sidebar.
    if (/\b(create|drop|alter|refresh)\b/i.test(sql)) renderSchema();
  }

  $('timing').textContent = `${ms < 1 ? '<1' : Math.round(ms)} ms`;
  runBtn.disabled = false;
  out.scrollTop = 0;
}

/* --------------------------------------------------------------- results */

function el(tag, cls, kids) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids || []) n.append(k);
  return n;
}

/** Postgres hands back bigint and numeric as strings to avoid precision loss,
 *  so typeof isn't enough to decide alignment. */
const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 1700]);

function fmt(v, isNumericCol) {
  if (v === null || v === undefined) return { text: 'NULL', cls: 'null' };
  if (typeof v === 'number') return { text: String(v), cls: 'num' };
  if (isNumericCol && typeof v === 'string') return { text: v, cls: 'num' };
  if (typeof v === 'boolean') return { text: v ? 'true' : 'false', cls: '' };
  if (v instanceof Date) return { text: v.toISOString().slice(0, 10), cls: '' };
  if (Array.isArray(v)) return { text: `{${v.join(', ')}}`, cls: '' };
  if (typeof v === 'object') return { text: JSON.stringify(v), cls: '' };
  return { text: String(v), cls: '' };
}

function renderResult(res, index, count) {
  const block = el('div', 'result-block');
  const cols = (res.fields || []).map((f) => f.name);

  const head = el('div', 'result-head');
  head.append(el('span', 'result-cmd', [res.command || 'RESULT']));
  if (cols.length) {
    head.append(`${res.rows.length} row${res.rows.length === 1 ? '' : 's'}`);
  } else if (res.affectedRows != null) {
    head.append(`${res.affectedRows} row${res.affectedRows === 1 ? '' : 's'} affected`);
  }
  if (count > 1) head.append(`statement ${index + 1} of ${count}`);
  block.append(head);

  if (!cols.length || !res.rows.length) {
    if (!res.rows.length && cols.length) {
      block.append(el('div', 'placeholder', ['No rows.']));
    }
    return block;
  }

  // EXPLAIN comes back as one text column; a grid would mangle the indentation.
  if (cols.length === 1 && cols[0] === 'QUERY PLAN') {
    const pre = el('pre', 'plan');
    pre.textContent = res.rows.map((r) => r['QUERY PLAN']).join('\n');
    block.append(pre);
    return block;
  }

  const numericCols = new Set(
    (res.fields || []).filter((f) => NUMERIC_OIDS.has(f.dataTypeID)).map((f) => f.name),
  );

  const table = el('table', 'grid');
  const thead = el('thead');
  const hr = el('tr');
  hr.append(el('th', 'rownum', ['#']));
  for (const c of cols) hr.append(el('th', null, [c]));
  thead.append(hr);
  table.append(thead);

  const tbody = el('tbody');
  for (const [i, row] of res.rows.slice(0, MAX_ROWS).entries()) {
    const tr = el('tr');
    tr.append(el('td', 'rownum', [String(i + 1)]));
    for (const c of cols) {
      const { text, cls } = fmt(row[c], numericCols.has(c));
      const td = el('td', cls);
      td.textContent = text;
      td.title = text;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  block.append(el('div', 'table-scroll', [table]));

  if (res.rows.length > MAX_ROWS) {
    block.append(el('div', 'truncated', [
      `Showing the first ${MAX_ROWS} of ${res.rows.length} rows. Add a LIMIT, or download the full result.`,
    ]));
  }

  const dl = el('button', 'link-btn', ['Download CSV']);
  dl.addEventListener('click', () => downloadCsv(cols, res.rows));
  block.append(el('div', 'truncated', [dl]));

  return block;
}

function downloadCsv(cols, rows) {
  const esc = (v) => {
    const { text } = fmt(v);
    const s = v === null || v === undefined ? '' : text;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(',')]
    .concat(rows.map((r) => cols.map((c) => esc(r[c])).join(',')))
    .join('\n');

  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'query-result.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------- sidebar */

async function renderSchema() {
  const panel = $('panel-schema');
  const { rows } = await db.query(`
    SELECT c.relname AS table_name,
           c.relkind AS kind,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           COALESCE(i.indisprimary, false) AS is_pk
    FROM pg_class c
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    JOIN pg_attribute a  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
                        AND a.attnum = ANY (i.indkey)
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
    ORDER BY c.relkind, c.relname, a.attnum
  `);

  const counts = {};
  const tableNames = [...new Set(rows.filter((r) => r.kind === 'r').map((r) => r.table_name))];
  for (const t of tableNames) {
    const { rows: c } = await db.query(`SELECT count(*)::int AS n FROM "${t}"`);
    counts[t] = c[0].n;
  }

  panel.innerHTML = '';
  const kindLabel = { r: 'Tables', v: 'Views', m: 'Materialized views' };
  let lastKind = null;
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, { kind: r.kind, cols: [] });
    byTable.get(r.table_name).cols.push(r);
  }

  for (const [name, info] of byTable) {
    if (info.kind !== lastKind) {
      panel.append(el('div', 'section-title', [kindLabel[info.kind] || 'Other']));
      lastKind = info.kind;
    }
    const wrap = el('div', 'schema-table');
    const head = el('div', 'schema-name');
    head.append(el('span', null, [name]));
    if (counts[name] != null) {
      head.append(el('span', 'schema-count', [counts[name].toLocaleString()]));
    }
    head.title = `Click to query ${name}`;
    head.addEventListener('click', () => {
      editor.setValue(`SELECT *\nFROM ${name}\nLIMIT 100;\n`);
      run();
    });
    wrap.append(head);

    const ul = el('ul', 'schema-cols');
    for (const c of info.cols) {
      const li = el('li');
      li.append(el('span', c.is_pk ? 'pk' : null, [c.column_name + (c.is_pk ? ' ⚿' : '')]));
      li.append(el('span', 'type', [c.data_type]));
      ul.append(li);
    }
    wrap.append(ul);
    panel.append(wrap);
  }
}

async function renderExamples() {
  const sections = await fetch('examples.json').then((r) => r.json());
  const panel = $('panel-examples');
  panel.innerHTML = '';

  for (const section of sections) {
    panel.append(el('div', 'section-title', [section.title]));
    for (const ex of section.queries) {
      const btn = el('button', 'example', [ex.title]);
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.example.is-active')
             .forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        editor.setValue(ex.sql.endsWith('\n') ? ex.sql : ex.sql + '\n');
        editor.focus();
        execute(ex.sql);
      });
      panel.append(btn);
    }
  }
}

/* -------------------------------------------------------------- lectures */

/* The lecture markdown is copied into docs/lectures/ by
   `npm run lectures`, rendered here, and every SQL block in it gets a Run
   button wired to the same editor and database as the examples. */

const LECTURE_KEY = 'sqlcourse.lecture';

let lectureIndex = [];
let currentLecture = null;

/** GitHub's heading slugs, so the "Contents" links in the markdown resolve. */
function slugger() {
  const seen = new Map();
  return (text) => {
    const base = text.toLowerCase().trim()
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

/** Is this block marked <!--noexec--> — syntax or a deliberate error? */
function isNoexec(pre) {
  for (let n = pre.previousSibling; n; n = n.previousSibling) {
    if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) continue;
    return n.nodeType === Node.COMMENT_NODE && n.textContent.includes('noexec');
  }
  return false;
}

function sendToEditor(sql, andRun) {
  editor.setValue(sql.endsWith('\n') ? sql : sql + '\n');
  editor.focus();
  if (andRun) execute(sql.trim());
}

/** Give each SQL block a Run bar, make tables scrollable, id the headings. */
function decorate(root) {
  const slug = slugger();
  for (const h of root.querySelectorAll('h1, h2, h3, h4')) {
    h.id = slug(h.textContent);
  }

  for (const table of root.querySelectorAll('table')) {
    const wrap = el('div', 'table-scroll');
    table.replaceWith(wrap);
    wrap.append(table);
  }

  for (const pre of [...root.querySelectorAll('pre')]) {
    const code = pre.querySelector('code');
    if (!code || !/\blanguage-sql\b/.test(code.className)) continue;

    const sql = code.textContent;

    // Same highlighter as the editor, so a block reads identically in both.
    code.textContent = '';
    code.className = 'cm-s-default';
    CodeMirror.runMode(sql, 'text/x-pgsql', code);

    const block = el('div', 'sql-block');
    pre.replaceWith(block);
    block.append(pre);

    const bar = el('div', 'sql-bar');
    if (isNoexec(block)) {
      bar.append(el('span', 'note', ['Syntax only — not meant to run as it stands']));
    } else {
      const runBtn = el('button', 'btn btn-primary', ['▶ Run']);
      runBtn.addEventListener('click', () => sendToEditor(sql, true));
      const loadBtn = el('button', 'btn', ['Load into editor']);
      loadBtn.addEventListener('click', () => sendToEditor(sql, false));
      bar.append(runBtn, loadBtn);
    }
    block.append(bar);
  }

  // In-page links from the lecture's own "Contents" list scroll the pane
  // rather than navigating the whole page.
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToHeading(decodeURIComponent(a.getAttribute('href').slice(1)));
    });
  }
}

function scrollToHeading(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const body = $('lecture-body');
  body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  showLecture();
}

function renderToc() {
  const panel = $('panel-lectures');
  panel.innerHTML = '';

  panel.append(el('div', 'section-title', ['Lectures']));
  for (const l of lectureIndex) {
    const btn = el('button', 'example', [l.title]);
    if (l.file === currentLecture) btn.classList.add('is-active');
    btn.addEventListener('click', () => openLecture(l.file));
    panel.append(btn);
  }

  const headings = $('lecture-body').querySelectorAll('h2, h3');
  if (!headings.length) return;
  panel.append(el('div', 'section-title', ['On this page']));
  for (const h of headings) {
    const btn = el('button', `toc-link ${h.tagName.toLowerCase()}`, [h.textContent]);
    btn.dataset.target = h.id;
    btn.addEventListener('click', () => scrollToHeading(h.id));
    panel.append(btn);
  }
}

/** Highlight the section currently under the top of the reading pane. */
function syncToc() {
  const body = $('lecture-body');
  const top = body.getBoundingClientRect().top + 60;
  let active = null;
  for (const h of body.querySelectorAll('h2, h3')) {
    if (h.getBoundingClientRect().top <= top) active = h.id;
    else break;
  }
  for (const link of $('panel-lectures').querySelectorAll('.toc-link')) {
    link.classList.toggle('is-active', link.dataset.target === active);
  }
}

async function openLecture(file) {
  const body = $('lecture-body');
  const meta = lectureIndex.find((l) => l.file === file) || { file, title: file };
  body.innerHTML = '<p class="placeholder">Loading…</p>';
  showLecture();

  try {
    const md = await fetch(`lectures/${file}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    body.innerHTML = marked.parse(md, { gfm: true });
    decorate(body);
  } catch (err) {
    body.innerHTML = '';
    const box = el('div', 'error');
    box.append(el('b', null, [`Could not load ${file}`]), String(err.message || err));
    body.append(box);
  }

  currentLecture = file;
  $('lecture-title').textContent = meta.title;
  body.scrollTop = 0;
  try { localStorage.setItem(LECTURE_KEY, file); } catch { /* private mode */ }
  renderToc();
  syncToc();
}

function showLecture() { $('workspace').classList.remove('is-collapsed'); }

async function initLectures() {
  const panel = $('panel-lectures');
  try {
    lectureIndex = await fetch('lectures/index.json').then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  } catch {
    panel.append(el('div', 'placeholder', ['No lectures published. Run `npm run lectures`.']));
    $('workspace').classList.add('is-collapsed');
    return;
  }

  renderToc();
  $('lecture-body').addEventListener('scroll', syncToc, { passive: true });

  let wanted;
  try { wanted = localStorage.getItem(LECTURE_KEY); } catch { /* private mode */ }
  const file = lectureIndex.some((l) => l.file === wanted) ? wanted : lectureIndex[0]?.file;
  if (file) await openLecture(file);
}

$('lecture-collapse').addEventListener('click', () => {
  const ws = $('workspace');
  const collapsed = ws.classList.toggle('is-collapsed');
  $('lecture-collapse').textContent = collapsed ? '▾' : '▴';
  $('lecture-collapse').title = collapsed ? 'Show the lecture pane' : 'Hide the lecture pane';
  if (editor) editor.refresh();
});

/* Drag the divider between the lecture and the editor. */
(() => {
  const splitter = $('splitter');
  const ws = $('workspace');
  let dragging = false;

  const move = (e) => {
    if (!dragging) return;
    const box = ws.getBoundingClientRect();
    const h = Math.min(box.height - 220, Math.max(80, e.clientY - box.top));
    ws.style.setProperty('--lecture-h', `${Math.round(h)}px`);
  };
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('is-dragging');
    document.body.style.userSelect = '';
    if (editor) editor.refresh();
  };

  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.classList.add('is-dragging');
    document.body.style.userSelect = 'none';
    splitter.setPointerCapture(e.pointerId);
  });
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', stop);
  splitter.addEventListener('pointercancel', stop);
})();

/* ------------------------------------------------------------- chrome UI */

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
    tab.classList.add('is-active');
    $(tab.dataset.panel).classList.add('is-active');
  });
});

const FONT_KEY = 'sqlcourse.font';
const THEME_KEY = 'sqlcourse.theme';

function setFont(px) {
  const clamped = Math.min(26, Math.max(12, px));
  document.documentElement.style.setProperty('--ui', `${clamped}px`);
  try { localStorage.setItem(FONT_KEY, String(clamped)); } catch { /* private mode */ }
  if (editor) editor.refresh();
}

function currentFont() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 15;
}

$('font-up').addEventListener('click', () => setFont(currentFont() + 1));
$('font-down').addEventListener('click', () => setFont(currentFont() - 1));

$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
});

$('reset-db').addEventListener('click', async () => {
  if (!db) return;
  if (!confirm('Drop everything and reload the sample data?')) return;
  $('app').hidden = true;
  $('boot').hidden = false;
  $('boot-error').hidden = true;
  try {
    await db.close();
    db = await PGlite.create();
    await loadData((msg, frac) => step(msg, frac * 100));
    await renderSchema();
    $('boot').hidden = true;
    $('app').hidden = false;
    editor.refresh();
    $('results').innerHTML = '';
    badge('reset – ready', 'ready');
  } catch (err) {
    $('boot-error').hidden = false;
    $('boot-error').textContent = String(err.message || err);
  }
});

try {
  const savedFont = localStorage.getItem(FONT_KEY);
  if (savedFont) setFont(parseFloat(savedFont));
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  else if (matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark';
  }
} catch { /* private mode */ }

boot();
