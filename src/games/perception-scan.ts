import { annotationRect, type AnnotationRect } from './perception-annotations';
import type { SceneTarget } from './perception-scenes';

export const SCANNER_RADIUS = 148;
export interface ScanPoint { x: number; y: number; strength: number }
export interface SensorFlags { camera: boolean; lidar: boolean; radar: boolean }
export interface ScanOptions {
  image: CanvasImageSource | null; rect: AnnotationRect; points: ScanPoint[];
  targets: SceneTarget[]; marked: ReadonlySet<string>; annotations: boolean;
  camera?: boolean; lidar: boolean; radar: boolean;
  quality: number; lidarQuality?: number; radarQuality?: number; cameraQuality?: number;
  time: number; reducedMotion: boolean;
}
export interface PerceptionEffect {
  kind: 'hit' | 'miss' | 'switch';
  x: number; y: number; w?: number; h?: number;
  color: string; startedAt: number; duration: number;
}

function targetSpecialty(target: SceneTarget) {
  const isLaneLine = target.category === 'road' && /车道线|标线/.test(target.name);
  const lidar =
    target.category === 'pedestrian' || target.category === 'cyclist' ? 1.0
    : target.category === 'vehicle' ? 0.92
    : target.category === 'landmark' ? 0.85
    : target.category === 'road' ? (isLaneLine ? 0.08 : 0.78)
    : 0.12; // signal: LiDAR cannot read colors/text

  const radar =
    target.category === 'vehicle' ? 1.0 // Huge metal RCS + Doppler speed target
    : target.category === 'cyclist' ? 0.62 // Metal bike frame, smaller RCS
    : target.category === 'pedestrian' ? 0.14 // Non-metal, very weak RCS
    : 0.0; // signal / road / distant static landmarks ignored by mmWave radar

  const camera =
    target.category === 'signal' || isLaneLine ? 1.0 // Color, text & painted road markings
    : target.category === 'pedestrian' || target.category === 'cyclist' || target.category === 'vehicle' ? 0.82
    : 0.35;

  return { lidar, radar, camera, isLaneLine };
}

// The monochrome photo and its edge samples share the original image coordinates.
// Ambient scan sweeps are intentionally subtle so that sensor-specific target reactions stand out clearly.
export function drawLaserCloud(ctx: CanvasRenderingContext2D, options: ScanOptions) {
  const { rect, time, reducedMotion, lidar, radar, quality } = options;
  const camera = options.camera ?? false;
  const lidarQ = options.lidarQuality ?? quality;
  const radarQ = options.radarQuality ?? quality;
  const cameraQ = options.cameraQuality ?? quality;
  const t = reducedMotion ? 0 : time;

  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();

  // Subtle dark tint so the real scene stays readable while strong sensor reactions pop vividly
  ctx.fillStyle = lidar || radar ? 'rgba(4, 15, 26, 0.56)' : 'rgba(6, 18, 32, 0.36)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (options.image && (lidar || radar)) {
    ctx.globalAlpha = 0.24;
    ctx.drawImage(options.image, rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
  }

  if (!lidar && !radar && !camera) {
    ctx.fillStyle = '#05131ecc';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.font = '600 16px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#8fb3c6';
    ctx.textAlign = 'center';
    ctx.fillText('请开启至少一个传感器（摄像头 / 激光雷达 / 毫米波雷达）', rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textAlign = 'start';
    ctx.restore();
    return;
  }

  // Shared sweep phases
  const camSweep = reducedMotion ? 0.45 : (t * 0.26) % 1;
  const lidarSweep = reducedMotion ? 0.52 : (t * 0.32) % 1;
  const originX = rect.x + rect.w * 0.5;
  const originY = rect.y + rect.h + 24;
  const maxRadius = Math.hypot(rect.w * 0.56, rect.h * 0.98);
  const halfSpread = 0.76;
  const centerAngle = -Math.PI / 2;
  const radarBeamAngle = reducedMotion ? centerAngle + 0.14 : centerAngle + Math.sin(t * 1.35) * (halfSpread * 0.94);
  const radarBeamDir = reducedMotion ? 1 : Math.cos(t * 1.35) >= 0 ? 1 : -1;

  // =========================================================================
  // 1. SUBTLE AMBIENT SWEEPS (Deliberately light so target hits steal the show)
  // =========================================================================
  if (camera) {
    if (!reducedMotion && !lidar && !radar) {
      const sx = rect.x + camSweep * rect.w;
      const grad = ctx.createLinearGradient(sx - 34, 0, sx + 4, 0);
      grad.addColorStop(0, 'rgba(71, 234, 255, 0)');
      grad.addColorStop(1, `rgba(71, 234, 255, ${(0.14 * cameraQ).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(sx - 34, rect.y, 38, rect.h);
      ctx.strokeStyle = `rgba(186, 230, 253, ${(0.35 * cameraQ).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, rect.y); ctx.lineTo(sx, rect.y + rect.h); ctx.stroke();
    }
  }

  if (lidar) {
    // Very faint perspective ground grid
    const cx = rect.x + rect.w * 0.5;
    const horizon = rect.y + rect.h * 0.6;
    const bottom = rect.y + rect.h;
    ctx.strokeStyle = `rgba(52, 211, 153, ${(0.08 * lidarQ).toFixed(3)})`;
    ctx.lineWidth = 0.8;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 12, horizon); ctx.lineTo(cx + i * rect.w * 0.18, bottom); ctx.stroke();
    }
    for (const offset of [0.15, 0.36, 0.62, 0.88]) {
      const y = horizon + (bottom - horizon) * offset;
      ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke();
    }

    // Subtle ambient edge point cloud (low opacity so target point bursts stand out dramatically)
    for (let i = 0; i < options.points.length; i += 2) {
      if ((i * 19 % 100) / 100 > lidarQ) continue;
      const pt = options.points[i];
      const near = Math.abs(pt.y - lidarSweep) < 0.055;
      ctx.globalAlpha = (near ? 0.34 : 0.14) * lidarQ;
      ctx.fillStyle = near ? '#a7f3d0' : '#10b981';
      ctx.fillRect(rect.x + pt.x * rect.w, rect.y + pt.y * rect.h, near ? 2.0 : 1.3, near ? 2.0 : 1.3);
    }
    ctx.globalAlpha = 1;

    // Subtle thin emerald laser sweep line
    if (!reducedMotion) {
      const sy = rect.y + lidarSweep * rect.h;
      const trail = ctx.createLinearGradient(0, sy - 36, 0, sy + 6);
      trail.addColorStop(0, 'rgba(52, 211, 153, 0)');
      trail.addColorStop(0.85, `rgba(52, 211, 153, ${(0.12 * lidarQ).toFixed(3)})`);
      trail.addColorStop(1, 'rgba(52, 211, 153, 0)');
      ctx.fillStyle = trail;
      ctx.fillRect(rect.x, sy - 36, rect.w, 42);
      ctx.strokeStyle = `rgba(167, 243, 208, ${(0.45 * lidarQ).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(rect.x, sy); ctx.lineTo(rect.x + rect.w, sy); ctx.stroke();
    }
  }

  if (radar) {
    // Faint radar FOV cone & range arcs
    const fanGrad = ctx.createRadialGradient(originX, originY, 30, originX, originY, maxRadius);
    fanGrad.addColorStop(0, `rgba(251, 191, 36, ${(0.07 * radarQ).toFixed(3)})`);
    fanGrad.addColorStop(0.6, `rgba(245, 158, 11, ${(0.035 * radarQ).toFixed(3)})`);
    fanGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = fanGrad;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.arc(originX, originY, maxRadius, centerAngle - halfSpread, centerAngle + halfSpread);
    ctx.closePath();
    ctx.fill();

    ctx.font = '600 10px "Microsoft YaHei", sans-serif';
    [15, 30, 45, 60].forEach((m, idx) => {
      const r = maxRadius * ((idx + 1) / 4.35);
      ctx.strokeStyle = `rgba(251, 191, 36, ${(0.11 * radarQ).toFixed(3)})`;
      ctx.lineWidth = 0.9;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.arc(originX, originY, r, centerAngle - halfSpread, centerAngle + halfSpread);
      ctx.stroke();
      ctx.setLineDash([]);
      const lx = originX + Math.cos(centerAngle + halfSpread * 0.76) * r;
      const ly = originY + Math.sin(centerAngle + halfSpread * 0.76) * r;
      if (ly > rect.y + 20 && ly < rect.y + rect.h - 10) {
        ctx.fillStyle = 'rgba(253, 230, 138, 0.45)';
        ctx.fillText(`${m}m`, lx + 4, ly);
      }
    });

    // Subtle single travelling radar wave + slender golden sweep beam
    const rWave = reducedMotion ? 0.42 : (t * 0.42) % 1;
    ctx.strokeStyle = `rgba(253, 224, 71, ${(Math.sin(rWave * Math.PI) * 0.2 * radarQ).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(originX, originY, 36 + rWave * (maxRadius - 36), centerAngle - halfSpread, centerAngle + halfSpread);
    ctx.stroke();

    ctx.fillStyle = `rgba(251, 191, 36, ${(0.08 * radarQ).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.arc(originX, originY, maxRadius, radarBeamAngle - radarBeamDir * 0.14, radarBeamAngle, radarBeamDir < 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(254, 240, 138, ${(0.48 * radarQ).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + Math.cos(radarBeamAngle) * maxRadius, originY + Math.sin(radarBeamAngle) * maxRadius);
    ctx.stroke();
  }

  // =========================================================================
  // 2. HIGH-CONTRAST SPECIALTY TARGET REACTIONS (Shows Real Sensor Gaps!)
  // =========================================================================
  for (const target of options.targets) {
    const box = annotationRect(target, rect);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const spec = targetSpecialty(target);

    // --- A. CAMERA SPECIALTY: Colors, Traffic Lights, Signs & Painted Lane Lines (degrades sharply in fog/rain!) ---
    if (camera && spec.camera >= 0.7) {
      const sweepDiff = Math.abs(target.x + target.w / 2 - camSweep);
      const waveBoost = !reducedMotion && sweepDiff < 0.14 ? (1 - sweepDiff / 0.14) : 0;
      const strength = spec.camera * cameraQ * (spec.camera === 1 ? 1.0 : 0.62);
      if (strength > 0.22) {
        const alpha = Math.min(0.95, strength * (0.52 + waveBoost * 0.48));
        ctx.save();
        ctx.strokeStyle = `rgba(71, 234, 255, ${alpha.toFixed(3)})`;
        ctx.lineWidth = spec.camera === 1 ? 2.2 : 1.4;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = spec.camera === 1 ? 14 : 6;
        // Crisp optical focus brackets
        const cl = Math.min(14, Math.max(5, Math.min(box.w, box.h) * 0.34));
        for (const [bx, by, dx, dy] of [
          [box.x, box.y, 1, 1], [box.x + box.w, box.y, -1, 1],
          [box.x, box.y + box.h, 1, -1], [box.x + box.w, box.y + box.h, -1, -1]
        ]) {
          ctx.beginPath();
          ctx.moveTo(bx, by + dy * cl); ctx.lineTo(bx, by); ctx.lineTo(bx + dx * cl, by);
          ctx.stroke();
        }
        // Highlight color/sign specialty tag when strong (e.g., traffic lights & lane lines in clear weather)
        if (spec.camera === 1 && cameraQ > 0.5) {
          ctx.shadowBlur = 0;
          const tag = target.category === 'signal' ? '视觉强 · 色彩/标志' : '视觉强 · 车道标线';
          ctx.font = '700 10px "Microsoft YaHei", sans-serif';
          const tw = ctx.measureText(tag).width + 10;
          const tx = Math.max(rect.x + 4, Math.min(rect.x + rect.w - tw - 4, cx - tw / 2));
          const ty = Math.max(rect.y + 4, box.y - 20);
          ctx.fillStyle = `rgba(8, 28, 46, ${(0.88 * cameraQ).toFixed(2)})`;
          ctx.strokeStyle = `rgba(71, 234, 255, ${(0.85 * cameraQ).toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(tx, ty, tw, 17, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#bae6fd';
          ctx.fillText(tag, tx + 5, ty + 12);
        }
        ctx.restore();
      }
    }

    // --- B. LiDAR SPECIALTY: Dense 3D Contour Point Cloud + 3D Wireframe (Pedestrians, Cyclists, Vehicles, Buildings) ---
    if (lidar) {
      const tyCenter = target.y + target.h / 2;
      // Compute sweep decay after vertical laser passes across target
      const delta = reducedMotion ? 0.08 : ((lidarSweep - tyCenter) + 1) % 1;
      const sweepFlare = delta < 0.28 ? Math.pow(1 - delta / 0.28, 1.4) : 0;

      if (spec.lidar >= 0.7) {
        const intensity = spec.lidar * lidarQ * (0.58 + sweepFlare * 0.42);
        const depth = Math.min(20, Math.max(6, Math.min(box.w, box.h) * 0.26));

        ctx.save();
        // Rich translucent emerald 3D fill + crisp glowing 3D wireframe box
        ctx.fillStyle = `rgba(16, 185, 129, ${(intensity * (0.18 + sweepFlare * 0.22)).toFixed(3)})`;
        ctx.fillRect(box.x, box.y, box.w, box.h);

        ctx.strokeStyle = `rgba(110, 231, 183, ${(Math.min(1, intensity * 0.95)).toFixed(3)})`;
        ctx.lineWidth = 1.6 + sweepFlare * 1.4;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 10 + sweepFlare * 14;
        ctx.strokeRect(box.x, box.y, box.w, box.h);

        // 3D depth back-frame & connecting edges
        ctx.strokeStyle = `rgba(52, 211, 153, ${(intensity * 0.65).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(box.x + depth, box.y - depth, box.w, box.h);
        for (const [ex, ey] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) {
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + depth, ey - depth); ctx.stroke();
        }

        // High-density glowing 3D laser point-cloud cluster directly on the object surface!
        const cols = Math.max(4, Math.min(14, Math.round(box.w / 8)));
        const rows = Math.max(3, Math.min(10, Math.round(box.h / 7)));
        ctx.shadowBlur = 6;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const hval = ((r * 31 + c * 17 + target.distance * 7) % 100) / 100;
            if (hval > lidarQ * 0.95) continue;
            const px = box.x + ((c + 0.5) / cols) * box.w + (hval - 0.5) * 3;
            const py = box.y + ((r + 0.5) / rows) * box.h;
            const hot = sweepFlare > 0.35 && ((r + c) % 2 === 0);
            ctx.fillStyle = hot ? '#ecfdf5' : hval > 0.55 ? '#6ee7b7' : '#34d399';
            ctx.globalAlpha = Math.min(1, intensity * (hot ? 1.0 : 0.82));
            const sz = hot ? 2.9 : 2.1;
            ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
          }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Compact 3D LiDAR telemetry badge for close/medium key 3D targets (pedestrians, cyclists, vehicles)
        if (target.category === 'pedestrian' || target.category === 'cyclist' || target.category === 'vehicle') {
          const tag = target.category === 'pedestrian' ? `3D人形 · ${target.distance}m` : target.category === 'cyclist' ? `3D轮廓 · ${target.distance}m` : `3D点云 · ${target.distance}m`;
          ctx.font = '700 10px "Microsoft YaHei", sans-serif';
          const tw = ctx.measureText(tag).width + 10;
          const tx = Math.max(rect.x + 4, Math.min(rect.x + rect.w - tw - 4, cx - tw / 2));
          const ty = Math.max(rect.y + 4, box.y - 20);
          ctx.fillStyle = `rgba(4, 30, 24, ${(0.88 * lidarQ).toFixed(2)})`;
          ctx.strokeStyle = `rgba(110, 231, 183, ${(0.9 * lidarQ).toFixed(2)})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.roundRect(tx, ty, tw, 17, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#d1fae5';
          ctx.fillText(tag, tx + 5, ty + 12);
        }
        ctx.restore();
      } else if (spec.lidar > 0 && sweepFlare > 0.25) {
        // Non-specialty (flat lane line / traffic light color): barely a faint muted blip to show LiDAR's color blindness
        ctx.save();
        ctx.strokeStyle = `rgba(148, 163, 184, ${(0.28 * sweepFlare).toFixed(3)})`;
        ctx.setLineDash([2, 4]);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // --- C. mmWAVE RADAR SPECIALTY: Intense Amber/Orange Metal RCS Echo & Doppler Lock (Vehicles + Bike Frames, Rain/Fog Proof!) ---
    if (radar && spec.radar > 0.05) {
      const targetAngle = Math.atan2(cy - originY, cx - originX);
      const angDiff = Math.abs(targetAngle - radarBeamAngle);
      const sweepHit = reducedMotion ? 0.85 : angDiff < 0.22 ? Math.pow(1 - angDiff / 0.22, 1.3) : 0;

      if (spec.radar >= 0.5) {
        // STRONG / MEDIUM METAL REFLECTION (Vehicles = 1.0 blazing lock, Cyclists = 0.62 warm metal echo)
        const isStrong = spec.radar >= 0.9;
        const intensity = spec.radar * radarQ * (0.68 + sweepHit * 0.32);
        const pulse = reducedMotion ? 0.45 : (t * (isStrong ? 1.9 : 1.35) + target.distance * 0.13) % 1;
        const rx = Math.max(isStrong ? 18 : 12, box.w * (isStrong ? 0.65 : 0.52));
        const ry = Math.max(isStrong ? 13 : 9, box.h * (isStrong ? 0.56 : 0.42));

        ctx.save();
        // Direct glowing range beam from ego radar to strong metal target
        if (isStrong) {
          const beamGrad = ctx.createLinearGradient(originX, originY, cx, cy);
          beamGrad.addColorStop(0, 'rgba(245, 158, 11, 0.08)');
          beamGrad.addColorStop(1, `rgba(253, 224, 71, ${(intensity * (0.55 + sweepHit * 0.4)).toFixed(3)})`);
          ctx.strokeStyle = beamGrad;
          ctx.lineWidth = 1.6 + sweepHit * 1.4;
          ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.moveTo(originX, originY - 24); ctx.lineTo(cx, cy); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Blazing amber-orange metal RCS core glow
        const core = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry) * 1.25);
        core.addColorStop(0, `rgba(255, 245, 180, ${(intensity * (isStrong ? 0.88 : 0.55)).toFixed(3)})`);
        core.addColorStop(0.45, `rgba(251, 146, 60, ${(intensity * (isStrong ? 0.58 : 0.32)).toFixed(3)})`);
        core.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2); ctx.fill();

        // Crisp concentric Doppler echo rings
        ctx.strokeStyle = isStrong ? '#fde047' : '#fbbf24';
        ctx.lineWidth = isStrong ? 2.4 : 1.5;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = isStrong ? 16 : 8;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

        ctx.strokeStyle = `rgba(254, 240, 138, ${(intensity * (1 - pulse)).toFixed(3)})`;
        ctx.lineWidth = isStrong ? 2.0 : 1.2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx + pulse * (isStrong ? 24 : 14), ry + pulse * (isStrong ? 16 : 10), 0, 0, Math.PI * 2); ctx.stroke();

        // Diamond radar lock reticle at center
        const dSize = isStrong ? 7 + sweepHit * 3 : 4.5;
        ctx.strokeStyle = '#fffbeb';
        ctx.lineWidth = isStrong ? 2 : 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy - dSize); ctx.lineTo(cx + dSize, cy); ctx.lineTo(cx, cy + dSize); ctx.lineTo(cx - dSize, cy);
        ctx.closePath(); ctx.stroke();
        ctx.shadowBlur = 0;

        // High-contrast RCS distance badge (placed below box so it never collides with LiDAR's top badge!)
        const tag = isStrong ? `⚡ 金属强回波 · ${target.distance}m` : `金属车架 · ${target.distance}m`;
        ctx.font = '700 10px "Microsoft YaHei", sans-serif';
        const tw = ctx.measureText(tag).width + 12;
        const tx = Math.max(rect.x + 4, Math.min(rect.x + rect.w - tw - 4, cx - tw / 2));
        const ty = Math.min(rect.y + rect.h - 21, box.y + box.h + 5);
        ctx.fillStyle = 'rgba(32, 16, 4, 0.92)';
        ctx.strokeStyle = isStrong ? '#fbbf24' : 'rgba(251, 191, 36, 0.65)';
        ctx.lineWidth = isStrong ? 1.4 : 1;
        ctx.beginPath(); ctx.roundRect(tx, ty, tw, 18, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = isStrong ? '#fef08a' : '#fde68a';
        ctx.fillText(tag, tx + 6, ty + 12.5);
        ctx.restore();
      } else {
        // Weak non-metal pedestrian RCS: only a tiny faint amber flicker when beam passes directly over
        if (sweepHit > 0.25) {
          ctx.save();
          ctx.fillStyle = `rgba(251, 191, 36, ${(0.28 * sweepHit * radarQ).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  // Extra confirmed highlight border for targets the user already found
  if (options.annotations) for (const target of options.targets) {
    if (!options.marked.has(target.id)) continue;
    const box = annotationRect(target, rect);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.restore();
}

export function drawScannerLens(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  reducedMotion: boolean,
  sensors: SensorFlags = { camera: true, lidar: true, radar: false }
) {
  ctx.save();
  const radius = SCANNER_RADIUS;
  const t = reducedMotion ? 0 : time;
  const primary = sensors.lidar ? '#6ee7b7' : sensors.radar ? '#fbbf24' : '#47eaff';
  const glowColor = sensors.lidar ? '#34d399' : sensors.radar ? '#f59e0b' : '#38bdf8';
  const angle = reducedMotion ? -0.6 : t * 0.95;

  // Rotating internal radar/laser sweep wedge
  if (!reducedMotion) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, radius - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = sensors.radar && !sensors.lidar ? 'rgba(251,191,36,0.16)' : 'rgba(52,211,153,0.14)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, angle - 0.55, angle);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = primary;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    ctx.stroke();
    ctx.restore();
  }

  // Primary glowing lens rim
  ctx.strokeStyle = primary;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner subtle ring
  ctx.strokeStyle = 'rgba(209, 250, 229, 0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, radius - 7, 0, Math.PI * 2); ctx.stroke();

  // Counter-rotating cyber energy arcs
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#ecfdf5';
  ctx.beginPath(); ctx.arc(x, y, radius + 6, angle, angle + 0.65); ctx.stroke();
  ctx.strokeStyle = sensors.radar ? '#fbbf24' : '#47eaff';
  ctx.beginPath(); ctx.arc(x, y, radius + 6, -angle + Math.PI, -angle + Math.PI + 0.55); ctx.stroke();

  // Outer dashed orbital ring
  ctx.strokeStyle = 'rgba(71, 234, 255, 0.36)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.arc(x, y, radius + 13, angle * 0.4, angle * 0.4 + Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // 36 precision ticks around lens
  for (let i = 0; i < 36; i++) {
    const a = i * Math.PI / 18;
    const major = i % 9 === 0;
    const outer = radius + (major ? 16 : i % 3 === 0 ? 11 : 8);
    ctx.strokeStyle = major ? '#ecfdf5' : 'rgba(110, 231, 183, 0.45)';
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (radius + 4), y + Math.sin(a) * (radius + 4));
    ctx.lineTo(x + Math.cos(a) * outer, y + Math.sin(a) * outer);
    ctx.stroke();
  }

  // Center dynamic reticle
  const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 4.5) * 0.14;
  ctx.strokeStyle = 'rgba(236, 253, 245, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(x, y, 8 * pulse, 0, Math.PI * 2);
  ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16);
  ctx.stroke();

  // Active sensor mini pill below lens
  const activeTags = [
    sensors.camera ? 'CAM' : '',
    sensors.lidar ? 'LiDAR' : '',
    sensors.radar ? 'RADAR' : ''
  ].filter(Boolean);
  const pill = activeTags.length === 3 ? '⚡ 三模融合扫描' : activeTags.length ? `${activeTags.join(' + ')} 扫描中` : '传感器未开启';
  ctx.font = '600 10px "Microsoft YaHei", sans-serif';
  const pw = ctx.measureText(pill).width + 16;
  const py = y + radius + 16;
  ctx.fillStyle = 'rgba(8, 14, 33, 0.9)';
  ctx.strokeStyle = primary;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x - pw / 2, py, pw, 20, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ecfdf5';
  ctx.fillText(pill, x - pw / 2 + 8, py + 14);
  ctx.restore();
}

export function drawPerceptionHUD(
  ctx: CanvasRenderingContext2D,
  area: AnnotationRect,
  options: {
    sensors: SensorFlags;
    quality: { camera: number; lidar: number; radar: number };
    time: number;
    reducedMotion: boolean;
    view: 'photo' | 'compare' | 'scan' | 'full';
  }
) {
  const { x, y, w, h } = area;
  const { sensors, quality, time, reducedMotion, view } = options;
  if (view === 'photo') return;

  const fusion = sensors.camera && sensors.lidar && sensors.radar;
  const accent = fusion ? '#75f1bb' : sensors.lidar ? '#34d399' : sensors.radar ? '#fbbf24' : '#47eaff';
  const pulse = reducedMotion ? 0.8 : 0.65 + Math.sin(time * 3.2) * 0.25;

  ctx.save();
  // Glowing optical HUD corner brackets inside photo frame
  const len = 24;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 2.2;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  for (const [cx, cy, dx, dy] of [
    [x + 8, y + 8, 1, 1],
    [x + w - 8, y + 8, -1, 1],
    [x + 8, y + h - 8, 1, -1],
    [x + w - 8, y + h - 8, -1, -1]
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * len);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * len, cy);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // Live sensor telemetry badges at bottom-left of stage
  const pills: { label: string; pct: number; on: boolean; color: string }[] = [
    { label: '摄像头', pct: Math.round(quality.camera * 100), on: sensors.camera, color: '#47eaff' },
    { label: '激光雷达', pct: Math.round(quality.lidar * 100), on: sensors.lidar, color: '#5eead4' },
    { label: '毫米波', pct: Math.round(quality.radar * 100), on: sensors.radar, color: '#fbbf24' }
  ];
  let px = x + 16;
  const py = y + h - 34;
  ctx.font = '600 11px "Microsoft YaHei", sans-serif';
  for (const item of pills) {
    const text = item.on ? `${item.label} ${item.pct}%` : `${item.label} 关`;
    const bw = ctx.measureText(text).width + 24;
    ctx.fillStyle = item.on ? 'rgba(8, 17, 34, 0.88)' : 'rgba(8, 14, 28, 0.62)';
    ctx.strokeStyle = item.on ? item.color : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = item.on ? 1.3 : 1;
    ctx.beginPath(); ctx.roundRect(px, py, bw, 22, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = item.on ? item.color : '#64748b';
    ctx.beginPath(); ctx.arc(px + 10, py + 11, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = item.on ? '#e8f3ff' : '#94a3b8';
    ctx.fillText(text, px + 18, py + 15);
    px += bw + 7;
  }

  if (fusion) {
    const tag = '⚡ 三模融合锁定';
    const tw = ctx.measureText(tag).width + 18;
    ctx.fillStyle = 'rgba(12, 48, 37, 0.92)';
    ctx.strokeStyle = '#75f1bb';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.roundRect(px, py, tw, 22, 6); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(tag, px + 9, py + 15);
  }
  ctx.restore();
}

export function drawClickEffects(
  ctx: CanvasRenderingContext2D,
  area: AnnotationRect,
  effects: PerceptionEffect[],
  time: number,
  reducedMotion: boolean
) {
  if (!effects.length || reducedMotion) return;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(area.x, area.y, area.w, area.h, 12); ctx.clip();

  for (const fx of effects) {
    const p = (time - fx.startedAt) / fx.duration;
    if (p < 0 || p > 1) continue;
    const ease = 1 - Math.pow(1 - p, 3);
    const fade = 1 - p;

    if (fx.kind === 'switch') {
      const sy = area.y + area.h * (1 - ease);
      const grad = ctx.createLinearGradient(0, sy - 30, 0, sy + 64);
      grad.addColorStop(0, 'rgba(71, 234, 255, 0)');
      grad.addColorStop(0.32, fx.color);
      grad.addColorStop(1, 'rgba(71, 234, 255, 0)');
      ctx.globalAlpha = fade * 0.65;
      ctx.fillStyle = grad;
      ctx.fillRect(area.x, sy - 30, area.w, 94);
      ctx.globalAlpha = fade * 0.95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = fx.color;
      ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(area.x, sy); ctx.lineTo(area.x + area.w, sy); ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (fx.kind === 'hit') {
      // Target lock-on expanding rings + contracting brackets + sparks
      ctx.save();
      ctx.strokeStyle = fx.color;
      ctx.shadowColor = fx.color;
      ctx.shadowBlur = 16;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 2.6 * fade + 0.8;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 12 + ease * 58, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 6 + ease * 36, 0, Math.PI * 2); ctx.stroke();

      if (fx.w && fx.h) {
        const pad = (1 - ease) * 28;
        const bx = fx.x - fx.w / 2 - pad;
        const by = fx.y - fx.h / 2 - pad;
        const bw = fx.w + pad * 2;
        const bh = fx.h + pad * 2;
        const c = Math.min(18, Math.max(8, Math.min(fx.w, fx.h) * 0.35));
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2.5;
        for (const [cx, cy, dx, dy] of [
          [bx, by, 1, 1], [bx + bw, by, -1, 1],
          [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]
        ]) {
          ctx.beginPath();
          ctx.moveTo(cx, cy + dy * c); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * c, cy);
          ctx.stroke();
        }
      }

      // 12 radial sparks
      ctx.fillStyle = '#fef9c3';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.2;
        const dist = 10 + ease * (32 + (i % 3) * 14);
        const r = Math.max(0.8, 3.2 * fade);
        ctx.beginPath();
        ctx.arc(fx.x + Math.cos(a) * dist, fx.y + Math.sin(a) * dist, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (fx.kind === 'miss') {
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 226, 255, 0.85)';
      ctx.globalAlpha = fade * 0.75;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 6 + ease * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
