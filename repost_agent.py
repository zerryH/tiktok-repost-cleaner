#!/usr/bin/env python3
"""Date-range repost reviewer/remover. Preview is default; removal requires explicit confirmation."""
import argparse, asyncio, re
from datetime import date, datetime, timezone
from pathlib import Path
from playwright.async_api import async_playwright

PROFILE = Path("tiktok_browser_profile")

def video_date(video_id):
    if not re.fullmatch(r"\d{15,20}", video_id): raise ValueError("bad video ID")
    return datetime.fromtimestamp(int(video_id) >> 32, tz=timezone.utc).date()

def extract_id(url):
    m = re.search(r"/(?:video|photo)/(\d{15,20})", url or "")
    return m.group(1) if m else None

async def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--username",required=True)
    ap.add_argument("--start",required=True,help="Inclusive UTC date YYYY-MM-DD")
    ap.add_argument("--end",required=True,help="Inclusive UTC date YYYY-MM-DD")
    ap.add_argument("--apply",action="store_true",help="Enable removal attempts (otherwise preview)")
    ap.add_argument("--scroll-limit",type=int,default=35)
    a=ap.parse_args(); start=date.fromisoformat(a.start); end=date.fromisoformat(a.end)
    if end<start: ap.error("--end must not be earlier than --start")
    if not 1<=a.scroll_limit<=500: ap.error("--scroll-limit must be 1..500")
    if a.apply and input("Removal mode: type REMOVE to confirm: ").strip()!="REMOVE":
        print("Cancelled."); return
    print(f"Dates UTC: {start}–{end} | Mode: {'REMOVE' if a.apply else 'PREVIEW'}")
    async with async_playwright() as p:
        ctx=await p.chromium.launch_persistent_context(str(PROFILE),headless=False,viewport={"width":1280,"height":900})
        page=ctx.pages[0] if ctx.pages else await ctx.new_page()
        try:
            await page.goto("https://www.tiktok.com/@"+a.username.lstrip("@"),wait_until="domcontentloaded",timeout=60000)
            print("Sign in manually if prompted. Session remains local in the ignored profile folder.")
            tab=page.get_by_text("Reposts",exact=True).first
            try: await tab.wait_for(timeout=20000); await tab.click(); await page.wait_for_timeout(2000)
            except Exception: print("Reposts tab not confidently found; stopping."); return
            seen=set(); matches=[]; idle=0
            for _ in range(a.scroll_limit):
                links=await page.locator('a[href*="/video/"],a[href*="/photo/"]').all()
                added=0
                for l in links:
                    href=await l.get_attribute("href"); vid=extract_id(href)
                    if not vid or vid in seen: continue
                    seen.add(vid); added+=1
                    try: dt=video_date(vid)
                    except Exception: continue
                    if start<=dt<=end:
                        matches.append((vid,href,dt)); print("MATCH",dt,href)
                idle=idle+1 if added==0 else 0
                if idle>=4: break
                await page.evaluate("window.scrollBy(0,Math.max(700,window.innerHeight*.8))")
                await page.wait_for_timeout(1800)
            print(f"Scanned {len(seen)} posts; date matches: {len(matches)}.")
            if not a.apply: print("Preview only; nothing changed. Use --apply to enable removal attempts."); return
            attempted=0
            for vid,href,dt in matches:
                try:
                    await page.goto(href,wait_until="domcontentloaded",timeout=45000); await page.wait_for_timeout(2000)
                    share=page.locator('[data-e2e="share-icon"]').first
                    if not await share.is_visible(timeout=4000): print("Skip (share control not found)",vid); continue
                    await share.click(); await page.wait_for_timeout(700)
                    opt=page.get_by_text("Remove repost",exact=True).first
                    if await opt.is_visible(timeout=2000):
                        await opt.click(); attempted+=1; print("Removal option clicked",vid)
                    else: print("Skip (explicit remove menu option missing)",vid)
                    await page.keyboard.press("Escape"); await page.wait_for_timeout(1200)
                except Exception as ex: print("Skipped safely:",vid,type(ex).__name__,str(ex)[:180])
            print(f"Removal attempts: {attempted}. Verify manually on TikTok.")
        finally: await ctx.close()
if __name__=="__main__": asyncio.run(main())
