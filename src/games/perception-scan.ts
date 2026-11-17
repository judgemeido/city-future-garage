import { annotationRect, type AnnotationRect } from './perception-annotations';
import type { SceneTarget } from './perception-scenes';

export const SCANNER_RADIUS = 135;
export interface ScanPoint { x: number; y: number; strength: number }
export interface ScanOptions {
  image: CanvasImageSource | null; rect: AnnotationRect; points: ScanPoint[];
  targets: SceneTarget[]; marked: ReadonlySet<string>; annotations: boolean;
  lidar: boolean; radar: boolean; quality: number; time: number; reducedMotion: boolean;
}

// The monochrome photo and its edge samples share the original image coordinates.
// This is a visual teaching layer; it does not reconstruct real depth from a photo.
export function drawLaserCloud(ctx: CanvasRenderingContext2D, options: ScanOptions) {
  const { rect, time, reducedMotion, lidar, radar, quality } = options;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = '#02140f'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (options.image) ctx.drawImage(options.image, rect.x, rect.y, rect.w, rect.h);
  if (!lidar && !radar) {
    ctx.fillStyle = '#071b15b0'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore(); return;
  }
  if (lidar) {
    ctx.fillStyle = '#34d399'; ctx.globalAlpha = .16 * quality;
    for (let y = rect.y + 5; y < rect.y + rect.h; y += 10) {
      for (let x = rect.x + 5; x < rect.x + rect.w; x += 10) ctx.fillRect(x, y, 1.1, 1.1);
    }
    const sweep = reducedMotion ? .5 : (time * .24) % 1;
    for (let i = 0; i < options.points.length; i++) {
      if ((i * 19 % 100) / 100 > quality) continue;
      const point = options.points[i];
      const highlighted = Math.abs(point.y - sweep) < .065;
      ctx.globalAlpha = Math.min(1, .30 + point.strength * .55 + (highlighted ? .25 : 0));
      ctx.fillStyle = highlighted ? '#d1fae5' : point.strength > .6 ? '#6ee7b7' : '#10b981';
      const size = highlighted ? 2.4 : 1.6 + point.strength * .6;
      ctx.fillRect(rect.x + point.x * rect.w, rect.y + point.y * rect.h, size, size);
    }
    ctx.globalAlpha = 1;
    // A low-opacity perspective guide stays below the skyline and landmarks.
    const horizon = rect.y + rect.h * .62, bottom = rect.y + rect.h;
    ctx.strokeStyle = '#34d39928'; ctx.lineWidth = .8;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(rect.x + rect.w * .5 + i * 9, horizon);
      ctx.lineTo(rect.x + rect.w * .5 + i * rect.w * .19, bottom); ctx.stroke();
    }
    for (const offset of [.06, .14, .26, .42, .64, .9]) {
      const y = horizon + (bottom - horizon) * offset;
      ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke();
    }
    if (!reducedMotion) {
      const y = rect.y + sweep * rect.h;
      const glow = ctx.createLinearGradient(0, y - 24, 0, y + 3);
      glow.addColorStop(0, '#34d39900'); glow.addColorStop(1, '#34d39926');
      ctx.fillStyle = glow; ctx.fillRect(rect.x, y - 24, rect.w, 27);
      ctx.strokeStyle = '#a7f3d06b'; ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke();
    }
  }
  if (options.annotations) for (const target of options.targets) {
    if (!options.marked.has(target.id)) continue;
    const box = annotationRect(target, rect);
    if (lidar) {
      const depth = Math.min(15, Math.max(4, Math.min(box.w, box.h) * .18));
      ctx.fillStyle = '#10b9811f'; ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 1.6; ctx.shadowColor = '#10b981'; ctx.shadowBlur = 6;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x + depth, box.y - depth, box.w, box.h);
      for (const [x, y] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + depth, y - depth); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    if (radar) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(13, box.w * .6), Math.max(9, box.h * .4), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#fef3c7';
      const text = `${target.distance.toFixed(1)} m · 教学测距`, width = ctx.measureText(text).width + 12;
      const x = Math.max(rect.x + 3, Math.min(rect.x + rect.w - width - 3, cx - width / 2));
      const y = Math.min(rect.y + rect.h - 23, box.y + box.h + 4);
      ctx.fillStyle = '#211806e8'; ctx.fillRect(x, y, width, 19);
      ctx.fillStyle = '#fde68a'; ctx.fillText(text, x + 6, y + 13);
    }
  }
  ctx.restore();
}

export function drawScannerLens(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion: boolean) {
  ctx.save();
  const radius = SCANNER_RADIUS, angle = reducedMotion ? -.6 : time * .65;
  ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 2; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 15;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#a7f3d060'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, radius - 6, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#d1fae5'; ctx.beginPath(); ctx.arc(x, y, radius + 5, angle, angle + .55); ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, outer = radius + (i % 6 === 0 ? 13 : 9);
    ctx.strokeStyle = i % 6 === 0 ? '#a7f3d0' : '#34d39966'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (radius + 5), y + Math.sin(a) * (radius + 5));
    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer); ctx.stroke();
  }
  ctx.strokeStyle = '#d1fae5a0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
  ctx.restore();
}
