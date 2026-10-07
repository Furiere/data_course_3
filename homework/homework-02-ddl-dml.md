# Homework 2. Find the Bugs: DDL, DML and Functions

*Covers Lecture 2: CREATE, INSERT, UPDATE, DELETE, TRUNCATE and functions. PostgreSQL syntax.*

The format is the same as Homework 1: ten statements, each with a description of
what it is **supposed** to do, and each broken. This time the statements
**change the database**, so a bug does more than show a wrong number. It
leaves wrong data behind.

## How to work

1. Open the **[live playground](https://furiere.github.io/data_course_3/)**.
2. Run the **setup** block below once. It builds the playlist tables from the
   lecture, plus a scratch copy of the catalogue.
3. Do the tasks **in order**. Later tasks use the tables earlier tasks create.
4. Each task ends with a **Check**: what you should see once the statement is
   correct. Run the whole block, statement and check together.

Three things about the playground that will save you time:

- **A run that fails changes nothing.** Everything you run in one go is a single
  transaction, so if any statement errors, the whole run is undone. Fix it and
  run again.
- **A run that succeeds is permanent**, even if it did the wrong thing. To try a
  version without keeping its effects, put `BEGIN;` at the top of the editor and
  `ROLLBACK;` at the bottom (Lecture 2, "A note on safety").
- **If you get into a mess, refresh the page.** You get a clean database back.
  Run the setup again, then redo the tasks you had finished.

## What to submit

For each task, the corrected statement, plus one line per problem: **what** was
wrong and **what it would have done** to the data.

---

## Setup

Run this once, before Task 1.

```sql
DROP TABLE IF EXISTS playlist_tracks, playlist_followers, playlists,
                     listeners, artist_summary, tracks_pool CASCADE;

CREATE TABLE playlists (
    id              SERIAL       PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    owner           VARCHAR(80)  NOT NULL,
    is_public       BOOLEAN      NOT NULL DEFAULT true,
    blurb           TEXT,
    track_cnt       INT          NOT NULL DEFAULT 0,
    avg_popularity  NUMERIC(5,2),
    created_at      TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT playlists_name_per_owner UNIQUE (name, owner)
);

CREATE TABLE playlist_tracks (
    playlist_id INT       NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    TEXT      NOT NULL REFERENCES tracks(id),
    position    SMALLINT  NOT NULL,
    added_at    TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (playlist_id, track_id)
);

INSERT INTO playlists (name, owner) VALUES
    ('Late Night Drive', 'denis'),
    ('Loud and Fast',    'denis'),
    ('Quiet Mornings',   'anna'),
    ('Sunday Jazz',      'anna');

-- playlist 1: energetic tracks at a running tempo
INSERT INTO playlist_tracks (playlist_id, track_id, position)
SELECT 1, t.id, ROW_NUMBER() OVER (ORDER BY t.popularity DESC, t.name)
  FROM tracks AS t
 WHERE t.tempo BETWEEN 150 AND 170
   AND t.energy > 0.8
   AND t.popularity > 60
 ORDER BY t.popularity DESC, t.name
 LIMIT 10;

-- playlist 3: calm acoustic tracks
INSERT INTO playlist_tracks (playlist_id, track_id, position)
SELECT 3, t.id, ROW_NUMBER() OVER (ORDER BY t.popularity DESC, t.name)
  FROM tracks AS t
 WHERE t.acousticness > 0.9
   AND t.energy < 0.2
   AND t.popularity > 55
 ORDER BY t.popularity DESC, t.name
 LIMIT 8;

-- a working copy of the catalogue, so DELETE practice leaves tracks alone
CREATE TABLE tracks_pool AS
SELECT id, name, popularity, release_date
  FROM tracks;

SELECT p.id, p.name, p.owner, count(pt.track_id) AS tracks
  FROM playlists AS p
  LEFT JOIN playlist_tracks AS pt ON pt.playlist_id = p.id
 GROUP BY p.id
 ORDER BY p.id;
```

You should see four playlists: *Late Night Drive* with 10 tracks, *Quiet
Mornings* with 8, and two empty ones.

---

## Task 1. A table of listeners (CREATE)

**Should do:** create `listeners`, with:

- `id`: an auto-incrementing primary key;
- `username`: required, unique, up to 30 characters;
- `email`: **optional** (we often do not know it), but two listeners may not
  share the same address;
- `country`: a two-letter code;
- `signed_up`: the sign-up date, defaulting to today;
- `is_premium`: required, defaulting to `false`.

Problems to find: **4**

```sql
CREATE TABLE listeners (
    id          SERIAL,
    username    VARCHAR(30)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE DEFAULT '',
    country     CHAR(2)
    signed_up   DATE         NOT NULL DEFAULT now,
    is_premium  BOOLEAN      NOT NULL DEFAULT false,
    PRIMARY KEY id
);

INSERT INTO listeners (username, country) VALUES
    ('maria', 'PT'),
    ('oleg',  'RS');

INSERT INTO listeners (username, email, country, is_premium) VALUES
    ('lena', 'lena@example.com', 'DE', true);

SELECT id, username, email, country,
       signed_up = current_date AS signed_up_today,
       is_premium
  FROM listeners
 ORDER BY id;
```

**Check:** three listeners. *maria* and *oleg* have `NULL` email, all three have
`signed_up_today = true`, and only *lena* is premium.

<details>
<summary>Hint</summary>

Three of the problems are errors, which PostgreSQL reports one at a time. The
fourth only shows up when the **second** listener without an email is inserted.
How many rows can hold `''` in a `UNIQUE` column? How many can hold `NULL`?

</details>

---

## Task 2. Who follows which playlist (CREATE with a foreign key)

**Should do:** create `playlist_followers`, one row per "this person follows
this playlist", with:

- `playlist_id` referencing `playlists`;
- `follower`: a username;
- `followed_at`: defaulting to now.

A person can follow many playlists and a playlist can have many followers, but
nobody can follow the same playlist twice. **When a playlist is deleted, its
followers go with it.**

Problems to find: **3**

```sql
CREATE TABLE playlist_followers (
    playlist_id  TEXT        NOT NULL REFERENCES playlists(id),
    follower     VARCHAR(80) NOT NULL,
    followed_at  TIMESTAMP   NOT NULL DEFAULT now(),
    PRIMARY KEY (playlist_id)
);

INSERT INTO playlist_followers (playlist_id, follower) VALUES
    (1, 'maria'),
    (1, 'oleg'),
    (3, 'maria');

-- a throwaway playlist with a follower, then delete the playlist
INSERT INTO playlists (name, owner) VALUES ('Temporary', 'oleg');
INSERT INTO playlist_followers (playlist_id, follower)
SELECT id, 'maria' FROM playlists WHERE name = 'Temporary';
DELETE FROM playlists WHERE name = 'Temporary';

SELECT playlist_id, follower
  FROM playlist_followers
 ORDER BY playlist_id, follower;
```

**Check:** three rows: playlist 1 with *maria* and *oleg*, playlist 3 with
*maria*. The follower of *Temporary* is gone along with the playlist.

<details>
<summary>Hint</summary>

What type is `playlists.id`? Then: a primary key says what is unique about
a row. Is it the playlist, or the pair? Finally, read the setup's
`playlist_tracks` definition again: what lets you delete a playlist that
still has tracks in it?

</details>

---

## Task 3. An artist snapshot (CREATE TABLE … AS)

**Should do:** create `artist_summary` from a query: one row per artist who has
tracks, with columns `artist_id` (the primary key), `name`, `track_cnt` and
`avg_popularity` (one decimal).

Problems to find: **3**

```sql
CREATE TABLE artist_summary AS
SELECT a.id,
       a.name,
       count(*),
       round(avg(t.popularity), 1)
  FROM artists AS a
  JOIN track_artists AS ta ON ta.artist_id = a.id
  JOIN tracks        AS t  ON t.id = ta.track_id
 GROUP BY a.name;

ALTER TABLE artist_summary ADD PRIMARY KEY (artist_id);

SELECT artist_id, name, track_cnt, avg_popularity
  FROM artist_summary
 ORDER BY track_cnt DESC, name
 LIMIT 5;
```

**Check:** *Die drei ???* on top with **392** tracks and an average popularity of
**36.4**, then *Lata Mangeshkar* with 282.

<details>
<summary>Hint</summary>

`CREATE TABLE … AS` takes its column names from the query's output. What is the
output name of an unaliased `count(*)`? And is an artist's name a safe thing to
group by? (Try `SELECT name, count(*) FROM artists GROUP BY name HAVING count(*) > 1`.)

</details>

---

## Task 4. Adding playlists (INSERT … VALUES)

**Should do:** add three playlists:

- *Rainy Sunday* for *maria*, **private**;
- *Gym Hits* for *maria*, with the default visibility;
- *Late Night Drive* for *denis*, with the default visibility. **This one may
  already exist.** If it does, leave the existing row alone and don't raise an
  error.

Problems to find: **3**

```sql
INSERT INTO playlists VALUES
    ('Rainy Sunday',     'maria', false),
    ('Gym Hits',         'maria'),
    ('Late Night Drive', 'denis');

SELECT name, owner, is_public
  FROM playlists
 ORDER BY owner, name;
```

**Check:** six playlists. *Rainy Sunday* is the only private one, and there is
still exactly one *Late Night Drive*.

<details>
<summary>Hint</summary>

Without a column list, which column does the first value go into? Then: must
every row of a `VALUES` list have the same number of items? (The keyword
`DEFAULT` can stand in for a value.) Finally, look up `ON CONFLICT` in the lecture.

</details>

> 💡 Look at the ids with `SELECT id, name FROM playlists`. Maria's playlists will
> probably not be 5 and 6. Every failed attempt took numbers from the sequence,
> and a sequence never gives numbers back. Gaps in a `SERIAL` column are normal.

---

## Task 5. Filling a playlist from the catalogue (INSERT … SELECT)

**Should do:** fill *Loud and Fast* (playlist **2**) with the **15 loudest**
tracks that have popularity above 50, with positions 1 to 15: position 1 is the
loudest. Break ties by track name.

Problems to find: **3**

```sql
INSERT INTO playlist_tracks (playlist_id, track_id, position)
SELECT t.id,
       2,
       ROW_NUMBER() OVER (ORDER BY t.loudness)
  FROM tracks AS t
 WHERE t.popularity > 50
 LIMIT 15;

SELECT pt.position, t.name, round(t.loudness::numeric, 2) AS loudness
  FROM playlist_tracks AS pt
  JOIN tracks AS t ON t.id = pt.track_id
 WHERE pt.playlist_id = 2
 ORDER BY pt.position;
```

**Check:** 15 rows. Position 1 is *Black Widow* at **0.84** dB, and position 15 is
*Louder (feat. Sian Evans) - Radio Edit* at **−1.13**.

<details>
<summary>Hint</summary>

Compare the `INSERT` column list with the `SELECT` list, item by item. Loudness is
in decibels, so which direction is loud? And without `ORDER BY`, *which* 15 rows
does `LIMIT 15` keep?

If a wrong version already ran successfully, clear it before retrying:
`DELETE FROM playlist_tracks WHERE playlist_id = 2;`

</details>

---

## Task 6. Making Anna's playlists private (UPDATE)

**Should do:** make every playlist owned by *anna* private, and set its `blurb`
to `'Curated by anna'`. Nobody else's playlists change.

Problems to find: **2**

```sql
UPDATE playlists
   SET is_public = false
   AND blurb = 'Curated by ' || owner
 WHERE owner = 'Anna';

SELECT name, owner, is_public, blurb
  FROM playlists
 ORDER BY owner, name;
```

**Check:** *Quiet Mornings* and *Sunday Jazz* are private with blurb *Curated by
anna*. Every other playlist is unchanged, with *Rainy Sunday* still the only
other private one.

<details>
<summary>Hint</summary>

The first problem makes the statement do nothing at all: `UPDATE 0`. Once
it updates two rows, check `blurb`. Is it set? How does PostgreSQL read
`false AND blurb = '…'`, and what does it assign to `is_public`?

</details>

---

## Task 7. Playlist statistics (UPDATE … FROM)

**Should do:** store each playlist's number of tracks in `track_cnt` and its
average track popularity (two decimals) in `avg_popularity`. A playlist with no
tracks keeps `track_cnt = 0` and `avg_popularity = NULL`.

Problems to find: **3**

```sql
UPDATE playlists AS p
   SET p.track_cnt      = count(*),
       p.avg_popularity = round(avg(t.popularity), 2)
  FROM playlist_tracks AS pt
  JOIN tracks AS t ON t.id = pt.track_id;

SELECT name, owner, track_cnt, avg_popularity
  FROM playlists
 ORDER BY owner, name;
```

**Check:** *Late Night Drive* 10 tracks / **78.40**, *Loud and Fast* 15 / **59.33**,
*Quiet Mornings* 8 / **74.88**. The other three show 0 / `NULL`.

<details>
<summary>Hint</summary>

Two problems are errors. In `SET`, can the target column carry a table alias?
Can an `UPDATE` compute an aggregate? (See how the lecture filled
`avg_popularity`.) The third problem is silent, and it is the worst of the three:
which playlist row is each joined row matched to?

</details>

---

## Task 8. Clearing out the archive (DELETE)

**Should do:** from `tracks_pool`, delete the tracks that are **both** unpopular
(popularity below 5) **and** released before 1950, **and also** every track
that has no name.

Problems to find: **2**

```sql
DELETE FROM tracks_pool
 WHERE popularity < 5
    OR release_date < '1950-01-01'
   AND name = NULL;

SELECT count(*) AS left_in_pool FROM tracks_pool;
```

**Check:** **3,532** rows are deleted, leaving **56,468**. Write the `SELECT` with
the same `WHERE` first and count what it would remove, as the lecture recommends.

<details>
<summary>Hint</summary>

Which binds tighter, `AND` or `OR`? Write out with parentheses how PostgreSQL
reads this condition. Then: what is `NULL = NULL`?

If the broken version already ran, it deleted thousands of rows. Rebuild the pool
before retrying:

```sql
DROP TABLE tracks_pool;
CREATE TABLE tracks_pool AS SELECT id, name, popularity, release_date FROM tracks;
```

</details>

---

## Task 9. Starting over (TRUNCATE)

**Should do:** reset the playlist feature: remove **every** playlist, every
playlist entry and every follower, **keeping the tables**, so that the next
playlist created gets **id 1**.

Problems to find: **3**

```sql
TRUNCATE TABLE playlists;
TRUNCATE TABLE playlist_tracks WHERE playlist_id IS NOT NULL;

INSERT INTO playlists (name, owner) VALUES ('Fresh Start', 'denis') RETURNING id;

SELECT (SELECT count(*) FROM playlists)          AS playlists,
       (SELECT count(*) FROM playlist_tracks)    AS playlist_tracks,
       (SELECT count(*) FROM playlist_followers) AS followers;
```

**Check:** the `INSERT` returns `id = 1`; the counts are 1, 0 and 0.

<details>
<summary>Hint</summary>

`TRUNCATE` does not look at rows. Can it be told which rows to remove? Which
tables point at `playlists` with a foreign key, and what does PostgreSQL do when
you truncate a table that others reference? Finally, `TRUNCATE` empties the
table, but does it reset the `SERIAL` sequence? Look up `RESTART IDENTITY`.

</details>

---

## Task 10. Explicit share of an artist (FUNCTION)

**Should do:** a function `explicit_share(artist_name)` that returns the
percentage of an artist's tracks that are explicit, to one decimal. For an
artist with no tracks (or one who does not exist) it returns `NULL`.

Problems to find: **4**

```sql
CREATE OR REPLACE FUNCTION explicit_share(artist_name text)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
    total    integer;
    explicit integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE explicit)
      INTO total, explicit
      FROM artists AS a
      JOIN track_artists AS ta ON ta.artist_id = a.id
      JOIN tracks        AS t  ON t.id = ta.track_id
     WHERE a.name = artist_name;

    RETURN round(explicit / total * 100, 1)
END;
$$;

SELECT explicit_share('Eminem') AS eminem,
       explicit_share('Drake')  AS drake,
       explicit_share('Queen')  AS queen,
       explicit_share('Nobody') AS nobody;
```

**Check:** **93.1**, **87.5**, **0.0** and `NULL`.

<details>
<summary>Hint</summary>

PostgreSQL checks the function's syntax when you create it. Look closely at
the `RETURN` line. When it runs: inside the function, `explicit` is both a
variable and a column, so which one does `WHERE explicit` mean? Once it returns
a number, is it the right one (compare Homework 1, Task 2)? And what does
*Nobody* compute: `0 / 0`?

</details>
