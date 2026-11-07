import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rename } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(root, '../../dist');
await build({
  root,
  build: { outDir, emptyOutDir: true, rollupOptions: { input: resolve(root, 'preview.html') } },
});
await rename(resolve(outDir, 'preview.html'), resolve(outDir, 'index.html'));
