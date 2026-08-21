// Keep both the local dist preview and the checked-in CrazyGames submission
// bundle in sync. The latter is what the desktop QA server serves.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
mkdirSync('astro-merge', { recursive: true });
copyFileSync('index.html', 'astro-merge/index.html');
copyFileSync('dist/bundle.js', 'astro-merge/bundle.js');
console.log('dist/ and astro-merge/ ready');
