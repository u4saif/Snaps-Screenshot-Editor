# Publishing Snaps on the Chrome Web Store – step by step

## 0. Before you start (10 min)
- [x] Replace `<YOUR SUPPORT EMAIL>` and `<YOUR NAME / COMPANY>` in the privacy policy and listing.
- [x] Decide on the store name. Recommended: **Snaps – Screenshot & Editor** (set `"name"` in `manifest.json`; "Snaps" alone is hard to find in search).
- [ ] Host the privacy policy at a public HTTPS URL (see step 2).
- [ ] Use `snaps-extension-v1.0.0.zip` from this kit – `manifest.json` is at the zip root, as required.

## 1. Create a developer account
1. Go to https://chrome.google.com/webstore/devconsole and sign in with a Google account (use a dedicated/company account – the publisher cannot be transferred easily).
2. Accept the developer agreement and pay the **one-time US$5 registration fee**.
3. Verify your contact email (and, for a trader account in the EU, fill in the trader details).
4. Turn on 2-step verification – it's required to publish.

## 2. Host the privacy policy
Easiest free option: GitHub Pages.
1. Create a public repo (e.g. `snaps-privacy`), upload `privacy-policy.html` renamed to `index.html`.
2. Settings → Pages → deploy from `main` branch.
3. Your URL: `https://<username>.github.io/snaps-privacy/`

## 3. Upload the package
1. Dev Console → **Add new item** → upload `snaps-extension-v1.0.0.zip`.
2. If you get a manifest error, check that the zip root contains `manifest.json` (not a parent folder).

## 4. Store listing tab
Copy everything from `01-STORE-LISTING.md`:
- Description, category (Productivity), language
- Store icon → `store-icon-128.png`
- Screenshots → the 5 files in `images/screenshots/` (1280×800)
- Small promo tile → `promo-small-440x280.png`
- Marquee → `promo-marquee-1400x560.png`
- Homepage / support URL (a GitHub page or email works)

## 5. Privacy practices tab
- Single purpose → paste from the listing doc
- Permission justifications → paste each row
- "Are you using remote code?" → **No**
- Data usage → tick **nothing**, certify the 3 statements
- Privacy policy URL → your hosted link

## 6. Distribution tab
- Visibility: **Public** (or *Unlisted* for a soft launch)
- Regions: all regions
- Pricing: free

## 7. Submit for review
Click **Submit for review**. Typical review is 1–3 business days (can take up to 3 weeks for new developers). You can choose to publish automatically after approval or publish manually.

## Pre-submit checklist
- [ ] Description ≤ 132 chars in manifest ✔ (119)
- [ ] Icon 128×128 included in zip ✔
- [ ] 1–5 screenshots, 1280×800 or 640×400, 24-bit PNG/JPEG, no transparency ✔
- [ ] Small tile 440×280 ✔ (required for featuring)
- [ ] Marquee 1400×560 ✔ (optional)
- [ ] No remote code, no obfuscation ✔
- [ ] Permissions all justified, none unused ✔
- [ ] Privacy policy link reachable
- [ ] Tested on a clean Chrome profile (load unpacked from the zip contents)

## Common rejection reasons (and how Snaps avoids them)
| Reason | Status |
|---|---|
| Excessive / unused permissions | Only 7 permissions, all justified; no host permissions |
| Missing or wrong privacy policy | Provided – remember to host it |
| Misleading metadata / keyword stuffing / other brand names in title | Title is "Snaps – Screenshot & Editor"; keep competitor names out of title and summary |
| Unclear single purpose | Single-purpose statement provided |
| Remote code | None – everything bundled (Roboto font included locally) |
| Broken functionality | Tested: area, visible, full page, copy, download |

## After publishing
- Updates: bump `"version"` in `manifest.json`, re-zip, upload under **Package → Upload new package**.
- Reply to reviews; they influence ranking.
- Add the store link to the banner/website (`banner-1500x500.png` is sized for social headers).
- Consider adding a short demo video (YouTube link) in the listing – it lifts installs.
