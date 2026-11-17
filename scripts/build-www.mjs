// Copies the web app into www/ for the iOS app (Capacitor). The site itself needs no build.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const FILES = ['index.html', 'styles.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const DIRS = ['src', 'fonts'];

rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of FILES) cpSync(f, 'www/' + f);
for (const d of DIRS) cpSync(d, 'www/' + d, { recursive: true });
console.log('www/ ready');
