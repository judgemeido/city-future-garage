import Phaser from 'phaser';
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
  let disposed = false;
  let density = getDensity();
  let scene: ExperienceScene | undefined;
  function getDensity() {
    const cssWidth = parent.getBoundingClientRect().width || width;
    const requested = cssWidth * (window.devicePixelRatio || 1) / width;
    // Use physical pixels for drawing, but keep teaching geometry and pointer coordinates logical.
    // Bound very large monitors to a predictable Canvas memory budget.
    return Math.max(1, Math.min(3, 3600 / width, 2400 / height, Math.ceil(requested * 20) / 20));
  }
  class ExperienceScene extends Phaser.Scene {
    private texture!: Phaser.Textures.CanvasTexture;
    private view!: Phaser.GameObjects.Image;
    create() {
      scene = this;
      this.texture = this.textures.createCanvas('world', Math.round(width * density), Math.round(height * density))!;
      this.view = this.add.image(0, 0, 'world').setOrigin(0);
      for (const [event, kind] of [['pointermove', 'move'], ['pointerdown', 'down'], ['pointerup', 'up']] as const) {
        this.input.on(event, (p: Phaser.Input.Pointer) => options.pointer?.(kind, p.x * width / this.texture.width, p.y * height / this.texture.height));
      }
      this.game.canvas.setAttribute('aria-label', options.label);
      this.game.canvas.setAttribute('role', 'img');
      // Let the parent's aspect ratio own layout. Inline Phaser sizes can stretch the
      // image after a window resize when only the CSS width is clamped.
      this.game.canvas.style.setProperty('position', 'absolute', 'important');
      this.game.canvas.style.setProperty('inset', '0', 'important');
      this.game.canvas.style.setProperty('width', '100%', 'important');
      this.game.canvas.style.setProperty('height', '100%', 'important');
      this.game.canvas.style.setProperty('margin', '0', 'important');
      this.game.canvas.dataset.renderDensity = density.toFixed(2);
      this.game.canvas.dataset.logicalWidth = String(width);
      this.game.canvas.dataset.logicalHeight = String(height);
    }
    resizeTexture() {
      if (!this.texture || disposed) return;
      this.texture.setSize(Math.round(width * density), Math.round(height * density));
      this.view.setTexture('world').setOrigin(0);
      this.game.scale.setGameSize(Math.round(width * density), Math.round(height * density));
      this.game.canvas.dataset.renderDensity = density.toFixed(2);
    }
    update(time: number, delta: number) {
      if (disposed || !this.texture) return;
      options.update?.(Math.min(delta / 1000, 0.05));
      const ctx = this.texture.context;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.texture.width, this.texture.height);
      ctx.save();
      ctx.scale(this.texture.width / width, this.texture.height / height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      options.draw(ctx, time / 1000);
      ctx.restore();
      // Canvas renderer reads the backing canvas directly; GPU refresh is unnecessary.
    }
  }
  const game = new Phaser.Game({
    type: Phaser.CANVAS, parent, width: Math.round(width * density), height: Math.round(height * density), backgroundColor: '#f0f4ee',
    transparent: false, scene: ExperienceScene, audio: { noAudio: true },
    banner: false, fps: { target: 60 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false }
  });
  const resize = () => {
    if (disposed) return;
    const next = getDensity();
    if (Math.abs(next - density) < .04) return;
    density = next; scene?.resizeTexture();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(parent);
  window.addEventListener('resize', resize);
  return {
    capture: () => {
      // Detailed report images remain bounded so four high-DPI captures fit in browser storage.
      const ratio = Math.min(1, 1800 / game.canvas.width);
      const image = document.createElement('canvas');
      image.width = Math.round(game.canvas.width * ratio);
      image.height = Math.round(game.canvas.height * ratio);
      const ctx = image.getContext('2d')!;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(game.canvas, 0, 0, image.width, image.height);
      return image.toDataURL('image/jpeg', .92);
    },
    destroy: () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', resize); game.destroy(true); }
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
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function escapeHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!));
}
