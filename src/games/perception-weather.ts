interface PhotoArea { x: number; y: number; w: number; h: number }

let wispyFogCanvas: HTMLCanvasElement | undefined;
let mistStreakCanvas: HTMLCanvasElement | undefined;

function buildWispyFogTexture(): HTMLCanvasElement {
  if (wispyFogCanvas) return wispyFogCanvas;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  // Deterministic pseudo-random multi-octave cloud wisps (no hard oval edges)
  let seed = 1337;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 42; i++) {
    const px = 48 + rand() * 416;
    const py = 54 + rand() * 148;
    const rx = 44 + rand() * 96;
    const ry = 22 + rand() * 48;
    const alpha = 0.045 + rand() * 0.065;
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
    g.addColorStop(0, `rgba(222, 232, 240, ${alpha.toFixed(3)})`);
    g.addColorStop(0.45, `rgba(210, 224, 235, ${(alpha * 0.6).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200, 216, 228, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  wispyFogCanvas = c;
  return c;
}

function buildRainSheetTexture(): HTMLCanvasElement {
  if (mistStreakCanvas) return mistStreakCanvas;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  let seed = 4242;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 68; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const len = 18 + rand() * 44;
    const a = 0.06 + rand() * 0.14;
    const grad = ctx.createLinearGradient(x, y, x - len * 0.14, y + len);
    grad.addColorStop(0, 'rgba(210, 232, 248, 0)');
    grad.addColorStop(0.55, `rgba(218, 238, 252, ${a.toFixed(3)})`);
    grad.addColorStop(1, 'rgba(235, 248, 255, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.6 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.14, y + len);
    ctx.stroke();
  }
  mistStreakCanvas = c;
  return c;
}

/**
 * Photorealistic layered atmospheric fog & storm rain rendered over the live street photo.
 * Designed for genuine visual realism (depth Mie scattering, drifting fractal mist banks,
 * wind-gusting tapered rain curtains, wet road spray, and refractive glass droplets).
 */
export function drawPerceptionWeather(
  ctx: CanvasRenderingContext2D,
  area: PhotoArea,
  fogPercent: number,
  rainPercent: number,
  time: number,
  reducedMotion: boolean
) {
  const { x, y, w, h } = area;
  const fog = Math.max(0, Math.min(1, fogPercent / 100));
  const rain = Math.max(0, Math.min(1, rainPercent / 100));
  if (fog <= 0.001 && rain <= 0.001) return;
  const t = reducedMotion ? 1.8 : time;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // =========================================================================
  // 1. VOLUMETRIC ATMOSPHERIC FOG (Exponential Depth Scattering + Cloud Banks)
  // =========================================================================
  if (fog > 0.001) {
    // Realistic atmospheric desaturation / Mie scattering veil:
    // Upper sky & distant horizon wash out first, near road retains partial contrast.
    const veil = ctx.createLinearGradient(0, y, 0, y + h);
    veil.addColorStop(0, `rgba(196, 210, 222, ${(fog * 0.72).toFixed(3)})`);
    veil.addColorStop(0.32, `rgba(212, 223, 232, ${(fog * 0.84).toFixed(3)})`);
    veil.addColorStop(0.62, `rgba(204, 217, 228, ${(fog * 0.64).toFixed(3)})`);
    veil.addColorStop(0.84, `rgba(186, 202, 216, ${(fog * 0.36).toFixed(3)})`);
    veil.addColorStop(1, `rgba(168, 186, 202, ${(fog * 0.18).toFixed(3)})`);
    ctx.fillStyle = veil;
    ctx.fillRect(x, y, w, h);

    // Subtle 'screen' sky-bloom glare for authentic light scattering in thick fog
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const bloom = ctx.createRadialGradient(x + w * 0.52, y + h * 0.24, w * 0.05, x + w * 0.52, y + h * 0.32, w * 0.68);
    bloom.addColorStop(0, `rgba(218, 228, 236, ${(fog * 0.34).toFixed(3)})`);
    bloom.addColorStop(0.55, `rgba(190, 206, 220, ${(fog * 0.18).toFixed(3)})`);
    bloom.addColorStop(1, 'rgba(160, 180, 198, 0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // 3 Parallax drifting turbulent fog strata
    const tex = buildWispyFogTexture();
    const layers = [
      { speed: 11, yFrac: 0.24, scaleX: 1.35, scaleY: 0.72, alpha: 0.58, dir: 1 },
      { speed: 19, yFrac: 0.46, scaleX: 1.25, scaleY: 0.68, alpha: 0.48, dir: -1 },
      { speed: 28, yFrac: 0.68, scaleX: 1.4, scaleY: 0.56, alpha: 0.34, dir: 1 },
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const tileW = w * L.scaleX;
      const tileH = h * L.scaleY;
      const drift = (((t * L.speed * L.dir) % tileW) + tileW) % tileW;
      const bob = Math.sin(t * 0.28 + li * 2.1) * 10;
      const cy = y + h * L.yFrac - tileH * 0.5 + bob;
      ctx.globalAlpha = Math.min(0.85, fog * (L.alpha + fog * 0.22));
      ctx.drawImage(tex, x + drift - tileW, cy, tileW, tileH);
      ctx.drawImage(tex, x + drift, cy, tileW, tileH);
      ctx.drawImage(tex, x + drift + tileW, cy, tileW, tileH);
    }
    ctx.globalAlpha = 1;
  }

  // =========================================================================
  // 2. PHOTOREALISTIC STORM RAIN + WET ROAD SPRAY + WINDSHIELD DROPLETS
  // =========================================================================
  if (rain > 0.001) {
    // Subtle storm overcast mood + lower road wet mist reflection
    const storm = ctx.createLinearGradient(0, y, 0, y + h);
    storm.addColorStop(0, `rgba(14, 26, 44, ${(rain * 0.32).toFixed(3)})`);
    storm.addColorStop(0.45, `rgba(26, 44, 66, ${(rain * 0.14).toFixed(3)})`);
    storm.addColorStop(0.76, `rgba(130, 162, 188, ${(rain * 0.16).toFixed(3)})`);
    storm.addColorStop(1, `rgba(24, 42, 62, ${(rain * 0.24).toFixed(3)})`);
    ctx.fillStyle = storm;
    ctx.fillRect(x, y, w, h);

    // Fine distant rain-spray mist band near horizon/ground
    const sprayHaze = ctx.createLinearGradient(0, y + h * 0.52, 0, y + h);
    sprayHaze.addColorStop(0, 'rgba(182, 206, 224, 0)');
    sprayHaze.addColorStop(0.55, `rgba(190, 212, 228, ${(rain * 0.22).toFixed(3)})`);
    sprayHaze.addColorStop(1, `rgba(155, 182, 204, ${(rain * 0.12).toFixed(3)})`);
    ctx.fillStyle = sprayHaze;
    ctx.fillRect(x, y + h * 0.52, w, h * 0.48);

    // Layer 0: Scrolling far rain-veil sheet texture (creates rich dense rainfall atmosphere)
    const sheet = buildRainSheetTexture();
    const fallOffset = (t * (280 + rain * 160)) % 256;
    const windOffset = (((-t * (38 + rain * 24)) % 256) + 256) % 256;
    ctx.save();
    ctx.globalAlpha = rain * 0.55;
    for (let sx = -256; sx < w + 256; sx += 256) {
      for (let sy = -256; sy < h + 256; sy += 256) {
        ctx.drawImage(sheet, x + sx + windOffset, y + sy + fallOffset);
      }
    }
    ctx.restore();

    // Dynamic wind gust tilt
    const windTilt = 0.15 + 0.05 * Math.sin(t * 0.65) + rain * 0.06;

    // Layer 1 & 2: Tapered refractive falling rain streaks (mid & near)
    ctx.lineCap = 'round';
    const rainDepths = [
      { count: Math.round(rain * 150), speed: 460, len: 22, width: 0.85, alpha: 0.34 },
      { count: Math.round(rain * 95), speed: 740, len: 42, width: 1.35, alpha: 0.46 },
      { count: Math.round(rain * 34), speed: 1040, len: 68, width: 1.9, alpha: 0.32 },
    ];
    for (let d = 0; d < rainDepths.length; d++) {
      const cfg = rainDepths[d];
      const spd = cfg.speed * (0.85 + rain * 0.35);
      const baseLen = cfg.len * (0.75 + rain * 0.5);
      ctx.lineWidth = cfg.width;

      for (let i = 0; i < cfg.count; i++) {
        const hash = (i * 2654435761 + d * 1013904223) >>> 0;
        const f1 = (hash & 0xffff) / 65536;
        const f2 = ((hash >>> 16) & 0xffff) / 65536;
        const dropLen = baseLen * (0.7 + f1 * 0.65);
        const dropTilt = windTilt + (f2 - 0.5) * 0.04;
        const spanH = h + dropLen * 2;
        const fall = (t * spd * (0.88 + f2 * 0.25) + f1 * spanH) % spanH;
        const rx = x + ((((f2 * w * 1.2 + i * 73.1 - fall * dropTilt) % w) + w) % w);
        const ry = y - dropLen + fall;
        const ex = rx - dropLen * dropTilt;
        const ey = ry + dropLen;

        // Tapered brightness (translucent tail -> glistening bright tip)
        const a = cfg.alpha * (0.55 + f1 * 0.45) * (0.45 + rain * 0.55);
        const grad = ctx.createLinearGradient(rx, ry, ex, ey);
        grad.addColorStop(0, 'rgba(210, 232, 248, 0)');
        grad.addColorStop(0.7, `rgba(224, 242, 255, ${a.toFixed(3)})`);
        grad.addColorStop(1, `rgba(245, 252, 255, ${(a * 0.45).toFixed(3)})`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // Crisp road impact micro-splashes & wet ripples in lower foreground
    const splashCount = Math.round(rain * 32);
    for (let i = 0; i < splashCount; i++) {
      const ph = (t * (1.8 + (i % 5) * 0.28) + i * 0.371) % 1;
      const sx = x + (((i * 197 + 41) % 977) / 977) * w;
      const sy = y + h * (0.76 + (((i * 53 + 19) % 103) / 103) * 0.22);
      const fade = (1 - ph) * rain;
      ctx.strokeStyle = `rgba(218, 240, 255, ${(fade * 0.48).toFixed(3)})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 1.5 + ph * 9, 0.7 + ph * 2.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Tiny upward crown rebound droplet right at impact start
      if (ph < 0.35) {
        const up = Math.sin((ph / 0.35) * Math.PI) * 5;
        ctx.fillStyle = `rgba(235, 248, 255, ${(fade * 0.7).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx - 1.5, sy - up, 0.9, 0, Math.PI * 2);
        ctx.arc(sx + 1.8, sy - up * 0.8, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Photorealistic Windshield Glass Droplets & Gravity Water Trails
    const dropCount = Math.round(rain * 24);
    for (let i = 0; i < dropCount; i++) {
      const isSliding = i % 3 === 0;
      const slideCycle = isSliding ? (t * (0.045 + (i % 4) * 0.012) + i * 0.29) % 1 : 0;
      const baseX = x + (0.04 + (((i * 239 + 67) % 919) / 919) * 0.92) * w;
      const wiggle = isSliding ? Math.sin(slideCycle * 18 + i) * 3.2 : 0;
      const bx = baseX + wiggle;
      const by = isSliding
        ? y + (0.05 + slideCycle * 0.88) * h
        : y + (0.08 + (((i * 151 + 23) % 853) / 853) * 0.82) * h;
      const rad = 2.0 + (i % 5) * 0.95;

      // Subtle watery streak left behind sliding drops
      if (isSliding && slideCycle > 0.04) {
        const trailLen = Math.min(78, slideCycle * h * 0.45);
        const tg = ctx.createLinearGradient(bx, by, bx, by - trailLen);
        tg.addColorStop(0, `rgba(215, 238, 255, ${(rain * 0.24).toFixed(3)})`);
        tg.addColorStop(1, 'rgba(215, 238, 255, 0)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = rad * 0.75;
        ctx.beginPath();
        ctx.moveTo(bx, by - rad);
        ctx.quadraticCurveTo(bx - wiggle * 0.7, by - trailLen * 0.5, baseX, by - trailLen);
        ctx.stroke();
      }

      // Refractive droplet body: dark bottom shadow + subtle sky tint + crisp upper specular dot
      ctx.fillStyle = `rgba(18, 34, 52, ${(rain * 0.22).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(bx + 0.5, by + 1.1, rad * 1.05, rad * (isSliding ? 1.45 : 1.15), 0, 0, Math.PI * 2);
      ctx.fill();

      const dg = ctx.createRadialGradient(bx - rad * 0.3, by - rad * 0.35, rad * 0.1, bx, by, rad * 1.35);
      dg.addColorStop(0, `rgba(245, 252, 255, ${(rain * 0.42).toFixed(3)})`);
      dg.addColorStop(0.55, `rgba(180, 214, 236, ${(rain * 0.14).toFixed(3)})`);
      dg.addColorStop(1, `rgba(30, 56, 82, ${(rain * 0.28).toFixed(3)})`);
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.ellipse(bx, by, rad, rad * (isSliding ? 1.42 : 1.12), 0, 0, Math.PI * 2);
      ctx.fill();

      // Tiny razor-sharp specular highlight glint
      ctx.fillStyle = `rgba(255, 255, 255, ${(rain * 0.72).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx - rad * 0.32, by - rad * 0.38, Math.max(0.7, rad * 0.26), 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle peripheral lens-condensation vignette in heavy downpour
    if (rain > 0.45) {
      const vig = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, w * 0.32, x + w * 0.5, y + h * 0.5, w * 0.66);
      vig.addColorStop(0, 'rgba(12, 24, 42, 0)');
      vig.addColorStop(1, `rgba(12, 26, 44, ${((rain - 0.45) * 0.45).toFixed(3)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(x, y, w, h);
    }
  }

  ctx.restore();
}
