# Astro Merge — CrazyGames Submission Kit

Wszystko poniżej wklejasz w formularz na https://developer.crazygames.com/

## Game name
Astro Merge

## Category
Puzzle (secondary: Casual)

## Tags
merge, physics, suika, watermelon, planets, space, drop, combo, relaxing, one-hand

## Short description (max ~140 chars)
Drop and merge planets to build the Sun! A cosmic physics puzzle with combos, chain reactions and endless "one more try" fun.

## Full description
Astro Merge is a cosmic twist on the beloved fruit-merge formula. Drop planets
into the cosmic well — when two identical planets touch, they fuse into a
bigger one: Pluto, Moon, Mercury, Mars, Venus, Earth, Neptune, Uranus, Saturn,
Jupiter... and finally the mighty SUN!

FEATURES
- Satisfying physics: planets roll, bounce and stack realistically
- Chain reactions and combo multipliers for massive scores
- 11 hand-crafted planets, from tiny Pluto to the glowing Sun
- Quick to learn, impossible to put down
- Works great with mouse or touch — play with one hand
- Your best score is saved across devices

HOW TO PLAY
1. Move your mouse (or finger) to aim
2. Click / tap to drop the planet
3. Merge identical planets to grow them
4. Don't let the pile cross the red line!
5. Build combos for multiplied points

Can you create the Sun?

## Controls text
Move mouse / drag finger — aim. Click / tap — drop planet.

## SDK integration notes (QA reviewer info)
- HTML5 SDK v3, manual init before game start
- gameplayStart/gameplayStop on play/game over/ad breaks
- loadingStart/loadingStop around boot
- Midgame ad on "Play Again" after game over
- Rewarded ad "Second Chance" (clears 40% smallest planets, resumes run)
- happytime() on big merges (Saturn tier and above)
- game.settings.muteAudio respected + settings change listener
- Best score via data module with localStorage fallback
- No external requests, all assets procedural, bundle ~100 KB
- Touch + mouse + keyboard-free; portrait-friendly, works on low-end devices

## Files to upload
- Build zip: astro-merge.zip (repo root po `npm run build` + `cd dist && zip -r ../astro-merge.zip .`)
- Cover 16:9 (1920x1080): marketing/cover-16x9.png
- Cover 1:1 (1080x1080): marketing/cover-1x1.png
- Screenshots: marketing/screenshot-menu.png, marketing/screenshot-gameplay.png

## Age rating / audience
All ages; designed for 10–16. No violence, no blood, no text chat, no user content.
