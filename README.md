# SQL Course

A SQL course for trainees and junior data analysts, taught in PostgreSQL.

- [`lecture-01-sql-basics.md`](lecture-01-sql-basics.md) — filtering, aggregates, window functions, subqueries & CTEs, joins, ACID
- [`lecture-02-ddl-dml-procedures-variables.md`](lecture-02-ddl-dml-procedures-variables.md) — DDL & DML, views, procedures, variables
- [`course_curriculum.md`](course_curriculum.md) — the outline

## Live playground

**<https://furiere.github.io/data_course_3/>**

A real PostgreSQL instance ([PGlite](https://pglite.dev), Postgres compiled to
WebAssembly) running in the browser against a sample of the Spotify dataset.
Nothing is installed and no query leaves the machine, so students can follow a
live demo and then experiment on the same data.

It ships 32 example queries mapped to the curriculum sections, a schema browser,
`EXPLAIN ANALYZE` output, CSV export, and a text-size control for projecting.
The database is in-memory: **a page refresh is a clean reset**, which is what you
want after a lecture drops a table.

### The data

A ~10% stratified sample of Kaggle's
[Spotify 1921–2020, 600k+ Tracks](https://www.kaggle.com/datasets/yamaerenay/spotify-dataset-19212020-600k-tracks),
normalised into four tables:

| Table            | Rows    | What it holds                                                  |
| ---------------- | ------- | -------------------------------------------------------------- |
| `tracks`         | 60,000  | One row per track, with Spotify audio features                 |
| `artists`        | 27,385  | Artists referenced by those tracks, with a `genres` array      |
| `track_artists`  | 74,624  | Many-to-many bridge — the reason JOINs are worth teaching here |
| `artist_related` | 210,844 | The "fans also like" graph — material for recursive CTEs       |

The sample is proportional across release decades, so aggregates keep the shape
of the real dataset. Foreign keys are enforced, and `tracks.popularity` /
`tracks.release_date` are deliberately left **unindexed** so lecture 3's
`EXPLAIN ANALYZE` exercises have real sequential scans to fix.

Total download is ~10 MB gzipped and it boots in about 8–10 seconds.

## Rebuilding the data

Only needed if you want a different sample size or different tables. The
generated artifacts under `docs/data/` are committed, so the site works without
this step.

The raw Kaggle download is **not** in the repo — `dict_artists.json` (317 MB)
and `tracks.csv` (112 MB) each exceed GitHub's 100 MB file limit.

1. Download the dataset and unzip it into `source/spotify/`, so you have
   `artists.csv`, `tracks.csv` and `dict_artists.json` there.
2. Sample and clean it (Python 3, standard library only):

   ```bash
   npm run prepare-data          # or: python3 scripts/prepare_data.py --tracks 60000
   ```

   Writes intermediate CSVs to `build/csv/`. Needs a few GB of RAM briefly to
   load the related-artists JSON.
3. Compress, and verify by loading into PGlite and running every example query:

   ```bash
   npm install
   npm run build
   ```

   Writes `docs/data/*.csv.gz`, `docs/data/manifest.json` and `docs/schema.sql`.
   It exits non-zero if any example query fails, so a broken example can't
   reach the site.

Run it locally with `npm run serve` and open <http://localhost:8099>.

> **Why gzipped CSVs and not a pre-built Postgres data directory?** PGlite can
> dump and restore a whole datadir, which skips the load step. For this sample
> that dump measured **96 MB** — the write-ahead log and Postgres' own baseline
> dwarf the actual rows — against **10 MB** for the CSVs. The CSVs cost about
> three seconds of `COPY` in the browser and win by a wide margin on the thing a
> classroom actually feels, which is download time.

## The lectures

Both lectures teach against the same Spotify database as the playground, so a
student can paste any example straight into the browser and get the printed result.

**Every result table in the lectures is generated, not typed.** `npm run lectures`
replays each lecture statement by statement against a fresh copy of the database
and rewrites the tables from what actually came back:

```bash
npm run lectures      # run all examples and refresh the result tables
npm run check         # verify without rewriting — fails if anything is stale or broken
```

That is 112 SQL examples across the two lectures, all executed on every run. A
query that stops working, or a result table that drifts out of date, fails the
build instead of surprising you in front of a class.

Three markers control it, in the markdown itself:

| Marker | Effect |
| --- | --- |
| `<!--noexec-->` before a block | it is syntax or a deliberate error, so don't run it |
| `<!--result-->…<!--/result-->` after a block | regenerate the table in between |
| `<!--result:20-->` | same, but show up to 20 rows (default 8) |

`RAISE NOTICE` output is captured too, so `DO` blocks and procedures show what
they actually printed.

Images are not generated. Each one is marked with a `🖼️ Placeholder` line naming
the path to drop the file at — see [`images/README.md`](images/README.md), or
`grep -n '🖼️' lecture-*.md` for the outstanding list.

## Adding an example query

Edit [`docs/examples.json`](docs/examples.json) — sections map to curriculum
numbering — then run `npm run build` to type-check it against the real database.

## Publishing

The site is served from the `docs/` folder on `main`. In the repository:
**Settings → Pages → Source: _Deploy from a branch_ → Branch: `main`, folder:
`/docs`**. Every push to `main` republishes.

## Layout

```text
docs/                 the published site (GitHub Pages root)
  index.html
  app.js              boots PGlite, loads the CSVs, runs queries
  styles.css
  examples.json       the example queries shown in the sidebar
  schema.sql          copied from scripts/ at build time
  data/               *.csv.gz + manifest.json
scripts/
  prepare_data.py     raw Kaggle dump -> sampled, clean CSVs
  schema.sql          the DDL, single source of truth
  build_db.mjs        compress + verify -> docs/data/
```
