# TikTok Repost Cleaner

A local browser helper for previewing visible repost cards on TikTok and opening each card's native menu. **It does not automatically remove reposts.** You choose TikTok's own “Remove repost” action for each post and verify the result.

## Chrome on Windows

1. Download this repository using GitHub's **Code → Download ZIP** button.
2. Extract the ZIP.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the `chrome-extension` folder.
6. Open TikTok, sign in normally, and navigate to your profile's **Reposts** tab.
7. Click the extension icon and choose **Open cleaner panel**.
8. The panel lists video cards currently loaded on the page. Click **Open menu**, then select TikTok's **Remove repost** option yourself.

The helper does not automatically scroll, bulk-delete, or confirm removals. Scroll TikTok yourself to load more posts and use **Refresh list**.

## Safari on iPhone

The GitHub Pages website works in Safari as a guide, but a normal website cannot inspect or control TikTok in another tab or in the TikTok app. Direct iPhone Safari automation would require a separately packaged and installed iOS Safari Web Extension; that app is not included here.

## GitHub Pages

The Pages site is a static guide. It cannot run browser extensions or control TikTok by itself:
https://zerryh.github.io/tiktok-repost-cleaner/

## Privacy and limitations

- No passwords, cookies, session tokens, or account data are collected or transmitted.
- The extension is limited to TikTok pages and operates on the already-open page.
- It only detects video cards currently rendered in the page; it cannot guarantee a complete inventory.
- TikTok may change its interface and break detection.
- Always review each post and verify any change in TikTok.
- Unofficial project; not affiliated with TikTok.
