import { drawPremiumCar } from './car-art';

export interface StageOptions {
  width?: number; height?: number; label: string;
  draw(ctx: CanvasRenderingContext2D, time: number): void;
  update?(dt: number): void;
  pointer?(kind: 'move' | 'down' | 'up', x: number, y: number): void;
}
export function createStage(parent: HTMLElement, options: StageOptions) {
  const width = options.width ?? 1000, height = options.height ?? 520;
  parent.classList.add('canvas-stage');
  parent.style.aspectRatio = `${width}/${height}`;
  parent.style.height = 'auto';

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', options.label);
  canvas.setAttribute('role', 'img');
  canvas.style.setProperty('position', 'absolute', 'important');
  canvas.style.setProperty('inset', '0', 'important');
  canvas.style.setProperty('width', '100%', 'important');
  canvas.style.setProperty('height', '100%', 'important');
  canvas.style.setProperty('margin', '0', 'important');
  canvas.style.setProperty('padding', '0', 'important');
  canvas.style.setProperty('border', '0', 'important');
  canvas.style.setProperty('display', 'block', 'important');
  canvas.dataset.logicalWidth = String(width);
  canvas.dataset.logicalHeight = String(height);
  parent.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let disposed = false;
  let density = 0;
  let rafId = 0;
  let lastNow = 0;
  let activePointer: number | undefined;
  let pixelRatio = window.devicePixelRatio || 1;

  function getDensity() {
    const cssWidth = parent.getBoundingClientRect().width || width;
    const requested = cssWidth * (window.devicePixelRatio || 1) / width;
    // Use physical pixels for drawing, keeping teaching geometry and pointer coordinates strictly 1:1 logical.
    return Math.max(0.5, Math.min(3, 3600 / width, 2400 / height, Math.ceil(requested * 20) / 20));
  }

  function syncCanvasSize(force = false) {
    if (disposed) return;
    const next = getDensity();
    if (!force && Math.abs(next - density) < 0.04) return;
    density = next;
    const w = Math.round(width * density);
    const h = Math.round(height * density);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.dataset.renderDensity = density.toFixed(2);
  }

  syncCanvasSize(true);

  const dispatch = (kind: 'move' | 'down' | 'up', event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    options.pointer?.(
      kind,
      (event.clientX - bounds.left) * width / bounds.width,
      (event.clientY - bounds.top) * height / bounds.height
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    if (activePointer !== undefined || event.button !== 0) return;
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    dispatch('down', event);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (activePointer === undefined || activePointer === event.pointerId) dispatch('move', event);
  };
  const releasePointer = () => {
    if (activePointer === undefined) return;
    const id = activePointer;
    activePointer = undefined;
    // An off-stage release cancels a connection instead of snapping stale coordinates.
    options.pointer?.('up', -1000, -1000);
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return;
    activePointer = undefined;
    dispatch('up', event);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);

  const renderFrame = (now: number) => {
    if (disposed) return;
    rafId = window.requestAnimationFrame(renderFrame);
    const dt = lastNow ? Math.min(Math.max((now - lastNow) / 1000, 0), 0.05) : 1 / 60;
    lastNow = now;
    // ResizeObserver handles layout changes; only a DPR change needs a frame check.
    // Avoid a forced layout read on every animation frame.
    const nextPixelRatio = window.devicePixelRatio || 1;
    if (nextPixelRatio !== pixelRatio) {
      pixelRatio = nextPixelRatio;
      syncCanvasSize(false);
    }
    options.update?.(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070e1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(canvas.width / width, canvas.height / height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    options.draw(ctx, now / 1000);
    ctx.restore();
  };
  rafId = window.requestAnimationFrame(renderFrame);

  const onResize = () => syncCanvasSize(false);
  const observer = new ResizeObserver(onResize);
  observer.observe(parent);
  window.addEventListener('resize', onResize);
  const onBlur = () => releasePointer();
  const onVisibility = () => {
    releasePointer();
    window.cancelAnimationFrame(rafId);
    lastNow = 0;
    if (!document.hidden && !disposed) rafId = window.requestAnimationFrame(renderFrame);
  };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    capture: () => {
      // Eight report captures share the local-storage budget with structured records.
      const ratio = Math.min(1, 1200 / Math.max(1, canvas.width));
      const image = document.createElement('canvas');
      image.width = Math.round(canvas.width * ratio);
      image.height = Math.round(canvas.height * ratio);
      const out = image.getContext('2d')!;
      out.imageSmoothingEnabled = true;
      out.imageSmoothingQuality = 'high';
      out.drawImage(canvas, 0, 0, image.width, image.height);
      return image.toDataURL('image/jpeg', 0.82);
    },
    destroy: () => {
      releasePointer();
      disposed = true;
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', releasePointer);
      canvas.removeEventListener('lostpointercapture', releasePointer);
      canvas.remove();
    }
  };
}
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 12, fill?: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 16, color = '#26352e', weight = 500) {
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color = '#6dcc93', scale = 1, wheelRotation = 0, body = 'city') {
  drawPremiumCar(ctx, x, y, color, scale, wheelRotation, body);
}
export function downloadFile(filename: string, content: string | Blob, type = 'text/html;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  if (window.garageDesktop) {
    void blob.arrayBuffer().then(bytes => window.garageDesktop!.saveFile(filename, bytes)).catch(() => {
      window.alert('作品未能保存，请检查保存位置后重试。');
    });
    return;
  }
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));
}
