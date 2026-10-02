/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

type SqlValue = string | number | bigint | Uint8Array | null;
type Row = Record<string, SqlValue>;

type DatabaseStatus = {
  installed: boolean;
  songs: number;
  version: string;
  minYear: number;
  maxYear: number;
  bytes: number;
  integrity: "unknown" | "passed" | "failed";
};

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  year: number;
  album: string | null;
  score: number;
  explanation: string;
  popularity: number;
};

const DB_NAME = "/goobs-song-finder.sqlite";
const PLAIN_CONTRACTIONS: Record<string, string> = {
  arent: "are not",
  couldnt: "could not",
  didnt: "did not",
  doesnt: "does not",
  dont: "do not",
  hadnt: "had not",
  hasnt: "has not",
  havent: "have not",
  isnt: "is not",
  mustnt: "must not",
  shouldnt: "should not",
  wasnt: "was not",
  werent: "were not",
  wouldnt: "would not"
};
let sqlite3: any;
let pool: any;
let db: any;

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bcant\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bwont\b/g, "will not")
    .replace(/\b([a-z]+)n't\b/g, "$1 not")
    .replace(
      /\b(arent|couldnt|didnt|doesnt|dont|hadnt|hasnt|havent|isnt|mustnt|shouldnt|wasnt|werent|wouldnt)\b/g,
      (word) => PLAIN_CONTRACTIONS[word]
    )
    .replace(/\b([a-z]+)'(re|ve|ll|d|m|s)\b/g, "$1 $2")
    .match(/[a-z0-9]+/g)
    ?.join(" ") ?? "";

const soundex = (token: string) => {
  if (!token) return "";
  const groups: Record<string, string> = {};
  for (const char of "bfpv") groups[char] = "1";
  for (const char of "cgjkqsxz") groups[char] = "2";
  for (const char of "dt") groups[char] = "3";
  groups.l = "4";
  for (const char of "mn") groups[char] = "5";
  groups.r = "6";
  const encoded: string[] = [];
  let previous = groups[token[0]] ?? "";
  for (const char of token.slice(1)) {
    const current = groups[char] ?? "";
    if (current && current !== previous) encoded.push(current);
    previous = current;
  }
  return `${token[0].toUpperCase()}${encoded.join("")}000`.slice(0, 4);
};

const editDistance = (left: string, right: string) => {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let column = 1; column <= right.length; column += 1) {
    let previous = rows[0];
    rows[0] = column;
    for (let row = 1; row <= left.length; row += 1) {
      const saved = rows[row];
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + cost);
      previous = saved;
    }
  }
  return rows[left.length];
};

const initialize = async () => {
  if (sqlite3) return;
  sqlite3 = await sqlite3InitModule({
    print: () => undefined,
    printErr: (...args: unknown[]) => console.warn(...args)
  });
  pool = await sqlite3.installOpfsSAHPoolVfs({
    name: "goobs-song-finder",
    initialCapacity: 6
  });
};

const closeDatabase = () => {
  if (db) {
    db.close();
    db = undefined;
  }
};

const openDatabase = () => {
  if (!pool.getFileNames().includes(DB_NAME)) return undefined;
  if (!db) db = new pool.OpfsSAHPoolDb(DB_NAME);
  return db;
};

const readInfo = (): DatabaseStatus => {
  const connection = openDatabase();
  if (!connection) {
    return { installed: false, songs: 0, version: "", minYear: 0, maxYear: 0, bytes: 0, integrity: "unknown" };
  }
  const rows = connection.selectObjects("SELECT key, value FROM build_info") as Row[];
  const info = Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
  return {
    installed: true,
    songs: Number(info.song_count ?? 0),
    version: info.version ?? "unknown",
    minYear: Number(info.min_year ?? 0),
    maxYear: Number(info.max_year ?? 0),
    bytes: Number(pool.exportFile ? 0 : 0),
    integrity: "unknown"
  };
};

const importDatabase = async (source: Blob) => {
  closeDatabase();
  const chunkSize = 4 * 1024 * 1024;
  let offset = 0;
  await pool.importDb(DB_NAME, async () => {
    if (offset >= source.size) return undefined;
    const next = await source.slice(offset, offset + chunkSize).arrayBuffer();
    offset += next.byteLength;
    postMessage({ type: "progress", progress: Math.min(1, offset / source.size) });
    return next;
  });
  const connection = openDatabase();
  const appId = Number(connection.selectValue("PRAGMA application_id"));
  const schema = Number(connection.selectValue("PRAGMA user_version"));
  if (appId !== 1196376659 || schema !== 1) {
    closeDatabase();
    pool.unlink(DB_NAME);
    throw new Error("This is not a compatible Goobs Song Finder database.");
  }
  const quickCheck = String(connection.selectValue("PRAGMA quick_check"));
  if (quickCheck !== "ok") throw new Error(`Database verification failed: ${quickCheck}`);
  return { ...readInfo(), bytes: source.size, integrity: "passed" as const };
};

const findAlternatives = (token: string) => {
  if (!db || token.length < 3) return [token];
  if (Number(db.selectValue("SELECT EXISTS(SELECT 1 FROM lexicon WHERE token = ?)", [token]))) return [token];
  const maxDistance = token.length <= 5 ? 1 : 2;
  const candidates = db.selectObjects(
    `SELECT token, document_frequency, phonetic
       FROM lexicon
      WHERE length(token) BETWEEN ? AND ?
        AND (substr(token, 1, 1) = ? OR phonetic = ?)
      ORDER BY document_frequency DESC
      LIMIT 180`,
    [Math.max(1, token.length - 2), token.length + 2, token[0], soundex(token)]
  ) as Row[];
  return [
    token,
    ...candidates
      .map((row) => ({ token: String(row.token), distance: editDistance(token, String(row.token)) }))
      .filter((candidate) => candidate.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((candidate) => candidate.token)
  ].filter((value, index, values) => values.indexOf(value) === index);
};

const escapeFts = (token: string) => `"${token.replaceAll('"', '""')}"`;

const expandCompoundToken = (token: string): string[] => {
  if (!db || token.length < 7) return [token];
  if (Number(db.selectValue("SELECT EXISTS(SELECT 1 FROM lexicon WHERE token = ?)", [token]))) return [token];

  let best: string[] | undefined;
  for (let split = 3; split <= token.length - 3; split += 1) {
    const parts = [token.slice(0, split), token.slice(split)];
    const known = Number(
      db.selectValue("SELECT count(*) FROM lexicon WHERE token IN (?, ?)", parts)
    );
    if (known === 2 && (!best || Math.min(...parts.map((part) => part.length)) > Math.min(...best.map((part) => part.length)))) {
      best = parts;
    }
  }
  return best ?? [token];
};

const positionsFor = (tokens: string[], alternatives: string[][]) =>
  alternatives.map((group) => {
    const positions: number[] = [];
    tokens.forEach((token, index) => {
      if (group.some((candidate) => token === candidate || token.startsWith(candidate) || candidate.startsWith(token))) {
        positions.push(index);
      }
    });
    return positions;
  });

const scoreCandidate = (
  row: Row,
  query: string,
  queryTokens: string[],
  alternatives: string[][]
): SearchResult => {
  const lyricText = String(row.lyrics);
  const lyricTokens = lyricText.split(" ");
  const positions = positionsFor(lyricTokens, alternatives);
  const matched = positions.filter((items) => items.length > 0).length;
  const coverage = matched / queryTokens.length;
  const exactPhrase = lyricText.includes(query);

  let bestSpan = Number.POSITIVE_INFINITY;
  if (matched >= 2) {
    const active = positions.filter((items) => items.length > 0);
    for (const first of active[0]) {
      const selected = [first];
      for (const group of active.slice(1)) {
        const nearest = group.reduce((best, value) =>
          Math.abs(value - selected[selected.length - 1]) < Math.abs(best - selected[selected.length - 1]) ? value : best
        );
        selected.push(nearest);
      }
      bestSpan = Math.min(bestSpan, Math.max(...selected) - Math.min(...selected) + 1);
    }
  }

  let orderedPairs = 0;
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index - 1].some((left) => positions[index].some((right) => right > left && right - left <= 6))) {
      orderedPairs += 1;
    }
  }
  const orderScore = queryTokens.length > 1 ? orderedPairs / (queryTokens.length - 1) : coverage;
  const proximity = Number.isFinite(bestSpan) ? Math.max(0, 1 - (bestSpan - matched) / 18) : 0;
  const phraseMatch = exactPhrase || (matched === queryTokens.length && bestSpan === matched && orderScore === 1);
  const popularity = Math.min(100, Math.max(0, Number(row.popularity))) / 100;
  const rankSignal = Math.min(1, Math.abs(Number(row.fts_rank)) / 12);

  const raw =
    coverage * 48 +
    orderScore * 17 +
    proximity * 12 +
    (phraseMatch ? 18 : 0) +
    popularity * 3 +
    rankSignal * 2;
  const score = Math.max(1, Math.min(99, Math.round(raw)));
  const explanation = phraseMatch
    ? exactPhrase ? "Exact phrase" : "Phrase match"
    : `${matched} of ${queryTokens.length} words${proximity > 0.72 ? " · close together" : orderScore > 0.55 ? " · mostly in order" : ""}`;

  return {
    id: String(row.id),
    title: String(row.title),
    artist: String(row.artist),
    year: Number(row.year),
    album: row.album ? String(row.album) : null,
    score,
    explanation,
    popularity: Number(row.popularity)
  };
};

const search = (rawQuery: string): SearchResult[] => {
  const connection = openDatabase();
  if (!connection) throw new Error("Install a song database before searching.");
  const normalizedQuery = normalize(rawQuery);
  const queryTokens = normalizedQuery
    .split(" ")
    .filter(Boolean)
    .flatMap(expandCompoundToken)
    .slice(0, 12);
  if (!queryTokens.length) return [];
  const query = queryTokens.join(" ");

  const alternatives = queryTokens.map(findAlternatives);
  const clauses = alternatives
    .flatMap((group) => group.map((token) => `${escapeFts(token)}*`))
    .filter((value, index, values) => values.indexOf(value) === index);
  const ftsQuery = clauses.join(" OR ");
  const broadRows = connection.selectObjects(
    `SELECT s.id, s.title, s.artist, s.year, s.album, s.popularity,
            lyrics_fts.lyrics, bm25(lyrics_fts) AS fts_rank
       FROM lyrics_fts
       JOIN songs AS s ON s.id = lyrics_fts.song_id
      WHERE lyrics_fts MATCH ?
      ORDER BY bm25(lyrics_fts)
      LIMIT 400`,
    [ftsQuery]
  ) as Row[];

  const phraseRows = queryTokens.length > 1
    ? connection.selectObjects(
        `SELECT s.id, s.title, s.artist, s.year, s.album, s.popularity,
                lyrics_fts.lyrics, bm25(lyrics_fts) AS fts_rank
           FROM lyrics_fts
           JOIN songs AS s ON s.id = lyrics_fts.song_id
          WHERE lyrics_fts MATCH ?
          ORDER BY bm25(lyrics_fts)
          LIMIT 100`,
        [escapeFts(query)]
      ) as Row[]
    : [];
  const rows = [...new Map([...phraseRows, ...broadRows].map((row) => [String(row.id), row])).values()];

  return rows
    .map((row) => scoreCandidate(row, query, queryTokens, alternatives))
    .filter((result) => result.score >= 18)
    .sort((a, b) => b.score - a.score || b.popularity - a.popularity || b.year - a.year)
    .slice(0, 10);
};

const verify = () => {
  const connection = openDatabase();
  if (!connection) throw new Error("No offline database is installed.");
  const quickCheck = String(connection.selectValue("PRAGMA quick_check"));
  if (quickCheck !== "ok") throw new Error(`Integrity check failed: ${quickCheck}`);
  const status = readInfo();
  const count = Number(connection.selectValue("SELECT count(*) FROM songs"));
  if (count !== status.songs) throw new Error("Song count verification failed.");
  return { ...status, integrity: "passed" as const };
};

self.onmessage = async (event: MessageEvent) => {
  const { id, action, payload } = event.data;
  try {
    await initialize();
    let result: unknown;
    if (action === "status") result = readInfo();
    else if (action === "install") result = await importDatabase(payload.file as Blob);
    else if (action === "search") result = search(String(payload.query));
    else if (action === "verify") result = verify();
    else if (action === "remove") {
      closeDatabase();
      result = { removed: pool.unlink(DB_NAME) };
    } else throw new Error(`Unknown action: ${action}`);
    postMessage({ id, type: "result", result });
  } catch (error) {
    postMessage({ id, type: "error", error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
