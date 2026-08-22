# Round 3 proof — Astro Merge

Verified on 2026-08-22 from this worktree's built `astro-merge/` artifact.
The server was the isolated `http://127.0.0.1:18743/index.html`; no shared
preview or external deployment was used.

## Compliance and visual evidence

- First-run gameplay shows the mouse click/drop gesture and first-merge cue;
  the new E2E regression proves it dismisses after a valid drop and remains
  dismissed after reload.
- The menu's custom orbital wordmark and the 3+ cascade impact frame were
  inspected in fresh presentation captures. The hit-stop is real-time capped
  at 65ms (under the 80ms ceiling) and honours reduced-motion.
- Fresh captures: `qa/desktop/907x510-menu.png`,
  `qa/desktop/1920x1080-menu.png`, `qa/desktop/390x844-menu.png`, plus their
  paired gameplay captures in the same directory.

## Media inspection

`ffprobe` was run on all five assets. PNGs have no duration/audio stream; both
MP4s contain a video stream only. Each video begins with its corresponding
cover for 0.7 seconds, then cuts to freshly recorded gameplay.

| Asset | Codec | Dimensions | Ratio | Duration | Size |
| --- | --- | ---: | --- | ---: | ---: |
| `marketing/cover-16x9.png` | PNG | 1920x1080 | 16:9 | n/a | 1,107,492 B |
| `marketing/cover-2x3.png` | PNG | 800x1200 | 2:3 | n/a | 515,086 B |
| `marketing/cover-1x1.png` | PNG | 800x800 | 1:1 | n/a | 407,520 B |
| `marketing/video-landscape.mp4` | H.264 | 1920x1080 | 16:9 (SAR 1:1) | 19.000s | 3,990,773 B |
| `marketing/video-portrait.mp4` | H.264 | 720x1080 | 2:3 (SAR 1:1) | 19.000s | 2,813,045 B |

The submission runtime payload is `astro-merge/`: 137,644 bytes across 2
files, below the 50MB / 1,500-file limits. Marketing media is stored separately
for portal upload.

## Gate commands and results

All commands exited 0.

```text
npm run build
node scripts/e2e.mjs http://127.0.0.1:18743/index.html
node tools/e2e-desktop.cjs http://127.0.0.1:18743/index.html
node tools/test-refresh-rate.cjs
node tools/e2e-soak.cjs http://127.0.0.1:18743/index.html
```

Results: core E2E passed (including first-run gesture persistence), all eleven
presentation viewports passed, fixed-step 60/144/165Hz determinism passed, and
the accelerated 120-second soak passed with bounded effects/listeners.
