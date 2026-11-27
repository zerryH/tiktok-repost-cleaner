(() => {
  if (window.__repostCleanerInstalled) return;
  window.__repostCleanerInstalled = true;

  let panel = null;
  let running = false;
  let paused = false;
  let stopRequested = false;
  let removed = 0;
  let skipped = 0;
  let processed = new Set();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }

  function label(el) {
    if (!el) return "";
    return norm(
      el.innerText ||
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("data-e2e") ||
      ""
    );
  }

  function buttonDescriptor(el) {
    return norm([
      el.innerText,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("data-e2e"),
      el.getAttribute("data-testid")
    ].filter(Boolean).join(" "));
  }

  function onRepostsPage() {
    const profilePath = /^\/@[^/]+(?:\/reposts?)?\/?$/i.test(location.pathname);
    if (!profilePath) return false;

    const tabNames = new Set([
      "reposts",
      "repost",
      "uudelleenjulkaisut",
      "återpubliceringar"
    ]);

    const tabs = [...document.querySelectorAll(
      '[role="tab"], a, [role="link"], button'
    )].filter(visible);

    const tab = tabs.find(el => tabNames.has(label(el)));
    if (!tab) return false;

    const states = [tab, tab.parentElement, tab.parentElement?.parentElement].filter(Boolean);
    const active = states.some(el => {
      const cls = String(el.className || "");
      const ariaCurrent = el.getAttribute("aria-current");
      return (
        el.getAttribute("aria-selected") === "true" ||
        el.getAttribute("data-state") === "active" ||
        (ariaCurrent && ariaCurrent !== "false") ||
        /\b(active|selected|current)\b/i.test(cls)
      );
    });

    const params = new URLSearchParams(location.search);
    const routeSaysReposts =
      /\/reposts?\/?$/i.test(location.pathname) ||
      /reposts?/i.test(params.get("tab") || "");

    return active || routeSaysReposts;
  }

  function menuButtonIn(node) {
    if (!node) return null;
    const candidates = [...node.querySelectorAll(
      'button, [role="button"], [tabindex="0"][aria-label]'
    )].filter(visible);

    const menuWords = /\b(more|options|menu|more actions|lisää vaihtoehtoja|valikko|fler alternativ|fler åtgärder)\b/i;
    return candidates.find(el => menuWords.test(buttonDescriptor(el))) || null;
  }

  function cardContainer(link) {
    let fallback = link.parentElement || link;
    let menu = null;

    for (
      let node = link.parentElement, depth = 0;
      node && node !== document.body && depth < 12;
      node = node.parentElement, depth++
    ) {
      const videoLinks = [...node.querySelectorAll('a[href*="/video/"]')]
        .filter(visible).length;

      if (videoLinks > 2) break;

      const rect = node.getBoundingClientRect();
      if (rect.width >= 90 && rect.height >= 80) fallback = node;

      menu = menuButtonIn(node);
      if (menu) return {node, menu};
    }

    return {node: fallback, menu: menuButtonIn(fallback)};
  }

  function videoIdFromUrl(url) {
    const match = String(url || "").match(/\/video\/(\d{10,25})/);
    return match ? match[1] : null;
  }

  // TikTok video IDs encode the original video's creation time in their high bits.
  // This is NOT the date on which the account reposted the video.
  function videoUploadDate(url) {
    const id = videoIdFromUrl(url);
    if (!id) return null;

    try {
      const seconds = Number(BigInt(id) >> 32n);
      if (
        !Number.isFinite(seconds) ||
        seconds < 1500000000 ||
        seconds > (Date.now() / 1000) + 86400
      ) return null;

      const date = new Date(seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    } catch (_) {
      return null;
    }
  }

  function loadedCards() {
    const links = [...document.querySelectorAll('a[href*="/video/"]')].filter(visible);
    const seen = new Set();
    const cards = [];

    for (const link of links) {
      let href;
      try {
        href = new URL(link.href, location.href).href.split("?")[0];
      } catch (_) {
        continue;
      }

      if (seen.has(href)) continue;
      seen.add(href);

      const container = cardContainer(link);
      cards.push({
        href,
        node: container.node,
        menu: container.menu,
        uploadDate: videoUploadDate(href)
      });
    }

    return cards;
  }

  function selectedDate() {
    return panel?.querySelector("#rc-date")?.value || "";
  }

  function matchingCards() {
    const date = selectedDate();
    return loadedCards().filter(card => !date || card.uploadDate === date);
  }

  function removeOption() {
    const exactLabels = new Set([
      "remove repost",
      "remove repost from profile",
      "remove from reposts",
      "undo repost",
      "poista uudelleenjulkaisu",
      "poista uudelleenjulkaisu profiilista",
      "poista repost",
      "ta bort repost",
      "ta bort återpublicering",
      "ta bort återpubliceringen"
    ]);

    return [...document.querySelectorAll(
      '[role="menuitem"], button, [role="button"], [role="option"]'
    )].filter(visible).find(el => {
      const text = label(el);
      const attrs = buttonDescriptor(el);
      return exactLabels.has(text) || /\b(remove|poista|ta bort)\s+(repost|uudelleenjulkaisu|återpublicering)\b/i.test(attrs);
    }) || null;
  }

  function confirmButton() {
    const dialogs = [...document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"]'
    )].filter(visible);

    for (const dialog of dialogs) {
      const dialogText = buttonDescriptor(dialog);
      if (!/repost|remove|poista|återpublicering/i.test(dialogText)) continue;

      const buttons = [...dialog.querySelectorAll('button, [role="button"]')]
        .filter(visible);

      const confirm = buttons.find(button => {
        const text = label(button);
        return ["remove", "poista", "ta bort"].includes(text);
      });

      if (confirm) return confirm;
    }

    return null;
  }

  function render(message) {
    if (!panel) return;

    const all = loadedCards();
    const date = selectedDate();
    const matches = date ? all.filter(card => card.uploadDate === date) : all;
    const pending = matches.filter(card => !processed.has(card.href));

    panel.querySelector("#rc-status").textContent =
      message ||
      (running
        ? (paused ? "Paused. Resume when ready." : "Working through the matching loaded reposts…")
        : "Ready. Open your profile's Reposts tab, load posts, then refresh the count.");

    panel.querySelector("#rc-count").textContent =
      "Removed: " + removed +
      " · Skipped: " + skipped +
      " · Loaded: " + all.length +
      (date ? " · Date matches: " + matches.length : "");

    const start = panel.querySelector("#rc-start");
    start.disabled = running;
    start.textContent = running ? "Removal running…" : "Start bulk removal";

    panel.querySelector("#rc-pause").disabled = !running;
    panel.querySelector("#rc-pause").textContent = paused ? "Resume" : "Pause";
    panel.querySelector("#rc-stop").disabled = !running;

    panel.querySelector("#rc-refresh").disabled = running;
    panel.querySelector("#rc-remaining").textContent =
      date && matches.length === 0
        ? "No loaded videos match that original upload date."
        : pending.length + " matching posts still available in the loaded page.";
  }

  async function waitPaused() {
    while (paused && !stopRequested) await sleep(250);
  }

  async function bulkRemove() {
    if (!onRepostsPage()) {
      render("Reposts tab not found. Open your own profile, select Reposts, and refresh the count.");
      return;
    }

    const allAtStart = loadedCards();
    const date = selectedDate();
    const initialMatches = matchingCards();

    if (allAtStart.length === 0) {
      render("No video cards found. Wait for TikTok to load the Reposts grid, scroll down once, then refresh the count.");
      return;
    }

    if (initialMatches.length === 0) {
      render(date
        ? "No loaded videos match " + date + ". This filter uses the video's upload date, not the date you reposted it."
        : "Video links are visible, but none could be matched for processing. Refresh the page and try again.");
      return;
    }

    running = true;
    paused = false;
    stopRequested = false;
    processed = new Set();
    removed = 0;
    skipped = 0;

    render("Starting. Each post is checked before moving to the next one.");
    let empty = 0;
    let attempts = 0;

    while (!stopRequested && attempts < 100) {
      await waitPaused();
      if (stopRequested) break;

      const cards = matchingCards().filter(card => !processed.has(card.href));

      if (!cards.length) {
        if (++empty >= 3) break;
        window.scrollBy({
          top: Math.max(500, window.innerHeight * 0.75),
          behavior: "smooth"
        });
        await sleep(1300);
        continue;
      }

      empty = 0;
      const card = cards[0];
      processed.add(card.href);
      attempts++;

      try {
        if (!card.menu || !visible(card.menu)) {
          skipped++;
          render("The post was found, but its menu button was not identifiable. Skipped safely.");
          await sleep(450);
          continue;
        }

        card.menu.click();
        await sleep(700);

        const option = removeOption();
        if (!option) {
          skipped++;
          render("The TikTok menu opened, but its Remove repost option was not found. Skipped safely.");
          await sleep(450);
          continue;
        }

        option.click();
        await sleep(700);

        const confirm = confirmButton();
        if (confirm) {
          confirm.click();
          await sleep(1000);
        } else {
          await sleep(600);
        }

        const remains = [...document.querySelectorAll('a[href*="/video/"]')]
          .some(anchor => {
            if (!visible(anchor)) return false;
            try {
              return new URL(anchor.href, location.href).href.split("?")[0] === card.href;
            } catch (_) {
              return false;
            }
          });

        if (!remains) removed++;
        else skipped++;

        render();
      } catch (_) {
        skipped++;
        render("Page interaction failed for one post. It was skipped.");
      }

      await sleep(700);
    }

    running = false;
    paused = false;

    render(
      stopRequested
        ? "Stopped. No more posts will be processed."
        : attempts >= 100
          ? "Safety limit reached (100 attempts). Start again to continue."
          : "Finished scanning matching posts currently loaded by TikTok. Scroll to load more, then refresh and run again if needed."
    );
  }

  function show() {
    if (panel) {
      panel.remove();
      panel = null;
    }

    panel = document.createElement("section");
    panel.id = "repost-cleaner-panel";

    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "2147483647",
      right: "14px",
      bottom: "14px",
      width: "min(390px, calc(100vw - 28px))",
      maxHeight: "80vh",
      overflow: "auto",
      background: "#101713",
      color: "#f1f5f2",
      border: "1px solid #365342",
      borderRadius: "14px",
      padding: "16px",
      font: "14px/1.45 system-ui",
      boxShadow: "0 8px 36px #0009"
    });

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">' +
        '<strong style="font-size:17px">Repost Cleaner</strong>' +
        '<button id="rc-close" style="background:#29372f;color:white;border:0;border-radius:7px;padding:7px 10px">Close</button>' +
      '</div>' +
      '<p style="color:#b8c9bd;margin:10px 0">Finds visible videos on your Reposts tab. It uses TikTok\\'s own menu, one post at a time.</p>' +
      '<label for="rc-date" style="display:block;font-size:12px;color:#d3ded6;margin:10px 0 5px">Only videos uploaded on this date</label>' +
      '<input id="rc-date" type="date" style="width:100%;box-sizing:border-box;padding:9px;background:#0d1410;color:#f1f5f2;border:1px solid #425448;border-radius:7px;font:inherit">' +
      '<p style="color:#a7b8ac;font-size:11px;margin:6px 0 10px">Important: this is the original video upload date encoded in its TikTok ID, not the date you reposted it. TikTok does not expose a reliable repost date in this view.</p>' +
      '<button id="rc-refresh" style="width:100%;padding:8px;background:#29372f;color:#f1f5f2;border:1px solid #425448;border-radius:8px">Refresh loaded posts</button>' +
      '<div id="rc-status" style="margin-top:10px;padding:10px;background:#1a2820;border-radius:8px">Ready.</div>' +
      '<p id="rc-count" style="color:#b8c9bd;font-size:12px">Removed: 0 · Skipped: 0 · Loaded: 0</p>' +
      '<p id="rc-remaining" style="color:#a7b8ac;font-size:11px;margin:0 0 9px"></p>' +
      '<button id="rc-start" style="width:100%;padding:11px;background:#b9f6c9;color:#102017;border:0;border-radius:8px;font-weight:700">Start bulk removal</button>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button id="rc-pause" disabled style="flex:1;padding:10px;background:#29372f;color:white;border:0;border-radius:8px">Pause</button>' +
        '<button id="rc-stop" disabled style="flex:1;padding:10px;background:#49302c;color:white;border:0;border-radius:8px">Stop</button>' +
      '</div>' +
      '<p style="color:#91a397;font-size:11px;margin-bottom:0">Removal changes your account. Confirm before starting. Uncertain controls are skipped. Limit: 100 attempts per run.</p>';

    document.documentElement.appendChild(panel);

    panel.querySelector("#rc-close").onclick = () => {
      stopRequested = true;
      panel.remove();
      panel = null;
    };

    panel.querySelector("#rc-date").onchange = () => render(
      selectedDate()
        ? "Date filter applied to original video upload dates."
        : "Date filter cleared. All loaded reposts can be reviewed."
    );

    panel.querySelector("#rc-refresh").onclick = () => {
      if (!onRepostsPage()) {
        render("Reposts tab not found. Open your own profile's Reposts tab, then refresh again.");
        return;
      }

      const cards = loadedCards();
      render(cards.length
        ? "Found " + cards.length + " visible video card(s). Review the date matches before starting."
        : "No video cards found. Wait for TikTok to load the Reposts grid, then try again.");
    };

    panel.querySelector("#rc-start").onclick = () => {
      if (running) return;

      const date = selectedDate();
      const scope = date
        ? "videos originally uploaded on " + date + " (not reposted on that date)"
        : "all matching loaded reposts";

      if (confirm("Remove " + scope + " from your TikTok profile? This changes your account. Continue?")) {
        bulkRemove();
      }
    };

    panel.querySelector("#rc-pause").onclick = () => {
      paused = !paused;
      render();
    };

    panel.querySelector("#rc-stop").onclick = () => {
      stopRequested = true;
      paused = false;
      render("Stopping after the current action…");
    };

    render();
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "OPEN_REPOST_CLEANER") show();
  });
})();
