-- Schema for the SQL course playground.
-- A ~10% stratified sample of the Kaggle "Spotify 1921-2020, 600k+ Tracks"
-- dataset, normalised into four tables.

CREATE TABLE artists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    followers   BIGINT      NOT NULL DEFAULT 0,
    popularity  SMALLINT    NOT NULL DEFAULT 0,
    genres      TEXT[]      NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE  artists            IS 'One row per artist referenced by a sampled track.';
COMMENT ON COLUMN artists.popularity IS 'Spotify popularity score, 0-100.';
COMMENT ON COLUMN artists.genres     IS 'Array of genre tags; may be empty.';

CREATE TABLE tracks (
    id                     TEXT PRIMARY KEY,
    name                   TEXT,
    popularity             SMALLINT NOT NULL,
    duration_ms            INTEGER  NOT NULL,
    explicit               BOOLEAN  NOT NULL,
    release_date           DATE     NOT NULL,
    -- The source only knows some release dates to the month or year. The date
    -- above is padded to the 1st; this column says how much of it to trust.
    release_date_precision TEXT     NOT NULL
                           CHECK (release_date_precision IN ('day','month','year')),
    danceability     REAL,
    energy           REAL,
    key              SMALLINT,
    loudness         REAL,
    mode             SMALLINT,
    speechiness      REAL,
    acousticness     REAL,
    instrumentalness REAL,
    liveness         REAL,
    valence          REAL,
    tempo            REAL,
    time_signature   SMALLINT
);

COMMENT ON TABLE  tracks             IS 'One row per track, with Spotify audio features.';
COMMENT ON COLUMN tracks.valence     IS 'Musical positivity, 0.0 (sad) to 1.0 (happy).';
COMMENT ON COLUMN tracks.key         IS 'Pitch class, 0=C, 1=C#/Db, ... 11=B.';
COMMENT ON COLUMN tracks.mode        IS '1 = major, 0 = minor.';

-- A track can have several artists, an artist has many tracks: classic
-- many-to-many, and the reason JOINs are worth teaching on this data.
CREATE TABLE track_artists (
    track_id  TEXT     NOT NULL REFERENCES tracks(id)  ON DELETE CASCADE,
    artist_id TEXT     NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    position  SMALLINT NOT NULL,
    PRIMARY KEY (track_id, artist_id)
);

COMMENT ON COLUMN track_artists.position IS '0 = primary/credited-first artist.';

-- Spotify's "fans also like" graph, restricted to artists present above.
CREATE TABLE artist_related (
    artist_id         TEXT     NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    related_artist_id TEXT     NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    position          SMALLINT NOT NULL,
    PRIMARY KEY (artist_id, related_artist_id)
);

COMMENT ON TABLE artist_related IS
    'Directed "fans also like" edges. Good material for recursive CTEs.';

-- Indexes supporting the join keys only.
--
-- Deliberately NOT indexed: tracks.popularity, tracks.release_date,
-- artists.followers, artists.genres. Lecture 3 covers EXPLAIN ANALYZE, and
-- students need queries that actually seq-scan before they can improve them.
CREATE INDEX idx_track_artists_artist  ON track_artists(artist_id);
CREATE INDEX idx_artist_related_related ON artist_related(related_artist_id);
