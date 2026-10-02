import "./styles.css";

type Status = {
  installed: boolean;
  songs: number;
  version: string;
  minYear: number;
  maxYear: number;
  bytes: number;
  integrity: "unknown" | "passed" | "failed";
};

type Result = {
  id: string;
  title: string;
  artist: string;
  year: number;
  album: string | null;
  score: number;
  explanation: string;
};

const worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
let requestId = 0;
let status: Status = { installed: false, songs: 0, version: "", minYear: 0, maxYear: 0, bytes: 0, integrity: "unknown" };
let results: Result[] = [];
let message = "";
let busy = false;
let installProgress = 0;
let persisted = false;
let storageUsage = 0;
let storageQuota = 0;

const callWorker = <T>(action: string, payload: Record<string, unknown> = {}) =>
  new Promise<T>((resolve, reject) => {
    requestId += 1;
    pending.set(requestId, { resolve, reject });
    worker.postMessage({ id: requestId, action, payload });
  });

worker.onmessage = (event) => {
  if (event.data.type === "progress") {
    installProgress = event.data.progress;
    render();
    return;
  }
  const request = pending.get(event.data.id);
  if (!request) return;
  pending.delete(event.data.id);
  if (event.data.type === "error") request.reject(new Error(event.data.error));
  else request.resolve(event.data.result);
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

const formatBytes = (bytes: number) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const level = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** level).toFixed(level > 1 ? 1 : 0)} ${units[level]}`;
};

const updateStorage = async () => {
  persisted = (await navigator.storage?.persisted?.()) ?? false;
  const estimate = await navigator.storage?.estimate?.();
  storageUsage = estimate?.usage ?? 0;
  storageQuota = estimate?.quota ?? 0;
};

const requestPersistence = async () => {
  if (navigator.storage?.persist) await navigator.storage.persist();
  await updateStorage();
};

const resultMarkup = () => {
  if (!status.installed) {
    return `<section class="empty-state"><span class="empty-icon">♪</span><h2>Install a database to begin</h2><p>The included demo has five fictional songs. Your real 1960s–1990s corpus will use the same private import flow.</p></section>`;
  }
  if (!results.length && !message) {
    return `<section class="empty-state compact"><span class="empty-icon">⌕</span><h2>Ready for a lyric fragment</h2><p>Three to ten words works best. Misspellings and one or two wrong words are okay.</p></section>`;
  }
  if (!results.length) {
    return `<section class="empty-state compact"><span class="empty-icon">…</span><h2>No confident match yet</h2><p>Try another word or remove the least certain word.</p></section>`;
  }
  return `<section class="results" aria-label="Song matches">
    ${results
      .map(
        (result, index) => `<article class="result-card ${index === 0 ? "top-result" : ""}">
          <div class="rank">${index + 1}</div>
          <div class="result-copy">
            <h2>${escapeHtml(result.title)}</h2>
            <p class="artist">${escapeHtml(result.artist)}</p>
            <p class="metadata">${result.year}${result.album ? ` · ${escapeHtml(result.album)}` : ""}</p>
            <p class="explanation">${escapeHtml(result.explanation)}</p>
          </div>
          <div class="match-score" aria-label="Match score ${result.score} out of 100"><strong>${result.score}</strong><span>match</span></div>
        </article>`
      )
      .join("")}
  </section>`;
};

const render = () => {
  const app = document.querySelector<HTMLElement>("#app")!;
  const ready = status.installed;
  app.innerHTML = `
    <div class="page-shell">
      <header class="app-header">
        <div class="brand-mark" aria-hidden="true">♫</div>
        <div class="brand-copy"><span>GOOBS</span><h1>Song Finder</h1></div>
        <button class="status-pill ${ready ? "ready" : ""}" id="database-button" type="button" aria-controls="database-panel">
          <i></i>${ready ? "Offline ready" : "Database needed"}
        </button>
      </header>

      <section class="search-surface" aria-labelledby="search-heading">
        <div class="era-badge">1960s–1990s collection</div>
        <h2 id="search-heading">What words do you remember?</h2>
        <form id="search-form" class="search-form">
          <label class="sr-only" for="lyric-query">Lyric fragment</label>
          <input id="lyric-query" name="query" type="search" inputmode="search" autocomplete="off" placeholder="streetlight people" ${ready ? "" : "disabled"} />
          <button type="submit" ${ready && !busy ? "" : "disabled"}>${busy ? '<span class="spinner"></span>' : "Find song"}</button>
        </form>
        <p class="search-hint">Exact phrase, partial memory, misspellings, or words slightly out of order</p>
      </section>

      <div class="notice ${message ? "visible" : ""}" role="status">${escapeHtml(message)}</div>
      ${resultMarkup()}

      <section class="database-panel" id="database-panel" aria-labelledby="database-heading">
        <div class="panel-heading">
          <div><span class="eyebrow">LOCAL COLLECTION</span><h2 id="database-heading">Song Database</h2></div>
          <span class="database-state ${ready ? "ready" : ""}">${ready ? "READY ✓" : "NOT INSTALLED"}</span>
        </div>
        <div class="database-stats">
          <div><span>Songs</span><strong>${ready ? status.songs.toLocaleString() : "—"}</strong></div>
          <div><span>Years</span><strong>${ready ? `${status.minYear}–${status.maxYear}` : "1960–1999"}</strong></div>
          <div><span>Version</span><strong>${ready ? escapeHtml(status.version) : "—"}</strong></div>
          <div><span>Storage</span><strong>${formatBytes(storageUsage)}</strong></div>
        </div>
        ${busy && installProgress > 0 ? `<div class="progress"><span style="width:${installProgress * 100}%"></span></div>` : ""}
        <div class="database-actions">
          <button class="primary-action" id="sample-button" type="button" ${busy ? "disabled" : ""}>${ready ? "Reinstall demo" : "Install demo database"}</button>
          <label class="secondary-action ${busy ? "disabled" : ""}">Import my database<input id="database-file" type="file" ${busy ? "disabled" : ""} /></label>
          <button class="text-action" id="offline-test" type="button" ${ready && !busy ? "" : "disabled"}>Run offline test</button>
        </div>
        <p class="storage-note">${persisted ? "Persistent storage granted. The browser should retain this database until you remove it." : "Storage is currently best-effort. Installing the PWA improves retention."}${storageQuota ? ` ${formatBytes(Math.max(0, storageQuota - storageUsage))} available.` : ""}</p>
      </section>

      <footer><span>Private by design</span><span>No account · No analytics · No search connection</span></footer>
    </div>`;

  bindEvents();
};

const withBusy = async (operation: () => Promise<void>) => {
  busy = true;
  message = "";
  render();
  try {
    await operation();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
    installProgress = 0;
    await updateStorage();
    render();
  }
};

const installBlob = async (file: Blob) => {
  await requestPersistence();
  status = await callWorker<Status>("install", { file });
  results = [];
  message = `${status.songs.toLocaleString()} songs installed and verified.`;
};

const bindEvents = () => {
  document.querySelector("#database-button")?.addEventListener("click", () => document.querySelector("#database-panel")?.scrollIntoView({ behavior: "smooth" }));
  document.querySelector<HTMLFormElement>("#search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget as HTMLFormElement).get("query")?.toString().trim() ?? "";
    if (!query) return;
    void withBusy(async () => {
      results = await callWorker<Result[]>("search", { query });
      message = results.length ? `${results.length} possible ${results.length === 1 ? "match" : "matches"}` : "No confident matches";
    });
  });
  document.querySelector("#sample-button")?.addEventListener("click", () => {
    void withBusy(async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-song-database.sqlite`);
      if (!response.ok) throw new Error("The demo database could not be loaded.");
      await installBlob(await response.blob());
    });
  });
  document.querySelector<HTMLInputElement>("#database-file")?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) void withBusy(() => installBlob(file));
  });
  document.querySelector("#offline-test")?.addEventListener("click", () => {
    void withBusy(async () => {
      status = await callWorker<Status>("verify");
      const cachesPresent = "caches" in window ? (await caches.keys()).length > 0 : false;
      const controlled = Boolean(navigator.serviceWorker?.controller) || import.meta.env.DEV;
      if (!cachesPresent && !import.meta.env.DEV) throw new Error("The application shell is not cached yet. Reopen once while online.");
      if (!controlled) throw new Error("The offline application shell is not active yet. Close and reopen the app.");
      message = `Offline test passed: app shell, ${status.songs.toLocaleString()} songs, search index, and database integrity are ready.`;
    });
  });
};

const start = async () => {
  render();
  try {
    const [databaseStatus] = await Promise.all([callWorker<Status>("status"), updateStorage()]);
    status = databaseStatus;
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  render();
};

void start();
