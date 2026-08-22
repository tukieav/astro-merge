# Round 4 proof — Astro Merge

Verified on 2026-08-22 from this worktree's rebuilt `astro-merge/` artifact
through the isolated server `http://127.0.0.1:18744/index.html`.

## Cover brightness gate

The prior 16:9 cover's recorded baseline was `darkFrac=0.55` (the Round 4
brief). The procedural renderer now uses a high-key blue/orange nebula, broad
light beams, and two large glossy merging planets. The new gate decodes PNG
pixels via ffmpeg and requires `meanLum >= 80`, `darkFrac <= 0.35`, and
`meanSat >= 0.35`.

| Cover | Before dark fraction | Mean luminance | Dark fraction | Mean saturation | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| 16:9 1920x1080 | 0.55 | 167.90 | 0.0000 | 0.4286 | PASS |
| 16:9 small 800x450 | n/a | 168.01 | 0.0000 | 0.4272 | PASS |
| 2:3 800x1200 | n/a | 166.40 | 0.0000 | 0.4213 | PASS |
| 1:1 800x800 | n/a | 164.48 | 0.0000 | 0.4391 | PASS |

Fresh 907x510 presentation captures are committed as
`qa/round4-cover-907x510.png` and `qa/round4-menu-907x510.png`.

## Refreshed media

Both silent previews were freshly recorded after the menu work, then rebuilt
with their matching new cover held as the opening frame for 0.7 seconds.

| Video | Codec | Dimensions | Ratio | Duration | Audio | Size |
| --- | --- | ---: | --- | ---: | --- | ---: |
| `marketing/video-landscape.mp4` | H.264 | 1920x1080 | 16:9 (SAR 1:1) | 19.000s | none | 3,865,644 B |
| `marketing/video-portrait.mp4` | H.264 | 720x1080 | 2:3 (SAR 1:1) | 19.000s | none | 3,091,436 B |

`marketing/screenshot-menu.png` and the viewport menu captures were also
refreshed after the brighter menu treatment.

## Gate commands

All commands exited 0.

```text
npm run build
node scripts/e2e.mjs http://127.0.0.1:18744/index.html
node tools/e2e-desktop.cjs http://127.0.0.1:18744/index.html
node tools/test-refresh-rate.cjs
node tools/e2e-soak.cjs http://127.0.0.1:18744/index.html
npm run test:cover
ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,sample_aspect_ratio:format=duration,size -of default=noprint_wrappers=1 marketing/video-landscape.mp4
ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,sample_aspect_ratio:format=duration,size -of default=noprint_wrappers=1 marketing/video-portrait.mp4
```

Results: core E2E passed with zero page/console errors; every one of the 11
desktop/mobile presentation targets passed; fixed-step 60/144/165Hz
determinism passed; and the accelerated 120-second soak finished with bounded
effects, 13 listeners, and zero timers.
