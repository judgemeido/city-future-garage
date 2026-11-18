import sharp from 'sharp';
import type { Plugin } from 'vite';

/** Compress embedded photographs without changing their dimensions or source files. */
export function optimizeImages(): Plugin {
  return {
    name: 'garage-optimize-images',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const cache = new Map<string, string>();
      let before = 0, after = 0;
      for (const entry of Object.values(bundle)) {
        if (entry.type !== 'chunk') continue;
        const urls = [...new Set(entry.code.match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g) ?? [])];
        for (const url of urls) {
          let optimized = cache.get(url);
          if (!optimized) {
            const original = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
            const bytes = await sharp(original).webp({ quality: 82, effort: 6 }).toBuffer();
            optimized = bytes.length < original.length ? `data:image/webp;base64,${bytes.toString('base64')}` : url;
            cache.set(url, optimized);
            before += original.length;
            after += Math.min(original.length, bytes.length);
          }
          entry.code = entry.code.replaceAll(url, optimized);
        }
      }
      this.info(`Photographs: ${cache.size}, ${(before / 1024).toFixed(0)} → ${(after / 1024).toFixed(0)} KiB; original dimensions retained.`);
    },
  };
}
