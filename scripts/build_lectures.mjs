/**
 * Execute every SQL example in the lectures and fill in their result tables.
 *
 * A lecture full of hand-written result tables rots the moment the data
 * changes, and a wrong table in front of a class is worse than no table. So
 * the tables are generated: each lecture is replayed statement by statement
 * against a fresh copy of the course database.
 *
 * Markers, placed in the markdown:
 *   <!--noexec-->              before a block that is syntax, not a runnable query
 *   <!--result-->…<!--/result--> after a block; the contents are regenerated
 *   <!--result:20-->           same, but showing up to 20 rows (default 8)
 *
 * Usage:  node scripts/build_lectures.mjs [--check]
 *         --check verifies without rewriting the files (for CI).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, toMarkdown } from './run_sql.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LECTURES = [
  'lecture-01-sql-basics.md',
  'lecture-02-ddl-dml-procedures-variables.md',
];

const DEFAULT_ROWS = 8;

/** Split the file into SQL blocks with the byte offsets we need to patch. */
function findBlocks(md) {
  const blocks = [];
  const re = /```sql\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const before = md.slice(Math.max(0, m.index - 200), m.index);
    blocks.push({
      sql: m[1],
      start: m.index,
      end: m.index + m[0].length,
      noexec: /<!--noexec-->\s*$/.test(before),
    });
  }
  return blocks;
}

async function processFile(file, check) {
  const path = join(ROOT, file);
  let md = await readFile(path, 'utf8');
  const db = await openDb();

  const blocks = findBlocks(md);
  const failures = [];
  let executed = 0;
  let filled = 0;

  // Patch from the end so earlier offsets stay valid.
  const patches = [];

  for (const block of blocks) {
    if (block.noexec) continue;

    let results;
    const notices = [];
    try {
      results = await db.exec(block.sql, { onNotice: (n) => notices.push(n) });
      executed++;
    } catch (err) {
      const first = block.sql.trim().split('\n')[0];
      failures.push(`${file}: ${first}\n    ${err.message}`);
      continue;
    }

    // Is this block followed by a result placeholder? The closing tag may be
    // far away once a table has been generated, so do not cap the lookahead —
    // capping it silently stops large tables from ever being refreshed.
    const after = md.slice(block.end);
    const marker = after.match(/^\s*<!--result(?::(\d+))?-->([\s\S]*?)<!--\/result-->/);
    if (!marker) continue;

    const limit = marker[1] ? parseInt(marker[1], 10) : DEFAULT_ROWS;
    // Show the last result set that actually returned columns.
    const shown = [...results].reverse().find((r) => (r.fields || []).length) || results.at(-1);

    // For DO blocks and procedures the RAISE NOTICE output *is* the result,
    // so render that rather than an empty table.
    let table;
    if (!(shown?.fields || []).length && notices.length) {
      const lines = notices.map(
        (n) => `${n.severity || 'NOTICE'}:  ${n.message}`,
      );
      table = '```text\n' + lines.join('\n') + '\n```';
    } else {
      table = shown ? toMarkdown(shown, limit) : '_OK_';
    }

    const openTag = marker[1] ? `<!--result:${marker[1]}-->` : '<!--result-->';
    const replacement = `\n\n${openTag}\n${table}\n<!--/result-->`;
    patches.push({
      start: block.end,
      end: block.end + marker[0].length,
      text: replacement,
    });
    filled++;
  }

  for (const p of patches.reverse()) {
    md = md.slice(0, p.start) + p.text + md.slice(p.end);
  }
  await db.close();

  const original = await readFile(path, 'utf8');
  const changed = md !== original;
  if (changed && !check) await writeFile(path, md);

  console.log(
    `${file}: ${executed} queries run, ${filled} result tables, ` +
    `${failures.length} failed${changed ? (check ? ', OUT OF DATE' : ', updated') : ''}`,
  );
  for (const f of failures) console.error('  FAIL ' + f);

  return { failures: failures.length, stale: check && changed };
}

/**
 * Copy the lectures into the published site so the playground can render them
 * next to the editor. The site is served from docs/, so anything above it is
 * unreachable from the browser — a copy is the whole mechanism.
 */
async function publish(check) {
  const dir = join(ROOT, 'docs', 'lectures');
  if (!check) await mkdir(dir, { recursive: true });

  const index = [];
  let stale = 0;
  for (const file of LECTURES) {
    const md = await readFile(join(ROOT, file), 'utf8');
    if (check) {
      const published = await readFile(join(dir, file), 'utf8').catch(() => null);
      if (published !== md) stale++;
    } else {
      await writeFile(join(dir, file), md);
    }
    const heading = md.match(/^#\s+(.+?)\s*$/m);
    index.push({ file, title: heading ? heading[1] : file });
  }

  const json = JSON.stringify(index, null, 2) + '\n';
  if (check) {
    if (await readFile(join(dir, 'index.json'), 'utf8').catch(() => null) !== json) stale++;
    console.log(`docs/lectures/: ${stale ? `${stale} file(s) OUT OF DATE` : 'up to date'}`);
  } else {
    await writeFile(join(dir, 'index.json'), json);
    console.log(`docs/lectures/: ${index.length} lectures published`);
  }
  return stale;
}

const check = process.argv.includes('--check');
let bad = 0;
for (const file of LECTURES) {
  const r = await processFile(file, check);
  bad += r.failures + (r.stale ? 1 : 0);
}
bad += await publish(check);

if (bad) {
  console.error(`\n${bad} problem(s).`);
  process.exit(1);
}
console.log('\nAll lecture examples ran successfully.');
