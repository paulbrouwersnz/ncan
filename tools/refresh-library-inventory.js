/*
  Athletics NZ eLearning Library – inventory refresh (v5)
  -------------------------------------------------------
  How to use:
   1. Log in and open https://athleticsnz.elearning.worldathletics.org/library
      (reload the page first if you've run any version of this script in the tab).
   2. Open Chrome DevTools (F12) > Console.
      (The first time, Chrome may ask you to type "allow pasting" first.)
   3. Paste this whole script and press Enter, once.
   4. A green "Library inventory" box appears at the top right of the page and
      shows progress. When it says "Finished", the JSON has downloaded and you can
      close DevTools. It takes about a minute.
   5. Optional: click "Compare with previous…" in the box and pick an earlier
      inventory JSON to see what was added, removed or changed.

  Buttons: "Stop" halts the scan and offers the partial results; "Close" ends the
  script completely (stops any scan, cancels timers, removes the box). After
  Close you can paste the script again for a fresh scan.

  Safety: reads each folder once; one request at a time with a pause between;
  hard cap of MAX_REQUESTS; only one scan per tab at a time.
  Read-only: it uses your logged-in session in this tab and changes nothing.
*/
(async () => {
  const PAUSE_MS = 500, MAX_REQUESTS = 200, MAX_DEPTH = 8, LIMIT = 100;
  const PORTAL = "https://athleticsnz.elearning.worldathletics.org/library/";
  const STORE  = "https://asset-in.storage.prod.cls-eu-west-1-alpha.thelearning-lab.com/";
  const today  = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
  const log = (...a) => console.log("%c[inventory]", "color:#0a7;font-weight:bold", ...a);

  // ---- One scan at a time per tab ---------------------------------------------
  const prev = window.__inventory;
  if (prev && prev.state === "running") { log("Already running in this tab – see the box at the top right."); prev.showPanel && prev.showPanel(); return; }
  if (prev && prev.state === "done") { log("Already finished in this tab – use the box to download again, or Close it and paste the script again for a fresh scan."); prev.showPanel && prev.showPanel(); return; }
  const inv = window.__inventory = { state: "running", stop: false };

  // ---- Lifecycle: everything the script starts can be cancelled ----------------
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const abort = new AbortController();
  const stopped$ = () => new Error("Stopped by you.");
  const sleep = (ms) => new Promise((resolve, reject) => {
    if (abort.signal.aborted) return reject(stopped$());
    const t = later(resolve, ms);
    abort.signal.addEventListener("abort", () => { clearTimeout(t); timers.delete(t); reject(stopped$()); }, { once: true });
  });
  let restoreXHR = () => {};
  const halt = () => {                    // stop the scan now (used by Stop and Close)
    inv.stop = true;
    abort.abort();
    timers.forEach(clearTimeout); timers.clear();
    restoreXHR();
  };
  const closeAll = () => {                // end the script completely
    halt();
    document.getElementById("inv-panel")?.remove();
    inv.state = "closed";
    log("Closed. Nothing is running now; paste the script again for a fresh scan.");
  };
  inv.close = closeAll;

  // ---- On-page status box ----------------------------------------------------
  let panel;
  const makePanel = () => {
    document.getElementById("inv-panel")?.remove();
    const box = document.createElement("div");
    box.id = "inv-panel";
    box.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:360px;background:#fff;color:#222;" +
      "border:2px solid #0a7;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);font:14px/1.4 system-ui,sans-serif;padding:12px 14px";
    const title = Object.assign(document.createElement("div"), { textContent: "Library inventory" });
    title.style.cssText = "font-weight:600;margin-bottom:6px";
    const status = document.createElement("div");
    const detail = document.createElement("div");
    detail.style.cssText = "color:#555;font-size:12px;margin-top:4px;white-space:pre-wrap;max-height:260px;overflow:auto";
    const buttons = document.createElement("div");
    buttons.style.cssText = "margin-top:10px;display:flex;gap:6px;flex-wrap:wrap";
    box.append(title, status, detail, buttons);
    document.body.appendChild(box);
    panel = {
      status: (t) => { status.textContent = t; },
      detail: (t) => { detail.textContent = t; },
      buttons: (list) => {
        buttons.replaceChildren(...list.map(([label, fn]) => {
          const b = Object.assign(document.createElement("button"), { textContent: label, onclick: fn });
          b.style.cssText = "padding:4px 10px;border:1px solid #0a7;border-radius:4px;background:#f3fbf8;cursor:pointer;font:inherit;font-size:13px";
          return b;
        }));
      },
    };
    return panel;
  };
  makePanel();
  const say = (s, d = "") => { panel.status(s); panel.detail(d); log(s, d); };

  const saveFile = (content, name, type) => {
    const blob = new Blob([content], { type });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  try {
    // ---- 1. Pick up the session from the portal's own next library request ---
    panel.buttons([["Stop", halt], ["Close", closeAll]]);
    say("Picking up your session…");
    const captured = await new Promise((resolve) => {
      const P = XMLHttpRequest.prototype, open = P.open, setH = P.setRequestHeader, send = P.send;
      const restore = () => { P.open = open; P.setRequestHeader = setH; P.send = send; };
      let done = false, giveUp;
      const finish = (v) => { if (!done) { done = true; restore(); clearTimeout(giveUp); timers.delete(giveUp); resolve(v); } };
      restoreXHR = () => finish(null);
      P.open = function (m, u) { this.__u = String(u); this.__h = {}; return open.apply(this, arguments); };
      P.setRequestHeader = function (k, v) { if (this.__h) this.__h[k] = v; return setH.apply(this, arguments); };
      P.send = function () {
        if (!done && this.__u && this.__u.includes("/api/libraries/") && this.__h && this.__h.Authorization) {
          finish({ headers: { ...this.__h }, api: new URL(this.__u, location.href).origin });
        }
        return send.apply(this, arguments);
      };
      const tryClick = (n) => {
        if (done) return;
        if (inv.stop) return finish(null);
        const link = document.querySelector("main tr.library-table-row .library-table-name-title");
        if (link) link.click();
        else if (n > 0) later(() => tryClick(n - 1), 1000);
        else say("Please click into any folder on the page.");
      };
      tryClick(10);
      giveUp = later(() => finish(null), 120000);
    });
    if (inv.state === "closed") return;
    if (!captured) {
      inv.state = "stopped";
      say(inv.stop ? "Stopped." : "Stopped: no session picked up.", "Reload the page and run the script again.");
      panel.buttons([["Close", closeAll]]);
      return;
    }

    // ---- 2. Rate-limited listing ---------------------------------------------
    let requests = 0;
    const warnings = [];
    const list = async (id, type) => {
      if (inv.stop) throw new Error("Stopped by you.");
      if (requests >= MAX_REQUESTS) throw new Error(`Request cap (${MAX_REQUESTS}) reached.`);
      requests++;
      await sleep(PAUSE_MS);
      const q = `sort=weight:ASC&limit=${LIMIT}&pinned=0&publicTags=&type=${type}`;
      let r;
      try { r = await fetch(`${captured.api}/api/libraries/${id}/children?${q}`, { headers: captured.headers, signal: abort.signal }); }
      catch (e) { throw inv.stop ? stopped$() : e; }
      if (r.status === 429) throw new Error("The portal asked us to slow down (HTTP 429).");
      if (!r.ok) throw new Error(`HTTP ${r.status} listing ${type}s in ${id}`);
      const items = (await r.json()).items || [];
      if (items.length >= LIMIT) warnings.push(`A folder returned ${LIMIT} ${type}s; some may be missing (${id}).`);
      return items;
    };
    const size  = (b) => b >= 1048576 ? `${Math.round(b / 1048576 * 100) / 100} MB` : `${Math.round(b / 1024 * 100) / 100} KB`;
    const isoNZ = (s) => new Date(s).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

    // ---- 3. Walk the library from the root ------------------------------------
    const queue = [{ id: "root", path: "", top: "", depth: 0 }];
    const visited = new Set(), childrenOf = new Map(), records = new Map();
    let fileCount = 0, stopped = false;
    while (queue.length && !stopped) {
      const f = queue.shift();
      if (visited.has(f.id)) continue;
      visited.add(f.id);
      let files = [], subs = [];
      try {
        subs = (await list(f.id, "folder")).filter((i) => i.type === "folder");
        if (f.id !== "root") files = (await list(f.id, "file")).filter((i) => i.type !== "folder");
      } catch (e) {
        if (inv.stop) { stopped = true; break; }
        warnings.push(e.message); stopped = /cap|429/.test(e.message);
      }

      const kids = [];
      for (const s of subs) {
        const sid = s.uuid || s.id, name = s.name || s.title;
        if (!sid || visited.has(sid)) continue;
        if (f.depth + 1 > MAX_DEPTH) { warnings.push(`Skipped deep folder: ${f.path} / ${name}`); continue; }
        kids.push(sid);
        queue.push({ id: sid, path: f.path ? `${f.path} / ${name}` : name, top: f.top || name, depth: f.depth + 1 });
      }
      childrenOf.set(f.id, kids);
      if (f.id === "root") continue;

      const furl = PORTAL + f.id;
      records.set(f.id, {
        path: f.path, top_level_folder: f.top, folder_id: f.id, url: furl, file_count: files.length,
        files: files.map((i) => {
          const uri = (i.file && i.file.uri) || "";
          const direct = uri.startsWith(STORE) && !uri.includes("?");
          const bytes = +(i.file && i.file.fileSize) || 0;
          return {
            name: i.name,
            last_modified: isoNZ(i.updated),
            size: size(bytes),
            size_bytes: bytes,
            file_type: (i.file && i.file.extension) || (direct ? uri.split(".").pop() : "unknown"),
            link_type: direct ? "direct" : "folder",
            url: direct ? uri : furl,
          };
        }),
      });
      fileCount += files.length;
      if (inv.state === "closed") break;
      say("Reading the library…", `Folders read: ${records.size}\nFiles found: ${fileCount}\nRequests: ${requests}\n\nLatest: ${f.path}`);
    }

    if (inv.state === "closed") return;
    if (inv.stop) warnings.push("Stopped by you.");

    // Same order as the folder tree (and the inventory doc).
    const folders = [], placed = new Set();
    const walk = (id) => { for (const c of childrenOf.get(id) || []) if (!placed.has(c)) { placed.add(c); if (records.has(c)) folders.push(records.get(c)); walk(c); } };
    walk("root");
    for (const [id, r] of records) if (!placed.has(id)) folders.push(r);

    // ---- 4. Assemble ---------------------------------------------------------
    const all = folders.flatMap((f) => f.files.map((x) => ({ ...x, top: f.top_level_folder })));
    const tops = [...new Set(folders.map((f) => f.top_level_folder))];
    const result = {
      title: "Athletics NZ eLearning Library inventory",
      source: "https://athleticsnz.elearning.worldathletics.org/library",
      captured: today,
      complete: !stopped,
      notes: [
        "Dates are the portal's last-modified values (NZ time).",
        "link_type 'direct' URLs open the file from the portal's storage and appear to work without a login, so treat them as public.",
        "link_type 'folder' files are on a video host that only issues expiring links; their url is the folder page, which requires a login.",
        "Folder URLs require a portal login.",
        ...(stopped ? ["INCOMPLETE: the scan stopped early; see warnings."] : []),
        ...warnings.map((w) => "Warning: " + w),
      ],
      totals: {
        files: all.length,
        folders_including_root: folders.length + 1,
        direct_links: all.filter((x) => x.link_type === "direct").length,
        folder_links_only: all.filter((x) => x.link_type === "folder").length,
        by_top_level_folder: Object.fromEntries(tops.map((t) => [t, all.filter((x) => x.top === t).length])),
        requests_made: requests,
      },
      folders,
    };
    inv.result = result;
    const fileName = `athletics-nz-library-inventory-${today}${stopped ? "-INCOMPLETE" : ""}.json`;
    inv.download = () => saveFile(JSON.stringify(result, null, 2), fileName, "application/json");

    // ---- 5. Comparison with an earlier inventory --------------------------------
    const flatten = (d) => (d.folders || []).flatMap((f) => (f.files || []).map((x) => ({ ...x, folder_id: f.folder_id, path: f.path })));
    inv.compare = (old) => {
      const O = flatten(old), N = flatten(result), key = (x) => `${x.folder_id}|${x.name}`;
      const om = new Map(O.map((x) => [key(x), x])), nm = new Map(N.map((x) => [key(x), x]));
      const added = [], removed = [], changed = [], renamed = [], moved = [];
      for (const [k, n] of nm) {
        const o = om.get(k);
        if (!o) { added.push(n); continue; }
        const diffs = ["last_modified", "size", "url", "link_type"].filter((p) => o[p] !== n[p]).map((p) => `${p}: ${o[p]} → ${n[p]}`);
        if (diffs.length) changed.push({ n, diffs });
      }
      for (const [k, o] of om) if (!nm.has(k)) removed.push(o);
      for (const r of [...removed]) {               // same direct link under a new name or folder
        if (r.link_type !== "direct") continue;
        const i = added.findIndex((a) => a.url === r.url);
        if (i < 0) continue;
        const a = added.splice(i, 1)[0];
        removed.splice(removed.indexOf(r), 1);
        (a.folder_id === r.folder_id ? renamed : moved).push({ from: r, to: a });
      }
      const oldF = new Map((old.folders || []).map((f) => [f.folder_id, f.path]));
      const newF = new Map(result.folders.map((f) => [f.folder_id, f.path]));
      const newFolders = [...newF].filter(([id]) => !oldF.has(id)).map(([, p]) => p);
      const goneFolders = [...oldF].filter(([id]) => !newF.has(id)).map(([, p]) => p);

      const L = [`Athletics NZ library – changes from ${old.captured || "previous"} to ${result.captured}`,
                 `Files: ${O.length} → ${N.length}`, ""];
      const sec = (title, rows) => { if (rows.length) L.push(`${title} (${rows.length})`, ...rows.map((r) => "  " + r), ""); };
      sec("New folders", newFolders);
      sec("Removed folders", goneFolders);
      sec("Added files", added.map((x) => `+ ${x.path} / ${x.name}  (${x.last_modified}, ${x.size})`));
      sec("Removed files", removed.map((x) => `- ${x.path} / ${x.name}`));
      sec("Renamed files", renamed.map(({ from, to }) => `~ ${to.path}: "${from.name}" → "${to.name}"`));
      sec("Moved files", moved.map(({ from, to }) => `> ${to.name}: ${from.path} → ${to.path}`));
      sec("Changed files", changed.map(({ n, diffs }) => `* ${n.path} / ${n.name} — ${diffs.join("; ")}`));
      const total = newFolders.length + goneFolders.length + added.length + removed.length + renamed.length + moved.length + changed.length;
      if (!total) L.push("No changes.");
      const summary = total
        ? `Added ${added.length}, removed ${removed.length}, renamed ${renamed.length}, moved ${moved.length}, changed ${changed.length}` +
          (newFolders.length || goneFolders.length ? `; folders +${newFolders.length}/−${goneFolders.length}` : "")
        : "No changes since the previous inventory.";
      return { summary, report: L.join("\n"), counts: { added: added.length, removed: removed.length, renamed: renamed.length, moved: moved.length, changed: changed.length, newFolders: newFolders.length, goneFolders: goneFolders.length } };
    };
    const pickAndCompare = () => {
      const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
      input.onchange = async () => {
        try {
          const file = input.files[0];
          const old = JSON.parse(await file.text());
          const c = inv.compare(old);
          inv.lastReport = c.report;
          panel.status(c.summary);
          panel.detail(c.report);
          log(c.report);
          panel.buttons([
            ["Download change report", () => saveFile(c.report, `athletics-nz-library-changes-${today}.txt`, "text/plain")],
            ["Compare another…", pickAndCompare],
            ["Download inventory again", inv.download],
            ["Close", closeAll],
          ]);
        } catch (e) { panel.status("Couldn't read that file: " + e.message); }
      };
      input.click();
    };

    // ---- 6. Finish ---------------------------------------------------------------
    const finalPanel = () => {
      if (inv.state === "closed") return;
      if (!document.getElementById("inv-panel")) makePanel();
      const t = result.totals;
      panel.status(stopped ? "Stopped before finishing" : "Finished – inventory downloaded ✔");
      panel.detail(`${t.files} files in ${t.folders_including_root - 1} folders\n` +
        `${t.direct_links} direct links, ${t.folder_links_only} folder links\n${t.requests_made} requests` +
        (warnings.length ? `\n\nWarnings:\n${warnings.join("\n")}` : "") +
        (stopped ? "" : "\n\nYou can close DevTools now."));
      panel.buttons(stopped
        ? [["Download partial results", inv.download], ["Close", closeAll]]
        : [["Compare with previous…", pickAndCompare], ["Download again", inv.download], ["Close", closeAll]]);
    };
    inv.showPanel = finalPanel;
    inv.state = stopped ? "stopped" : "done";
    if (!stopped) inv.download();        // downloads exactly once per run
    finalPanel();
    log(stopped ? "Stopped." : "Finished.", result.totals, warnings.length ? warnings : "");
  } catch (e) {
    if (inv.state === "closed") return;
    inv.state = "stopped";
    say("Something went wrong: " + e.message, "Reload the page and try again. If it keeps happening, copy the console messages.");
    panel.buttons([["Close", closeAll]]);
    console.error(e);
  }
})();
