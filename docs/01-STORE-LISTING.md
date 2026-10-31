# Snaps – Chrome Web Store listing (copy & paste)

## Name
**Snaps – Screenshot & Editor**
(The store listing name comes from `manifest.json`. `"name"` has been set to `"Snaps – Screenshot & Editor"` for better search visibility — within the 75-character limit.)

## Summary (max 132 characters – this is the manifest `description`)
```
Screenshot any area, the visible page or a full scrolling page. Annotate, blur, copy or save. Private and 100% offline.
```
(119 characters)

## Category
Productivity  → sub-category: Tools

## Language
English

## Detailed description
```
Snaps is a fast, private screenshot tool and image editor for Chrome. Capture exactly what you need, mark it up, and copy or save it in seconds.

CAPTURE
• Select area – drag a region on any page (Lightshot-style), with a magnifier loupe, live size badge and resize handles
• Visible part – grab what's on screen right now
• Full page – auto-scrolls and stitches long pages into one image (sticky headers appear only once, up to 16,000 px tall)
• Timer – 3, 5 or 10 second delay for menus and hover states
• Keyboard shortcuts: Alt+Shift+A (area), Alt+Shift+V (visible), Alt+Shift+F (full page). Change them any time at chrome://extensions/shortcuts

ANNOTATE
• Arrows, lines, rectangles, ellipses, pen and highlighter
• Text, numbered step badges and emoji stamps
• Blur and pixelate to hide emails, names and other sensitive details
• Undo / redo, crop, rotate and flip

MAKE IT SHARE-WORTHY
• Beautify mode: backdrops, padding, rounded corners, shadows and a window frame – perfect for docs, tickets and social posts

SAVE & SHARE
• One-click copy to clipboard
• Download as PNG, JPG, WebP or PDF
• Built-in gallery of recent captures with search by type, re-edit, copy and delete
• "After capture" setting: open editor, copy straight away, or download straight away

PRIVATE BY DESIGN
• No account, no sign-in, no tracking, no analytics
• Nothing is ever uploaded – captures stay in your browser
• Works fully offline
• Only runs when you press the button or a shortcut (uses the activeTab permission – no access to all your sites)

LOOKS GREAT
• Clean Material Design interface with light and dark mode that follows your system
• Six theme colours

Perfect for support teams, QA and bug reports, designers, developers, writers, teachers and anyone who shares what's on their screen.

Questions or ideas? Contact us at: u4saif@gmail.com
```

## Single-purpose statement (Privacy practices tab)
```
Snaps has a single purpose: to capture screenshots of web pages (selected area, visible part or full page), let the user annotate them, and copy or save the result.
```

## Permission justifications (Privacy practices tab)

| Permission | Justification to paste |
|---|---|
| `activeTab` | Grants temporary access to the current tab only when the user clicks the Snaps button, uses a shortcut or the context menu. Needed to capture the visible tab image and to show the area-selection overlay on that tab. |
| `scripting` | Injects the area-selection overlay and the helper that scrolls the page for full-page capture into the active tab, only after the user starts a capture. |
| `storage` | Saves the user's settings (theme colour, default format, after-capture behaviour, timer). |
| `unlimitedStorage` | Stores the user's screenshot history (image blobs) locally in IndexedDB. Full-page screenshots can be several MB each, which would exceed the default quota. Data never leaves the device. |
| `downloads` | Saves screenshots to the user's Downloads folder (in a "Snaps" sub-folder) when they click Download or choose "download after capture". |
| `clipboardWrite` | Copies the captured or edited image to the clipboard when the user clicks Copy. |
| `contextMenus` | Adds right-click menu items ("Snaps: Capture area / visible part / full page"). |
| Host permissions | None requested. |
| Remote code | **No.** All code is bundled in the extension package. |

## Privacy practices tab – data usage answers
- Does the extension collect or use any user data? → **No data collected.** Leave every data-type checkbox **unticked**.
  (Screenshots are created by the user and stored only on their device; they are never transmitted.)
- Certify all three statements:
  - I do not sell or transfer user data to third parties, outside of the approved use cases
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose
  - I do not use or transfer user data to determine creditworthiness or for lending purposes
- Privacy policy URL → host `privacy-policy.html` (text in 02-PRIVACY_POLICY.md) and paste the public link.

## Store assets map
| Store field | File |
|---|---|
| Store icon (128×128) | `images/promo/store-icon-128.png` |
| Screenshots (5 × 1280×800) | `images/screenshots/screenshot-1…5-*.png` |
| Small promo tile (440×280) | `images/promo/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `images/promo/promo-marquee-1400x560.png` |
| Social / website banner (1500×500) | `images/promo/banner-1500x500.png` |

## Suggested screenshot captions
1. Capture any area in one drag
2. Annotate like a pro
3. Full-page screenshots, stitched for you
4. Make it share-worthy
5. Private by design. Works offline.

## Search keywords to weave into the description
screenshot, screen capture, full page screenshot, screenshot editor, annotate, blur, lightshot alternative, snipping tool
(Avoid keyword stuffing and don't name other brands in the title – Google rejects that. Mentioning "Lightshot-style" once in the body is acceptable but you can remove it to be safe.)
