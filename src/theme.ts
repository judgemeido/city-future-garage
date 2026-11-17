// Shared colors for DOM surfaces and the teaching stages. Photographs stay untouched.
export const GAME_COLORS = {
  perception: '#47eaff', factory: '#f5bc65', ai: '#bc98ff', regen: '#75f1bb',
  parking: '#47eaff', repair: '#f5bc65', charging: '#75f1bb', grip: '#a6b7ff'
} as const;

export function nightBackdrop(ctx: CanvasRenderingContext2D, width = 1000, height = 520, city = false) {
  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, '#080e21'); sky.addColorStop(.6, '#101a32'); sky.addColorStop(1, '#17223d');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  ctx.save();
  if (city) {
    for (let i = 0; i < 15; i++) {
      const x = i * width / 14 - 20, h = 48 + (i * 43) % 98, y = height * .47 - h;
      ctx.fillStyle = i % 2 ? '#172641' : '#1d2e4b'; ctx.fillRect(x, y, 55, h);
      ctx.fillStyle = i % 3 ? '#47eaff80' : '#ed71bd80';
      for (let r = 0; r < h / 21 - 1; r++) for (let c = 0; c < 3; c++) ctx.fillRect(x + 8 + c * 16, y + 12 + r * 21, 5, 8);
    }
  } else {
    ctx.strokeStyle = '#47eaff0c'; ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  }
  ctx.strokeStyle = '#47eaff60'; ctx.lineWidth = 2;
  for (const [x, y, dx, dy] of [[12, 12, 1, 1], [width - 12, 12, -1, 1], [12, height - 12, 1, -1], [width - 12, height - 12, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 20); ctx.lineTo(x, y); ctx.lineTo(x + dx * 20, y); ctx.stroke();
  }
  ctx.restore();
}
