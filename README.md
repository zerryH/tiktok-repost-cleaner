# Repost Cleaner

A local-first TikTok repost review and removal helper. The project includes a Chrome Manifest V3 extension and a GitHub Pages landing page.

## Install on Chrome (Windows)

1. Download the repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `chrome-extension` folder.
5. Open TikTok, sign in normally, and visit your own profile's **Reposts** tab.
6. Click the extension icon and choose **Open cleaner panel**.
7. Scroll the Reposts tab to load posts, then click **Refresh loaded posts**.

## Date filter — important distinction

The exact-day filter uses the **original video's upload date**, derived from the timestamp encoded in the TikTok video ID. It does **not** mean the date you reposted that video.

TikTok's Reposts view does not expose a reliable repost-created timestamp to this extension, so the extension must not claim it can target a specific reposting date. Posts whose video upload date cannot be decoded are excluded when a date is selected.

## Current behavior and limits

- Counts visible video links even when TikTok's menu button cannot be identified.
- Opens TikTok's own menu and processes one post at a time.
- Uses the visible **Remove repost** option and skips uncertain controls.
- Runs in the existing browser session; no passwords or cookies are collected.
- Only processes posts currently loaded in the Reposts page.
- Stops after 100 attempts per run; scroll to load more posts and run again.
- TikTok may change its interface and break selectors. Refresh the page and reload the extension if the panel cannot connect.

This is a manual-confirmation helper, not a guaranteed one-click bulk deletion tool. Removal makes real changes to your account, so verify the selected date and the posts before starting.

## iPhone / Safari

The Pages site is a guide only. A website cannot inspect or control the TikTok app or another Safari tab. Native iPhone automation would require a separately packaged Safari Web Extension and iOS app; that is not included here.

Unofficial project; not affiliated with TikTok or ByteDance.
