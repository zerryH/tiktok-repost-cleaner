# TikTok Repost Cleaner
Local date-range repost scanner. **Preview by default**; removal mode requires `--apply` and typing `REMOVE`. TikTok's DOM changes frequently; actions may be skipped and must be manually verified.

## GitHub Pages
The Pages website is a guide only. Playwright automation runs locally, not on GitHub Pages.

## Install
Python 3.10+:
```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
``

## Preview
Dates inclusive, UTC:
```bash
python repost_agent.py --username YOUR_USERNAME --start 2024-07-20 --end 2024-08-15
``
Browser opens; log in yourself. Session is stored locally in `tiktok_browser_profile/`.

## Optional removal
Only after reviewing preview:
```bash
python repost_agent.py --username YOUR_USERNAME --start 2024-07-20 --end 2024-08-15 --apply
``
Type `REMOVE` to confirm. It only attempts to click a visible explicit **Remove repost** menu item; if not found, it skips. Verify results manually.

## Safety/privacy
Never upload the local browser profile. Cookies and credentials aren't read by the code or sent to this project. `.gitignore` excludes profile/session files. This is unofficial and not affiliated with TikTok.

## Known limitations
- Repost tab/menu selectors can break when TikTok updates its site.
- The scanner is limited by scroll count and posts loaded in the browser.
- Date decoding assumes the TikTok numeric ID timestamp format.
- It is not guaranteed to identify or remove every repost.
