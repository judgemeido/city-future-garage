import { SIDE_PATHS, type VectorPath } from './vehicle-paths.ts';

/** Noto side profiles and matching top views share SVG/Canvas geometry.
 * Native vectors draw synchronously, without images or remote requests.
 */
type Body = 'city' | 'touring' | 'sport';
const bodyFor = (body: string): Body => body === 'touring' || body === 'sport' ? body : 'city';
const names: Record<Body, string> = { city: '豆豆城市车', touring: '山野旅行车', sport: '闪电电动赛车' };
const safeColor = (color: string) => /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : '#62bd95';
function mix(color: string, target: string, amount: number) {
  const a = parseInt(color.slice(1), 16), b = parseInt(target.slice(1), 16);
  return '#' + [16, 8, 0].map(shift => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount).toString(16).padStart(2, '0')).join('');
}
function palette(color: string): Record<string, string> {
  const paint = safeColor(color);
  return { paint, shade: mix(paint, '#243a44', .18), deep: mix(paint, '#243a44', .42), light: mix(paint, '#ffffff', .45), accent: '#e8b555' };
}
const topPath = (d: string, fill: string): VectorPath => ({ d, fill });
const TOP_PATHS: Record<Body, VectorPath[]> = {
  city: [
    topPath('M-31-26h14v7h-14zM-31 19h14v7h-14zM21-25h14v7H21zM21 18h14v7H21z', '#29363d'),
    topPath('M-42-12Q-42-23-30-23H23Q42-22 44-11V11Q42 22 23 23H-30Q-42 23-42 12Z', 'shade'),
    topPath('M-39-12Q-39-20-29-20H24Q39-19 40-10V10Q39 19 24 20H-29Q-39 20-39 12Z', 'paint'),
    topPath('M-25-16Q-27-19-32-16L-34-10V10L-32 16Q-27 19-25 16Z', '#3e5964'),
    topPath('M-23-18H5L21-12V12L5 18H-23Z', '#3e5964'),
    topPath('M7-15L18-10V10L7 15Z', '#cbe6e9'),
    topPath('M-23-15H3V15H-23Z', 'light'),
    topPath('M-20-12H0V12H-20Z', 'paint'),
    topPath('M26-16L36-13L39-9L28-11ZM28 11L39 9L36 13L26 16Z', '#fff7df'),
    topPath('M-40-14h3v8h-3zM-40 6h3v8h-3z', '#d9796f'),
    topPath('M10-20L14-26L20-25L18-20ZM10 20L14 26L20 25L18 20Z', 'shade'),
    topPath('M25-6H36V-4H25ZM25 4H36V6H25Z', 'light'),
  ],
  touring: [
    topPath('M-34-28h17v8h-17zM-34 20h17v8h-17zM24-27h15v8H24zM24 19h15v8H24z', '#29363d'),
    topPath('M-45-17Q-45-25-36-25H28Q45-24 46-12V12Q45 24 28 25H-36Q-45 25-45 17Z', 'shade'),
    topPath('M-42-17Q-42-22-35-22H28Q42-21 43-11V11Q42 21 28 22H-35Q-42 22-42 17Z', 'paint'),
    topPath('M-47-12h5v24h-5z', '#29363d'),
    topPath('M-34-17H8L24-12V12L8 17H-34Z', '#3e5964'),
    topPath('M10-14L21-10V10L10 14Z', '#cbe6e9'),
    topPath('M-31-14H5V14H-31Z', 'light'),
    topPath('M-28-11H2V11H-28Z', 'paint'),
    topPath('M-31-20H6V-18H-31ZM-31 18H6V20H-31Z', '#dce3e4'),
    topPath('M-24-10H-5V10H-24Z', 'deep'),
    topPath('M-21-7h2V7h-2zM-16-7h2V7h-2zM-11-7h2V7h-2z', 'light'),
    topPath('M32-18h7l3 8h-9ZM33 10h9l-3 8h-7Z', '#fff7df'),
    topPath('M13-22L18-28H23L22-22ZM13 22L18 28H23L22 22Z', 'shade'),
  ],
  sport: [
    topPath('M-31-28h17v11h-17zM-31 17h17v11h-17zM22-27h16v10H22zM22 17h16v10H22z', '#29363d'),
    topPath('M-40-20H-22L-8-14H8L20-8L45-4V4L20 8L8 14H-8L-22 20H-40Z', 'shade'),
    topPath('M-37-16H-23L-9-11H8L22-5L43-3V3L22 5L8 11H-9L-23 16H-37Z', 'paint'),
    topPath('M-41-26h6v52h-6zM35-20h5v40h-5z', 'deep'),
    topPath('M-26-13H-12V13H-26Z', 'light'),
    topPath('M-11-9Q1-13 9-5V5Q1 13-11 9Z', '#29363d'),
    topPath('M-5-5Q3-8 7-3V3Q3 8-5 5Z', '#cbe6e9'),
    topPath('M11-2H32V2H11Z', '#fff7df'),
    topPath('M-22-25h4v4h-4zM-22 21h4v4h-4zM26-24h4v4h-4zM26 20h4v4h-4z', 'accent'),
    topPath('M-19-13H-13V-10H-19ZM-19 10H-13V13H-19Z', 'deep'),
  ],
};
const shapeCache = new Map<string, Path2D>();
function shape(d: string) {
  let path = shapeCache.get(d);
  if (!path) { path = new Path2D(d); shapeCache.set(d, path); }
  return path;
}
const ANIMATED_SIDE_PATHS = Object.fromEntries((Object.keys(names) as Body[]).map(body => [body,
  SIDE_PATHS[body].flatMap(path => {
    if (!path.pivot) return [path];
    const [x, y] = path.pivot;
    return [path, { d: `M${x - 1} ${y - 6}h2v5l4 2-1 2-5-2-4 3-1-2 4-3Z`, fill: '#647d88', pivot: path.pivot }];
  })
])) as Record<Body, VectorPath[]>;
function pathsFor(body: Body, view: 'side' | 'top'): VectorPath[] {
  return view === 'top' ? TOP_PATHS[body] : ANIMATED_SIDE_PATHS[body];
}
const SIDE_TRANSFORM = 'matrix(-1.4 0 0 1.4 89.6 -140.6)';
/** Standalone SVG for inline use, CSS scaling and offline PNG export. */
export function vehicleSVG(color = '#62bd95', body = 'city', view: 'side' | 'top' = 'side', rotation = 0): string {
  const model = bodyFor(body), paints = palette(color);
  const angle = Number.isFinite(rotation) ? -rotation * 180 / Math.PI : 0;
  const paths = pathsFor(model, view).map(path => `<path d="${path.d}" fill="${paints[path.fill] ?? path.fill}"${path.pivot ? ` transform="rotate(${angle} ${path.pivot.join(' ')})"` : ''}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view === 'top' ? '-50 -32 100 64' : '-100 -88 200 126'}" role="img" aria-label="${names[model]}${view === 'top' ? '俯视图' : '侧视图'}"><title>${names[model]}</title>${view === 'side' ? `<g transform="${SIDE_TRANSFORM}">${paths}</g>` : paths}</svg>`;
}
export const premiumCarSVG = (color = '#62bd95', body = 'city') => vehicleSVG(color, body);
function drawVector(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale: number, body: string, view: 'side' | 'top', rotation: number) {
  const model = bodyFor(body), paints = palette(color);
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (view === 'side') {
    ctx.fillStyle = '#29403d20'; ctx.beginPath(); ctx.ellipse(0, 34, 82, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.transform(-1.4, 0, 0, 1.4, 89.6, -140.6);
  }
  for (const path of pathsFor(model, view)) {
    ctx.save();
    if (path.pivot) {
      const [px, py] = path.pivot;
      ctx.translate(px, py); ctx.rotate(Number.isFinite(rotation) ? -rotation : 0); ctx.translate(-px, -py);
    }
    ctx.fillStyle = paints[path.fill] ?? path.fill;
    ctx.fill(shape(path.d)); ctx.restore();
  }
  ctx.restore();
}
export function drawPremiumCar(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#62bd95', scale = 1, wheelRotation = 0, body = 'city') {
  drawVector(ctx, x, y, color, scale, body, 'side', wheelRotation);
}
export function drawPremiumTopCar(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#62bd95', scale = 1, body = 'city') {
  drawVector(ctx, x, y, color, scale, body, 'top', 0);
}
