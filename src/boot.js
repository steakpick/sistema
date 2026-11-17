// Entry point: in the iOS app restore saves from device storage first, then start the app.
import { restore } from './native.js';

await restore();
await import('./main.js');
