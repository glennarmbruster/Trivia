(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))p(a);new MutationObserver(a=>{for(const s of a)if(s.type==="childList")for(const f of s.addedNodes)f.tagName==="LINK"&&f.rel==="modulepreload"&&p(f)}).observe(document,{childList:!0,subtree:!0});function l(a){const s={};return a.integrity&&(s.integrity=a.integrity),a.referrerPolicy&&(s.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?s.credentials="include":a.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function p(a){if(a.ep)return;a.ep=!0;const s=l(a);fetch(a.href,s)}})();const q=new Worker(new URL("/assets/search.worker-B9wwaVWx.js",import.meta.url),{type:"module"}),y=new Map;let m=0,r={installed:!1,songs:0,version:"",minYear:0,maxYear:0,bytes:0,integrity:"unknown"},i=[],n="",o=!1,h=0,L=!1,b=0,v=0;const g=(e,t={})=>new Promise((l,p)=>{m+=1,y.set(m,{resolve:l,reject:p}),q.postMessage({id:m,action:e,payload:t})});q.onmessage=e=>{if(e.data.type==="progress"){h=e.data.progress,d();return}const t=y.get(e.data.id);t&&(y.delete(e.data.id),e.data.type==="error"?t.reject(new Error(e.data.error)):t.resolve(e.data.result))};const c=e=>e.replace(/[&<>'"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[t]),$=e=>{if(!e)return"—";const t=["B","KB","MB","GB"],l=Math.min(Math.floor(Math.log(e)/Math.log(1024)),t.length-1);return`${(e/1024**l).toFixed(l>1?1:0)} ${t[l]}`},w=async()=>{L=await navigator.storage?.persisted?.()??!1;const e=await navigator.storage?.estimate?.();b=e?.usage??0,v=e?.quota??0},E=async()=>{navigator.storage?.persist&&await navigator.storage.persist(),await w()},O=()=>r.installed?!i.length&&!n?'<section class="empty-state compact"><span class="empty-icon">⌕</span><h2>Ready for a lyric fragment</h2><p>Three to ten words works best. Misspellings and one or two wrong words are okay.</p></section>':i.length?`<section class="results" aria-label="Song matches">
    ${i.map((e,t)=>`<article class="result-card ${t===0?"top-result":""}">
          <div class="rank">${t+1}</div>
          <div class="result-copy">
            <h2>${c(e.title)}</h2>
            <p class="artist">${c(e.artist)}</p>
            <p class="metadata">${e.year}${e.album?` · ${c(e.album)}`:""}</p>
            <p class="explanation">${c(e.explanation)}</p>
          </div>
          <div class="match-score" aria-label="Match score ${e.score} out of 100"><strong>${e.score}</strong><span>match</span></div>
        </article>`).join("")}
  </section>`:'<section class="empty-state compact"><span class="empty-icon">…</span><h2>No confident match yet</h2><p>Try another word or remove the least certain word.</p></section>':'<section class="empty-state"><span class="empty-icon">♪</span><h2>Install a database to begin</h2><p>The included demo has five fictional songs. Your real 1960s–1990s corpus will use the same private import flow.</p></section>',d=()=>{const e=document.querySelector("#app"),t=r.installed;e.innerHTML=`
    <div class="page-shell">
      <header class="app-header">
        <div class="brand-mark" aria-hidden="true">♫</div>
        <div class="brand-copy"><span>GOOBS</span><h1>Song Finder</h1></div>
        <button class="status-pill ${t?"ready":""}" id="database-button" type="button" aria-controls="database-panel">
          <i></i>${t?"Offline ready":"Database needed"}
        </button>
      </header>

      <section class="search-surface" aria-labelledby="search-heading">
        <div class="era-badge">1960s–1990s collection</div>
        <h2 id="search-heading">What words do you remember?</h2>
        <form id="search-form" class="search-form">
          <label class="sr-only" for="lyric-query">Lyric fragment</label>
          <input id="lyric-query" name="query" type="search" inputmode="search" autocomplete="off" placeholder="streetlight people" ${t?"":"disabled"} />
          <button type="submit" ${t&&!o?"":"disabled"}>${o?'<span class="spinner"></span>':"Find song"}</button>
        </form>
        <p class="search-hint">Exact phrase, partial memory, misspellings, or words slightly out of order</p>
      </section>

      <div class="notice ${n?"visible":""}" role="status">${c(n)}</div>
      ${O()}

      <section class="database-panel" id="database-panel" aria-labelledby="database-heading">
        <div class="panel-heading">
          <div><span class="eyebrow">LOCAL COLLECTION</span><h2 id="database-heading">Song Database</h2></div>
          <span class="database-state ${t?"ready":""}">${t?"READY ✓":"NOT INSTALLED"}</span>
        </div>
        <div class="database-stats">
          <div><span>Songs</span><strong>${t?r.songs.toLocaleString():"—"}</strong></div>
          <div><span>Years</span><strong>${t?`${r.minYear}–${r.maxYear}`:"1960–1999"}</strong></div>
          <div><span>Version</span><strong>${t?c(r.version):"—"}</strong></div>
          <div><span>Storage</span><strong>${$(b)}</strong></div>
        </div>
        ${o&&h>0?`<div class="progress"><span style="width:${h*100}%"></span></div>`:""}
        <div class="database-actions">
          <button class="primary-action" id="sample-button" type="button" ${o?"disabled":""}>${t?"Reinstall demo":"Install demo database"}</button>
          <label class="secondary-action ${o?"disabled":""}">Import my database<input id="database-file" type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" ${o?"disabled":""} /></label>
          <button class="text-action" id="offline-test" type="button" ${t&&!o?"":"disabled"}>Run offline test</button>
        </div>
        <p class="storage-note">${L?"Persistent storage granted. The browser should retain this database until you remove it.":"Storage is currently best-effort. Installing the PWA improves retention."}${v?` ${$(Math.max(0,v-b))} available.`:""}</p>
      </section>

      <footer><span>Private by design</span><span>No account · No analytics · No search connection</span></footer>
    </div>`,M()},u=async e=>{o=!0,n="",d();try{await e()}catch(t){n=t instanceof Error?t.message:String(t)}finally{o=!1,h=0,await w(),d()}},S=async e=>{await E(),r=await g("install",{file:e}),i=[],n=`${r.songs.toLocaleString()} songs installed and verified.`},M=()=>{document.querySelector("#database-button")?.addEventListener("click",()=>document.querySelector("#database-panel")?.scrollIntoView({behavior:"smooth"})),document.querySelector("#search-form")?.addEventListener("submit",e=>{e.preventDefault();const t=new FormData(e.currentTarget).get("query")?.toString().trim()??"";t&&u(async()=>{i=await g("search",{query:t}),n=i.length?`${i.length} possible ${i.length===1?"match":"matches"}`:"No confident matches"})}),document.querySelector("#sample-button")?.addEventListener("click",()=>{u(async()=>{const e=await fetch("/sample-song-database.sqlite");if(!e.ok)throw new Error("The demo database could not be loaded.");await S(await e.blob())})}),document.querySelector("#database-file")?.addEventListener("change",e=>{const t=e.currentTarget.files?.[0];t&&u(()=>S(t))}),document.querySelector("#offline-test")?.addEventListener("click",()=>{u(async()=>{r=await g("verify");const e="caches"in window?(await caches.keys()).length>0:!1,t=!!navigator.serviceWorker?.controller||!1;if(!e)throw new Error("The application shell is not cached yet. Reopen once while online.");if(!t)throw new Error("The offline application shell is not active yet. Close and reopen the app.");n=`Offline test passed: app shell, ${r.songs.toLocaleString()} songs, search index, and database integrity are ready.`})})},T=async()=>{d();try{const[e]=await Promise.all([g("status"),w()]);r=e}catch(e){n=e instanceof Error?e.message:String(e)}d()};T();
