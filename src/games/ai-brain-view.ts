import { drawPremiumTopCar } from '../car-art';
import { label, roundRect } from '../platform';
import { nightBackdrop } from '../theme';
import {
  BRAIN_ACTION_META,
  SCENARIO_MAP,
  type BrainAction,
  type BrainStyle,
  type RoadEvent,
  type RunMode,
} from './ai-brain-model';

export const LANE_Y = [215, 295, 375] as const;
export const CAR_X = 215;

export interface FloatingPop {
  text: string;
  color: string;
  x: number;
  y: number;
  age: number;
}

export interface BrainStageView {
  running: boolean;
  paused: boolean;
  mode: RunMode;
  style: BrainStyle;
  roadOffset: number;
  carY: number;
  carTilt: number;
  speedKmh: number;
  color: string;
  body: string;
  time: number;
  reduced: boolean;
  bulletTime: boolean;
  bulletRemaining: number;
  bulletSeconds: number;
  event: RoadEvent | null;
  combo: number;
  score: number;
  examIndex: number;
  examTotal: number;
  examPassed: number;
  examFinished: boolean;
  bubble: string;
  bubbleTone: 'info' | 'good' | 'warn';
  pops: FloatingPop[];
  dataPulse: number; // 0..1 animation when human teaches AI
  weather: 'clear' | 'rain';
}

function drawPedestrian(ctx: CanvasRenderingContext2D, x: number, y: number, walkPhase: number, shirt: string) {
  ctx.save();
  // Soft safety halo
  ctx.fillStyle = 'rgba(255, 152, 180, 0.22)';
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
  // Head & backpack & shoulders (top-3/4 view)
  ctx.fillStyle = '#38bdf8';
  roundRect(ctx, x - 9, y + 4, 18, 8, 3, '#38bdf8');
  ctx.fillStyle = shirt;
  roundRect(ctx, x - 11, y - 5, 22, 13, 6, shirt);
  ctx.fillStyle = '#fde2c4';
  ctx.beginPath(); ctx.arc(x, y - 4, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.beginPath(); ctx.arc(x, y - 5, 6.2, Math.PI, Math.PI * 2); ctx.fill();
  // Walking feet
  const stride = Math.sin(walkPhase * 10) * 4;
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(x - 5, y + 11 + stride, 3, 0, Math.PI * 2);
  ctx.arc(x + 5, y + 11 - stride, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number, blink: boolean) {
  ctx.save();
  ctx.fillStyle = 'rgba(245, 188, 101, 0.22)';
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 10, y + 10); ctx.lineTo(x + 10, y + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = blink ? '#fffbeb' : '#fde68a';
  ctx.fillRect(x - 6, y - 2, 12, 4);
  ctx.restore();
}

function drawPlannedPath(
  ctx: CanvasRenderingContext2D,
  carY: number,
  action: BrainAction,
  targetY: number,
  eventX: number | null,
  t: number,
  isHuman: boolean
) {
  ctx.save();
  const color = isHuman ? '#75f1bb' : BRAIN_ACTION_META[action].color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.globalAlpha = 0.72;

  const startX = CAR_X + 46;
  const endX = action === 'stop' && eventX !== null
    ? Math.max(startX + 35, Math.min(eventX - 55, startX + 260))
    : startX + 310;

  ctx.beginPath();
  ctx.moveTo(startX, carY);
  if (action === 'detour') {
    const mid1 = startX + (endX - startX) * 0.35;
    const mid2 = startX + (endX - startX) * 0.65;
    ctx.bezierCurveTo(mid1, carY, mid2, targetY, endX, targetY);
  } else {
    ctx.lineTo(endX, carY);
  }
  ctx.stroke();

  // Animated flow chevrons along path
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 18]);
  ctx.lineDashOffset = -t * 90;
  ctx.stroke();
  ctx.setLineDash([]);

  if (action === 'stop') {
    // Stop bar indicator
    ctx.strokeStyle = '#ff7c95';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(endX, carY - 24);
    ctx.lineTo(endX, carY + 24);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBrainWorld(ctx: CanvasRenderingContext2D, v: BrainStageView) {
  const t = v.reduced ? 0 : v.time;
  nightBackdrop(ctx, 1000, 520, true);

  // Parallax night city skyline above road
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 170);
  skyGrad.addColorStop(0, '#070f21');
  skyGrad.addColorStop(1, '#10243d');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1000, 170);

  const cityScroll = (v.roadOffset * 0.25) % 260;
  for (let i = -1; i < 6; i++) {
    const bx = i * 260 - cityScroll;
    roundRect(ctx, bx + 16, 76, 86, 94, 5, '#13263d', '#24415e');
    roundRect(ctx, bx + 114, 52, 118, 118, 5, '#182d47', '#2b4a69');
    ctx.fillStyle = '#47eaff33';
    for (let wy = 90; wy < 156; wy += 18) {
      ctx.fillRect(bx + 28, wy, 16, 9);
      ctx.fillRect(bx + 54, wy, 16, 9);
      ctx.fillRect(bx + 128, wy - 20, 22, 10);
      ctx.fillRect(bx + 162, wy - 20, 22, 10);
      ctx.fillRect(bx + 196, wy - 20, 22, 10);
    }
  }

  // Sidewalks & 3-lane cyber highway
  ctx.fillStyle = '#233b52';
  ctx.fillRect(0, 162, 1000, 14);
  ctx.fillRect(0, 414, 1000, 16);

  const roadGrad = ctx.createLinearGradient(0, 176, 0, 414);
  roadGrad.addColorStop(0, '#101d31');
  roadGrad.addColorStop(0.5, '#15253c');
  roadGrad.addColorStop(1, '#101d31');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, 176, 1000, 238);

  // Glowing road shoulders
  ctx.fillStyle = '#47eaff88';
  ctx.fillRect(0, 176, 1000, 3);
  ctx.fillRect(0, 411, 1000, 3);

  // Scrolling dashed lane dividers (between lanes 0-1 at y=255 and lanes 1-2 at y=335)
  const dashOffset = v.roadOffset % 68;
  ctx.strokeStyle = 'rgba(148, 210, 235, 0.38)';
  ctx.lineWidth = 3;
  ctx.setLineDash([34, 34]);
  ctx.lineDashOffset = dashOffset;
  for (const ly of [255, 335]) {
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(1000, ly); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Lane labels on left edge
  ctx.font = '600 10px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#6f90ac';
  ctx.fillText('1道', 12, LANE_Y[0] + 4);
  ctx.fillText('2道', 12, LANE_Y[1] + 4);
  ctx.fillText('3道', 12, LANE_Y[2] + 4);

  // Active Road Event rendering
  const ev = v.event;
  if (ev) {
    const ex = ev.x;
    const laneY = LANE_Y[ev.lane];
    const scenario = SCENARIO_MAP[ev.scenarioId];

    if (ev.scenarioId === 'clear') {
      // Green gate arches across road
      ctx.save();
      ctx.strokeStyle = '#75f1bb';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#75f1bb';
      ctx.shadowBlur = 16;
      ctx.strokeRect(ex - 10, 180, 20, 228);
      ctx.restore();
      roundRect(ctx, ex - 44, 134, 88, 28, 8, '#0f362c', '#75f1bb');
      label(ctx, '绿灯畅通', ex - 28, 153, 12, '#a7f3d0', 700);
    }

    if (ev.scenarioId === 'redlight') {
      // Zebra crossing & stop line
      for (let zy = 186; zy < 406; zy += 22) {
        roundRect(ctx, ex + 20, zy, 54, 12, 2, 'rgba(226, 244, 255, 0.55)');
      }
      ctx.fillStyle = ev.lightGreen ? '#75f1bb' : '#ff7c95';
      ctx.fillRect(ex - 14, 180, 6, 230);
      // Traffic signal gantry
      roundRect(ctx, ex - 22, 102, 44, 70, 8, '#0b1526', '#4a6884');
      const lightColor = ev.lightGreen ? '#75f1bb' : '#ff5f7e';
      ctx.save();
      ctx.fillStyle = ev.lightGreen ? '#2d3b4e' : '#ff5f7e';
      if (!ev.lightGreen) { ctx.shadowColor = '#ff5f7e'; ctx.shadowBlur = 18; }
      ctx.beginPath(); ctx.arc(ex, 122, 10, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = ev.lightGreen ? '#75f1bb' : '#2d3b4e';
      if (ev.lightGreen) { ctx.shadowColor = '#75f1bb'; ctx.shadowBlur = 18; }
      ctx.beginPath(); ctx.arc(ex, 152, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      roundRect(ctx, ex - 56, 70, 112, 24, 6, '#101d32', lightColor);
      label(ctx, ev.lightGreen ? '绿灯 · 通行' : '红灯 · 停止线', ex - 42, 86, 11, lightColor, 700);
    }

    if (ev.scenarioId === 'pedestrian') {
      for (let zy = 186; zy < 406; zy += 22) {
        roundRect(ctx, ex - 22, zy, 54, 12, 2, 'rgba(226, 244, 255, 0.55)');
      }
      ctx.fillStyle = '#ff98b4';
      ctx.fillRect(ex - 46, 180, 5, 230);
      const py = 166 + ev.pedProgress * 255;
      drawPedestrian(ctx, ex + 5, py, t, '#f472b6');
      roundRect(ctx, ex - 54, 122, 118, 26, 7, '#341628', '#ff98b4');
      label(ctx, '⚠️ 行人横穿斑马线', ex - 46, 139, 11, '#ffc4d6', 700);
    }

    if (ev.scenarioId === 'construction') {
      const boxY = laneY - 34;
      roundRect(ctx, ex - 44, boxY, 132, 68, 8, '#3f2732', '#f5bc65');
      ctx.save();
      ctx.beginPath(); ctx.roundRect(ex - 44, boxY, 132, 68, 8); ctx.clip();
      ctx.strokeStyle = 'rgba(245, 188, 101, 0.48)';
      ctx.lineWidth = 10;
      for (let i = -3; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(ex - 44 + i * 26, boxY); ctx.lineTo(ex - 72 + i * 26, boxY + 72); ctx.stroke();
      }
      ctx.restore();
      const blink = Math.floor(t * 4) % 2 === 0;
      drawCone(ctx, ex - 54, laneY - 14, blink);
      drawCone(ctx, ex - 54, laneY + 14, !blink);
      drawCone(ctx, ex + 98, laneY, blink);
      label(ctx, '🚧 施工占道', ex - 18, laneY + 5, 12, '#fff0c8', 700);

      // Highlight open neighbor lane
      const safeY = LANE_Y[ev.targetLane];
      ctx.save();
      ctx.strokeStyle = 'rgba(117, 241, 187, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      roundRect(ctx, ex - 52, safeY - 26, 148, 52, 8, 'rgba(117, 241, 187, 0.08)', 'rgba(117, 241, 187, 0.6)');
      ctx.setLineDash([]);
      label(ctx, '邻道畅通 ✓', ex - 12, safeY + 4, 11, '#75f1bb', 600);
      ctx.restore();
    }

    if (ev.scenarioId === 'school') {
      ctx.fillStyle = 'rgba(245, 188, 101, 0.14)';
      ctx.fillRect(ex - 110, 179, 280, 232);
      ctx.strokeStyle = '#f5bc65';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.strokeRect(ex - 110, 179, 280, 232);
      ctx.setLineDash([]);
      roundRect(ctx, ex - 76, 116, 166, 36, 8, '#3b2b14', '#f5bc65');
      label(ctx, '🏫 青禾小学 · 限速 30', ex - 64, 139, 12, '#fef08a', 700);
      drawPedestrian(ctx, ex - 40, 164, t * 0.4, '#fbbf24');
      drawPedestrian(ctx, ex + 42, 164, t * 0.4 + 1.5, '#60a5fa');
    }

    if (ev.scenarioId === 'ambulance') {
      const ay = LANE_Y[ev.lane];
      const ax = ev.ambX;
      ctx.save();
      ctx.shadowColor = Math.floor(t * 8) % 2 === 0 ? '#47eaff' : '#ff5f7e';
      ctx.shadowBlur = 18;
      drawPremiumTopCar(ctx, ax, ay, '#f1f5f9', 0.96, 'touring');
      ctx.restore();
      roundRect(ctx, ax - 8, ay - 8, 16, 16, 3, '#ffffff');
      label(ctx, '+', ax - 5, ay + 6, 16, '#ef4444', 800);
      roundRect(ctx, ax - 3, ay - 20, 16, 6, 2, Math.floor(t * 8) % 2 === 0 ? '#38bdf8' : '#ff5f7e');
      // Rear radar warning waves toward player car
      ctx.save();
      ctx.strokeStyle = 'rgba(71, 234, 255, 0.65)';
      ctx.lineWidth = 2;
      for (let r = 0; r < 2; r++) {
        const rad = 42 + ((t * 50 + r * 28) % 56);
        ctx.beginPath(); ctx.arc(ax + 30, ay, rad, -0.45, 0.45); ctx.stroke();
      }
      ctx.restore();
      roundRect(ctx, Math.max(20, ax - 42), ay - 52, 124, 24, 6, '#0d253d', '#47eaff');
      label(ctx, '🚑 急救车鸣笛靠近', Math.max(28, ax - 34), ay - 36, 11, '#a5f3fc', 700);
    }

    // AI Perception bounding box on approaching/decision event
    if (ev.state === 'approaching' || ev.state === 'decision' || ev.state === 'executing') {
      const targetX = ev.scenarioId === 'ambulance' ? ev.ambX : ex;
      const targetY = ev.scenarioId === 'construction' || ev.scenarioId === 'ambulance' ? laneY : 295;
      ctx.save();
      ctx.strokeStyle = scenario.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(targetX - 56, targetY - 46, 112, 92);
      ctx.setLineDash([]);
      const distMeters = Math.max(2, Math.round(Math.abs(targetX - CAR_X) / 14));
      const tagText = `${scenario.badge} · ${distMeters}m`;
      ctx.font = '600 11px "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(tagText).width + 14;
      roundRect(ctx, targetX - tw / 2, targetY - 70, tw, 20, 5, '#081224e6', scenario.color);
      label(ctx, tagText, targetX - tw / 2 + 7, targetY - 56, 11, scenario.color, 600);
      ctx.restore();
    }
  }

  // Forward Perception Sensor Cone from AI Car
  ctx.save();
  const coneGrad = ctx.createRadialGradient(CAR_X + 35, v.carY, 12, CAR_X + 35, v.carY, 270);
  coneGrad.addColorStop(0, v.bulletTime ? 'rgba(188, 152, 255, 0.30)' : 'rgba(71, 234, 255, 0.22)');
  coneGrad.addColorStop(1, 'rgba(71, 234, 255, 0)');
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(CAR_X + 35, v.carY);
  ctx.arc(CAR_X + 35, v.carY, 270, -0.42, 0.42);
  ctx.closePath();
  ctx.fill();
  for (const r of [85, 165, 245]) {
    ctx.strokeStyle = v.bulletTime ? 'rgba(188, 152, 255, 0.32)' : 'rgba(71, 234, 255, 0.20)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(CAR_X + 35, v.carY, r, -0.4, 0.4); ctx.stroke();
  }
  ctx.restore();

  // Dynamic Planned Path visualization
  if (ev && (ev.state === 'decision' || ev.state === 'executing' || ev.state === 'approaching')) {
    const activeAction = ev.chosenAction ?? ev.aiPrediction.action;
    const planTargetY = activeAction === 'detour' ? LANE_Y[ev.targetLane] : v.carY;
    drawPlannedPath(ctx, v.carY, activeAction, planTargetY, ev.scenarioId === 'ambulance' ? null : ev.x, t, ev.humanIntervened);
  }

  // Player / AI Car
  ctx.save();
  ctx.translate(CAR_X, v.carY);
  ctx.rotate(v.carTilt);
  ctx.shadowColor = v.bulletTime ? '#bc98ff' : v.mode === 'exam' ? '#f5bc65' : '#47eaff';
  ctx.shadowBlur = v.reduced ? 0 : 18;
  drawPremiumTopCar(ctx, 0, 0, v.color, 1.0, v.body);
  // Roof AI Brain Pulse Beacon (compact so it complements the panoramic glass canopy)
  ctx.shadowBlur = 0;
  const beaconColor = v.bubbleTone === 'warn' ? '#ff7c95' : v.bubbleTone === 'good' ? '#75f1bb' : '#7aefff';
  ctx.strokeStyle = beaconColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(7, 0, 6.5 + (v.reduced ? 0 : Math.sin(t * 6) * 1.4), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = beaconColor;
  ctx.beginPath(); ctx.arc(7, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Data transfer pulse when human teaches AI
  if (v.dataPulse > 0 && !v.reduced) {
    const p = 1 - v.dataPulse;
    ctx.save();
    ctx.strokeStyle = '#bc98ff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = v.dataPulse;
    ctx.beginPath();
    ctx.arc(CAR_X, v.carY, 28 + p * 70, 0, Math.PI * 2);
    ctx.stroke();
    // Flying data packet toward right-side brain panel
    const dx = CAR_X + p * (980 - CAR_X);
    const dy = v.carY - Math.sin(p * Math.PI) * 90;
    ctx.fillStyle = '#e9d5ff';
    ctx.shadowColor = '#bc98ff';
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(dx, dy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Rain weather layer for Exam / Generalization test
  if (v.weather === 'rain') {
    ctx.save();
    ctx.fillStyle = 'rgba(11, 24, 48, 0.24)';
    ctx.fillRect(0, 0, 1000, 440);
    ctx.strokeStyle = 'rgba(165, 228, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 65; i++) {
      const rx = ((i * 157 - t * 240) % 1060 + 1060) % 1060 - 30;
      const ry = ((i * 89 + t * 520) % 440);
      ctx.moveTo(rx, ry); ctx.lineTo(rx - 8, ry + 18);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Bullet-Time "Coach Takeover" cinematic vignette + countdown ring
  if (v.bulletTime) {
    ctx.save();
    const edge = ctx.createLinearGradient(0, 0, 1000, 0);
    edge.addColorStop(0, 'rgba(188, 152, 255, 0.26)');
    edge.addColorStop(0.14, 'rgba(188, 152, 255, 0)');
    edge.addColorStop(0.86, 'rgba(188, 152, 255, 0)');
    edge.addColorStop(1, 'rgba(188, 152, 255, 0.26)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, 1000, 456);
    ctx.strokeStyle = '#bc98ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 996, 452);

    // Top-center slow-mo callout banner
    roundRect(ctx, 290, 14, 420, 48, 12, 'rgba(26, 17, 48, 0.94)', '#bc98ff');
    label(ctx, `⚡ 慢动作示范 · 剩余 ${v.bulletSeconds.toFixed(1)} 秒`, 312, 34, 13, '#e9d5ff', 700);
    label(ctx, '点下方 4 个动作键（或按 1/2/3/4）教 AI 怎么开！', 312, 52, 11, '#c4b5fd');
    // Countdown bar inside banner
    const ratio = Math.max(0, Math.min(1, v.bulletRemaining));
    ctx.fillStyle = '#3b2463';
    ctx.fillRect(312, 57, 376, 3);
    ctx.fillStyle = '#75f1bb';
    ctx.fillRect(312, 57, 376 * ratio, 3);
    ctx.restore();
  }

  // Car Thought Bubble
  if (v.bubble) {
    ctx.font = '600 12px "Microsoft YaHei", sans-serif';
    const bw = Math.min(340, ctx.measureText(v.bubble).width + 24);
    const bx = Math.max(18, Math.min(980 - bw, CAR_X - 24));
    const by = Math.max(66, v.carY - 68);
    const border = v.bubbleTone === 'good' ? '#75f1bb' : v.bubbleTone === 'warn' ? '#ff7c95' : '#bc98ff';
    roundRect(ctx, bx, by, bw, 30, 9, 'rgba(11, 22, 39, 0.94)', border);
    label(ctx, v.bubble, bx + 12, by + 20, 12, '#eef6ff', 600);
  }

  // Floating score/feedback pops
  for (const pop of v.pops) {
    const alpha = Math.max(0, 1 - pop.age / 1.3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 18px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = pop.color;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 8;
    ctx.fillText(pop.text, pop.x, pop.y - pop.age * 42);
    ctx.restore();
  }

  // Top-left & Top-right HUD pills
  const modeLabel = v.mode === 'exam'
    ? `🏆 全自动毕业路考 · 第 ${Math.min(v.examTotal, v.examIndex + 1)} / ${v.examTotal} 关${v.weather === 'rain' ? ' · 🌧️ 雨夜泛化' : ''}`
    : '🎓 AI 智驾训练营 · 边跑边教';
  roundRect(ctx, 16, 14, v.mode === 'exam' ? 286 : 230, 36, 9, 'rgba(11, 22, 39, 0.88)', v.mode === 'exam' ? '#f5bc65' : '#47eaff');
  label(ctx, modeLabel, 28, 37, 12, v.mode === 'exam' ? '#fef08a' : '#a5f3fc', 700);

  roundRect(ctx, 738, 14, 246, 36, 9, 'rgba(11, 22, 39, 0.88)', '#36516d');
  label(ctx, `${Math.round(v.speedKmh)} km/h`, 752, 37, 14, '#75f1bb', 700);
  label(ctx, `得分 ${v.score}`, 832, 37, 13, '#e8f3ff', 600);
  if (v.combo >= 2) {
    label(ctx, `🔥×${v.combo}`, 924, 37, 13, '#f5bc65', 700);
  } else if (v.paused) {
    label(ctx, '已暂停', 922, 37, 12, '#f5bc65', 700);
  }

  // Bottom 4-Step Autonomous Driving Closed-Loop Pipeline HUD
  roundRect(ctx, 14, 460, 972, 48, 10, '#0b1629', '#2f4966');
  const stageActive = !v.running ? -1
    : !ev ? 0
    : ev.state === 'approaching' ? 0
    : ev.state === 'decision' ? 1
    : ev.state === 'executing' ? 2
    : 3;

  const pipeSteps = [
    {
      idx: 0,
      title: '① 感知 Perception',
      detail: ev ? SCENARIO_MAP[ev.scenarioId].featureLabel : '雷达与视觉巡航扫描中',
      color: '#47eaff',
    },
    {
      idx: 1,
      title: '② 大脑思考 Thinking',
      detail: ev ? `${BRAIN_ACTION_META[ev.aiPrediction.action].short} (${ev.aiPrediction.confidence}%)` : '等待路况特征输入',
      color: '#bc98ff',
    },
    {
      idx: 2,
      title: '③ 轨迹规划 Planning',
      detail: ev && (ev.chosenAction || ev.aiPrediction)
        ? `${ev.humanIntervened ? '教练示范' : 'AI 规划'} → ${BRAIN_ACTION_META[ev.chosenAction ?? ev.aiPrediction.action].label}`
        : '保持当前车道巡航',
      color: '#75f1bb',
    },
    {
      idx: 3,
      title: '④ 车辆执行 Control',
      detail: `${Math.round(v.speedKmh)} km/h · ${v.speedKmh < 3 ? '已刹停' : v.speedKmh <= 30 ? '控速慢行' : '稳定行驶'}`,
      color: '#f5bc65',
    },
  ];

  pipeSteps.forEach((step, i) => {
    const sx = 24 + i * 240;
    const isCurrent = stageActive === i;
    roundRect(ctx, sx, 467, 228, 34, 7, isCurrent ? '#172b47' : '#0f1c31', isCurrent ? step.color : '#263a52');
    label(ctx, step.title, sx + 10, 481, 10, isCurrent ? step.color : '#8ba5bf', 700);
    label(ctx, step.detail, sx + 10, 495, 11, isCurrent ? '#f1f8ff' : '#9fb6cd', 500);
    if (i < 3) {
      label(ctx, '›', sx + 231, 489, 15, '#5b7694', 700);
    }
  });
}
