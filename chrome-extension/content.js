(() => {
  "use strict";
  if (window.__repostCleanerInstalled) return;
  window.__repostCleanerInstalled = true;

  let panel = null, running = false, paused = false, stopRequested = false;
  let removed = 0, skipped = 0, processed = new Set(), runTotal = 0, lastLoadedCount = 0;
  let securityStopped = false;
  let remainingQueue = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const MEDIA = 'a[href*="/video/"], a[href*="/photo/"]';
  const TILE = '[data-e2e="user-repost-item"], [data-e2e="user-post-item"]';

  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function mediaId(value) {
    return String(value || "").match(/\/(?:video|photo)\/(\d{10,25})/i)?.[1] || null;
  }

  // TikTok video IDs encode the original video's creation timestamp, not its repost timestamp.
  function uploadDate(id) {
    if (!id || !/^\d{10,25}$/.test(String(id))) return null;
    try {
      const seconds = Number(BigInt(id) >> 32n);
      if (!Number.isFinite(seconds) || seconds < 1500000000 || seconds > Date.now() / 1000 + 86400) return null;
      return new Date(seconds * 1000).toISOString().slice(0, 10);
    } catch (_) { return null; }
  }

  function isRepostsPage() {
    if (!/^\/@[^/]+(?:\/reposts?)?\/?$/i.test(location.pathname)) return false;
    const tabs = [...document.querySelectorAll('[role="tab"], a, [role="link"], button')].filter(visible);
    const tab = tabs.find(el => {
      const value = norm(el.innerText || el.getAttribute("aria-label") || el.getAttribute("title"));
      return value === "reposts" || value === "repost";
    });
    if (tab) {
      const chain = [tab, tab.parentElement, tab.parentElement?.parentElement].filter(Boolean);
      if (chain.some(el => {
        const cls = String(el.className || "");
        const current = el.getAttribute("aria-current");
        return el.getAttribute("aria-selected") === "true" ||
          el.getAttribute("data-state") === "active" ||
          (current && current !== "false") ||
          /\b(active|selected|current)\b/i.test(cls);
      })) return true;
    }
    const routeIsReposts = /\/reposts?\/?$/i.test(location.pathname);
    const visibleRepostTiles = [...document.querySelectorAll('[data-e2e="user-repost-item"]')].some(visible);
    if (tab) return routeIsReposts || visibleRepostTiles;
    return routeIsReposts || visibleRepostTiles;
  }

  function parentTile(link) {
    for (let el = link, depth = 0; el && el !== document.body && depth < 12; el = el.parentElement, depth++) {
      if (el.matches?.(TILE)) return el;
    }
    return link;
  }

  function loadedTiles() {
    let entries = [];
    const roots = [...document.querySelectorAll(TILE)];
    if (roots.length) {
      for (const root of roots) {
        const link = root.matches?.(MEDIA) ? root : root.querySelector(MEDIA);
        if (link && visible(link)) entries.push({link, tile: root});
      }
    }

    // Fallback only to the main profile grid, never the sidebar or recommendations.
    if (!entries.length) {
      const main = document.querySelector("main") || document.querySelector('[role="main"]');
      if (main) {
        for (const link of main.querySelectorAll(MEDIA)) {
          if (visible(link)) entries.push({link, tile: parentTile(link)});
        }
      }
    }

    const unique = new Map();
    for (const entry of entries) {
      const id = mediaId(entry.link.href);
      if (!id || unique.has(id)) continue;
      unique.set(id, {
        id,
        href: new URL(entry.link.href, location.href).href.split("?")[0],
        link: entry.link,
        tile: entry.tile,
        uploadDate: uploadDate(id)
      });
    }
    return [...unique.values()];
  }

  function rangeValue() {
    return {
      from: panel?.querySelector("#rc-from")?.value || "",
      to: panel?.querySelector("#rc-to")?.value || ""
    };
  }
  function validRange(r) { return !r.from || !r.to || r.from <= r.to; }
  function inRange(item, r) {
    if (!r.from && !r.to) return true;
    if (!item.uploadDate) return false;
    return (!r.from || item.uploadDate >= r.from) && (!r.to || item.uploadDate <= r.to);
  }
  function filteredTiles() {
    const r = rangeValue();
    return loadedTiles().filter(item => inRange(item, r));
  }

  function securityChallengeReason() {
    const challengeSelectors = [
      'iframe[src*="captcha" i]',
      '[data-e2e*="captcha" i]',
      '[id*="captcha" i]',
      '[class*="captcha" i]'
    ];
    for (const selector of challengeSelectors) {
      const match = [...document.querySelectorAll(selector)].find(visible);
      if (match) return "a CAPTCHA or verification challenge";
    }

    const patterns = [
      /\bcaptcha\b/i,
      /security verification required/i,
      /verify to continue/i,
      /complete the security check/i,
      /unusual activity detected/i,
      /suspicious activity detected/i,
      /too many requests/i,
      /temporarily blocked/i,
      /access restricted/i,
      /try again later/i
    ];
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
      .filter(visible)
      .map(el => el.innerText || "")
      .join(" ");
    const body = String(document.body?.innerText || "").slice(0, 18000);
    if (patterns.some(pattern => pattern.test(dialogs))) return "TikTok displayed a security or rate-limit notice";
    if (patterns.some(pattern => pattern.test(body))) return "TikTok displayed a security or rate-limit notice";
    return null;
  }

  function storeManualQueue() {
    const safeQueue = remainingQueue.map(item => ({
      id: item.id,
      url: item.href,
      uploadDate: item.uploadDate || null
    }));
    if (!chrome.storage?.local) return Promise.resolve();
    return chrome.storage.local.set({repostCleanerManualQueue: safeQueue});
  }

  function stopForSecurity(reason) {
    if (!running || securityStopped) return;
    securityStopped = true;
    stopRequested = true;
    paused = false;
    storeManualQueue().catch(() => {});
    render("Stopped automatically: " + reason + ". No more actions will run. Your unfinished post links are saved for manual review.");
  }

  async function copyManualQueue() {
    let queue = remainingQueue;
    if (!queue.length && chrome.storage?.local) {
      try {
        const saved = await chrome.storage.local.get("repostCleanerManualQueue");
        queue = Array.isArray(saved.repostCleanerManualQueue) ? saved.repostCleanerManualQueue : [];
      } catch (_) {}
    }
    const urls = queue.map(item => item.url || item.href).filter(Boolean);
    if (!urls.length) {
      render("No unfinished post links are saved.");
      return;
    }
    const value = urls.join("\n");
    try {
      await navigator.clipboard.writeText(value);
      render("Copied " + urls.length + " unfinished post links. Remove them manually in TikTok.");
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      panel.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      render(ok
        ? "Copied " + urls.length + " unfinished post links. Remove them manually in TikTok."
        : "Clipboard access failed. Try copying the saved links from the extension's local storage.");
    }
  }

  function controlText(el) {
    return norm([
      el?.innerText, el?.getAttribute("aria-label"),
      el?.getAttribute("title"), el?.getAttribute("data-state")
    ].filter(Boolean).join(" "));
  }

  function repostControl() {
    const found = [...document.querySelectorAll(
      '[data-e2e="video-share-repost"], [data-e2e="photo-share-repost"], [aria-label*="Remove repost" i], [aria-label*="Undo repost" i]'
    )].filter(visible);
    return found.find(el => el.closest('[role="dialog"], [aria-modal="true"]')) || found[0] || null;
  }

  // true: already reposted; false: not reposted; null: state is ambiguous.
  function repostState(el) {
    if (!el) return null;
    const pressed = el.getAttribute("aria-pressed");
    if (pressed === "true") return true;
    if (pressed === "false") return false;
    const label = controlText(el);
    if (/\b(remove|undo|unrepost|unpost|poista|kumoa|ta bort|avbryt)\b/.test(label)) return true;
    if (/\b(reposted|you reposted|repost added|uudelleenjulkaistu|återpublicerad)\b/.test(label)) return true;
    if (/\b(repost|repost video|uudelleenjulkaise|återpublicera)\b/.test(label)) return false;
    if (visible(document.querySelector('[data-e2e="repost-tag"]'))) return true;
    return null;
  }

  async function waitFor(getValue, timeout = 10000, interval = 150) {
    const end = Date.now() + timeout;
    while (Date.now() < end && !stopRequested) {
      if (running) {
        const reason = securityChallengeReason();
        if (reason) {
          stopForSecurity(reason);
          return null;
        }
      }
      try {
        const value = getValue();
        if (value) return value;
      } catch (_) {}
      await sleep(interval);
    }
    return null;
  }

  function clickSafe(el) {
    if (!el || !el.isConnected) return false;
    el.scrollIntoView({block: "center", inline: "center", behavior: "instant"});
    el.click();
    return true;
  }

  function viewerCloseButton() {
    const selectors = [
      '[data-e2e="browse-close"]', '[data-e2e="video-close"]',
      '[data-e2e="close-icon"]', 'button[aria-label="Close"]',
      'button[aria-label="close"]', 'button[aria-label="Sulje"]'
    ];
    for (const selector of selectors) {
      const el = [...document.querySelectorAll(selector)].find(visible);
      if (el) return el;
    }
    return null;
  }

  async function closeViewer(id) {
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true}));
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true}));
    await sleep(350);
    const close = viewerCloseButton();
    if (close) clickSafe(close);

    let closed = await waitFor(() =>
      mediaId(location.pathname) !== id && !repostControl() ? true : null,
    2500, 150);
    if (closed) return true;

    // TikTok normally pushes the video viewer onto the SPA history stack.
    if (mediaId(location.pathname) === id) {
      history.back();
      closed = await waitFor(() =>
        mediaId(location.pathname) !== id && !repostControl() ? true : null,
      4000, 200);
      if (closed) return true;
    }
    return !repostControl();
  }

  function render(message) {
    if (!panel) return;
    const r = rangeValue();
    const all = loadedTiles();
    lastLoadedCount = Math.max(lastLoadedCount, all.length);
    const matches = all.filter(item => inRange(item, r));
    const unknown = all.filter(item => !item.uploadDate).length;
    const remaining = matches.filter(item => !processed.has(item.id)).length;

    panel.querySelector("#rc-status").textContent = message || (running
      ? (paused ? "Paused. Resume when ready." : "Processing reposts one at a time…")
      : "Ready. Choose a date range and refresh the loaded posts.");
    panel.querySelector("#rc-count").textContent =
      "Removed: " + removed + " · Skipped: " + skipped + " · Loaded: " + lastLoadedCount;
    panel.querySelector("#rc-matches").textContent =
      ((r.from || r.to) ? "In upload-date range: " : "Matching loaded posts: ") +
      matches.length + " · Remaining in page: " + remaining;
    panel.querySelector("#rc-unknown").textContent = (r.from || r.to)
      ? "Posts without a readable upload date: " + unknown + " (excluded)"
      : "Date filter uses original video upload dates, not repost dates.";

    const total = runTotal || matches.length;
    const done = Math.min(processed.size, total);
    panel.querySelector("#rc-progress-fill").style.width =
      (total ? Math.min(100, Math.round(done / total * 100)) : 0) + "%";
    panel.querySelector("#rc-progress-label").textContent =
      running ? "Batch progress · " + done + " / " + total : "Batch progress";

    panel.querySelector("#rc-start").disabled = running;
    panel.querySelector("#rc-start").textContent = running ? "Removal running…" : "Start removal";
    panel.querySelector("#rc-pause").disabled = !running;
    panel.querySelector("#rc-pause").textContent = paused ? "Resume" : "Pause";
    panel.querySelector("#rc-stop").disabled = !running;
    panel.querySelector("#rc-refresh").disabled = running;
    panel.querySelector("#rc-from").disabled = running;
    panel.querySelector("#rc-to").disabled = running;
  }

  async function waitPaused() {
    while (paused && !stopRequested) await sleep(200);
  }

  async function processOne(item, index) {
    const challenge = securityChallengeReason();
    if (challenge) {
      stopForSecurity(challenge);
      return;
    }
    if (!item.link?.isConnected || !clickSafe(item.link)) {
      skipped++;
      render("Post is no longer available in the loaded grid. Skipped safely.");
      return;
    }

    render("Opening post " + index + " of " + runTotal + "…");
    const control = await waitFor(() => {
      const found = repostControl();
      const currentId = mediaId(location.pathname);
      return (!found || (currentId && currentId !== item.id)) ? null : found;
    }, 12000, 200);

    if (!control) {
      if (securityStopped) return;
      skipped++;
      const closed = await closeViewer(item.id);
      render(closed
        ? "TikTok’s repost control did not appear. Skipped safely."
        : "Could not close the post viewer. Stopping to avoid acting on the wrong post.");
      if (!closed) stopRequested = true;
      return;
    }

    const before = repostState(control);
    if (before !== true) {
      skipped++;
      const closed = await closeViewer(item.id);
      render(before === false
        ? "TikTok says this post is not currently reposted. Skipped."
        : "Could not verify the repost state. Skipped safely.");
      if (!closed) stopRequested = true;
      return;
    }

    render("Removing repost " + index + " of " + runTotal + "…");
    control.click();

    // Never click twice just because TikTok is slow to update.
    const changed = await waitFor(() => {
      const next = repostControl();
      if (next && repostState(next) === false) return true;
      if (!next && !document.querySelector('[data-e2e="repost-tag"]')) return true;
      return null;
    }, 5000, 200);

    const closed = await closeViewer(item.id);
    if (!closed) {
      skipped++;
      render("Removal was attempted, but the viewer did not close. Stopping safely.");
      stopRequested = true;
      return;
    }

    const stillInGrid = loadedTiles().some(entry => entry.id === item.id);
    if (changed || !stillInGrid) {
      removed++;
      render("Repost removal confirmed.");
    } else {
      skipped++;
      render("TikTok did not confirm removal. The post will not be clicked again.");
    }
  }

  async function bulkRemove() {
    const r = rangeValue();
    const challenge = securityChallengeReason();
    if (challenge) {
      render("TikTok is showing " + challenge + ". Complete TikTok's own verification in the browser; this extension will not automate around it.");
      return;
    }
    if (!isRepostsPage()) {
      render("Reposts tab not detected. Open your own profile’s Reposts tab and refresh the count.");
      return;
    }
    if (!validRange(r)) {
      render("The start date must be on or before the end date.");
      return;
    }

    const initial = loadedTiles();
    const matches = initial.filter(item => inRange(item, r));
    if (!initial.length) {
      render("No repost tiles detected. Wait for TikTok’s grid to load, then refresh.");
      return;
    }
    if (!matches.length) {
      render((r.from || r.to)
        ? "No loaded reposts have an original video upload date inside that range."
        : "No matching repost tiles detected.");
      return;
    }

    running = true;
    paused = false;
    stopRequested = false;
    securityStopped = false;
    removed = 0;
    skipped = 0;
    processed = new Set();
    remainingQueue = matches.map(item => ({
      id: item.id, href: item.href, uploadDate: item.uploadDate
    }));
    storeManualQueue().catch(() => {});
    runTotal = Math.min(100, matches.length);
    lastLoadedCount = initial.length;

    const rangeText = (r.from || r.to)
      ? (r.from || "any date") + " to " + (r.to || "any date")
      : "all dates";
    render("Starting a batch of up to " + runTotal + " posts (" + rangeText + ").");

    let emptyPasses = 0, attempts = 0;
    while (!stopRequested && attempts < 100) {
      await waitPaused();
      if (stopRequested) break;

      const candidates = loadedTiles().filter(item => inRange(item, r) && !processed.has(item.id));
      if (!candidates.length) {
        if (++emptyPasses >= 3) break;
        window.scrollBy({top: Math.max(550, window.innerHeight * 0.8), behavior: "smooth"});
        await sleep(1300);
        if (loadedTiles().some(item => inRange(item, r) && !processed.has(item.id))) emptyPasses = 0;
        continue;
      }

      emptyPasses = 0;
      const item = candidates[0];
      processed.add(item.id);
      attempts++;
      await processOne(item, attempts);
      if (securityStopped) break;
      remainingQueue = remainingQueue.filter(entry => entry.id !== item.id);
      storeManualQueue().catch(() => {});
      await sleep(650);
    }

    running = false;
    paused = false;
    if (securityStopped) {
      storeManualQueue().catch(() => {});
      render("Stopped for TikTok verification or a rate limit. Complete verification manually; copy the unfinished links below for manual review.");
    } else if (stopRequested) {
      storeManualQueue().catch(() => {});
      render("Stopped. No further posts will be processed.");
    } else if (attempts >= 100) render("100-post batch finished. Refresh the grid and start another batch to continue.");
    else render("Finished the matching posts currently loaded by TikTok. Scroll to load more, refresh, then run another batch.");
  }

  function show() {
    if (panel) { panel.remove(); panel = null; }
    panel = document.createElement("section");
    panel.id = "repost-cleaner-panel";
    Object.assign(panel.style, {
      position: "fixed", zIndex: "2147483647", right: "14px", bottom: "14px",
      width: "min(400px, calc(100vw - 28px))", maxHeight: "82vh", overflow: "auto",
      background: "#101713", color: "#f1f5f2", border: "1px solid #365342",
      borderRadius: "14px", padding: "16px", font: "14px/1.45 system-ui",
      boxShadow: "0 8px 36px #0009"
    });

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">' +
        '<strong style="font-size:17px">Repost Cleaner</strong>' +
        '<button id="rc-close" style="background:#29372f;color:white;border:0;border-radius:7px;padding:7px 10px">Close</button>' +
      '</div>' +
      '<p style="color:#b8c9bd;margin:10px 0">Opens each repost and uses TikTok’s own Remove repost control. No Python or external login is needed.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">' +
        '<label style="font-size:12px;color:#d3ded6">From' +
          '<input id="rc-from" type="date" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px;background:#0d1410;color:#f1f5f2;border:1px solid #425448;border-radius:7px;font:inherit">' +
        '</label>' +
        '<label style="font-size:12px;color:#d3ded6">To' +
          '<input id="rc-to" type="date" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:9px;background:#0d1410;color:#f1f5f2;border:1px solid #425448;border-radius:7px;font:inherit">' +
        '</label>' +
      '</div>' +
      '<p style="color:#a7b8ac;font-size:11px;margin:7px 0 10px">Inclusive range: original video upload date (UTC), not the date you reposted it. TikTok does not expose a reliable repost timestamp here.</p>' +
      '<button id="rc-refresh" style="width:100%;padding:8px;background:#29372f;color:#f1f5f2;border:1px solid #425448;border-radius:8px">Refresh loaded posts</button>' +
      '<button id="rc-copy-queue" style="width:100%;padding:8px;margin-top:7px;background:#202b36;color:#e8eef4;border:1px solid #354352;border-radius:8px">Copy unfinished links</button>' +
      '<div id="rc-queue-info" style="color:#91a397;font-size:11px;margin-top:5px"></div>' +
      '<div id="rc-status" style="margin-top:10px;padding:10px;background:#1a2820;border-radius:8px">Ready.</div>' +
      '<p id="rc-count" style="color:#b8c9bd;font-size:12px;margin:9px 0 4px">Removed: 0 · Skipped: 0 · Loaded: 0</p>' +
      '<p id="rc-matches" style="color:#b8c9bd;font-size:11px;margin:0 0 4px">Matching loaded posts: 0</p>' +
      '<p id="rc-unknown" style="color:#91a397;font-size:11px;margin:0 0 8px"></p>' +
      '<div id="rc-progress-label" style="color:#b8c9bd;font-size:11px">Batch progress</div>' +
      '<div style="height:6px;background:#28352d;border-radius:8px;overflow:hidden;margin:5px 0 10px">' +
        '<div id="rc-progress-fill" style="height:100%;width:0;background:#b9f6c9;border-radius:8px;transition:width .2s"></div>' +
      '</div>' +
      '<button id="rc-start" style="width:100%;padding:11px;background:#b9f6c9;color:#102017;border:0;border-radius:8px;font-weight:700">Start removal</button>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button id="rc-pause" disabled style="flex:1;padding:10px;background:#29372f;color:white;border:0;border-radius:8px">Pause</button>' +
        '<button id="rc-stop" disabled style="flex:1;padding:10px;background:#49302c;color:white;border:0;border-radius:8px">Stop</button>' +
      '</div>' +
      '<p style="color:#91a397;font-size:11px;margin-bottom:0">Only your own Reposts tab is processed. Removal changes your account. Verify the date range before confirming. Batch limit: 100 posts.</p>';

    document.documentElement.appendChild(panel);
    panel.querySelector("#rc-close").onclick = () => {
      stopRequested = true;
      panel.remove();
      panel = null;
    };

    for (const selector of ["#rc-from", "#rc-to"]) {
      panel.querySelector(selector).addEventListener("change", () => {
        const r = rangeValue();
        render(!validRange(r)
          ? "Invalid range: the start date must be on or before the end date."
          : "Date range updated. Click Refresh loaded posts to recalculate matches.");
      });
    }

    panel.querySelector("#rc-copy-queue").onclick = () => { copyManualQueue(); };

    if (chrome.storage?.local) {
      chrome.storage.local.get("repostCleanerManualQueue").then(saved => {
        if (!panel) return;
        const queue = Array.isArray(saved.repostCleanerManualQueue) ? saved.repostCleanerManualQueue : [];
        if (queue.length) {
          panel.querySelector("#rc-queue-info").textContent =
            queue.length + " unfinished links saved from an interrupted run.";
        }
      }).catch(() => {});
    }

    panel.querySelector("#rc-refresh").onclick = () => {
      if (!isRepostsPage()) {
        render("Reposts tab not detected. Open your own profile’s Reposts tab first.");
        return;
      }
      const r = rangeValue();
      if (!validRange(r)) { render("The start date must be on or before the end date."); return; }
      const all = loadedTiles();
      const matching = all.filter(item => inRange(item, r));
      lastLoadedCount = all.length;
      render(all.length
        ? "Found " + all.length + " repost tile(s); " + matching.length + " match the selected date range."
        : "No repost tiles found. Scroll the Reposts page to load posts, then try again.");
    };

    panel.querySelector("#rc-start").onclick = () => {
      if (running) return;
      const r = rangeValue();
      if (!validRange(r)) { render("The start date must be on or before the end date."); return; }
      const count = filteredTiles().length;
      if (!count) { render("No matching loaded posts. Refresh the count or change the date range."); return; }

      if (confirm("Remove up to 100 of " + count + " matching reposts?\n\nThe date range applies to original video upload date, not repost date.\n\nContinue?")) {
        bulkRemove();
      }
    };

    panel.querySelector("#rc-pause").onclick = () => { paused = !paused; render(); };
    panel.querySelector("#rc-stop").onclick = () => {
      stopRequested = true;
      paused = false;
      render("Stopping after the current post action…");
    };
    render();
  }

  const securityObserver = new MutationObserver(() => {
    if (!running || securityStopped) return;
    const reason = securityChallengeReason();
    if (reason) stopForSecurity(reason);
  });
  try {
    securityObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class", "aria-label"]
    });
  } catch (_) {}

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "OPEN_REPOST_CLEANER") show();
  });
})();