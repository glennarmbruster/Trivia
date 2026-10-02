# Goobs Song Finder

Goobs Song Finder is a private, offline-first lyric-fragment search PWA focused on recognizable songs from 1960 through 1999. It is a standalone project and has no dependency on Goobs Games.

## What works in this first version

- Installable offline PWA shell.
- SQLite/WASM database stored in the browser's Origin Private File System.
- Local `.sqlite` database import from the device's file picker.
- Exact, partial, misspelled, missing-word, and slightly reordered lyric-fragment matching.
- Title, artist, year, album, match score, and match explanation.
- Database readiness, browser persistence, storage, and offline integrity checks.
- A fictional five-song demonstration database with no copyrighted lyrics.
- A local database builder for JSONL or CSV input.

## Local data format

The builder accepts JSON Lines or CSV records with these fields:

- `id`
- `title`
- `artist`
- `year`
- `album` (optional)
- `popularity` (optional, 0–100)
- `lyrics`
- `aliases` (optional known mishearings; JSON array in JSONL or `|`-separated text in CSV)

The default build includes only songs from 1960 through 1999. Use `--min-year` and `--max-year` to change that for a particular build.

Keep real source data outside this repository. The `.gitignore` excludes local corpora, normalized lyrics, generated databases, indexes, credentials, packages, and temporary files.

## Development

1. Install dependencies with `pnpm install`.
2. Build the fictional demonstration database with `pnpm build:sample-db`.
3. Start the development app with `pnpm dev`.
4. Create a production build with `pnpm build`.

## Publish with GitHub Pages

The repository includes an automatic GitHub Pages workflow. It compiles the application and adjusts all PWA paths for the repository's Pages address.

1. Copy or commit the complete project, including `.github/workflows/deploy-pages.yml`, to the repository's `main` branch.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the repository's **Actions** tab and wait for **Deploy Goobs Song Finder** to finish.
5. Open the Pages URL shown by the completed deployment. Do not open the repository's raw `index.html` file.

Only the application and fictional demo database are published. Keep any real lyric corpus and generated private database outside GitHub, then use **Import my database** on the device.

## Production database example

Place your source file outside the repository, then run:

```sh
python3 tools/build_database.py \
  --input /private/path/songs.jsonl \
  --output /private/path/goobs-60s-90s.sqlite \
  --manifest /private/path/goobs-60s-90s.json \
  --version 2026.10 \
  --min-year 1960 \
  --max-year 1999
```

Transfer the resulting SQLite file privately to the phone and choose **Import my database** inside the installed PWA.
