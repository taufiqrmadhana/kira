// Isolated validation until Andrew's app shell is available. No production entry is changed.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const web = resolve(root, '../../..');
const dependencyPackage = existsSync(resolve(web, 'node_modules/vite'))
  ? resolve(web, 'package.json') : resolve(web, 'src/kira/package.json');
const require = createRequire(dependencyPackage);
const { build, createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const config = {
  root,
  cacheDir: resolve(web, '../artifacts/step4-vite'),
  resolve: { alias: [
    { find: /^react$/, replacement: require.resolve('react') },
    { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime') },
    { find: /^react\/jsx-dev-runtime$/, replacement: require.resolve('react/jsx-dev-runtime') },
    { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') },
  ] },
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [web] }, proxy: { '/api': 'http://127.0.0.1:8011' } },
  build: { outDir: resolve(web, '../artifacts/step4-build'), emptyOutDir: false, rolldownOptions: { input: resolve(root, 'Step4.preview.html') } },
};
if (process.argv.includes('--build')) await build(config);
else { const server = await createServer(config); await server.listen(); server.printUrls(); }
