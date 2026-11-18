import { SIDE_PATHS, TOP_PATHS, type VectorPath } from './vehicle-paths.ts';

/** Future Autonomous EV side & top vector models shared across SVG export and Canvas stages.
 * Native vectors draw synchronously, without images or remote requests.
 */
type Body = 'city' | 'touring' | 'sport';
const bodyFor = (body: string): Body => (body === 'touring' || body === 'sport' ? body : 'city');
const names: Record<Body, string> = {
  city: '星驰智驾轿跑',
  touring: '星舰智驾SUV',
  sport: '极光电动超跑',
};
const safeColor = (color: string) => (/^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : '#62bd95');

function mix(color: string, target: string, amount: number) {
  const a = parseInt(color.slice(1), 16), b = parseInt(target.slice(1), 16);
  return (
    '#' +
    [16, 8, 0]
      .map(shift =>
        Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

function palette(color: string): Record<string, string> {
  const paint = safeColor(color);
  return {
    paint,
    shade: mix(paint, '#102136', 0.28),
    deep: mix(paint, '#091524', 0.56),
    light: mix(paint, '#ffffff', 0.42),
    hi: mix(paint, '#ffffff', 0.70),
    accent: '#f5bc65',
    glass: '#0e2036',
    glassMid: '#1e3e5c',
    glassHi: '#90e3ff',
    dark: '#142030',
    tire: '#1a2535',
    rim: '#d0e2f0',
    spoke: '#2d4157',
    headlight: '#effdff',
    cyan: '#47eaff',
    taillight: '#ff476c',
    caliper: '#f5bc65',
  };
}

const shapeCache = new Map<string, Path2D>();
function shape(d: string) {
  let path = shapeCache.get(d);
  if (!path) {
    path = new Path2D(d);
    shapeCache.set(d, path);
  }
  return path;
}

function pathsFor(body: Body, view: 'side' | 'top'): VectorPath[] {
  return view === 'top' ? TOP_PATHS[body] : SIDE_PATHS[body];
}

/** Standalone SVG for inline use, CSS scaling and offline PNG export. */
export function vehicleSVG(color = '#62bd95', body = 'city', view: 'side' | 'top' = 'side', rotation = 0): string {
  const model = bodyFor(body), paints = palette(color);
  const angle = Number.isFinite(rotation) ? (-rotation * 180) / Math.PI : 0;
  const paths = pathsFor(model, view)
    .map(path => {
      const fill = paints[path.fill] ?? path.fill;
      const op = path.opacity !== undefined ? ` fill-opacity="${path.opacity}"` : '';
      const tr = path.pivot ? ` transform="rotate(${angle} ${path.pivot.join(' ')})"` : '';
      return `<path d="${path.d}" fill="${fill}"${op}${tr}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view === 'top' ? '-50 -32 100 64' : '-100 -88 200 126'}" role="img" aria-label="${names[model]}${view === 'top' ? '俯视图' : '侧视图'}"><title>${names[model]}</title>${paths}</svg>`;
}

export const premiumCarSVG = (color = '#62bd95', body = 'city') => vehicleSVG(color, body);

function drawVector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  scale: number,
  body: string,
  view: 'side' | 'top',
  rotation: number
) {
  const model = bodyFor(body), paints = palette(color);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (view === 'side') {
    // Subtle ground contact shadow + cyan underglow reflection
    ctx.fillStyle = 'rgba(4, 12, 24, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 35, 86, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(71, 234, 255, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 34, 62, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Soft top-view ambient shadow & subtle headlight glow
    ctx.fillStyle = 'rgba(4, 12, 24, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    const beam = ctx.createLinearGradient(42, 0, 82, 0);
    beam.addColorStop(0, 'rgba(148, 245, 255, 0.32)');
    beam.addColorStop(1, 'rgba(148, 245, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(42, -13);
    ctx.lineTo(82, -24);
    ctx.lineTo(82, 24);
    ctx.lineTo(42, 13);
    ctx.closePath();
    ctx.fill();
  }

  for (const path of pathsFor(model, view)) {
    ctx.save();
    if (path.pivot) {
      const [px, py] = path.pivot;
      ctx.translate(px, py);
      ctx.rotate(Number.isFinite(rotation) ? rotation : 0);
      ctx.translate(-px, -py);
    }
    if (path.opacity !== undefined) ctx.globalAlpha *= path.opacity;
    ctx.fillStyle = paints[path.fill] ?? path.fill;
    ctx.fill(shape(path.d));
    ctx.restore();
  }

  // Subtle LED headlight & taillight halo on side view
  if (view === 'side') {
    const hl = ctx.createRadialGradient(85, -8, 1, 92, -6, 26);
    hl.addColorStop(0, 'rgba(140, 245, 255, 0.48)');
    hl.addColorStop(1, 'rgba(140, 245, 255, 0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(92, -6, 26, 0, Math.PI * 2);
    ctx.fill();

    const tl = ctx.createRadialGradient(-85, -7, 1, -86, -7, 16);
    tl.addColorStop(0, 'rgba(255, 71, 108, 0.45)');
    tl.addColorStop(1, 'rgba(255, 71, 108, 0)');
    ctx.fillStyle = tl;
    ctx.beginPath();
    ctx.arc(-86, -7, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawPremiumCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = '#62bd95',
  scale = 1,
  wheelRotation = 0,
  body = 'city'
) {
  drawVector(ctx, x, y, color, scale, body, 'side', wheelRotation);
}

export function drawPremiumTopCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = '#62bd95',
  scale = 1,
  body = 'city'
) {
  drawVector(ctx, x, y, color, scale, body, 'top', 0);
}
