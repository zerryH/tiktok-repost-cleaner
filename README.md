# Repost Cleaner

A local-first TikTok repost review helper. The project includes a Chrome Manifest V3 extension and a GitHub Pages landing page.

## Current capabilities

- Detects video cards currently rendered on TikTok's Reposts page.
- Opens the native menu for an individual visible card.
- Keeps the user in control: select TikTok's own “Remove repost” option and verify the result.
- Runs in the existing TikTok browser session; no password or cookies are collected.
- Mobile-friendly information page and a rough manual cleanup-time estimator.

## Install on Chrome (Windows)

1. Download the repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked** and select the `chrome-extension` folder.
5. Open TikTok.com, sign in normally, and visit your profile's Reposts tab.
6. Click the extension icon → **Open cleaner panel**.

Scroll TikTok to load more posts, then refresh the panel. It only sees cards currently present in the page.

## iPhone / Safari

The Pages site is responsive and can be used in iPhone Safari as a guide. A regular website cannot inspect the TikTok app or another Safari tab. Native iPhone automation would require a separately built and installed iOS app containing a Safari Web Extension. This repository does not currently include that app.

## GitHub Pages

https://zerryh.github.io/tiktok-repost-cleaner/

## Important limitations

This release is a preview and manual-action helper. It does **not** offer one-click bulk deletion, guaranteed complete scanning, date-based filtering, background removal, or verified removal history. TikTok may change its interface and break selectors. No automated “human-like” timing is used to bypass platform controls.

Unofficial project, not affiliated with TikTok or ByteDance.
