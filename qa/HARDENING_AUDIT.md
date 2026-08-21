# Astro Merge hardening audit

**Audited:** 2026-08-21 (pre-implementation baseline)  
**Build exercised:** `npm run build`, then `node tools/e2e-desktop.cjs` using its
ephemeral `127.0.0.1` server. The baseline presentation smoke passed at
1280x720, 1920x1080 and 390x844 without browser errors. I also traced the
menu, first drop/merge, forced failure/restart and menu overlays through the
debug surface. This is source and automated local evidence, not a CrazyGames
portal or device-lab certification.

## Core loop, session and depth

The player positions and drops an incoming planet; equal tiers collide and
become the next tier. Score and a short combo multiplier reward chain merges;
a pile over the red line loses after a grace period. A run earns Stardust,
progresses the DEX/missions, and can unlock a skin plus one Undo, Nova Bomb and
two-step preview per run. Desktop adds useful station panels without changing
the core chamber.

## Prioritized issues

1. **P0 — simulation speed depends on display refresh.** The render loop calls
   `Engine.update(engine, 1000 / 60)` exactly once per animation frame
   (`src/main.js:623-632`), so 144/165Hz advances Matter 2.4/2.75× as fast as
   60Hz. Particle coordinates also advance in fixed pixels/frame
   (`src/main.js:649-660`).
2. **P0 — no complete required viewport gate.** `tools/e2e-desktop.cjs:9-13`
   covers only 1280x720, 1920x1080 and 390x844, omitting seven required
   landscape sizes and checks for clipped/overlapping controls.
3. **P0 — lifecycle is not a pause boundary.** Only dirty metadata is handled
   on `visibilitychange` (`src/main.js:1148-1151`); hidden/blurred tabs keep
   their rAF, Matter simulation and audio running. Ad callbacks mute but do
   not pause a run (`src/main.js:453-459`).
4. **P1 — restart has a mandatory midgame-ad path.** `PLAY AGAIN` always
   enters `restartWithAd` (`src/main.js:953-960`), making a local restart wait
   on an ad request instead of guaranteeing a sub-second reset.
5. **P1 — the danger state is not legible enough.** The only warning is a
   laser line and a randomly triggered tone (`src/main.js:487-500`,
   `src/main.js:692-695`); no projected offending zones, explicit 2.5s
   countdown, or loss reason remains on the game-over panel.
6. **P1 — merge readability is reactive only.** Pairs merge immediately once
   queued (`src/main.js:191-220`) and drawing begins after their removal
   (`src/main.js:714-751`): there is no pre-merge magnetic pull, tier ring or
   chain path. Score texts all use the same vertical lane (`src/main.js:761-769`)
   and can collide visually during cascades.
7. **P1 — power-ups lack in-run affordance.** The buttons appear only while an
   owned use remains (`src/main.js:842-843`), with no cooldown/remaining-use
   explanation or disabled discovery state; Nova also silently requires three
   bodies (`src/main.js:348-359`).
8. **P1 — merge work is linear in bodies and debug checks do not exercise
   dedupe/max-tier.** Each collision invokes two `planets.find` calls
   (`src/main.js:193-201`), and existing e2e does not assert one pair is
   consumed only once or that two Suns stay separate.
9. **P1 — persistence accepts arbitrary object shapes.** `meta.load` shallow
   assigns nested saved data (`src/meta.js:52-65`), so malformed values can
   replace expected objects and old saves have no versioned migration.
10. **P2 — platform metadata is stale and non-compliant.** Submission claims
   `Puzzle`, non-verified lower-case SEO tags and `suika`/`watermelon`
   (`marketing/SUBMISSION.md:8-15`), and calls the game a fruit-merge formula
   (`:18`); the repository map requires Arcade and its exact verified tags.

## Likely quit causes

| Moment | Quit cause |
| --- | --- |
| First 10 seconds | First instruction is clear, but display-rate acceleration can make a first drop feel inconsistent; a tap outside the chamber on desktop does nothing with no feedback. |
| First 60 seconds | Pressure can appear suddenly because the player sees only the red line/random beep, and owned power-ups do not explain when or why they can help. |
| Five minutes | Frame-rate-dependent difficulty/physics, possible hidden-tab loss, and a forced ad before retry undermine earned mastery. |

## Graphics and game-feel findings

The procedural planet art, chamber, desktop station framing, initial target and
merge flash/rings are coherent. The priority polish is anticipatory feedback:
show a target ghost and merge pull before contact, make danger spatial and
timed, give Nova/Undo a clear remaining-use state, and stack score labels so a
chain can be read instead of becoming a white-text clump.

## Requirement matrix at baseline

| Requirement | Baseline | Evidence |
| --- | --- | --- |
| Gameplay in at most one click | PASS | Menu PLAY (`src/main.js:909`) starts a useful authored merge (`:403-415`). |
| All ten DPR=1 viewports, visible controls/no overlaps | FAIL | Gate lists three sizes only (`tools/e2e-desktop.cjs:9-13`). |
| 60/144/165Hz deterministic | FAIL | One full Matter step per rAF (`src/main.js:623-632`). |
| Visibility/blur/ad lifecycle pause/resume | FAIL | Only metadata flush on visibility (`src/main.js:1148-1151`). |
| Reload + malformed/old save safety | PARTIAL | JSON parse fallback exists (`src/sdk.js:67-83`); no schema migration. |
| 120s soak with bounds/leak evidence | FAIL | No soak gate exists. |
| Keyboard, mouse, touch and 44px mobile targets | PARTIAL | All input paths exist (`src/main.js:361-388`); no full mobile target/physical-path gate. |
| SDK/audio boundaries, mute, ads | PARTIAL | Init timeout/mute and basic callbacks exist (`src/sdk.js:5-64`), but ads do not pause lifecycle and happytime is unthrottled. |
| Reduced motion/accessibility | FAIL | No `prefers-reduced-motion` handling; shake/flashes always run (`src/main.js:666`, `714-751`). |
| PEGI12/no cross-promotion/custom fullscreen | PARTIAL | No fullscreen/cross-promotion observed; current copy says “All ages” rather than submission-safe PEGI12 statement (`marketing/SUBMISSION.md:61-62`). |

## Taxonomy correction required

The exact `astro-merge` map entry requires **Arcade** (`/c/arcade`), secondary
discovery paths **Casual** and **Merge**, and these exact tags: **Casual,
Merge, Mobile, Relaxing, 2D, Mouse, Physics**. Remove Puzzle, `suika`,
`watermelon`, planets/space/drop/combo/one-hand as portal tags and all
fruit/clone framing. Natural terms may remain in prose only where accurate.

