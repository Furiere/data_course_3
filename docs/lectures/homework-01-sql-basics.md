# Homework 1. Find the Bugs: SQL Basics

*Covers Lecture 1: filtering, aggregates, window functions, joins and unions. PostgreSQL syntax.*

Each of the ten queries below was written by a colleague in a hurry. Each one has
a short description of what it is **supposed** to return. None of them does.

Some fail with an error. Those are the easy ones: PostgreSQL tells you where to look.
Others **run without complaint and return the wrong numbers**, and those are the
bugs that end up on a dashboard. Most queries have more than one problem, and
fixing the first one often reveals the next.

## How to work

1. Open this homework in the **[live playground](https://furiere.github.io/data_course_3/)**:
   it is under **Homework** in the sidebar. All queries run on the same Spotify
   database as the lecture.
2. Press **▶ Run** under a query (or **Load into editor** to edit it first). Read
   the error, or read the result and ask yourself whether it matches the task.
   Then fix the query in the editor below.
3. Fix it. The **Check** line under each task gives a value you should see once
   the query is correct.
4. Stuck? Open the hint. Try without it first.

## What to submit

For each task:

- the corrected query;
- one line per problem you found: **what** was wrong and **why** it produced the
  wrong result.

The number of problems in each task is given, so you know when to stop looking.

---

## Task 1. Popular decades (SELECT, GROUP BY, WHERE vs HAVING)

**Should return:** for **non-explicit** tracks released **from 1 January 1960
onwards**, one row per decade with the number of tracks and their average
popularity. Show only decades whose average popularity is **above 15**.

Problems to find: **3**

<!--broken-->
```sql
SELECT (EXTRACT(YEAR FROM release_date)::int / 10) * 10 AS decade,
       explicit,
       count(*)                  AS tracks,
       round(avg(popularity), 1) AS avg_popularity
  FROM tracks
 WHERE release_date > DATE '1960-01-01'
   AND avg(popularity) > 15
 GROUP BY decade
HAVING explicit = false
 ORDER BY decade;
```

**Check:** 7 rows. The 1960s row shows **4,826** tracks with an average popularity of **18.2**.

<details>
<summary>Hint</summary>

Remember the order of execution: `WHERE` → `GROUP BY` → `HAVING`. Which filters
apply to single rows, and which to groups? Then look at the `release_date` note
in Lecture 1 §0: what date does a track known only by its year get?

</details>

---

## Task 2. Explicit artists (SUM and COUNT)

**Should return:** for five artists, the number of tracks, the number of
**explicit** tracks, the total duration **in hours to two decimals**, and the
**percentage** of explicit tracks to one decimal. Most explicit first.

Problems to find: **3**

<!--broken-->
```sql
SELECT a.name,
       count(*)                           AS tracks,
       count(t.explicit)                  AS explicit_tracks,
       sum(t.duration_ms) / 3600000       AS total_hours,
       100 * count(t.explicit) / count(*) AS pct_explicit
  FROM artists AS a
  JOIN track_artists AS ta ON ta.artist_id = a.id
  JOIN tracks        AS t  ON t.id = ta.track_id
 WHERE a.name IN ('Eminem', 'Drake', 'Kanye West', 'Queen', 'The Beatles')
 GROUP BY a.name
 ORDER BY pct_explicit DESC;
```

**Check:** Eminem: 29 tracks, **27** explicit, **2.21** hours, **93.1** %. Queen: **0** explicit.

<details>
<summary>Hint</summary>

Every artist comes out 100 % explicit, Queen included. What exactly does
`COUNT(<field>)` count? And what is `7956000 / 3600000` in integer arithmetic?

</details>

---

## Task 3. A year-by-year profile (COUNT)

**Should return:** for each year from 1958 to 1965, the number of tracks, the
number of **distinct** titles, the number of tracks in a **minor** key
(`mode = 0`), and the number of explicit tracks, showing **0** when there are none.

Problems to find: **3**

<!--broken-->
```sql
SELECT EXTRACT(YEAR FROM release_date)    AS year,
       count(*)                           AS tracks,
       count(name)                        AS distinct_titles,
       count(mode = 0)                    AS minor_key_tracks,
       sum(CASE WHEN explicit THEN 1 END) AS explicit_tracks
  FROM tracks
 WHERE release_date BETWEEN DATE '1958-01-01' AND DATE '1965-12-31'
 GROUP BY year
 ORDER BY year;
```

**Check:** 1958: 447 tracks, **444** distinct titles, **143** minor-key tracks, **0** explicit.

<details>
<summary>Hint</summary>

Three columns are identical to `tracks`, which should make you suspicious. A
boolean expression such as `mode = 0` is `true` or `false`, and neither of them is
`NULL`. What does a `CASE` with no `ELSE` return?

</details>

---

## Task 4. The medal table (window functions: DENSE_RANK vs ROW_NUMBER)

**Should return:** for every decade from the 1950s on, the tracks holding the
**three highest popularity scores** of that decade: gold for the highest score,
silver for the second, bronze for the third. Tracks with the same score share a
medal, and a tie must not push the next score off the podium: if two tracks share
gold, the next score still gets silver.

Problems to find: **3**

<!--broken-->
```sql
SELECT (EXTRACT(YEAR FROM release_date)::int / 10) * 10 AS decade,
       name,
       popularity,
       ROW_NUMBER() OVER (ORDER BY popularity DESC) AS medal_place
  FROM tracks
 WHERE medal_place <= 3
   AND release_date >= DATE '1950-01-01'
 ORDER BY decade, medal_place;
```

**Check:** 35 rows. The 1960s get **5** bronze medals (five tracks tied at 75),
and the 1990s get **3** golds.

<details>
<summary>Hint</summary>

When are window functions computed, compared with `WHERE`? Then: "for every
decade" means a separate ranking inside each decade. Finally, compare
`ROW_NUMBER`, `RANK` and `DENSE_RANK` on tied values.

</details>

---

## Task 5. Top five per artist (window functions: RANK vs DENSE_RANK)

**Should return:** for Queen, ABBA and The Beatles, each artist's tracks ranked
by popularity, **most popular first**, using **competition ranking**: tied tracks
share a place and the next place is skipped (1, 1, 3, …). Show every track with
**place 1 to 5** for **each** artist.

Problems to find: **4**

<!--broken-->
```sql
WITH artist_tracks AS (
    SELECT a.name AS artist, t.name AS track, t.popularity
      FROM artists AS a
      JOIN track_artists AS ta ON ta.artist_id = a.id
      JOIN tracks        AS t  ON t.id = ta.track_id
     WHERE a.name IN ('Queen', 'ABBA', 'The Beatles')
)
SELECT artist,
       track,
       popularity,
       DENSE_RANK() OVER (PARTITION BY track ORDER BY popularity) AS place
  FROM artist_tracks
 ORDER BY artist, place
 LIMIT 15;
```

**Check:** 15 rows, but not the 15 the query returns now. ABBA starts with
*Chiquitita* and *Lay All Your Love On Me*, both in place **1**, followed by
*SOS* in place **3**.

<details>
<summary>Hint</summary>

Every row is in place 1. What does each partition contain? Then think about the
direction of the sort, the gap after a tie, and what `LIMIT` limits.

</details>

---

## Task 6. One version per song (window functions: ROW_NUMBER for deduplication)

**Should return:** the catalogue holds many versions of the same song
(remasters, re-releases). For **KAROL G**, return **exactly one row per distinct
track title**: the most popular version. If several versions tie on popularity,
keep the **earliest release**.

Problems to find: **3**

<!--broken-->
```sql
WITH versions AS (
    SELECT a.name AS artist,
           t.name AS track,
           t.release_date,
           t.popularity,
           RANK() OVER (PARTITION BY t.name ORDER BY t.popularity DESC) AS rn
      FROM artists AS a
      JOIN track_artists AS ta ON ta.artist_id = a.id
      JOIN tracks        AS t  ON t.id = ta.track_id
)
SELECT artist, track, release_date, popularity
  FROM versions
 WHERE rn = 1
   AND artist = 'KAROL G'
 ORDER BY popularity DESC, track;
```

**Check:** **8** rows, one per title. *Hello* is among them, released **2021-04-12**.

<details>
<summary>Hint</summary>

*Hello* is missing entirely. Who else has recorded a song called *Hello*? Once
it appears, count how many *Hello* rows you get, and ask which one the query
keeps when popularities tie.

</details>

---

## Task 7. Tracks and artists in one list (UNION ALL)

**Should return:** one result with the **3 most popular tracks** and the **3 most
popular artists**, with the columns `kind` (`'track'` or `'artist'`), `name`,
`popularity` and `detail`: the release date for a track, the **first genre** for
an artist. Ties on popularity are broken alphabetically by name. Sort the whole
result by `kind`, then by popularity, highest first.

Problems to find: **4**

<!--broken-->
```sql
SELECT 'track'      AS kind,
       name,
       popularity,
       release_date AS detail
  FROM tracks
 ORDER BY popularity DESC
 LIMIT 3
UNION ALL
SELECT 'artist'     AS kind,
       popularity,
       name,
       genres       AS detail
  FROM artists
 ORDER BY popularity DESC
 LIMIT 3
 ORDER BY kind, popularity DESC;
```

**Check:** 6 rows. The artists are Justin Bieber (`canadian pop`), Bad Bunny and
Drake. Taylor Swift also has a popularity of 98, but loses the tie-break.

<details>
<summary>Hint</summary>

Fix the errors one at a time: the syntax first (look at the parentheses example in
Lecture 1 §1.5), then the column types, which must match position by position.
Then run it a few times and ask whether the third artist is always the same.

</details>

---

## Task 8. Every new track with its main artist (LEFT JOIN)

**Should return:** **every** track released in 2021, with its **primary artist**
(`position = 0`). A track with no credited artist, or no primary one, must still
appear, with `NULL` as the artist.

Problems to find: **2**

<!--broken-->
```sql
SELECT t.name        AS track,
       t.release_date,
       a.name        AS primary_artist
  FROM tracks AS t
  LEFT JOIN track_artists AS ta ON ta.track_id = t.id
  LEFT JOIN artists       AS a  ON a.id = ta.track_id
 WHERE t.release_date >= DATE '2021-01-01'
   AND ta.position = 0
 ORDER BY t.release_date DESC, t.name;
```

**Check:** **625** rows, one per 2021 track. **543** of them have an artist name;
the other 82 show `NULL`. *Ay Vamos* belongs to J Balvin.

<details>
<summary>Hint</summary>

Wrap the query in `SELECT count(*), count(primary_artist) FROM (…) AS q` and
compare with `SELECT count(*) FROM tracks WHERE release_date >= '2021-01-01'`.
Then read each join condition aloud. What happens to a `LEFT JOIN` when you put
a condition on its right-hand table in `WHERE`?

</details>

---

## Task 9. Tracks by big artists (INNER JOIN and duplicates)

**Should return:** for tracks released **from 2020 onwards** that have **at least
one** credited artist with more than 1,000,000 followers: the number of tracks
and their average popularity, split by `explicit`.

Problems to find: **2**

<!--broken-->
```sql
SELECT explicit,
       count(*)                  AS tracks,
       round(avg(popularity), 1) AS avg_popularity
  FROM tracks AS t
  JOIN track_artists AS ta ON ta.track_id = t.id
  JOIN artists       AS a  ON a.id = ta.artist_id
 WHERE a.followers > 1000000
   AND t.release_date >= DATE '2020-01-01'
 GROUP BY explicit;
```

**Check:** non-explicit: **426** tracks, average **41.6**. Explicit: **174** tracks, average **58.6**.

<details>
<summary>Hint</summary>

After the error is fixed, the counts come out at 542 and 247. A track by two big
artists, a collaboration between two stars, appears in the join how many times? Be careful: `avg(DISTINCT popularity)` is **not** the fix.

</details>

---

## Task 10. The decade × mode grid (CROSS JOIN)

**Should return:** a complete grid with **every decade** (including the 1910s,
which have no tracks at all) crossed with **both** modes (`major` / `minor`), and
the number of tracks in each cell. Empty cells must show **0**, not disappear.

Problems to find: **3**

<!--broken-->
```sql
WITH decades AS (
    SELECT DISTINCT (EXTRACT(YEAR FROM release_date)::int / 10) * 10 AS decade
      FROM tracks
     UNION
    SELECT 1910
),
modes(mode, mode_name) AS (VALUES
    (0, 'minor'),
    (1, 'major')
)
SELECT d.decade,
       m.mode_name,
       count(*) AS tracks
  FROM decades AS d
 CROSS JOIN modes AS m
 CROSS JOIN tracks AS t
 WHERE (EXTRACT(YEAR FROM t.release_date)::int / 10) * 10 = d.decade
 GROUP BY d.decade, m.mode_name
 ORDER BY d.decade, m.mode_name;
```

**Check:** **26** rows. 1910 shows 0 / 0, 1900 shows major 1 / minor 0, and the
1960s show major **3,492** / minor **1,342**.

<details>
<summary>Hint</summary>

The major and minor counts are identical in every decade, and 1910 is missing.
`CROSS JOIN` plus a `WHERE` behaves like which kind of join? Which condition
connects a track to a mode? And after a `LEFT JOIN`, what is the difference
between `count(*)` and `count(t.id)`?

</details>
