#!/usr/bin/env python3
"""Build a Goobs Song Finder SQLite database from local JSONL or CSV data."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


TOKEN_RE = re.compile(r"[a-z0-9]+")
REQUIRED_FIELDS = {"id", "title", "artist", "year", "lyrics"}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.replace("’", "'").replace("‘", "'")
    value = re.sub(r"\b(can)['’]?t\b", "cannot", value)
    value = re.sub(r"\b(won)['’]?t\b", "will not", value)
    value = re.sub(r"\b([a-z]+)n['’]?t\b", r"\1 not", value)
    value = re.sub(r"\b([a-z]+)['’](re|ve|ll|d|m|s)\b", r"\1 \2", value)
    return " ".join(TOKEN_RE.findall(value))


def soundex(token: str) -> str:
    if not token:
        return ""
    codes = {
        **dict.fromkeys("bfpv", "1"),
        **dict.fromkeys("cgjkqsxz", "2"),
        **dict.fromkeys("dt", "3"),
        "l": "4",
        **dict.fromkeys("mn", "5"),
        "r": "6",
    }
    first = token[0].upper()
    encoded: list[str] = []
    previous = codes.get(token[0], "")
    for char in token[1:]:
        current = codes.get(char, "")
        if current and current != previous:
            encoded.append(current)
        previous = current
    return (first + "".join(encoded) + "000")[:4]


def read_rows(path: Path) -> list[dict]:
    if path.suffix.lower() == ".jsonl":
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    elif path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
    else:
        raise ValueError("Input must be .jsonl or .csv")

    for number, row in enumerate(rows, start=1):
        missing = REQUIRED_FIELDS.difference(row)
        if missing:
            raise ValueError(f"Row {number} is missing: {', '.join(sorted(missing))}")
    return rows


def read_aliases(value: object) -> list[str]:
    """Accept JSON arrays or pipe-separated CSV text for known mishearings."""
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if value:
        return [item.strip() for item in str(value).split("|") if item.strip()]
    return []


def build(args: argparse.Namespace) -> dict:
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    manifest_path = Path(args.manifest).resolve()
    rows = read_rows(input_path)
    selected: list[dict] = []

    for row in rows:
        year = int(row["year"])
        if args.min_year <= year <= args.max_year:
            normalized_lyrics = normalize(str(row["lyrics"]))
            normalized_aliases = [normalize(alias) for alias in read_aliases(row.get("aliases"))]
            search_text = " ".join([normalized_lyrics, *(alias for alias in normalized_aliases if alias)]).strip()
            if search_text:
                selected.append({**row, "year": year, "search_text": search_text})

    if not selected:
        raise ValueError("No songs remained after filtering")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    connection = sqlite3.connect(output_path)
    try:
        connection.executescript(
            """
            PRAGMA journal_mode=DELETE;
            PRAGMA page_size=4096;
            PRAGMA application_id=1196376659;
            PRAGMA user_version=1;

            CREATE TABLE build_info (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            ) WITHOUT ROWID;

            CREATE TABLE songs (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              artist TEXT NOT NULL,
              year INTEGER NOT NULL,
              album TEXT,
              popularity REAL NOT NULL DEFAULT 50
            ) WITHOUT ROWID;

            CREATE VIRTUAL TABLE lyrics_fts USING fts5(
              song_id UNINDEXED,
              lyrics,
              tokenize='unicode61 remove_diacritics 2',
              prefix='2 3'
            );

            CREATE TABLE lexicon (
              token TEXT PRIMARY KEY,
              document_frequency INTEGER NOT NULL,
              phonetic TEXT NOT NULL
            ) WITHOUT ROWID;
            CREATE INDEX lexicon_phonetic ON lexicon(phonetic, document_frequency DESC);
            """
        )

        document_frequency: Counter[str] = Counter()
        for row in selected:
            song_id = str(row["id"])
            connection.execute(
                "INSERT INTO songs(id, title, artist, year, album, popularity) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    song_id,
                    str(row["title"]).strip(),
                    str(row["artist"]).strip(),
                    row["year"],
                    str(row.get("album") or "").strip() or None,
                    float(row.get("popularity") or 50),
                ),
            )
            connection.execute(
                "INSERT INTO lyrics_fts(song_id, lyrics) VALUES (?, ?)",
                (song_id, row["search_text"]),
            )
            document_frequency.update(set(row["search_text"].split()))

        connection.executemany(
            "INSERT INTO lexicon(token, document_frequency, phonetic) VALUES (?, ?, ?)",
            ((token, frequency, soundex(token)) for token, frequency in document_frequency.items()),
        )

        version = args.version or datetime.now(timezone.utc).strftime("%Y.%m.%d")
        info = {
            "name": "Goobs Song Finder Database",
            "version": version,
            "schema_version": "1",
            "song_count": str(len(selected)),
            "min_year": str(min(row["year"] for row in selected)),
            "max_year": str(max(row["year"] for row in selected)),
            "built_at": datetime.now(timezone.utc).isoformat(),
        }
        connection.executemany("INSERT INTO build_info(key, value) VALUES (?, ?)", info.items())
        connection.execute("INSERT INTO lyrics_fts(lyrics_fts) VALUES ('optimize')")
        connection.commit()
        check = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if check != "ok":
            raise RuntimeError(f"SQLite integrity check failed: {check}")
        connection.execute("VACUUM")
    finally:
        connection.close()

    digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
    manifest = {
        "format": "goobs-song-finder-database",
        "schemaVersion": 1,
        "databaseVersion": version,
        "songs": len(selected),
        "minYear": min(row["year"] for row in selected),
        "maxYear": max(row["year"] for row in selected),
        "bytes": output_path.stat().st_size,
        "sha256": digest,
        "file": output_path.name,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Source .jsonl or .csv file")
    parser.add_argument("--output", required=True, help="Output SQLite database")
    parser.add_argument("--manifest", required=True, help="Output JSON manifest")
    parser.add_argument("--version", help="Database version label")
    parser.add_argument("--min-year", type=int, default=1960)
    parser.add_argument("--max-year", type=int, default=1999)
    args = parser.parse_args()
    print(json.dumps(build(args), indent=2))


if __name__ == "__main__":
    main()
