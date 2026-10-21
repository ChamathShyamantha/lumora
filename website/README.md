# Lumora website

Static site (no build step) for downloading Lumora. Plain HTML/CSS/JS.

## Deploy on Vercel

1. In Vercel: **Add New → Project → Import** the `lumora` GitHub repo.
2. Set **Root Directory** to `website`.
3. **Framework Preset:** Other. Leave Build Command and Output Directory empty.
4. Deploy. `vercel.json` adds caching and security headers.

## Edit links

Everything personal lives in [`config.js`](config.js):

- `kofiUrl`: paste your Ko-fi page (e.g. `https://ko-fi.com/yourname`). While it's
  empty, the Ko-fi card shows a "coming soon" note instead of the button.
- `downloadUrl` points at the **public** `lumora-releases` repo's *latest* release, so
  publishing a new release updates the download automatically.
- `version` / `installerSizeMB`: update when you ship a new version.

## Regenerate content after changing effects

From the `lumora` folder:

```bash
node scripts/build-site-catalog.mjs   # website/effects.json
node scripts/render-previews.mjs      # website/assets/effects/*.png (needs Chrome or Edge)
node scripts/make-icon.mjs            # icons
```

## Preview locally

Any static server works, e.g. `npx serve website`.
