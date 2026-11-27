# TikTok Repost Cleaner

A Chrome Manifest V3 extension for reviewing and removing your own TikTok reposts. It runs inside your signed-in TikTok tab.

**No Python, Playwright, command line, server, password or cookie export is required.**

## Install on Chrome (Windows)

1. Download the repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `chrome-extension` folder.
5. Open TikTok and sign in normally.
6. Open your own profile's **Reposts** tab.
7. Click the extension icon and choose **Open cleaner panel**.
8. Scroll the Reposts page to load the posts you want included, then click **Refresh loaded posts**.

## Date range

The panel has **From** and **To** fields. Both dates are inclusive. For example, 01.01.2023–01.01.2024 selects videos whose original upload dates fall inside that range.

Important: this is the **original video upload date**, not the day your account reposted it. TikTok's documented repost-video response provides the original video's `create_time`, not a per-user repost timestamp. This extension must not claim to filter by the date you tapped Repost.

Dates are read in UTC from the timestamp encoded in TikTok's video ID. Posts with an unreadable date are excluded when a range is selected.

## How removal works

- Detects repost tiles using TikTok's profile-grid `data-e2e` hooks, with a main-grid fallback.
- Opens each post, finds TikTok's repost control and checks that the post is currently reposted.
- Clicks the native remove/repost toggle only when the repost state is positively identified.
- Waits for the state change and skips uncertain actions instead of clicking a second time.
- Supports pause and stop.
- Processes at most 100 posts per batch. Refresh and start another batch to continue.

TikTok changes its website frequently. This code has passed a JavaScript syntax check, but live-page behavior still depends on the controls currently shown to your account. Test a small batch first and verify the result in TikTok.

## Privacy and limitations

The extension works locally in your existing browser session. It does not collect passwords, cookies or session tokens and does not upload your account data. It only operates on your own Reposts tab.

A website cannot control the TikTok app or another Safari tab on iPhone. A native iOS/Safari version is not included.

Unofficial project; not affiliated with TikTok or ByteDance.


## CAPTCHA and account-protection handling (v1.1.1)

If TikTok displays a CAPTCHA, verification screen, unusual-activity warning or rate-limit notice, the extension stops immediately. It does not solve, hide, bypass or retry the challenge.

The unfinished post URLs are saved locally in Chrome extension storage and can be copied with **Copy unfinished links**. Complete TikTok's own verification in the browser and use TikTok normally; the extension does not automatically resume a bulk run after a challenge. Manually review the saved links in TikTok or contact TikTok Support if the restriction remains.
