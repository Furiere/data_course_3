/**
 * Package the prepared CSVs for the web playground, then prove they work.
 *
 * We ship gzipped CSVs (~10 MB) and COPY them in the browser rather than
 * shipping a pre-built Postgres data directory. A dumped datadir for this
 * sample measured 96 MB - the write-ahead log and Postgres' own baseline
 * dwarf the actual rows - so the CSVs win on download time by ~9x, which is
 * what a classroom actually feels.
 *
 * Usage:  node scripts/build_db.mjs
 * Input:  build/csv/*.csv, scripts/schema.sql, docs/examples.json
 * Output: docs/data/*.csv.gz, docs/data/manifest.json
 */

import { PGlite } from '@electric-sql/pglite';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gzipAsync = promisify(gzip);

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CSV = join(ROOT, 'build', 'csv');
const OUT = join(ROOT, 'docs', 'data');

// Column order must match what prepare_data.py writes. The browser reads this
// back out of manifest.json, so this array is the single source of truth.
const TABLES = [
  { table: 'artists', columns: ['id', 'name', 'followers', 'popularity', 'genres'] },
  {
    table: 'tracks',
    columns: [
      'id', 'name', 'popularity', 'duration_ms', 'explicit', 'release_date',
      'release_date_precision', 'danceability', 'energy', 'key', 'loudness',
      'mode', 'speechiness', 'acousticness', 'instrumentalness', 'liveness',
      'valence', 'tempo', 'time_signature',
    ],
  },
  { table: 'track_artists', columns: ['track_id', 'artist_id', 'position'] },
  { table: 'artist_related', columns: ['artist_id', 'related_artist_id', 'position'] },
];

const mb = (n) => (n / 1e6).toFixed(1) + ' MB';

async function main() {
  const schema = await readFile(join(ROOT, 'scripts', 'schema.sql'), 'utf8');
  await mkdir(OUT, { recursive: true });

  // The page applies the same DDL at boot, so it needs its own copy.
  await writeFile(join(ROOT, 'docs', 'schema.sql'), schema);

  // --- package -------------------------------------------------------------
  console.log('Compressing CSVs...');
  const manifest = { generated: new Date().toISOString(), tables: [] };
  let rawTotal = 0;
  let gzTotal = 0;

  for (const { table, columns } of TABLES) {
    const raw = await readFile(join(CSV, `${table}.csv`));
    const gz = await gzipAsync(raw, { level: 9 });
    const file = `${table}.csv.gz`;
    await writeFile(join(OUT, file), gz);
    rawTotal += raw.length;
    gzTotal += gz.length;
    manifest.tables.push({ table, file, columns, bytes: gz.length });
    console.log(`  ${table.padEnd(15)} ${mb(raw.length)} -> ${mb(gz.length)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(15)} ${mb(rawTotal)} -> ${mb(gzTotal)}`);

  // --- verify --------------------------------------------------------------
  // Load exactly the way the browser will, so a broken column order or a bad
  // example query fails here rather than in front of a class.
  console.log('\nVerifying in PGlite...');
  const db = await PGlite.create();
  await db.exec(schema);

  for (const { table, columns } of TABLES) {
    const bytes = await readFile(join(CSV, `${table}.csv`));
    const t0 = Date.now();
    await db.query(
      `COPY ${table} (${columns.join(', ')}) FROM '/dev/blob' WITH (FORMAT csv)`,
      [], { blob: new Blob([bytes]) },
    );
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
    const entry = manifest.tables.find((t) => t.table === table);
    entry.rows = rows[0].n;
    console.log(`  ${table.padEnd(15)} ${String(rows[0].n).padStart(7)} rows  ${Date.now() - t0}ms`);
  }
  await db.exec('ANALYZE;');

  // Every example query on the site gets executed once here.
  const examples = JSON.parse(await readFile(join(ROOT, 'docs', 'examples.json'), 'utf8'));
  let checked = 0;
  const failures = [];
  for (const section of examples) {
    for (const ex of section.queries) {
      try {
        await db.exec(ex.sql);
        checked++;
      } catch (err) {
        failures.push(`${section.title} / ${ex.title}: ${err.message}`);
      }
    }
  }
  await db.close();

  console.log(`\nChecked ${checked} example queries, ${failures.length} failed.`);
  for (const f of failures) console.error('  FAIL ' + f);

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote docs/data/manifest.json (payload ${mb(gzTotal)})`);

  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
