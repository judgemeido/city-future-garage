/** Resolution-independent side profiles. The wheel baseline matches drawCar. */
type CarBody = 'city' | 'touring' | 'sport';
interface Profile {
  shell: string; glass: string; rearGlass: string; frontGlass: string;
  roof: string; belt: string; rearDoor: string; frontDoor: string;
  rearWheel: number; frontWheel: number; mirror: number;
}
const PROFILES: Record<CarBody, Profile> = {
  city: {
    shell: 'M-84 7C-85-4-81-13-71-17L-57-21L-41-45Q-36-50-22-50L8-50Q23-50 34-40L52-23Q73-19 84-12Q90-8 90 4L87 18L-81 18Z',
    glass: 'M-55-23L-38-44Q-35-46-25-46L7-46Q22-46 30-37L43-23Z',
    rearGlass: 'M-54-24L-37-43Q-34-45-25-45L-11-45L-11-24Z',
    frontGlass: 'M-6-45L7-45Q20-45 29-36L40-24L-6-24Z',
    roof: 'M-57-21L-41-45Q-36-50-22-50L8-50Q23-50 34-40L52-23',
    belt: 'M-76-15Q-29-17 17-17Q55-17 80-11',
    rearDoor: 'M-37-21Q-41-7-37 7Q-33 12-24 13L-9 13L-9-22',
    frontDoor: 'M-7-21L39-21Q45-6 38 10Q36 13 29 13L-7 13Z',
    rearWheel: -48, frontWheel: 53, mirror: 41,
  },
  touring: {
    shell: 'M-88 8Q-89-8-80-16L-61-23L-46-46Q-41-50-25-50L22-50Q33-50 42-40L56-23L78-17Q93-13 93 1L90 19L-84 19Z',
    glass: 'M-60-24L-44-44Q-40-46-26-46L21-46Q31-46 39-37L49-24Z',
    rearGlass: 'M-58-25L-43-43Q-39-45-26-45L-8-45L-8-25Z',
    frontGlass: 'M-3-45L20-45Q30-45 37-36L46-25L-3-25Z',
    roof: 'M-61-23L-46-46Q-41-50-25-50L22-50Q33-50 42-40L56-23',
    belt: 'M-81-16Q-34-18 15-18Q60-18 85-12',
    rearDoor: 'M-41-23Q-45-9-39 8Q-36 13-28 13L-6 13L-6-24',
    frontDoor: 'M-3-23L44-23Q49-7 42 10Q39 13 32 13L-3 13Z',
    rearWheel: -52, frontWheel: 57, mirror: 46,
  },
  sport: {
    shell: 'M-88 9Q-87-7-74-15L-45-20Q-28-43-8-46Q16-49 38-34L58-22L81-16Q93-12 93 2L90 18L-85 18Z',
    glass: 'M-43-22Q-26-42-7-43Q13-46 34-31L47-23Z',
    rearGlass: 'M-40-23Q-24-41-8-42L-5-24Z',
    frontGlass: 'M0-43Q14-43 33-30L44-24L0-24Z',
    roof: 'M-45-20Q-28-43-8-46Q16-49 38-34L58-22',
    belt: 'M-80-14Q-28-17 22-18Q62-18 85-12',
    rearDoor: 'M-35-20Q-38-5-34 9Q-32 12-25 13L-1 13L-3-23',
    frontDoor: 'M1-23L42-22Q48-5 40 10Q38 13 31 13L1 13Z',
    rearWheel: -52, frontWheel: 57, mirror: 44,
  },
};
const profileFor = (body: string) => PROFILES[body as CarBody] ?? PROFILES.city;
const windowSill = (body: string) => body === 'sport' ? 'M-43-22L47-23' : body === 'touring' ? 'M-60-24L49-24' : 'M-55-23L43-23';
const shapeCache = new Map<string, Path2D>();
function shapeFor(data: string): Path2D {
  let shape = shapeCache.get(data);
  if (!shape) { shape = new Path2D(data); shapeCache.set(data, shape); }
  return shape;
}
const safeColor = (color: string) => /^#[\da-f]{6}$/i.test(color) ? color : '#5bb89d';
function mix(color: string, towards: string, amount: number): string {
  const a = parseInt(color.slice(1), 16), b = parseInt(towards.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
function palette(color: string) {
  const base = safeColor(color);
  return { base, light: mix(base, '#ffffff', .58), pale: mix(base, '#ffffff', .84),
    shade: mix(base, '#142d38', .38), deep: mix(base, '#102431', .65) };
}
function path(ctx: CanvasRenderingContext2D, data: string, fill?: string | CanvasGradient, stroke?: string, width = .55) {
  const shape = shapeFor(data);
  if (fill) { ctx.fillStyle = fill; ctx.fill(shape); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(shape); }
}
function gradient(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stops: [number, string][]) {
  const paint = ctx.createLinearGradient(x1, y1, x2, y2);
  stops.forEach(([at, color]) => paint.addColorStop(at, color));
  return paint;
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | CanvasGradient, stroke?: string, width = .5) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function rectangle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke?: string, width = .5) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, rotation: number, sporty: boolean) {
  ctx.save(); ctx.translate(x, 16);
  const tyre = ctx.createRadialGradient(-4, -6, 3, 0, 0, 17);
  tyre.addColorStop(0, '#56616a'); tyre.addColorStop(.64, '#242d35'); tyre.addColorStop(.91, '#141b21'); tyre.addColorStop(1, '#2e3840');
  circle(ctx, 0, 0, 17, tyre, '#152029', .45);
  circle(ctx, 0, 0, 14.8, '#27333d', '#58636c', .32);
  // The fixed brake caliper sits behind the rotating alloy spokes.
  const alloy = gradient(ctx, -12, -12, 12, 12, [[0, '#f3f6f8'], [.32, '#bbc8d2'], [.57, '#6b7f8f'], [1, '#d5e0e8']]);
  circle(ctx, 0, 0, 12.6, alloy, '#edf2f5', .5);
  circle(ctx, 0, 0, 11.3, '#273542');
  circle(ctx, 0, 0, 9.6, '#7c8a94', '#a8b3ba', .35);
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8; circle(ctx, Math.cos(angle) * 8, Math.sin(angle) * 8, .42, '#465664');
  }
  rectangle(ctx, 6.8, -4.1, 3.6, 8.2, 1.1, sporty ? '#c45d48' : '#bccbca', '#65756f', .3);
  ctx.rotate(rotation);
  const spoke = gradient(ctx, -7, -12, 9, 12, [[0, '#fbfdff'], [.45, sporty ? '#80929f' : '#d7e1e8'], [.7, '#596d7d'], [1, '#cbd8e0']]);
  for (let i = 0; i < 10; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 5);
    path(ctx, 'M-1.15-2.5L-2.5-10.9Q-1.6-12.2-.35-12.15L1.7-3.1Z', spoke, '#a7b8c6', .23);
    path(ctx, 'M.65-3.1L3.3-10.65L4.05-10.2L2.15-2.5Z', '#e4ecf1', '#637988', .16);
    ctx.restore();
  }
  circle(ctx, 0, 0, 3.1, alloy, '#4b6374', .5);
  circle(ctx, 0, 0, 1.9, '#2b4352');
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4; circle(ctx, Math.cos(a) * 2.2, Math.sin(a) * 2.2, .32, '#edf4f8');
  }
  path(ctx, 'M-.8.65L0-.7L.8.65', undefined, '#b8dcd4', .45);
  ctx.restore();
}

/** Wheels: centers y=16, radius 17. Paint and geometry remain crisp at any scale. */
export function drawPremiumCar(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#5bb89d', scale = 1, wheelRotation = 0, body = 'city') {
  const p = profileFor(body), c = palette(color), sporty = body === 'sport';
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const shadow = ctx.createRadialGradient(0, 33, 9, 0, 33, 94);
  shadow.addColorStop(0, '#203a483c'); shadow.addColorStop(.62, '#203a4824'); shadow.addColorStop(1, '#203a4800');
  ctx.save(); ctx.translate(0, 33); ctx.scale(1, .1); circle(ctx, 0, 0, 96, shadow); ctx.restore();
  // A subdued chassis below the body creates real depth around the sills.
  rectangle(ctx, -74, 10, 153, 8.2, 3, '#202e38');
  const paint = gradient(ctx, 0, -51, 0, 20, [[0, c.pale], [.15, c.light], [.4, c.base], [.56, c.light], [.63, c.base], [.88, c.shade], [1, c.deep]]);
  path(ctx, p.shell, paint, c.deep, .7);
  ctx.save(); ctx.clip(shapeFor(p.shell));
  const reflection = gradient(ctx, 0, -17, 0, 10, [[0, '#ffffff00'], [.28, '#ffffff54'], [.39, '#ffffff25'], [.68, '#ffffff00'], [1, '#152d3d2b']]);
  path(ctx, 'M-87-15Q-20-12 32-14Q64-17 94-10L95 6Q39-2-8 1Q-43 4-88 7Z', reflection);
  const lowerPaint = gradient(ctx, 0, 1, 0, 19, [[0, '#19394800'], [.72, '#173a4445'], [1, '#0f293650']]);
  path(ctx, 'M-87 7Q-14 17 93 1L94 22L-90 22Z', lowerPaint);
  path(ctx, 'M-74-12Q-20-14 25-14Q61-15 80-9', undefined, '#ffffff9e', .45);
  path(ctx, 'M-75 9Q-24 15 34 11L82 8', undefined, c.light, .38);
  for (const wheel of [p.rearWheel, p.frontWheel]) {
    circle(ctx, wheel, 16, 19, '#182933', c.deep, .5);
    ctx.beginPath(); ctx.arc(wheel, 16, 19.5, Math.PI * 1.04, Math.PI * 1.94); ctx.strokeStyle = c.light; ctx.lineWidth = .7; ctx.stroke();
    ctx.beginPath(); ctx.arc(wheel, 16, 20.4, Math.PI * 1.15, Math.PI * 1.83); ctx.strokeStyle = c.shade; ctx.lineWidth = .5; ctx.stroke();
  }
  ctx.restore();
  // Pillars and smoked glass share exactly the same outline as the SVG version.
  path(ctx, p.glass, '#172c39', '#273e4b', .55);
  const glass = gradient(ctx, -30, -47, 28, -21, [[0, '#5d7b8b'], [.31, '#294b60'], [.67, '#153342'], [1, '#344e58']]);
  path(ctx, p.rearGlass, glass); path(ctx, p.frontGlass, glass);
  ctx.save(); ctx.clip(shapeFor(p.glass));
  path(ctx, 'M-38-53L-21-53L12-16L2-16Z', '#d5f2fb2a');
  path(ctx, 'M10-52L15-52L46-17L39-17Z', '#e5f6ff52');
  path(ctx, 'M-67-29Q-14-39 51-31L53-28Q-14-35-63-27Z', '#b9dce922');
  path(ctx, 'M-57-25Q-13-27 45-25', undefined, '#a9cad373', .45);
  ctx.restore();
  path(ctx, p.roof, undefined, '#ffffff9c', .65);
  path(ctx, p.belt, undefined, c.deep, .55);
  path(ctx, p.rearDoor, undefined, c.deep, .38);
  path(ctx, p.frontDoor, undefined, c.deep, .42);
  // Thin chrome surrounds and flush handles preserve the silhouette.
  path(ctx, windowSill(body), undefined, '#b6cace', .5);
  for (const handleX of [body === 'sport' ? -25 : -30, body === 'touring' ? 25 : 20]) {
    rectangle(ctx, handleX, -15.1, 7.6, 1.8, .7, c.deep);
    rectangle(ctx, handleX + .6, -15.2, 6.2, .7, .3, '#d8e8e784');
  }
  rectangle(ctx, -75, -7.4, 8.5, 7.5, 1.6, c.base, c.deep, .4);
  path(ctx, 'M-73.5-5.7L-68-5.7', undefined, c.light, .5);
  circle(ctx, -71, -2, .8, c.deep);
  // Black mirror mount, painted housing and a fine reflective inset.
  path(ctx, `M${p.mirror - 3}-22L${p.mirror + 2}-16L${p.mirror + 6}-18L${p.mirror + 3}-23Z`, '#203b46');
  path(ctx, `M${p.mirror}-25Q${p.mirror + 3}-29 ${p.mirror + 9}-26L${p.mirror + 12}-23Q${p.mirror + 11}-20 ${p.mirror + 7}-20L${p.mirror}-22Z`, c.light, c.deep, .5);
  path(ctx, `M${p.mirror + 2}-25L${p.mirror + 8}-24`, undefined, '#f2f9f7', .55);
  // Rear light blade, rear bumper, flush EV nose and separate DRL optics.
  path(ctx, 'M-83-11L-78-12L-77-4L-84-3Z', '#702c30', '#4d2830', .4);
  path(ctx, 'M-83-10L-78-11L-77-8L-83-7Z', '#ff8f80');
  path(ctx, 'M-85 6L-77 6L-76 13L-83 15Z', '#2a3c45', '#536772', .4);
  path(ctx, 'M-83 8L-78 8', undefined, '#c36e63', .65);
  path(ctx, 'M72-13L86-10L87-6L74-8Z', '#253c47', '#465e69', .4);
  path(ctx, 'M73-12L85-9', undefined, '#ecfbff', 1.35);
  path(ctx, 'M76-9L85-7', undefined, '#b9e5ed', .6);
  path(ctx, 'M85-1L90 0L88 7L82 7Z', '#263b45');
  path(ctx, 'M84 1L88 2', undefined, '#bbd3d8', .7);
  path(ctx, 'M78 13L89 11L87 16L77 17Z', '#1b303c');
  path(ctx, 'M79 13L87 12', undefined, '#647983', .6);
  path(ctx, `M${p.rearWheel + 20} 15L${p.frontWheel - 20} 15L${p.frontWheel - 19} 18L${p.rearWheel + 18} 18Z`, '#243b46', '#68838c', .4);
  path(ctx, `M${p.rearWheel + 21} 14L${p.frontWheel - 20} 14`, undefined, '#bdd8d37d', .6);
  if (body === 'touring') {
    path(ctx, 'M-29-51L23-51', undefined, '#263e47', 1.15);
    path(ctx, 'M-24-52L17-52', undefined, '#b7c9cc', .55);
    path(ctx, 'M-63-24L-59-19', undefined, '#172f3c', 2.3);
  } else if (sporty) {
    path(ctx, 'M-81-16L-64-17L-57-19', undefined, '#213644', 1.15);
    path(ctx, 'M64 0L74-1', undefined, c.deep, .6);
  }
  drawWheel(ctx, p.rearWheel, wheelRotation, sporty);
  drawWheel(ctx, p.frontWheel, wheelRotation, sporty);
  ctx.restore();
}

let svgIndex = 0;
/** Standalone vector artwork for thumbnails and print. No bitmap scaling. */
export function premiumCarSVG(color = '#5bb89d', body = 'city'): string {
  const p = profileFor(body), c = palette(color), id = `ev-car-${++svgIndex}`;
  const wheel = (x: number) => `<g transform="translate(${x} 16)"><circle r="17" fill="url(#${id}-tyre)" stroke="#17232c" stroke-width=".45"/><circle r="14.8" fill="#27333d" stroke="#58636c" stroke-width=".32"/><circle r="12.6" fill="url(#${id}-metal)" stroke="#edf2f5" stroke-width=".5"/><circle r="11.3" fill="#273542"/><circle r="9.6" fill="#7c8a94"/><rect x="6.8" y="-4.1" width="3.6" height="8.2" rx="1.1" fill="${body === 'sport' ? '#c45d48' : '#bccbca'}"/>${Array.from({ length: 10 }, (_, i) => `<g transform="rotate(${i * 36})"><path d="M-1.15-2.5L-2.5-10.9Q-1.6-12.2-.35-12.15L1.7-3.1Z" fill="url(#${id}-metal)" stroke="#a7b8c6" stroke-width=".23"/><path d="M.65-3.1L3.3-10.65L4.05-10.2L2.15-2.5Z" fill="#e4ecf1"/></g>`).join('')}<circle r="3.1" fill="url(#${id}-metal)" stroke="#4b6374" stroke-width=".5"/><circle r="1.9" fill="#2b4352"/><path d="M-.8.65L0-.7L.8.65" fill="none" stroke="#b8dcd4" stroke-width=".45"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-106 -64 212 112" role="img" aria-label="现代新能源${body === 'touring' ? '跨界旅行' : body === 'sport' ? '溜背运动' : '都市掀背'}车" fill="none" stroke-linejoin="round" stroke-linecap="round"><defs>
    <linearGradient id="${id}-paint" x1="0" y1="-51" x2="0" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="${c.pale}"/><stop offset=".15" stop-color="${c.light}"/><stop offset=".4" stop-color="${c.base}"/><stop offset=".56" stop-color="${c.light}"/><stop offset=".63" stop-color="${c.base}"/><stop offset=".88" stop-color="${c.shade}"/><stop offset="1" stop-color="${c.deep}"/></linearGradient>
    <linearGradient id="${id}-glass" x1="-30" y1="-47" x2="28" y2="-21" gradientUnits="userSpaceOnUse"><stop stop-color="#5d7b8b"/><stop offset=".31" stop-color="#294b60"/><stop offset=".67" stop-color="#153342"/><stop offset="1" stop-color="#344e58"/></linearGradient>
    <linearGradient id="${id}-metal"><stop stop-color="#f3f6f8"/><stop offset=".32" stop-color="#bbc8d2"/><stop offset=".57" stop-color="#6b7f8f"/><stop offset="1" stop-color="#d5e0e8"/></linearGradient>
    <radialGradient id="${id}-tyre" cx=".38" cy=".32"><stop stop-color="#56616a"/><stop offset=".64" stop-color="#242d35"/><stop offset=".91" stop-color="#141b21"/><stop offset="1" stop-color="#2e3840"/></radialGradient>
    <clipPath id="${id}-shell"><path d="${p.shell}"/></clipPath><clipPath id="${id}-windows"><path d="${p.glass}"/></clipPath>
    </defs><ellipse cx="1" cy="33" rx="89" ry="5.8" fill="#203a48" opacity=".17"/><rect x="-74" y="10" width="153" height="8.2" rx="3" fill="#202e38"/><path d="${p.shell}" fill="url(#${id}-paint)" stroke="${c.deep}" stroke-width=".7"/>
    <g clip-path="url(#${id}-shell)"><path d="M-87-15Q-20-12 32-14Q64-17 94-10L95 6Q39-2-8 1Q-43 4-88 7Z" fill="#fff" opacity=".15"/><path d="M-87 7Q-14 17 93 1L94 22L-90 22Z" fill="#173a44" opacity=".19"/><path d="M-74-12Q-20-14 25-14Q61-15 80-9" stroke="#ffffff9e" stroke-width=".45"/>${[p.rearWheel, p.frontWheel].map(x => `<circle cx="${x}" cy="16" r="19" fill="#182933" stroke="${c.light}" stroke-width=".65"/>`).join('')}</g>
    <path d="${p.glass}" fill="#172c39" stroke="#273e4b" stroke-width=".55"/><path d="${p.rearGlass}" fill="url(#${id}-glass)"/><path d="${p.frontGlass}" fill="url(#${id}-glass)"/><g clip-path="url(#${id}-windows)"><path d="M-38-53L-21-53L12-16L2-16Z" fill="#d5f2fb" opacity=".17"/><path d="M10-52L15-52L46-17L39-17Z" fill="#e5f6ff" opacity=".32"/></g>
    <path d="${p.roof}" stroke="#ffffff9c" stroke-width=".65"/><path d="${p.belt}" stroke="${c.deep}" stroke-width=".55"/><path d="${p.rearDoor}" stroke="${c.deep}" stroke-width=".38"/><path d="${p.frontDoor}" stroke="${c.deep}" stroke-width=".42"/><path d="${windowSill(body)}" stroke="#b6cace" stroke-width=".5"/><rect x="-30" y="-15.1" width="7.6" height="1.8" rx=".7" fill="${c.deep}"/><rect x="20" y="-15.1" width="7.6" height="1.8" rx=".7" fill="${c.deep}"/>
    <rect x="-75" y="-7.4" width="8.5" height="7.5" rx="1.6" fill="${c.base}" stroke="${c.deep}" stroke-width=".4"/><path d="M-73.5-5.7L-68-5.7" stroke="${c.light}" stroke-width=".5"/><path d="M${p.mirror - 3}-22L${p.mirror + 2}-16L${p.mirror + 6}-18L${p.mirror + 3}-23Z" fill="#203b46"/><path d="M${p.mirror}-25Q${p.mirror + 3}-29 ${p.mirror + 9}-26L${p.mirror + 12}-23Q${p.mirror + 11}-20 ${p.mirror + 7}-20L${p.mirror}-22Z" fill="${c.light}" stroke="${c.deep}" stroke-width=".5"/>
    <path d="M-83-11L-78-12L-77-4L-84-3Z" fill="#702c30"/><path d="M-83-10L-78-11L-77-8L-83-7Z" fill="#ff8f80"/><path d="M-85 6L-77 6L-76 13L-83 15Z" fill="#2a3c45"/><path d="M72-13L86-10L87-6L74-8Z" fill="#253c47"/><path d="M73-12L85-9" stroke="#ecfbff" stroke-width="1.35"/><path d="M85-1L90 0L88 7L82 7Z" fill="#263b45"/><path d="M78 13L89 11L87 16L77 17Z" fill="#1b303c"/><path d="M${p.rearWheel + 20} 15L${p.frontWheel - 20} 15L${p.frontWheel - 19} 18L${p.rearWheel + 18} 18Z" fill="#243b46" stroke="#68838c" stroke-width=".4"/>
    ${body === 'touring' ? '<path d="M-29-51L23-51" stroke="#263e47" stroke-width="1.15"/>' : body === 'sport' ? '<path d="M-81-16L-64-17L-57-19" stroke="#213644" stroke-width="1.15"/>' : ''}${wheel(p.rearWheel)}${wheel(p.frontWheel)}</svg>`;
}

/** Compact overhead car, +x is forward; useful for BEV and miniature road maps. */
export function drawPremiumTopCar(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#5bb89d', scale = 1, body = 'city') {
  const c = palette(color), touring = body === 'touring', sport = body === 'sport';
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.shadowColor = '#152c3c3b'; ctx.shadowBlur = 4; rectangle(ctx, -40, -22, 82, 45, 13, '#152c3c1f'); ctx.restore();
  for (const wx of [-26, 25]) for (const wy of [-24.7, 24.7]) {
    rectangle(ctx, wx - 7, wy - 2.4, 14, 4.8, 1.4, '#182936', '#4a5c67', .5);
    path(ctx, `M${wx - 5} ${wy}L${wx + 5} ${wy}`, undefined, '#758792', .5);
  }
  const shell = touring ? 'M-44-14Q-44-24-34-24L28-22Q44-20 44-9L44 9Q44 20 28 22L-34 24Q-44 24-44 14Z'
    : sport ? 'M-43-11Q-42-22-31-23L26-21Q43-19 44-8L44 8Q43 19 26 21L-31 23Q-42 22-43 11Z'
      : 'M-42-12Q-42-23-31-24L28-22Q43-20 43-10L43 10Q43 20 28 22L-31 24Q-42 23-42 12Z';
  const paint = gradient(ctx, -14, -25, 8, 25, [[0, c.deep], [.15, c.light], [.36, c.base], [.57, c.pale], [.78, c.base], [1, c.deep]]);
  path(ctx, shell, paint, c.deep, .6);
  ctx.save(); ctx.clip(shapeFor(shell));
  path(ctx, 'M-41-20Q-17-25 34-17', undefined, '#ffffff8c', .6);
  path(ctx, 'M-39 19Q-8 24 35 16', undefined, '#ffffff67', .5);
  path(ctx, 'M-34-22L-31-15L-31 15L-34 22', undefined, c.deep, .45);
  path(ctx, 'M-8-23L-8-18M-8 18L-8 23M21-21L21-16M21 16L21 21', undefined, c.deep, .45);
  ctx.restore();
  const glass = gradient(ctx, -25, -20, 21, 19, [[0, '#607d8d'], [.32, '#2b4b5e'], [.64, '#183644'], [1, '#436271']]);
  const cabin = sport ? 'M-27-14Q-23-19-17-19L7-17L19-12L19 12L7 17L-17 19Q-23 19-27 14Z'
    : 'M-29-15Q-25-20-18-20L11-18L23-13L23 13L11 18L-18 20Q-25 20-29 15Z';
  path(ctx, cabin, '#182e3a', '#64818c', .4);
  path(ctx, sport ? 'M-25-13Q-21-17-16-17L-14 17Q-23 17-25 13Z' : 'M-27-14Q-23-18-18-18L-16 18Q-25 18-27 14Z', glass);
  rectangle(ctx, sport ? -12 : -14, -16.7, sport ? 21 : 25, 33.4, 4, glass, '#243e4e', .6);
  path(ctx, sport ? 'M10-16L17-11L17 11L10 16Z' : 'M12-16L21-12L21 12L12 16Z', glass);
  ctx.save(); ctx.clip(shapeFor(cabin));
  path(ctx, 'M-27-22L-19-22L14 22L5 22Z', '#bce4f229');
  path(ctx, 'M-1-22L2-22L24 17L20 19Z', '#ecfaff52');
  ctx.restore();
  for (const side of [-1, 1]) {
    path(ctx, `M13 ${side * 20}L17 ${side * 27}Q20 ${side * 28} 21 ${side * 24}L20 ${side * 20}Z`, c.light, '#284551', .5);
    path(ctx, `M15 ${side * 23}L19 ${side * 25}`, undefined, '#ecf8fa', .65);
    rectangle(ctx, -18, side < 0 ? -22.1 : 20.9, 5.5, 1.25, .5, c.deep);
    rectangle(ctx, 10, side < 0 ? -20.8 : 19.7, 5.5, 1.2, .5, c.deep);
  }
  path(ctx, 'M39-13Q41-8 41 8L39 13', undefined, '#243c49', 2.6);
  path(ctx, 'M39.4-13Q41.4-8 41.4 8L39.4 13', undefined, '#eafcff', .85);
  path(ctx, 'M-39-16Q-41-8-41 8L-39 16', undefined, '#81333a', 2.1);
  path(ctx, 'M-39.2-15Q-40.5-8-40.5 8L-39.2 15', undefined, '#ff9d8b', .75);
  path(ctx, 'M27-13Q35-10 35 10L27 13', undefined, c.shade, .45);
  if (touring) {
    path(ctx, 'M-25-18L11-16M-25 18L11 16', undefined, '#b0c3c9', .55);
  }
  ctx.restore();
}
