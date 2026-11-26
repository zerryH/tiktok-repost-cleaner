document.getElementById("scan").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.url?.startsWith("https://www.tiktok.com/")) {
    document.querySelector("p").textContent = "Open TikTok in this tab, go to your profile's Reposts tab, then try again.";
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id,{type:"OPEN_REPOST_CLEANER"});
    window.close();
  } catch {
    document.querySelector("p").textContent = "Refresh the TikTok tab, then reopen this extension.";
  }
});