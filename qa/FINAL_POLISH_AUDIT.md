# Astro Merge — final polish audit

**Audited:** 2026-08-22  
**Build:** fresh `npm run build`, exercised locally at 907x510, 1920x1080 and
390x844. The current fixed-step, viewport, lifecycle, persistence and soak
gates were retained. I exercised the opening, retry, shop/meta path and
accelerated five-minute play. The three findings below are reproducible in the
current build; they are not a restatement of previously fixed hardening work.

1. **Chamber-loss grace is consumed while the player is in the shop (fairness).**
   At 907x510, start a debug run, spawn Suns at `(120,580)`, `(260,580)` and
   `(400,580)`, then a Venus at `(260,105)`, and advance 1.5 seconds. Open
   `SHOP`, advance four seconds, close it, then advance 0.1 seconds. The
   captured state changes from `playing, simTime=1733ms` to
   `playing, overlay=shop, simTime=5883ms`, then immediately to
   `gameover, simTime=6000ms`. The player has paused the chamber to inspect a
   meta option, but returns to a loss without a chance to respond. Root cause:
   [`src/main.js:673-693`](../src/main.js#L673-L693) advances `simTime` while an
   overlay is open but skips `checkDanger`; the old `aboveSince` timestamp is
   then charged in full on the first resumed danger check at
   [`src/main.js:513-529`](../src/main.js#L513-L529). **Evidence state:** the
   three states and timestamps above were captured through `window.__astro`.

2. **Cascade rewards become unreadable at high combos (visual clarity).**
   At 907x510, start a run, spawn four overlapping Pluto pairs around
   `(245..265,600)`, and advance 0.4 seconds. The captured state contains
   `texts=7`, `rings=12`, `particles=192`, `score=96` and `combo=6`; the
   screenshot state shows the seven `+score/xcombo` labels painted over the
   same two planets and each other. This hides the earned sequence exactly
   when a chain should feel most legible. Root cause:
   [`src/main.js:265-268`](../src/main.js#L265-L268) assigns only a rotating
   three-lane offset based on list length and never reserves vertical space;
   [`src/main.js:854-861`](../src/main.js#L854-L861) draws every label without
   collision handling. **Evidence screenshot/state:** local baseline capture
   at 907x510 plus the debug counts above.

3. **Nova advertises an actionable power-up when it cannot act (UX).**
   Buy Nova Bomb, start a new run, and inspect the initial chamber: its button
   is orange and reads `NOVA 1/1` although the authored opening has one planet.
   Pressing it leaves `bombLeft=1` and `planets=1` unchanged, with no reason or
   feedback. Under pressure this turns a visible emergency affordance into a
   silent no-op. Root cause: [`src/main.js:374-386`](../src/main.js#L374-L386)
   returns for fewer than three planets, while
   [`src/main.js:939-941`](../src/main.js#L939-L941) chooses its enabled visual
   state only from `bombLeft`. **Evidence state:** before and after pressing
   Nova: `{ bombLeft: 1, planets: 1 }`.
