#!/usr/bin/env python3
"""
Turn the raw Kaggle Spotify dump in source/spotify/ into a small, clean,
relational sample that fits in a browser.

Reads   source/spotify/{tracks.csv,artists.csv,dict_artists.json}
Writes  build/csv/{tracks,artists,track_artists,artist_related}.csv

The sample is a *stratified proportional* draw over release decades, so the
shape of the data (which decades dominate, how popularity is distributed)
matches the full dataset. Seeded, so rebuilds are reproducible.

Usage:  python3 scripts/prepare_data.py [--tracks 60000]
"""

import argparse
import ast
import csv
import json
import os
import random
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source", "spotify")
OUT = os.path.join(ROOT, "build", "csv")
SEED = 42

csv.field_size_limit(10**9)

AUDIO_COLS = [
    "danceability", "energy", "key", "loudness", "mode", "speechiness",
    "acousticness", "instrumentalness", "liveness", "valence", "tempo",
    "time_signature",
]


def pg_array(items):
    """Render a Python list of strings as a Postgres array literal."""
    if not items:
        return "{}"
    parts = []
    for it in items:
        s = str(it).replace("\\", "\\\\").replace('"', '\\"')
        parts.append('"%s"' % s)
    return "{%s}" % ",".join(parts)


def norm_release(raw):
    """Spotify dates come at day/month/year precision. Normalise to a real
    DATE plus a precision flag, the way the Spotify API itself does."""
    parts = (raw or "").split("-")
    if len(parts) == 3:
        return "%s-%s-%s" % (parts[0], parts[1].zfill(2), parts[2].zfill(2)), "day"
    if len(parts) == 2:
        return "%s-%s-01" % (parts[0], parts[1].zfill(2)), "month"
    return "%s-01-01" % parts[0], "year"


def decade_of(raw):
    return int(raw[:4]) // 10 * 10


def choose_sample(target):
    """Pass 1: decide which track row numbers survive."""
    per_decade = defaultdict(list)
    with open(os.path.join(SRC, "tracks.csv"), newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f)):
            per_decade[decade_of(row["release_date"])].append(i)

    total = sum(len(v) for v in per_decade.values())
    rng = random.Random(SEED)
    keep = set()
    for decade, idxs in sorted(per_decade.items()):
        quota = min(len(idxs), max(1, round(target * len(idxs) / total)))
        keep.update(rng.sample(idxs, quota))
    print("  scanned %d tracks across %d decades -> sampling %d"
          % (total, len(per_decade), len(keep)))
    return keep


def write_tracks(keep):
    """Pass 2: emit sampled tracks, and collect the track->artist pairs.

    The bridge is held in memory rather than written now, because we can only
    filter it for referential integrity once we know which artists actually
    exist in artists.csv."""
    artist_ids = set()
    pairs = []
    decades = Counter()
    n = 0
    with open(os.path.join(SRC, "tracks.csv"), newline="", encoding="utf-8") as f, \
         open(os.path.join(OUT, "tracks.csv"), "w", newline="", encoding="utf-8") as ft:
        wt = csv.writer(ft)
        for i, row in enumerate(csv.DictReader(f)):
            if i not in keep:
                continue
            rdate, prec = norm_release(row["release_date"])
            wt.writerow([
                row["id"], row["name"], row["popularity"], row["duration_ms"],
                "true" if row["explicit"] == "1" else "false", rdate, prec,
            ] + [row[c] for c in AUDIO_COLS])

            for pos, aid in enumerate(ast.literal_eval(row["id_artists"])):
                pairs.append((row["id"], aid, pos))
                artist_ids.add(aid)

            decades[decade_of(row["release_date"])] += 1
            n += 1

    print("  wrote %d tracks referencing %d distinct artists" % (n, len(artist_ids)))
    print("  by decade: " + ", ".join("%ds=%d" % (d, c) for d, c in sorted(decades.items())))
    return artist_ids, pairs


def write_bridge(pairs, found):
    """Drop pairs pointing at artists that never appear in artists.csv, so the
    schema can declare real foreign keys."""
    dropped = 0
    tracks_with_artist = set()
    with open(os.path.join(OUT, "track_artists.csv"), "w", newline="", encoding="utf-8") as fb:
        w = csv.writer(fb)
        for tid, aid, pos in pairs:
            if aid not in found:
                dropped += 1
                continue
            w.writerow([tid, aid, pos])
            tracks_with_artist.add(tid)
    print("  wrote %d track-artist links (dropped %d dangling)"
          % (len(pairs) - dropped, dropped))
    return tracks_with_artist


def write_artists(artist_ids):
    """Emit only the artists our sampled tracks actually reference."""
    found = set()
    with open(os.path.join(SRC, "artists.csv"), newline="", encoding="utf-8") as f, \
         open(os.path.join(OUT, "artists.csv"), "w", newline="", encoding="utf-8") as fa:
        w = csv.writer(fa)
        for row in csv.DictReader(f):
            if row["id"] not in artist_ids:
                continue
            w.writerow([
                row["id"], row["name"],
                int(float(row["followers"] or 0)),
                row["popularity"] or 0,
                pg_array(ast.literal_eval(row["genres"])),
            ])
            found.add(row["id"])

    missing = artist_ids - found
    print("  wrote %d artists (%d referenced ids absent from artists.csv)"
          % (len(found), len(missing)))
    return found


def write_related(found):
    """Filter the related-artist graph down to edges where BOTH ends survived,
    so the table is referentially clean."""
    path = os.path.join(SRC, "dict_artists.json")
    print("  loading %s (this needs a few GB of RAM briefly)..." % os.path.basename(path))
    with open(path, encoding="utf-8") as f:
        graph = json.load(f)

    edges = 0
    with open(os.path.join(OUT, "artist_related.csv"), "w", newline="", encoding="utf-8") as fr:
        w = csv.writer(fr)
        for aid, related in graph.items():
            if aid not in found:
                continue
            for pos, rid in enumerate(related):
                if rid in found:
                    w.writerow([aid, rid, pos])
                    edges += 1
    print("  wrote %d related-artist edges" % edges)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tracks", type=int, default=60000,
                    help="approximate number of tracks to sample (default 60000)")
    args = ap.parse_args()

    if not os.path.isdir(SRC):
        sys.exit("Missing %s - download the Kaggle dataset first (see README)." % SRC)
    os.makedirs(OUT, exist_ok=True)

    print("1/5 selecting sample")
    keep = choose_sample(args.tracks)
    print("2/5 writing tracks")
    artist_ids, pairs = write_tracks(keep)
    print("3/5 writing artists")
    found = write_artists(artist_ids)
    print("4/5 writing track_artists")
    linked = write_bridge(pairs, found)
    orphan_tracks = args.tracks and (len(keep) - len(linked))
    if orphan_tracks:
        print("  note: %d tracks now have no artist link (useful LEFT JOIN material)"
              % orphan_tracks)
    print("5/5 writing artist_related")
    write_related(found)

    print("\nDone. CSVs in build/csv:")
    for name in sorted(os.listdir(OUT)):
        size = os.path.getsize(os.path.join(OUT, name)) / 1e6
        print("  %-22s %6.1f MB" % (name, size))


if __name__ == "__main__":
    main()
