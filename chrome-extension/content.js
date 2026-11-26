(() => {
  if (window.__repostCleanerInstalled) return;
  window.__repostCleanerInstalled = true;
  let panel;

  const visible = el => !!(el && el.getClientRects().length);
  const text = el => (el?.innerText || el?.getAttribute("aria-label") || "").trim();

  function findCards() {
    const links = [...document.querySelectorAll('a[href*="/video/"]')].filter(visible);
    const seen = new Set();
    return links.map(link => {
      let node = link;
      for (let i=0; i<7 && node; i++, node=node.parentElement) {
        const buttons = [...node.querySelectorAll('button,[role="button"]')].filter(visible);
        if (buttons.some(b => /more|share|comment/i.test(text(b)))) {
          if (!seen.has(node)) { seen.add(node); return {node,link}; }
          break;
        }
      }
      return null;
    }).filter(Boolean);
  }

  function findMenuButton(card) {
    const buttons = [...card.querySelectorAll('button,[role="button"]')].filter(visible);
    return buttons.find(b => /more|options/i.test(text(b)) ||
      /more|ellipsis/i.test((b.getAttribute("data-e2e")||"") + " " + (b.getAttribute("aria-label")||"")));
  }

  function show() {
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "repost-cleaner-panel";
      Object.assign(panel.style,{position:"fixed",zIndex:"2147483647",right:"14px",bottom:"14px",width:"min(360px,calc(100vw - 28px))",maxHeight:"70vh",overflow:"auto",background:"#101318",color:"#f4f6f8",border:"1px solid #3a424d",borderRadius:"14px",padding:"14px",font:"14px/1.45 system-ui",boxShadow:"0 8px 36px #0009"});
      document.documentElement.appendChild(panel);
    }
    render();
  }

  function render(message) {
    if (!panel) return;
    const cards = findCards();
    panel.replaceChildren();
    const title = document.createElement("strong"); title.textContent="Repost Cleaner";
    const close = document.createElement("button"); close.textContent="Close";
    Object.assign(close.style,{float:"right",background:"#303844",color:"white",border:0,borderRadius:"7px",padding:"5px 9px"});
    close.onclick=()=>panel.remove(); panel=null;
    const info = document.createElement("p");
    info.textContent = message || (cards.length ? cards.length+" visible video card(s) found. Only posts loaded on this page are listed." : "No visible video cards found. Make sure you are on your profile's Reposts tab and scroll to load posts.");
    info.style.color="#b8c0ca";
    panel.append(title,close,info);
    cards.forEach((card,i)=>{
      const row=document.createElement("div");
      Object.assign(row.style,{borderTop:"1px solid #303844",padding:"10px 0",display:"flex",gap:"8px",alignItems:"center"});
      const a=document.createElement("a"); a.href=card.link.href; a.target="_blank"; a.rel="noopener"; a.textContent="Post "+(i+1)+" ↗";
      Object.assign(a.style,{color:"#a8d5ff",flex:"1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"});
      const b=document.createElement("button"); b.textContent="Open menu";
      Object.assign(b.style,{background:"#e9edf2",color:"#111",border:0,borderRadius:"7px",padding:"7px 9px",fontWeight:"650"});
      b.onclick=()=>{
        const menu=findMenuButton(card.node);
        if(menu){menu.click(); render("TikTok's menu was opened. Choose “Remove repost” yourself in TikTok, then return here.");}
        else render("Couldn't identify this card's menu button. Use TikTok's own menu on the post.");
      };
      row.append(a,b); panel.append(row);
    });
    const refresh=document.createElement("button"); refresh.textContent="Refresh list";
    Object.assign(refresh.style,{marginTop:"10px",width:"100%",padding:"9px",background:"#303844",color:"white",border:0,borderRadius:"8px"});
    refresh.onclick=()=>render(); panel.append(refresh);
    const note=document.createElement("p"); note.textContent="This is a preview/helper only. It does not remove posts automatically. Use TikTok's own “Remove repost” action and verify each change."; note.style.cssText="color:#929ba6;font-size:12px;margin-bottom:0"; panel.append(note);
  }

  chrome.runtime.onMessage.addListener(msg=>{if(msg?.type==="OPEN_REPOST_CLEANER") show();});
})();