import type { SceneTarget } from './perception-scenes';

export interface AnnotationRect { x: number; y: number; w: number; h: number }
export function annotationRect(target: SceneTarget, image: AnnotationRect): AnnotationRect {
  return { x: image.x + target.x * image.w, y: image.y + target.y * image.h, w: target.w * image.w, h: target.h * image.h };
}

// Find individual instances even when small targets or overlapping parked vehicles
// sit close together. A card's exact centre always selects that instance for scanning.
export function scanTargetAt(targets: SceneTarget[], image: AnnotationRect, x: number, y: number): SceneTarget | undefined {
  return targets.map(target => {
    const rect = annotationRect(target, image);
    const distance = Math.hypot(x - rect.x - rect.w / 2, y - rect.y - rect.h / 2);
    const radius = Math.max(5, Math.min(24, Math.min(rect.w, rect.h) * .55));
    return { target, distance, radius };
  }).filter(item => item.distance < item.radius).sort((a, b) => a.distance - b.distance)[0]?.target;
}

export function clickTargetAt(targets: SceneTarget[], image: AnnotationRect, x: number, y: number): SceneTarget | undefined {
  const candidates = targets.map(target => ({ target, rect: annotationRect(target, image) }));
  return candidates.filter(({rect}) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h)
    .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0]?.target;
}

export function drawSceneAnnotations(ctx: CanvasRenderingContext2D, targets: SceneTarget[], image: AnnotationRect, selected: string | null = null, found: ReadonlySet<string> = new Set()) {
  const scale = Math.max(.8, Math.min(1.6, image.w / 900));
  const fontSize = 10 * scale, tagHeight = 17 * scale, gap = 3 * scale;
  const tags: AnnotationRect[] = [];
  const intersects = (a: AnnotationRect, b: AnnotationRect) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  ctx.save(); ctx.font = `600 ${fontSize}px "Microsoft YaHei", sans-serif`; ctx.textBaseline = 'middle';
  // Keep the original card numbers while drawing only explicitly marked instances.
  const ordered = targets.map((target, index) => ({ target, index })).filter(({ target }) => found.has(target.id)).sort((a, b) => Number(a.target.id === selected) - Number(b.target.id === selected));
  for (const { target, index } of ordered) {
    const rect = annotationRect(target, image), active = target.id === selected;
    ctx.strokeStyle = target.color; ctx.lineWidth = (active ? 2.5 : 1.2) * scale;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    const text = `${index + 1} ${found.has(target.id) ? '✓ ' : ''}${target.name}`;
    const width = ctx.measureText(text).width + 10 * scale;
    const clampX = (x: number) => Math.max(image.x, Math.min(image.x + image.w - width, x));
    const clampY = (y: number) => Math.max(image.y, Math.min(image.y + image.h - tagHeight, y));
    const candidates: AnnotationRect[] = [];
    for (let row = 0; row < 8; row++) {
      for (const direction of [-1, 1]) {
        const yy = direction < 0 ? rect.y - (row + 1) * (tagHeight + gap) : rect.y + rect.h + row * (tagHeight + gap);
        for (const xx of [rect.x, rect.x + rect.w - width, rect.x - width - gap, rect.x + rect.w + gap]) candidates.push({ x: clampX(xx), y: clampY(yy), w: width, h: tagHeight });
      }
    }
    const tag = candidates.find(candidate => !tags.some(placed => intersects(candidate, placed))) ?? candidates[0];
    tags.push(tag);
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    ctx.globalAlpha = .65; ctx.lineWidth = scale * .8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tag.x + tag.w / 2, tag.y + tag.h / 2); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#080e21ec'; ctx.beginPath(); ctx.roundRect(tag.x, tag.y, tag.w, tag.h, 3 * scale); ctx.fill();
    ctx.fillStyle = target.color; ctx.fillText(text, tag.x + 5 * scale, tag.y + tag.h / 2);
  }
  ctx.restore();
}
