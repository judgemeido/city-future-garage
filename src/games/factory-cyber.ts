import { drawPremiumCar } from '../car-art';
import { label, roundRect } from '../platform';
import {
  batteryOf,
  bodyOf,
  configurationStats,
  inverterOf,
  motorOf,
  reducerOf,
  round,
  wheelsOf,
  type FactoryVehicle,
  type Part,
} from './factory-model';

export type SensorPackId = 'vision' | 'fusion' | 'omni';
export type ChipTierId = 'basic' | 'pro' | 'ultra';
export type CyberViewMode = 'hologram' | 'xray' | 'aero';
export type ExtendedPart = Part | 'sensor' | 'chip';

export interface SensorPack {
  value: SensorPackId;
  title: string;
  range: number;
  fov: number;
  powerKw: number;
  coins: number;
  detail: string;
  desc: string;
}

export interface ChipTier {
  value: ChipTierId;
  title: string;
  tops: number;
  latencyMs: number;
  coins: number;
  detail: string;
  desc: string;
}

export const SENSOR_PACKS: readonly SensorPack[] = [
  {
    value: 'vision',
    title: '双目纯视觉套件',
    range: 85,
    fov: 120,
    powerKw: 0.3,
    coins: 12,
    detail: '85m 前视 · 120° · 0.3 kW',
    desc: '依靠前视双目摄像头识别车道线与车辆，成本低、功耗小，适合晴天基础辅助驾驶（L2）。',
  },
  {
    value: 'fusion',
    title: '激光 + 毫米波融合',
    range: 165,
    fov: 240,
    powerKw: 0.8,
    coins: 28,
    detail: '165m 融合 · 240° · 0.8 kW',
    desc: '车顶激光雷达精准建图 + 4D 毫米波穿透雨雾测速，大幅提升复杂城市领航可靠性（L3）。',
  },
  {
    value: 'omni',
    title: '360° 全息阵列 + V2X',
    range: 260,
    fov: 360,
    powerKw: 1.4,
    coins: 46,
    detail: '260m 全景 · 360° · V2X 协同',
    desc: '双固态激光雷达 + 全周摄像头 + 毫米波 + 车路协同通信，无死角预判盲区风险（L4）。',
  },
];

export const CHIP_TIERS: readonly ChipTier[] = [
  {
    value: 'basic',
    title: '星尘-64 智驾芯片',
    tops: 64,
    latencyMs: 78,
    coins: 10,
    detail: '64 TOPS · 延迟 78 ms',
    desc: '每秒 64 万亿次运算，胜任车道保持与自动跟车，复杂城市场景需要人类随时接管。',
  },
  {
    value: 'pro',
    title: '苍穹-256 域控双芯',
    tops: 256,
    latencyMs: 32,
    coins: 24,
    detail: '256 TOPS · 延迟 32 ms',
    desc: '双芯片冗余热备，毫秒级融合激光与视觉数据，支持城市无保护左转与自动泊车。',
  },
  {
    value: 'ultra',
    title: '未来-1000 超算大脑',
    tops: 1000,
    latencyMs: 12,
    coins: 42,
    detail: '1000 TOPS · 延迟 12 ms',
    desc: '千级算力支持端到端大模型实时推理，12 毫秒闪电反应，支撑 L4 全场景无人驾驶！',
  },
];

export const sensorOf = (id?: string): SensorPack =>
  SENSOR_PACKS.find(s => s.value === id) ?? SENSOR_PACKS[1];

export const chipOf = (id?: string): ChipTier =>
  CHIP_TIERS.find(c => c.value === id) ?? CHIP_TIERS[1];

export function adRating(sensorId: SensorPackId, chipId: ChipTierId) {
  if (sensorId === 'omni' && chipId === 'ultra') {
    return { level: 'L4', title: 'L4 全场景无人驾驶', color: '#bc98ff', accent: '#75f1bb', score: 98 };
  }
  if (sensorId === 'vision' || chipId === 'basic') {
    const isPlus = sensorId !== 'vision' || chipId !== 'basic';
    return {
      level: isPlus ? 'L2+' : 'L2',
      title: isPlus ? 'L2+ 增强辅助驾驶' : 'L2 组合辅助驾驶',
      color: '#47eaff',
      accent: '#7dd3fc',
      score: isPlus ? 66 : 48,
    };
  }
  const isPro = sensorId === 'omni' || chipId === 'ultra';
  return {
    level: isPro ? 'L3+' : 'L3',
    title: isPro ? 'L3+ 城市高阶领航' : 'L3 有条件自动驾驶',
    color: '#75f1bb',
    accent: '#47eaff',
    score: isPro ? 88 : 78,
  };
}

export function fiveDimMetrics(vehicle: FactoryVehicle, sensorId: SensorPackId, chipId: ChipTierId) {
  const stats = configurationStats(vehicle);
  const bat = batteryOf(vehicle);
  const wheel = wheelsOf(vehicle);
  const body = bodyOf(vehicle);
  const sensor = sensorOf(sensorId);
  const chip = chipOf(chipId);

  const power = Math.min(100, Math.round((stats.wheelPower / 115) * 75 + (stats.wheelTorque / 3400) * 25));
  const range = Math.min(100, Math.round((bat.value / 60) * 68 + (0.019 - wheel.rolling) / 0.009 * 18 + (0.72 - body.drag) / 0.2 * 14));
  const perception = sensor.value === 'omni' ? 98 : sensor.value === 'fusion' ? 78 : 50;
  const compute = chip.value === 'ultra' ? 98 : chip.value === 'pro' ? 76 : 46;
  const handling = Math.min(100, Math.round(wheel.grip * 74 + (0.72 - body.drag) / 0.2 * 26));

  return [
    { label: '动力', value: Math.max(25, power), color: '#f5bc65' },
    { label: '续航', value: Math.max(25, range), color: '#75f1bb' },
    { label: '感知', value: perception, color: '#47eaff' },
    { label: '算力', value: compute, color: '#bc98ff' },
    { label: '操控', value: Math.max(25, handling), color: '#ff98b4' },
  ];
}

function drawRadarChart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  metrics: { label: string; value: number; color: string }[]
) {
  ctx.save();
  roundRect(ctx, cx - r - 30, cy - r - 42, (r + 30) * 2, (r + 34) * 2 + 12, 12, 'rgba(9, 18, 35, 0.84)', '#2f4b6a');
  label(ctx, '整车五维能力', cx - 36, cy - r - 24, 10, '#8cc8e0', 700);

  // Concentric pentagons
  for (const frac of [0.33, 0.66, 1]) {
    ctx.strokeStyle = frac === 1 ? 'rgba(71, 234, 255, 0.35)' : 'rgba(71, 234, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    metrics.forEach((_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / metrics.length;
      const px = cx + Math.cos(a) * r * frac;
      const py = cy + Math.sin(a) * r * frac;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // Axes & labels
  ctx.font = '600 10px "Microsoft YaHei", sans-serif';
  metrics.forEach((m, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / metrics.length;
    ctx.strokeStyle = 'rgba(71, 234, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();

    const lx = cx + Math.cos(a) * (r + 17);
    const ly = cy + Math.sin(a) * (r + 14);
    ctx.fillStyle = m.color;
    ctx.textAlign = 'center';
    ctx.fillText(m.label, lx, ly + 3);
  });
  ctx.textAlign = 'start';

  // Data polygon
  ctx.fillStyle = 'rgba(71, 234, 255, 0.22)';
  ctx.strokeStyle = '#75f1bb';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#47eaff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  metrics.forEach((m, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / metrics.length;
    const rad = (m.value / 100) * r;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Vertex dots
  metrics.forEach((m, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / metrics.length;
    const rad = (m.value / 100) * r;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export function drawCarRoofSensors(
  ctx: CanvasRenderingContext2D,
  carX: number,
  carY: number,
  scale: number,
  sensorId: SensorPackId,
  time: number,
  reduced: boolean,
  facingRight = true,
  bodyType = 'city'
) {
  const t = reduced ? 0 : time;
  const dir = facingRight ? 1 : -1;
  const roofOffset = bodyType === 'sport' ? 41 : bodyType === 'touring' ? 56 : 45;
  const roofX = carX + dir * (bodyType === 'touring' ? 14 : 6) * scale;
  const roofY = carY - roofOffset * scale;

  ctx.save();
  if (sensorId === 'vision') {
    // Sleek front stereo camera pod on windshield top
    const podX = carX + dir * 22 * scale;
    const podY = roofY + 5 * scale;
    roundRect(ctx, podX - 9 * scale, podY - 4 * scale, 18 * scale, 8 * scale, 3 * scale, '#0d2238', '#47eaff');
    ctx.fillStyle = '#47eaff';
    ctx.shadowColor = '#47eaff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(podX + dir * 5 * scale, podY, 2.4 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Forward cyan stereo vision cone
    const coneLen = 105 * scale;
    const g = ctx.createLinearGradient(podX, podY, podX + dir * coneLen, podY);
    g.addColorStop(0, 'rgba(71, 234, 255, 0.34)');
    g.addColorStop(1, 'rgba(71, 234, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(podX + dir * 6 * scale, podY);
    ctx.lineTo(podX + dir * coneLen, podY - 26 * scale);
    ctx.lineTo(podX + dir * coneLen, podY + 22 * scale);
    ctx.closePath();
    ctx.fill();
  } else if (sensorId === 'fusion') {
    // Roof spinning LiDAR turret + nose millimeter-wave radar
    roundRect(ctx, roofX - 13 * scale, roofY - 10 * scale, 26 * scale, 11 * scale, 4 * scale, '#0f2836', '#34d399');
    ctx.fillStyle = '#34d399';
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 12;
    const spinX = roofX + Math.sin(t * 5) * 6 * scale;
    ctx.beginPath(); ctx.arc(spinX, roofY - 4.5 * scale, 2.6 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Emerald LiDAR forward scan fan + pulse arcs
    const fanLen = 148 * scale;
    const lg = ctx.createLinearGradient(roofX, roofY - 5 * scale, roofX + dir * fanLen, roofY);
    lg.addColorStop(0, 'rgba(52, 211, 153, 0.34)');
    lg.addColorStop(1, 'rgba(52, 211, 153, 0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(roofX + dir * 10 * scale, roofY - 5 * scale);
    ctx.lineTo(roofX + dir * fanLen, roofY - 38 * scale);
    ctx.lineTo(roofX + dir * fanLen, roofY + 34 * scale);
    ctx.closePath();
    ctx.fill();

    // Nose amber mmWave radar pulses
    const noseX = carX + dir * 86 * scale;
    const noseY = carY - 3 * scale;
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.9 + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(251, 191, 36, ${(0.75 * (1 - p)).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(noseX, noseY, (12 + p * 44) * scale, facingRight ? -0.45 : Math.PI - 0.45, facingRight ? 0.45 : Math.PI + 0.45);
      ctx.stroke();
    }
  } else {
    // L4 Omni multi-modal dome + 360° holographic shield + V2X cloud waves
    roundRect(ctx, roofX - 18 * scale, roofY - 13 * scale, 36 * scale, 14 * scale, 6 * scale, '#1c193c', '#bc98ff');
    ctx.fillStyle = '#75f1bb';
    ctx.shadowColor = '#bc98ff';
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(roofX - 7 * scale, roofY - 6 * scale, 2.8 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#47eaff';
    ctx.beginPath(); ctx.arc(roofX + 7 * scale, roofY - 6 * scale, 2.8 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // 360° LiDAR dual-side laser beams
    const len = 165 * scale;
    for (const sDir of [-1, 1]) {
      const grad = ctx.createLinearGradient(roofX, roofY - 6 * scale, roofX + sDir * len, roofY);
      grad.addColorStop(0, sDir === dir ? 'rgba(117, 241, 187, 0.34)' : 'rgba(188, 152, 255, 0.26)');
      grad.addColorStop(1, 'rgba(71, 234, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(roofX, roofY - 6 * scale);
      ctx.lineTo(roofX + sDir * len, roofY - 40 * scale);
      ctx.lineTo(roofX + sDir * len, roofY + 34 * scale);
      ctx.closePath();
      ctx.fill();
    }

    // V2X upward cloud connectivity rings
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.75 + i / 3) % 1;
      ctx.strokeStyle = `rgba(188, 152, 255, ${(0.8 * (1 - p)).toFixed(2)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(roofX, roofY - 12 * scale, (8 + p * 36) * scale, -Math.PI * 0.82, -Math.PI * 0.18);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCyberWorkshop(
  ctx: CanvasRenderingContext2D,
  opts: {
    vehicle: FactoryVehicle;
    sensorPack: SensorPackId;
    chipTier: ChipTierId;
    chosenPart: ExtendedPart;
    viewMode: CyberViewMode;
    time: number;
    assemblePulse: number;
    reduced: boolean;
  }
) {
  const { vehicle, sensorPack, chipTier, chosenPart, viewMode, time, assemblePulse, reduced } = opts;
  const t = reduced ? 0 : time;
  const rating = adRating(sensorPack, chipTier);
  const sensor = sensorOf(sensorPack);
  const chip = chipOf(chipTier);
  const body = bodyOf(vehicle);
  const stats = configurationStats(vehicle);

  // Deep cyber hangar background
  const bg = ctx.createRadialGradient(540, 260, 40, 540, 260, 620);
  bg.addColorStop(0, viewMode === 'xray' ? '#0b2238' : viewMode === 'aero' ? '#0a2033' : '#12223d');
  bg.addColorStop(1, '#070e1d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1000, 520);

  // Perspective cyber grid floor
  ctx.save();
  const horizonY = 342;
  ctx.strokeStyle = 'rgba(71, 234, 255, 0.14)';
  ctx.lineWidth = 1;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(540 + i * 52, horizonY);
    ctx.lineTo(540 + i * 160, 520);
    ctx.stroke();
  }
  for (const frac of [0.06, 0.16, 0.30, 0.48, 0.70, 0.94]) {
    const yy = horizonY + (520 - horizonY) * frac;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(1000, yy); ctx.stroke();
  }
  ctx.restore();

  // Rotating Holographic Turntable Platform under car
  const carX = 565;
  const carY = 296;
  const carScale = 2.6;
  const padY = carY + 34 * carScale;
  ctx.save();
  const padGrad = ctx.createRadialGradient(carX, padY, 20, carX, padY, 290);
  padGrad.addColorStop(0, 'rgba(71, 234, 255, 0.25)');
  padGrad.addColorStop(0.65, 'rgba(188, 152, 255, 0.08)');
  padGrad.addColorStop(1, 'rgba(71, 234, 255, 0)');
  ctx.fillStyle = padGrad;
  ctx.beginPath(); ctx.ellipse(carX, padY, 290, 44, 0, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = rating.color;
  ctx.lineWidth = 2;
  ctx.shadowColor = rating.color;
  ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.ellipse(carX, padY, 235, 30, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(117, 241, 187, 0.48)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([28, 18]);
  ctx.lineDashOffset = -t * 36;
  ctx.beginPath(); ctx.ellipse(carX, padY, 268, 37, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Aero Wind Tunnel Streamlines (behind/over car)
  if (viewMode === 'aero') {
    const dragNorm = (body.drag - 0.50) / 0.22; // 0 = sleek sport, 1 = boxy touring
    ctx.save();
    for (let i = 0; i < 11; i++) {
      const baseY = 145 + i * 24;
      const offset = (t * 210 + i * 47) % 140;
      const deflect = Math.max(0, 1 - Math.abs(baseY - 295) / 145);
      const lift = deflect * (46 + dragNorm * 28);
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(117, 241, 187, 0.65)' : 'rgba(71, 234, 255, 0.48)';
      ctx.lineWidth = i % 3 === 0 ? 2 : 1.3;
      ctx.beginPath();
      ctx.moveTo(990, baseY);
      ctx.bezierCurveTo(780, baseY, 710, baseY - lift * 0.9, carX, baseY - lift);
      ctx.bezierCurveTo(420, baseY - lift * 0.9, 340, baseY - lift * 0.2, 210, baseY + (dragNorm * 14 * deflect * Math.sin(t * 6 + i)));
      ctx.setLineDash([42, 22]);
      ctx.lineDashOffset = offset;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Rear wake turbulence indicator proportional to CdA
    const wakeAlpha = 0.22 + dragNorm * 0.45;
    for (let w = 0; w < 3; w++) {
      const wx = 315 - w * 26;
      const wy = 265 + w * 22 + Math.sin(t * 7 + w) * 8;
      ctx.strokeStyle = `rgba(255, 124, 149, ${wakeAlpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx, wy, 10 + dragNorm * 12, t * 5 + w, t * 5 + w + Math.PI * 1.4);
      ctx.stroke();
    }
    roundRect(ctx, 252, 434, 520, 38, 9, 'rgba(10, 22, 40, 0.92)', '#47eaff');
    label(ctx, `💨 风洞实时仿真 · 车身风阻 CdA = ${body.drag.toFixed(2)} m²（${body.drag <= 0.55 ? '极低风阻超跑流线，高速更省电' : body.drag <= 0.60 ? '均衡城市风阻' : '高顶大空间，尾流阻力较大'}）`, 268, 458, 12, '#cdeeff', 600);
    ctx.restore();
  }

  // Draw Vehicle (with transparency in X-Ray mode)
  ctx.save();
  if (viewMode === 'xray') ctx.globalAlpha = 0.34;
  drawPremiumCar(ctx, carX, carY, vehicle.color, carScale, viewMode === 'aero' ? t * 8 : 0, vehicle.body);
  ctx.restore();

  // Draw mounted autonomous driving roof & bumper sensors
  drawCarRoofSensors(ctx, carX, carY, carScale, sensorPack, t, reduced, true, vehicle.body);

  // X-Ray Internal Powertrain + AI Neural Bus Overlay
  if (viewMode === 'xray') {
    ctx.save();
    // Chassis battery pack (glowing emerald bars)
    const batLen = 90 + (batteryOf(vehicle).value / 60) * 90;
    const batX = carX - batLen / 2 - 4;
    const batY = carY + 22;
    roundRect(ctx, batX, batY, batLen, 22, 6, 'rgba(16, 185, 129, 0.42)', '#75f1bb');
    label(ctx, `电池 ${batteryOf(vehicle).value}kWh`, batX + 12, batY + 15, 11, '#d1fae5', 700);

    // Inverter & Motor at front axle
    const invX = carX + 64;
    const invY = carY - 12;
    roundRect(ctx, invX, invY, 54, 24, 6, 'rgba(245, 188, 101, 0.36)', '#f5bc65');
    label(ctx, '逆变器', invX + 8, invY + 16, 11, '#fef08a', 700);

    const motX = carX + 138;
    const motY = carY + 34;
    ctx.fillStyle = 'rgba(245, 188, 101, 0.4)';
    ctx.strokeStyle = '#f5bc65';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(motX, motY, 21, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    label(ctx, '电机', motX - 12, motY + 4, 11, '#fffbeb', 700);

    // Powertrain energy cable (Battery -> Inverter -> Motor)
    ctx.strokeStyle = '#f5bc65';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#f5bc65';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(batX + batLen, batY + 11);
    ctx.lineTo(invX + 24, invY + 24);
    ctx.lineTo(motX - 18, motY);
    ctx.stroke();

    // Animated golden energy dots along powertrain
    if (!reduced) {
      for (let i = 0; i < 4; i++) {
        const p = (t * 0.9 + i / 4) % 1;
        const px = batX + batLen + p * (motX - (batX + batLen));
        const py = batY + 11 - Math.sin(p * Math.PI) * 24;
        ctx.fillStyle = '#fffbeb';
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // AI Domain Controller Chip in cabin center
    const chipX = carX - 24;
    const chipY = carY - 52;
    roundRect(ctx, chipX, chipY, 82, 32, 7, 'rgba(124, 58, 237, 0.5)', '#bc98ff');
    label(ctx, `${chip.tops} TOPS`, chipX + 10, chipY + 20, 12, '#f3e8ff', 700);

    // AI Data Bus (Roof Sensor -> Chip -> Front Motor/Steering)
    const roofAnchorY = carY - (vehicle.body === 'sport' ? 41 : vehicle.body === 'touring' ? 56 : 45) * carScale;
    const roofAnchorX = carX + (vehicle.body === 'touring' ? 14 : 6) * carScale;
    ctx.strokeStyle = '#bc98ff';
    ctx.lineWidth = 2.6;
    ctx.shadowColor = '#bc98ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(roofAnchorX, roofAnchorY);
    ctx.lineTo(chipX + 41, chipY);
    ctx.moveTo(chipX + 82, chipY + 16);
    ctx.lineTo(motX, motY - 20);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Legend bar
    roundRect(ctx, 252, 444, 540, 38, 9, 'rgba(10, 22, 40, 0.92)', '#bc98ff');
    label(ctx, '🩻 X 光透视：⚡ 金色 = 三电动力链（肌肉心脏） · 🧠 紫色 = 智驾感知与超算总线（眼睛大脑）', 268, 468, 12, '#e8dcff', 600);
    ctx.restore();
  }

  // Hologram Mode: Laser Scan Beam + Floating Callout Leaders
  if (viewMode === 'hologram') {
    if (!reduced) {
      const scanX = 290 + ((t * 140) % 550);
      const sg = ctx.createLinearGradient(scanX - 36, 0, scanX + 8, 0);
      sg.addColorStop(0, 'rgba(71, 234, 255, 0)');
      sg.addColorStop(0.85, 'rgba(71, 234, 255, 0.22)');
      sg.addColorStop(1, 'rgba(71, 234, 255, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(scanX - 36, 110, 44, 290);
      ctx.strokeStyle = 'rgba(165, 243, 252, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(scanX, 115); ctx.lineTo(scanX, 395); ctx.stroke();
    }

    const roofAnchorY = carY - (vehicle.body === 'sport' ? 45 : vehicle.body === 'touring' ? 60 : 49) * carScale;
    const roofAnchorX = carX + (vehicle.body === 'touring' ? 14 : 6) * carScale;
    const callouts: { ax: number; ay: number; lx: number; ly: number; text: string; sub: string; active: boolean; color: string }[] = [
      {
        ax: roofAnchorX, ay: roofAnchorY, lx: 716, ly: 92,
        text: sensor.title, sub: `${sensor.range}m · ${sensor.fov}° 视野`,
        active: chosenPart === 'sensor', color: '#47eaff',
      },
      {
        ax: carX + 18, ay: carY - 38, lx: 766, ly: 186,
        text: chip.title, sub: `${chip.tops} TOPS · ${chip.latencyMs}ms`,
        active: chosenPart === 'chip', color: '#bc98ff',
      },
      {
        ax: carX - 18, ay: carY + 34, lx: 274, ly: 444,
        text: `${batteryOf(vehicle).title} ${batteryOf(vehicle).value}kWh`,
        sub: `供电 ${batteryOf(vehicle).power}kW · ${inverterOf(vehicle).title}`,
        active: chosenPart === 'battery' || chosenPart === 'inverter', color: '#75f1bb',
      },
      {
        ax: carX + 136, ay: carY + 34, lx: 678, ly: 444,
        text: `${motorOf(vehicle).title} + ${reducerOf(vehicle).value}∶1`,
        sub: `轮端 ${round(stats.wheelPower)}kW / ${round(stats.wheelTorque)}N·m`,
        active: chosenPart === 'motor' || chosenPart === 'reducer' || chosenPart === 'wheels', color: '#f5bc65',
      },
    ];

    for (const c of callouts) {
      ctx.save();
      ctx.strokeStyle = c.active ? c.color : 'rgba(126, 178, 210, 0.45)';
      ctx.lineWidth = c.active ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(c.ax, c.ay);
      ctx.lineTo(c.lx + 60, c.ly + (c.ly < carY ? 34 : 0));
      ctx.stroke();

      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.arc(c.ax, c.ay, c.active ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();

      roundRect(ctx, c.lx, c.ly, 212, 42, 8, c.active ? 'rgba(20, 42, 68, 0.94)' : 'rgba(10, 20, 38, 0.84)', c.active ? c.color : '#334d6b');
      label(ctx, c.text, c.lx + 11, c.ly + 18, 12, c.active ? c.color : '#e8f3ff', 700);
      label(ctx, c.sub, c.lx + 11, c.ly + 34, 10, '#9ebad4');
      ctx.restore();
    }
  }

  // Assemble Flash Wave when user swaps any part
  if (assemblePulse > 0 && !reduced) {
    const p = 1 - assemblePulse;
    const fx = 240 + p * 680;
    ctx.save();
    ctx.strokeStyle = '#75f1bb';
    ctx.lineWidth = 3;
    ctx.globalAlpha = assemblePulse;
    ctx.shadowColor = '#47eaff';
    ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(fx, 80); ctx.lineTo(fx, 440); ctx.stroke();
    ctx.restore();
  }

  // Top-left Cyber Vehicle Nameplate + AD Level Badge
  roundRect(ctx, 18, 16, 290, 62, 11, 'rgba(9, 18, 35, 0.88)', rating.color);
  label(ctx, `${vehicle.name}`, 32, 41, 18, '#f0f8ff', 700);
  label(ctx, `${rating.title}  ·  ${chip.tops} TOPS`, 32, 64, 12, rating.color, 700);

  // Top-right Live AD Level Chip
  roundRect(ctx, 846, 16, 136, 48, 11, 'rgba(17, 24, 48, 0.92)', rating.color);
  label(ctx, '智驾等级', 862, 34, 10, '#9cb8d4', 600);
  label(ctx, rating.level, 926, 51, 24, rating.color, 800);

  // Left Five-Dimension Radar Chart
  drawRadarChart(ctx, 116, 264, 64, fiveDimMetrics(vehicle, sensorPack, chipTier));

  // Corner cyber HUD brackets
  ctx.save();
  ctx.strokeStyle = 'rgba(71, 234, 255, 0.45)';
  ctx.lineWidth = 2;
  for (const [x, y, dx, dy] of [[10, 10, 1, 1], [990, 10, -1, 1], [10, 510, 1, -1], [990, 510, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * 18); ctx.lineTo(x, y); ctx.lineTo(x + dx * 18, y); ctx.stroke();
  }
  ctx.restore();
}
