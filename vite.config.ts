import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { optimizeImages } from './scripts/optimize-images';
export default defineConfig({
  base: './', plugins: [optimizeImages(), viteSingleFile({ removeViteModuleLoader: true })],
  server: { watch: { ignored: ['**/release/**', '**/output/**', '**/qa/**', '**/artifacts/**', '**/城市未来车厂-双击打开.html'] } },
  build: { target: 'es2022', assetsInlineLimit: 10000000, chunkSizeWarningLimit: 2500 }
});
