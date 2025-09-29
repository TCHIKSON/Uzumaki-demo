import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const outDir  = path.join(root, 'public', 'vendor');

await fs.mkdir(outDir, { recursive: true });

// --- HLS ---
const hlsSpec = 'hls.js/dist/hls.min.js';
let hlsPath;
try {
  hlsPath = require.resolve(hlsSpec);
} catch {
  console.error('❌ hls.js introuvable. Fais: npm i hls.js');
  process.exit(1);
}
await fs.writeFile(path.join(outDir, 'hls.min.js'), await fs.readFile(hlsPath));
console.log('copied hls.min.js ->', path.relative(root, path.join(outDir, 'hls.min.js')));

// --- DASH (essaie plusieurs variantes) ---
const dashCandidates = [
  'dashjs/dist/dash.all.min.js',
  'dashjs/dist/dash.mediaplayer.min.js',
  'dashjs/dist/dash.all.debug.js',
  'dashjs/dist/dash.mediaplayer.debug.js',
  'dashjs/dist/dash.all.js',
  'dashjs/dist/dash.mediaplayer.js',
];

let dashSrc = null;
for (const spec of dashCandidates) {
  try {
    dashSrc = require.resolve(spec);
    break;
  } catch {}
}

if (!dashSrc) {
  console.warn('⚠️  dashjs introuvable ou build non standard. Installe-le:');
  console.warn('   npm i dashjs   (ou épingle: npm i dashjs@4.7.4)');
  // on n’échoue pas; le player HLS fonctionnera quand même
} else {
  // on copie toujours sous un nom stable pour le HTML
  const dst = path.join(outDir, 'dash.all.min.js');
  await fs.writeFile(dst, await fs.readFile(dashSrc));
  console.log('copied dashjs ->', path.relative(root, dst));
}
