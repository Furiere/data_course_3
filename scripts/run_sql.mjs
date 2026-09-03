/**
 * Ad-hoc query runner against the course database.
 *
 *   node scripts/run_sql.mjs "SELECT 1"
 *   node scripts/run_sql.mjs -f some/file.sql
 *
 * Loads the same CSVs the site loads, so results here match what students see.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export async function openDb() {
  const db = await PGlite.create();
  await db.exec(await readFile(join(ROOT, 'scripts', 'schema.sql'), 'utf8'));
  const manifest = JSON.parse(
    await readFile(join(ROOT, 'docs', 'data', 'manifest.json'), 'utf8'),
  );
  for (const t of manifest.tables) {
    const bytes = await readFile(join(ROOT, 'build', 'csv', `${t.table}.csv`));
    await db.query(
      `COPY ${t.table} (${t.columns.join(', ')}) FROM '/dev/blob' WITH (FORMAT csv)`,
      [], { blob: new Blob([bytes]) },
    );
  }
  await db.exec('ANALYZE;');
  return db;
}

/** Render one result set as a GitHub-flavoured markdown table. */
export function toMarkdown(res, limit = 10) {
  const cols = (res.fields || []).map((f) => f.name);
  if (!cols.length) return `_${res.command || 'OK'}_`;
  if (!res.rows.length) return '_(no rows)_';

  const cell = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (Array.isArray(v)) return v.length ? `{${v.join(', ')}}` : '{}';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  };

  const shown = res.rows.slice(0, limit);
  const lines = [
    `| ${cols.join(' | ')} |`,
    `|${cols.map(() => '---').join('|')}|`,
    ...shown.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`),
  ];
  if (res.rows.length > shown.length) {
    lines.push(`\n_… ${res.rows.length - shown.length} more rows_`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sql = args[0] === '-f' ? await readFile(args[1], 'utf8') : args[0];
  const db = await openDb();
  for (const res of await db.exec(sql)) {
    console.log(toMarkdown(res, 30));
    console.log();
  }
  await db.close();
}
