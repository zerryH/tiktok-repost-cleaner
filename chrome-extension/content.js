(() => {
  if (window.__repostCleanerInstalled) return;
  window.__repostCleanerInstalled = true;
  let panel = null, running = false, paused = false, stopRequested = false;
  let removed = 0, skipped = 0, processed = new Set();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => !!(el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none");
  const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const label = el => norm(el?.innerText || el?.getAttribute("aria-label") || el?.getAttribute("title") || "");
  function onRepostsPage() {
    const profile = /^\/@[^/]+\/?$/.test(location.pathname);
    const tabs = [...document.querySelectorAll('[role="tab"], a, [role="link"]')].filter(visible);
    const tab = tabs.find(el => label(el) === "reposts");
    const active = tab && (tab.getAttribute("aria-selected") === "true" || tab.matches('[aria-current="page"]') || tab.classList.contains("TUXTab-active"));
    return profile && !!tab && !!active;
  }
  function findCards() {
    const links = [...document.querySelectorAll('a[href*="/video/"]')].filter(visible), seen = new Set(), cards = [];
    for (const link of links) {
      const href = new URL(link.href, location.href).href.split("?")[0];
      if (seen.has(href) || processed.has(href)) continue;
      seen.add(href);
      let node = link, card = null;
      for (let i = 0; i < 9 && node && node !== document.body; i++, node = node.parentElement) {
        const buttons = [...node.querySelectorAll('button,[role="button"]')].filter(visible);
        const menu = buttons.find(b => /more|options|menu/i.test((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "") + " " + label(b)));
        if (menu && node.getBoundingClientRect().width > 90 && node.getBoundingClientRect().height > 80) { card = {href,node,menu}; break; }
      }
      if (card) cards.push(card);
    }
    return cards;
  }
  function removeOption() {
    return [...document.querySelectorAll('[role="menuitem"],button,[role="button"],[role="option"]')].filter(visible)
      .find(el => ["remove repost","remove repost from profile"].includes(label(el)));
  }
  function confirmButton() {
    for (const d of [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].filter(visible)) {
      if (!/repost|remove/i.test(label(d))) continue;
      const b = [...d.querySelectorAll('button,[role="button"]')].filter(visible).find(el => label(el) === "remove");
      if (b) return b;
    }
    return null;
  }
  function render(message) {
    if (!panel) return;
    panel.querySelector("#rc-status").textContent = message || (running ? (paused ? "Paused. Resume when ready." : "Working through loaded reposts…") : "Ready. Only loaded posts on your Reposts tab are included.");
    panel.querySelector("#rc-count").textContent = "Removed: " + removed + " · Skipped: " + skipped + " · Currently loaded: " + findCards().length;
    panel.querySelector("#rc-start").disabled = running && !paused;
    panel.querySelector("#rc-pause").disabled = !running;
    panel.querySelector("#rc-pause").textContent = paused ? "Resume" : "Pause";
    panel.querySelector("#rc-stop").disabled = !running;
  }
  async function waitPaused() { while (paused && !stopRequested) await sleep(250); }
  async function bulkRemove() {
    if (!onRepostsPage()) { render("Open your own profile’s Reposts tab first. Cleaner will not run on other pages."); running = false; return; }
    running = true; paused = false; stopRequested = false; processed = new Set(); removed = 0; skipped = 0;
    render("Starting. Each removal is checked before moving to the next post.");
    let empty = 0, attempts = 0;
    while (!stopRequested && attempts < 100) {
      await waitPaused(); if (stopRequested) break;
      const cards = findCards();
      if (!cards.length) {
        if (++empty >= 3) break;
        window.scrollBy({top: Math.max(500, window.innerHeight * .75),behavior:"smooth"});
        await sleep(1200); continue;
      }
      empty = 0;
      const card = cards[0]; processed.add(card.href); attempts++;
      try {
        card.menu.click(); await sleep(650);
        const option = removeOption();
        if (!option) { skipped++; render("Could not safely identify Remove repost; skipped one post."); await sleep(450); continue; }
        option.click(); await sleep(650);
        const confirm = confirmButton();
        if (confirm) { confirm.click(); await sleep(900); } else await sleep(500);
        const remains = [...document.querySelectorAll('a[href*="/video/"]')].some(a => visible(a) && new URL(a.href,location.href).href.split("?")[0] === card.href);
        if (!remains) removed++; else skipped++;
        render();
      } catch (_) { skipped++; render("Page interaction failed; that post was skipped."); }
      await sleep(700);
    }
    running = false; paused = false;
    render(stopRequested ? "Stopped. No more posts will be processed." : attempts >= 100 ? "Safety limit reached (100 attempts). Start again to continue." : "Finished scanning currently available reposts. Load more posts and run again if needed.");
  }
  function show() {
    if (panel) { panel.remove(); panel = null; }
    panel = document.createElement("section"); panel.id = "repost-cleaner-panel";
    Object.assign(panel.style,{position:"fixed",zIndex:"2147483647",right:"14px",bottom:"14px",width:"min(390px,calc(100vw - 28px))",maxHeight:"75vh",overflow:"auto",background:"#101713",color:"#f1f5f2",border:"1px solid #365342",borderRadius:"14px",padding:"16px",font:"14px/1.45 system-ui",boxShadow:"0 8px 36px #0009"});
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><strong style="font-size:17px">Repost Cleaner</strong><button id="rc-close" style="background:#29372f;color:white;border:0;border-radius:7px;padding:7px 10px">Close</button></div><p style="color:#b8c9bd;margin:10px 0">Bulk mode uses TikTok’s own menu, one post at a time. Only identifiable posts on your Reposts tab are processed.</p><div id="rc-status" style="padding:10px;background:#1a2820;border-radius:8px">Ready.</div><p id="rc-count" style="color:#b8c9bd;font-size:12px">Removed: 0 · Skipped: 0</p><button id="rc-start" style="width:100%;padding:11px;background:#b9f6c9;color:#102017;border:0;border-radius:8px;font-weight:700">Start bulk removal</button><div style="display:flex;gap:8px;margin-top:8px"><button id="rc-pause" disabled style="flex:1;padding:10px;background:#29372f;color:white;border:0;border-radius:8px">Pause</button><button id="rc-stop" disabled style="flex:1;padding:10px;background:#49302c;color:white;border:0;border-radius:8px">Stop</button></div><p style="color:#91a397;font-size:11px;margin-bottom:0">This performs real account changes. Confirm before starting. No passwords or account data are sent anywhere. Uncertain posts are skipped. Limit: 100 attempts per run.</p>';
    document.documentElement.appendChild(panel);
    panel.querySelector("#rc-close").onclick = () => { stopRequested = true; panel.remove(); panel = null; };
    panel.querySelector("#rc-start").onclick = () => { if (running) return; if (confirm("Remove reposts from your TikTok profile in bulk? This changes your account. Continue?")) bulkRemove(); };
    panel.querySelector("#rc-pause").onclick = () => { paused = !paused; render(); };
    panel.querySelector("#rc-stop").onclick = () => { stopRequested = true; paused = false; render("Stopping after the current action…"); };
    render();
  }
  chrome.runtime.onMessage.addListener(msg => { if (msg?.type === "OPEN_REPOST_CLEANER") show(); });
})();