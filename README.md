# Astro Merge

Suika-style (merge-drop) fizyczna gra dla nastolatków 10–16, zbudowana pod dystrybucję na CrazyGames.

Mechanika (sprawdzony, uzależniający wzorzec "Suika Game / Watermelon Game"):
- Upuszczasz planety do studni. Dwie identyczne łączą się w większą (Pluto -> Moon -> ... -> Sun).
- Combo mnoży punkty; przekroczenie czerwonej linii = game over (z 2.5s łaski).
- Ładne proceduralne planety (Canvas 2D), gwiazdy, partikle, screen shake, dźwięk WebAudio (zero plików audio/grafiki = mikroskopijny bundle ~100 KB).

## Monetyzacja / CrazyGames SDK v3 (pełna integracja)
- `sdk.init()` przy starcie, `loadingStart/Stop`, `gameplayStart/Stop`
- Midgame ad przy "PLAY AGAIN" po game over
- Rewarded ad: "SECOND CHANCE" — usuwa 40% najmniejszych planet i pozwala grać dalej (klasyczny hook: gracz OGLĄDA reklamę żeby ratować wynik)
- `happytime()` przy dużych merge'ach (tier Saturn+)
- `muteAudio` z ustawień SDK respektowane (wymóg Full Implementation)
- Best score przez moduł `data` SDK (cross-device) z fallbackiem localStorage

## Build
```
npm install
npm run build     # -> dist/ (index.html + bundle.js), gotowe do zipa
npm run dev       # lokalny serwer z watch
```

## Submisja na CrazyGames
1. `cd dist && zip -r ../astro-merge.zip .`
2. https://developer.crazygames.com/ -> Submit game -> HTML5 -> upload zip
3. Metadane: kategoria Puzzle/Casual, tagi: merge, physics, suika, planets, space
4. Covery: wymagane 16:9 (1920x1080) i 1:1 — zrób z screenshotów gameplayu
5. Rozmiar buildu ~100 KB — kwalifikuje się na mobile homepage (<20 MB)

Gra działa na desktop (mysz) i mobile (touch), portrait-friendly z czarnymi pasami.

## Testy wykonane
- Playwright + Chrome headless: menu, drop, merge, combo, scoring, game over,
  rewarded second chance (real SDK test ad na localhost), midgame ad, restart. Zero błędów konsoli.
