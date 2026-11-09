import { mkdir, writeFile } from 'node:fs/promises';
import { vehicleSVG } from '../src/car-art.ts';
const target = new URL('../src/assets/vehicles/ready/', import.meta.url);
await mkdir(target, { recursive: true });
for (const body of ['city', 'touring', 'sport']) for (const view of ['side', 'top']) {
  await writeFile(new URL(`${body}-${view}.svg`, target), '<?xml version="1.0" encoding="UTF-8"?>\n' + vehicleSVG('#62bd95', body, view) + '\n');
  console.log(`Exported ${body}-${view}.svg`);
}
