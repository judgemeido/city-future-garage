interface PhotoArea { x: number; y: number; w: number; h: number }
let fogTexture: HTMLCanvasElement | undefined;

function mistTexture() {
  if (fogTexture) return fogTexture;
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(1, .5);
  const mist = ctx.createRadialGradient(96, 96, 6, 96, 96, 96);
  mist.addColorStop(0, 'rgba(224,236,242,.72)');
  mist.addColorStop(.45, 'rgba(214,229,237,.42)');
  mist.addColorStop(1, 'rgba(214,229,237,0)');
  ctx.fillStyle = mist; ctx.fillRect(0, 0, 192, 192);
  fogTexture = canvas;
  return canvas;
}

// The photograph and its teaching weather are separate. The caller clips this
// layer to the picture and omits it completely in the original-photo view.
export function drawPerceptionWeather(ctx: CanvasRenderingContext2D, area: PhotoArea,
  fogPercent: number, rainPercent: number, time: number, reducedMotion: boolean) {
  const { x, y, w, h } = area;
  const fog = Math.max(0, Math.min(1, fogPercent / 100));
  const rain = Math.max(0, Math.min(1, rainPercent / 100));
  const t = reducedMotion ? 0 : time;
  ctx.save();
  if (fog > 0) {
    // The distant street fades first; the near road stays easier to inspect.
    const haze = ctx.createLinearGradient(0, y, 0, y + h);
    haze.addColorStop(0, `rgba(203,220,231,${fog * .76})`);
    haze.addColorStop(.36, `rgba(216,230,238,${fog * .83})`);
    haze.addColorStop(.72, `rgba(204,224,234,${fog * .57})`);
    haze.addColorStop(1, `rgba(188,211,225,${fog * .30})`);
    ctx.fillStyle = haze; ctx.fillRect(x, y, w, h);
    const texture = mistTexture();
    for (let i = 0; i < 7; i++) {
      const drift = t * (7 + i % 3 * 4) * (i % 2 ? -1 : 1);
      const cx = ((i * w * .37 + drift) % (w * 1.5) + w * 1.5) % (w * 1.5);
      const cy = y + h * (.19 + i % 4 * .18) + Math.sin(t * .17 + i * 1.7) * h * .025;
      const width = w * (.78 + i % 3 * .13), height = h * (.31 + i % 2 * .13);
      ctx.globalAlpha = fog * (.26 + fog * .22);
      // A second copy gives each soft bank a continuous wrap at the picture edge.
      ctx.drawImage(texture, x + cx - width / 2, cy - height / 2, width, height);
      ctx.drawImage(texture, x + cx - w * 1.5 - width / 2, cy - height / 2, width, height);
    }
    ctx.globalAlpha = 1;
  }
  if (rain > 0) {
    const wet = ctx.createLinearGradient(0, y, 0, y + h);
    wet.addColorStop(0, `rgba(16,40,66,${rain * .13})`);
    wet.addColorStop(.65, `rgba(124,182,211,${rain * .025})`);
    wet.addColorStop(1, `rgba(158,208,229,${rain * .18})`);
    ctx.fillStyle = wet; ctx.fillRect(x, y, w, h);
    ctx.lineCap = 'round';
    // Three depths: distant fine rainfall, mid-ground streaks, fast close drops.
    for (let layer = 0; layer < 3; layer++) {
      const count = Math.round(rain * [90, 120, 75][layer]);
      const speed = [255, 420, 650][layer] * (.8 + rain * .4);
      const length = [13, 24, 38][layer] * (.7 + rain * .55);
      ctx.strokeStyle = `rgba(216,241,255,${(.22 + layer * .11) * (.45 + rain * .55)})`;
      ctx.lineWidth = [.8, 1.25, 2][layer];
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const fall = (t * speed + ((i * 137 + layer * 83) % 997) / 997 * (h + 90)) % (h + 90);
        const rx = x + (((i * 97.3 + layer * 173 - fall * .24) % w) + w) % w;
        const ry = y - 45 + fall;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - length * .24, ry + length);
      }
      ctx.stroke();
    }
    // Small flattening rings suggest rain landing on the near road.
    const splashes = Math.round(rain * 22);
    ctx.lineWidth = 1;
    for (let i = 0; i < splashes; i++) {
      const phase = (t * (1.3 + i % 3 * .16) + i * .618) % 1;
      const sx = x + ((i * 113 + 49) % 953) / 953 * w;
      const sy = y + h * (.79 + ((i * 37) % 101) / 101 * .19);
      ctx.strokeStyle = `rgba(224,245,255,${rain * .46 * (1 - phase)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 2 + phase * 12, 1 + phase * 2.8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // Sparse foreground beads retain transparent centers instead of blanking targets.
    const beads = Math.round(rain * 16);
    for (let i = 0; i < beads; i++) {
      const phase = (t * .075 + i * .3819) % 1;
      const bx = x + (.05 + ((i * 179) % 887) / 887 * .9) * w;
      const by = y + (.04 + phase * .88) * h;
      const radius = 2.5 + i % 4 * 1.3;
      ctx.fillStyle = `rgba(191,226,244,${rain * .07})`;
      ctx.strokeStyle = `rgba(226,247,255,${rain * .35})`; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.ellipse(bx, by, radius, radius * 1.65, -.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(bx - .7, by - .8, radius * .8, radius * 1.45, -.1, Math.PI * .9, Math.PI * 1.7); ctx.stroke();
    }
  }
  ctx.restore();
}
