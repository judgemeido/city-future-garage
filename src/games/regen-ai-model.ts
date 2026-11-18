export type RegenBatteryMode = 'normal' | 'cold' | 'full';
export type AiHorizonMode = 'short' | 'medium' | 'v2x';
export type AiRegenStyle = 'mild' | 'adaptive' | 'strong';
export type ControlMode = 'ai' | 'manual';
export type ManualPedal = 'accel' | 'coast' | 'regen' | 'brake';

export interface ElevationNode {
  x: number;
  h: number; // meters
}

export interface TrafficLight {
  id: number;
  x: number;
  name: string;
  cycle: number; // total seconds
  greenDuration: number;
  phaseOffset: number;
}

export interface LeadTraffic {
  id: number;
  x: number;
  baseSpeed: number; // m/s
  speed: number;
  color: string;
  body: 'city' | 'touring' | 'sport';
  passed: boolean;
}

export interface RegenAiRoute {
  id: number;
  name: string;
  subtitle: string;
  length: number; // meters
  speedLimit: number; // m/s
  elevation: ElevationNode[];
  lights: TrafficLight[];
  traffic: { x: number; speed: number; color: string; body: 'city' | 'touring' | 'sport' }[];
}

export interface RegenAiConfig {
  battery: RegenBatteryMode;
  horizon: AiHorizonMode;
  regenStyle: AiRegenStyle;
  control: ControlMode;
}

export interface AiThought {
  badge: string;
  reason: string;
  targetType: 'none' | 'light' | 'car' | 'slope' | 'finish';
  targetX: number | null;
  recommendedAction: 'drive' | 'coast' | 'regen' | 'brake';
  tone: 'cyan' | 'mint' | 'amber' | 'coral';
}

export interface RegenCarSim {
  x: number;
  v: number; // m/s
  soc: number; // 0..1
  energyUsedJ: number; // electrical drawn from battery
  energyRegenJ: number; // electrical stored back into battery
  frictionHeatJ: number; // wasted mechanical brake heat
  regenPowerW: number;
  drivePowerW: number;
  frictionPowerW: number;
  action: 'drive' | 'coast' | 'regen' | 'brake';
  redViolations: number;
  hardBrakes: number;
  smoothSaves: number; // lights/cars cleared with near-zero friction heat
  finished: boolean;
}

export interface RegenAiState {
  route: number;
  phase: 'ready' | 'running' | 'ended';
  paused: boolean;
  time: number;
  config: RegenAiConfig;
  player: RegenCarSim;
  ghost: RegenCarSim; // Aggressive late-braking human reference car on the same road
  traffic: LeadTraffic[];
  thought: AiThought;
  combo: number;
  bestCombo: number;
  score: number;
  lastPassedLight: number;
  eventBanner: string;
  bannerTone: 'mint' | 'cyan' | 'amber' | 'coral';
  bannerTimer: number;
}

export const REGEN_AI_DT = 1 / 60;
export const EV_MASS = 1400; // kg
export const GRAVITY = 9.81;
export const PACK_J = 45 * 3600000; // 45 kWh in Joules

export const HORIZON_METERS: Record<AiHorizonMode, number> = {
  short: 42,
  medium: 115,
  v2x: 210,
};

export const BATTERY_ACCEPT_W: Record<RegenBatteryMode, number> = {
  normal: 48000,
  cold: 13000,
  full: 2500,
};

export const REGEN_AI_ROUTES: RegenAiRoute[] = [
  {
    id: 0,
    name: '绿波都市大道',
    subtitle: 'V2X 车路协同预判红绿灯，提前纯电回能实现零摩擦热滑行',
    length: 680,
    speedLimit: 18, // 65 km/h
    elevation: [{ x: 0, h: 0 }, { x: 240, h: 2 }, { x: 460, h: 0 }, { x: 680, h: 0 }],
    lights: [
      { id: 0, x: 195, name: '星光路口', cycle: 14, greenDuration: 6.5, phaseOffset: 2.5 },
      { id: 1, x: 410, name: '未来广场', cycle: 14, greenDuration: 6.5, phaseOffset: 8.2 },
      { id: 2, x: 600, name: '智驾园区', cycle: 14, greenDuration: 7.0, phaseOffset: 3.0 },
    ],
    traffic: [
      { x: 110, speed: 10.5, color: '#8ab4d4', body: 'city' },
    ],
  },
  {
    id: 1,
    name: '盘山势能长坡',
    subtitle: '爬坡蓄势 + 连续 -7% 长下坡，让 AI 把重力势能 mgh 精准转成电池电量',
    length: 760,
    speedLimit: 17.5,
    elevation: [
      { x: 0, h: 0 },
      { x: 180, h: 14 },
      { x: 250, h: 14 },
      { x: 560, h: -6 },
      { x: 760, h: -6 },
    ],
    lights: [
      { id: 0, x: 575, name: '山脚收费站', cycle: 15, greenDuration: 7.0, phaseOffset: 5.5 },
    ],
    traffic: [
      { x: 320, speed: 9.2, color: '#f5bc65', body: 'touring' },
      { x: 510, speed: 10.8, color: '#a5b4fc', body: 'city' },
    ],
  },
  {
    id: 2,
    name: '晚高峰智驾走廊',
    subtitle: '高架起伏 + 密集车流 + V2X 路口，终极考验人机预测性回能策略',
    length: 840,
    speedLimit: 19,
    elevation: [
      { x: 0, h: 0 },
      { x: 160, h: 9 },
      { x: 360, h: 0 },
      { x: 520, h: 10 },
      { x: 740, h: -2 },
      { x: 840, h: -2 },
    ],
    lights: [
      { id: 0, x: 265, name: '高架下匝道', cycle: 13, greenDuration: 6.0, phaseOffset: 1.8 },
      { id: 1, x: 545, name: '中心枢纽', cycle: 14, greenDuration: 6.5, phaseOffset: 7.5 },
      { id: 2, x: 765, name: '夜城终点站', cycle: 14, greenDuration: 7.0, phaseOffset: 3.4 },
    ],
    traffic: [
      { x: 145, speed: 10.2, color: '#7dd3fc', body: 'city' },
      { x: 430, speed: 9.8, color: '#fca5a5', body: 'touring' },
    ],
  },
];

export function elevationAt(route: RegenAiRoute, x: number): { height: number; slope: number } {
  const pts = route.elevation;
  if (x <= pts[0].x) return { height: pts[0].h, slope: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (x <= b.x) {
      const slope = (b.h - a.h) / Math.max(1e-6, b.x - a.x);
      return { height: a.h + (x - a.x) * slope, slope };
    }
  }
  return { height: pts[pts.length - 1].h, slope: 0 };
}

export function lightStateAt(light: TrafficLight, time: number): { color: 'green' | 'amber' | 'red'; remaining: number } {
  const phase = ((time + light.phaseOffset) % light.cycle + light.cycle) % light.cycle;
  if (phase < light.greenDuration) {
    return { color: 'green', remaining: light.greenDuration - phase };
  }
  if (phase < light.greenDuration + 1.8) {
    return { color: 'amber', remaining: light.greenDuration + 1.8 - phase };
  }
  return { color: 'red', remaining: light.cycle - phase };
}

function makeCarSim(battery: RegenBatteryMode): RegenCarSim {
  return {
    x: 12,
    v: 9,
    soc: battery === 'full' ? 0.985 : 0.68,
    energyUsedJ: 0,
    energyRegenJ: 0,
    frictionHeatJ: 0,
    regenPowerW: 0,
    drivePowerW: 0,
    frictionPowerW: 0,
    action: 'drive',
    redViolations: 0,
    hardBrakes: 0,
    smoothSaves: 0,
    finished: false,
  };
}

export function createRegenAiState(routeIdx = 0, config: Partial<RegenAiConfig> = {}): RegenAiState {
  const idx = Math.max(0, Math.min(REGEN_AI_ROUTES.length - 1, routeIdx));
  const route = REGEN_AI_ROUTES[idx];
  const fullConfig: RegenAiConfig = {
    battery: config.battery ?? 'normal',
    horizon: config.horizon ?? 'v2x',
    regenStyle: config.regenStyle ?? 'adaptive',
    control: config.control ?? 'ai',
  };
  return {
    route: idx,
    phase: 'ready',
    paused: false,
    time: 0,
    config: fullConfig,
    player: makeCarSim(fullConfig.battery),
    ghost: makeCarSim(fullConfig.battery),
    traffic: route.traffic.map((t, i) => ({
      id: i,
      x: t.x,
      baseSpeed: t.speed,
      speed: t.speed,
      color: t.color,
      body: t.body,
      passed: false,
    })),
    thought: {
      badge: 'AI ECO-PILOT 待命',
      reason: '配置智驾前瞻视野与回收策略，出发对比「AI 预测回收」与「传统急刹」的电耗差距！',
      targetType: 'none',
      targetX: null,
      recommendedAction: 'drive',
      tone: 'cyan',
    },
    combo: 0,
    bestCombo: 0,
    score: 0,
    lastPassedLight: -1,
    eventBanner: '',
    bannerTone: 'mint',
    bannerTimer: 0,
  };
}

/**
 * Computes the AI Eco-Pilot's predictive driving command based on its configured sensor horizon,
 * V2X traffic-light countdown, radar lead-car gap, high-def map slope, and battery state!
 */
export function evaluateAiEcoPilot(
  car: RegenCarSim,
  route: RegenAiRoute,
  traffic: LeadTraffic[],
  time: number,
  horizonMode: AiHorizonMode,
  regenStyle: AiRegenStyle,
  battery: RegenBatteryMode
): { accelCmd: number; thought: AiThought } {
  const sight = HORIZON_METERS[horizonMode];
  const { slope } = elevationAt(route, car.x);
  const { slope: aheadSlope } = elevationAt(route, car.x + Math.min(80, sight * 0.6));
  const acceptW = BATTERY_ACCEPT_W[battery];
  const maxPureRegenDecel = Math.min(2.6, (acceptW / Math.max(4, car.v)) / EV_MASS);
  const styleFactor = regenStyle === 'mild' ? 0.55 : regenStyle === 'strong' ? 1.25 : 0.92;

  // 1. Check upcoming V2X traffic light within sensor horizon
  const nextLight = route.lights.find(l => l.x > car.x + 2 && l.x - car.x <= sight);
  if (nextLight) {
    const dist = nextLight.x - car.x - 6; // stop 6m before line
    const ls = lightStateAt(nextLight, time);
    const eta = dist / Math.max(3, car.v);

    // Will light be red/amber when we arrive?
    const arrivePhase = ((time + eta + nextLight.phaseOffset) % nextLight.cycle + nextLight.cycle) % nextLight.cycle;
    const arriveGreen = arrivePhase < nextLight.greenDuration;

    if (!arriveGreen && (ls.color !== 'green' || eta > ls.remaining)) {
      // If we have long V2X sight & time until next green is reasonable, calculate green-wave coast speed!
      const timeUntilNextGreen = ls.color === 'red' ? ls.remaining : (nextLight.cycle - ((time + nextLight.phaseOffset) % nextLight.cycle));
      if (horizonMode === 'v2x' && dist > 38 && timeUntilNextGreen < 8.5) {
        const greenWaveSpeed = Math.max(4.5, Math.min(route.speedLimit, dist / (timeUntilNextGreen + 0.6)));
        if (car.v > greenWaveSpeed + 0.6) {
          const decel = Math.min(maxPureRegenDecel, (car.v - greenWaveSpeed) * 0.55);
          return {
            accelCmd: -Math.max(0.4, decel * styleFactor),
            thought: {
              badge: `📡 V2X 绿波预测 · ${Math.round(dist)}m`,
              reason: `${nextLight.name}${ls.color === 'red' ? `红灯剩 ${ls.remaining.toFixed(0)}s` : '即将变红'} → 提前纯电轻回收降到 ${Math.round(greenWaveSpeed * 3.6)} km/h，刚好绿灯不停车通过！`,
              targetType: 'light',
              targetX: nextLight.x,
              recommendedAction: battery === 'full' ? 'coast' : 'regen',
              tone: 'mint',
            },
          };
        }
      }

      // Otherwise brake smoothly to stop line; if short horizon, ends up braking hard (friction heat!)
      const neededDecel = (car.v * car.v) / Math.max(4, 2 * Math.max(2, dist));
      if (dist < 14 && ls.color !== 'green') {
        return {
          accelCmd: -Math.min(6.2, Math.max(2.0, neededDecel * 1.25)),
          thought: {
            badge: horizonMode === 'short' ? '⚠️ 视野太短 · 紧急摩擦刹!' : `🚦 稳停 ${nextLight.name}`,
            reason: horizonMode === 'short'
              ? '前瞻距离仅 42m，到路口才急刹，大量动能变成刹车盘摩擦热浪费了！'
              : `平稳停在线前等待绿灯（剩 ${ls.remaining.toFixed(0)}s）。`,
            targetType: 'light',
            targetX: nextLight.x,
            recommendedAction: neededDecel > maxPureRegenDecel + 0.4 ? 'brake' : 'regen',
            tone: neededDecel > maxPureRegenDecel + 0.4 ? 'coral' : 'mint',
          },
        };
      }
      if (neededDecel > 0.45 || dist < 48) {
        const applied = regenStyle === 'mild' && dist > 26 ? neededDecel * 0.65 : Math.min(5.5, neededDecel * 1.05);
        const triggersFriction = applied > maxPureRegenDecel + 0.35;
        return {
          accelCmd: -applied,
          thought: {
            badge: triggersFriction ? '🔥 摩擦制动介入' : `⚡ 预判纯电回能 · ${Math.round(dist)}m`,
            reason: triggersFriction
              ? battery !== 'normal'
                ? `${battery === 'cold' ? '寒冬低温' : '满电 98%'}电池回充受限，摩擦片被迫补足制动力！`
                : '减速度超过电机纯回能上限，触发了机械刹车发热损耗！'
              : `提前 ${Math.round(dist)}m 用电机温和发电减速，把车速几乎 100% 存回电池！`,
            targetType: 'light',
            targetX: nextLight.x,
            recommendedAction: triggersFriction ? 'brake' : 'regen',
            tone: triggersFriction ? 'amber' : 'mint',
          },
        };
      }
    }
  }

  // 2. Check radar lead vehicle ahead
  const lead = traffic.find(c => c.x > car.x + 2 && c.x - car.x <= Math.min(sight, 125));
  if (lead) {
    const gap = lead.x - car.x - 14;
    if (gap < 48 && car.v > lead.speed + 0.5) {
      const needed = ((car.v - lead.speed) * (car.v + lead.speed)) / Math.max(8, 2 * Math.max(4, gap - 10));
      const decel = Math.min(5.5, Math.max(0.6, needed * styleFactor));
      const friction = decel > maxPureRegenDecel + 0.35;
      return {
        accelCmd: -decel,
        thought: {
          badge: `📡 雷达跟车回能 · 距 ${Math.round(gap)}m`,
          reason: friction
            ? '跟车距离偏近，需要较大制动力，部分动能转为摩擦热！'
            : `毫米波雷达锁定前车（${Math.round(lead.speed * 3.6)} km/h），柔和发电同步车速！`,
          targetType: 'car',
          targetX: lead.x,
          recommendedAction: friction ? 'brake' : 'regen',
          tone: friction ? 'amber' : 'mint',
        },
      };
    }
  }

  // 3. High-definition map slope prediction (downhill gravity recovery!)
  if (slope < -0.025 || (aheadSlope < -0.035 && horizonMode !== 'short')) {
    const targetDownV = route.speedLimit * (regenStyle === 'strong' ? 0.78 : 0.88);
    if (car.v > targetDownV) {
      const decel = Math.min(maxPureRegenDecel * 1.15, (car.v - targetDownV) * 0.75 + Math.abs(slope) * GRAVITY);
      const friction = decel > maxPureRegenDecel + 0.35;
      return {
        accelCmd: -decel,
        thought: {
          badge: `⛰️ 高精地图下坡回能 (${(slope * 100).toFixed(0)}%)`,
          reason: battery === 'full'
            ? '电池 98% 满电装不下下坡势能，机械刹车正在发热控速！'
            : battery === 'cold'
              ? '寒冬低温限制回充功率，下坡部分势能只能变成刹车热！'
              : '长下坡重力加速中！AI 精准控制电机发电，把重力势能 mgh 源源不断充进电池！',
          targetType: 'slope',
          targetX: car.x + 60,
          recommendedAction: friction ? 'brake' : 'regen',
          tone: friction ? 'amber' : 'mint',
        },
      };
    }
  }

  // 4. Smooth eco cruise acceleration
  const cruiseTarget = route.speedLimit * (horizonMode === 'v2x' && regenStyle === 'adaptive' ? 0.92 : 0.98);
  const diff = cruiseTarget - car.v;
  const accelCmd = Math.max(-0.2, Math.min(2.3, diff * 0.65));
  return {
    accelCmd,
    thought: {
      badge: `🤖 AI 经济巡航 · ${Math.round(car.v * 3.6)} km/h`,
      reason: slope > 0.025
        ? '前方上坡路段，平稳输出电机扭矩保持高效区间！'
        : `前瞻视野 ${sight}m 畅通无阻，保持最优低风阻经济巡航。`,
      targetType: 'none',
      targetX: null,
      recommendedAction: accelCmd > 0.15 ? 'drive' : 'coast',
      tone: 'cyan',
    },
  };
}

function stepSingleCar(
  car: RegenCarSim,
  route: RegenAiRoute,
  accelCmd: number,
  battery: RegenBatteryMode,
  dt: number
) {
  if (car.finished) {
    car.regenPowerW = 0;
    car.drivePowerW = 0;
    car.frictionPowerW = 0;
    return;
  }

  const { slope } = elevationAt(route, car.x);
  const fRoll = 0.012 * EV_MASS * GRAVITY;
  const fAero = 0.34 * car.v * car.v;
  const fGravity = EV_MASS * GRAVITY * slope; // positive uphill, negative downhill
  const fResist = fRoll + fAero + fGravity;

  // Desired wheel traction force F_wheel = m * a + F_resist
  const desiredWheelForce = EV_MASS * accelCmd + fResist;

  let actualWheelForce = desiredWheelForce;
  let drivePowerW = 0;
  let regenPowerW = 0;
  let frictionPowerW = 0;
  let action: RegenCarSim['action'] = 'coast';

  if (desiredWheelForce > 25) {
    // Driving: Battery -> Motor -> Wheels
    action = 'drive';
    const maxDriveForce = Math.min(EV_MASS * 3.4, 72000 / Math.max(3, car.v));
    actualWheelForce = Math.min(maxDriveForce, desiredWheelForce);
    const mechPower = actualWheelForce * Math.max(0.5, car.v);
    drivePowerW = mechPower / 0.88; // 88% inverter+motor efficiency
    car.energyUsedJ += drivePowerW * dt;
  } else if (desiredWheelForce < -25 && car.v > 0.25) {
    // Braking: Cooperative Regenerative Braking (CRBS) splits between Motor Generator & Friction Disc
    const brakeForceNeeded = Math.min(EV_MASS * 6.5, -desiredWheelForce);
    actualWheelForce = -brakeForceNeeded;

    const headRoomJ = Math.max(0, (1 - car.soc) * PACK_J);
    const acceptW = Math.min(BATTERY_ACCEPT_W[battery], headRoomJ / Math.max(dt, 0.5));
    // Low speed regen tapers smoothly below 2.5 m/s
    const lowSpeedFactor = Math.min(1, car.v / 2.5);
    const maxMechRegenPower = (acceptW / 0.82) * lowSpeedFactor;
    const maxRegenForce = Math.min(EV_MASS * 2.5, maxMechRegenPower / Math.max(0.8, car.v));

    const regenForce = Math.min(brakeForceNeeded, maxRegenForce);
    const frictionForce = Math.max(0, brakeForceNeeded - regenForce);

    const regenMechW = regenForce * car.v;
    regenPowerW = regenMechW * 0.82;
    frictionPowerW = frictionForce * car.v;

    car.energyRegenJ += regenPowerW * dt;
    car.frictionHeatJ += frictionPowerW * dt;

    if (frictionPowerW > 2200) {
      action = 'brake';
      if (frictionPowerW > 14000) car.hardBrakes++;
    } else if (regenPowerW > 200) {
      action = 'regen';
    } else {
      action = 'coast';
    }
  } else {
    actualWheelForce = 0;
    action = 'coast';
  }

  // Auxiliary electronics (350W)
  car.energyUsedJ += 350 * dt;

  const netAccel = (actualWheelForce - fResist) / EV_MASS;
  const nextV = Math.max(0, Math.min(route.speedLimit * 1.25, car.v + netAccel * dt));
  const avgV = (car.v + nextV) * 0.5;
  car.x += avgV * dt;
  car.v = nextV;
  car.soc = Math.max(0.05, Math.min(1.0, (battery === 'full' ? 0.985 : 0.68) + (car.energyRegenJ - car.energyUsedJ) / PACK_J));
  car.drivePowerW = drivePowerW;
  car.regenPowerW = regenPowerW;
  car.frictionPowerW = frictionPowerW;
  car.action = action;

  if (car.x >= route.length) {
    car.x = route.length;
    car.finished = true;
  }
}

export function stepRegenAi(state: RegenAiState, manualPedal: ManualPedal | null = null): void {
  if (state.phase !== 'running' || state.paused) return;
  const route = REGEN_AI_ROUTES[state.route];
  const dt = REGEN_AI_DT;
  state.time += dt;
  if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);

  // Move traffic cars gently along the corridor
  for (const tc of state.traffic) {
    const aheadLight = route.lights.find(l => l.x > tc.x && l.x - tc.x < 34);
    const stopForRed = aheadLight && lightStateAt(aheadLight, state.time).color === 'red';
    const targetV = stopForRed ? 0 : tc.baseSpeed;
    tc.speed += (targetV - tc.speed) * Math.min(1, dt * 3);
    tc.x += tc.speed * dt;
    if (tc.x > route.length + 40) tc.x = route.length + 40;
  }

  // Evaluate AI Eco-Pilot continuously (even in manual mode, AI acts as live Co-Pilot advice!)
  const aiEval = evaluateAiEcoPilot(
    state.player,
    route,
    state.traffic,
    state.time,
    state.config.horizon,
    state.config.regenStyle,
    state.config.battery
  );
  state.thought = aiEval.thought;

  let playerAccel = aiEval.accelCmd;
  if (state.config.control === 'manual') {
    const pedal = manualPedal ?? 'coast';
    if (pedal === 'accel') playerAccel = 2.4;
    else if (pedal === 'regen') playerAccel = -1.75; // sweet-spot pure regen decel
    else if (pedal === 'brake') playerAccel = -5.4; // hard mechanical + regen brake
    else playerAccel = 0; // pure coast
  }

  const prevX = state.player.x;
  const prevHeat = state.player.frictionHeatJ;
  stepSingleCar(state.player, route, playerAccel, state.config.battery, dt);

  // Check traffic light crossing for player (green-wave bonus vs red-light penalty)
  for (const light of route.lights) {
    if (prevX < light.x && state.player.x >= light.x && state.lastPassedLight < light.id) {
      state.lastPassedLight = light.id;
      const ls = lightStateAt(light, state.time);
      if (ls.color === 'red') {
        state.player.redViolations++;
        state.player.v *= 0.25;
        state.player.frictionHeatJ += 35000; // emergency AEB stop penalty
        state.combo = 0;
        state.eventBanner = `🚨 ${light.name}闯红灯触发 AEB 急刹！浪费 35 kJ 摩擦热`;
        state.bannerTone = 'coral';
        state.bannerTimer = 2.4;
      } else {
        const cleanPass = state.player.frictionHeatJ - prevHeat < 500;
        state.player.smoothSaves++;
        state.combo++;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const pts = 220 + state.combo * 60 + (cleanPass ? 80 : 0);
        state.score += pts;
        state.eventBanner = `✦ ${light.name}绿波丝滑通过！+${pts} 分（连击 ×${state.combo}）`;
        state.bannerTone = 'mint';
        state.bannerTimer = 2.2;
      }
    }
  }

  // Step Ghost Car (aggressive short-horizon late-braker on the exact same road & battery!)
  const ghostEval = evaluateAiEcoPilot(state.ghost, route, state.traffic, state.time, 'short', 'mild', state.config.battery);
  stepSingleCar(state.ghost, route, ghostEval.accelCmd, state.config.battery, dt);

  // Continuous eco score for pure electrical regen
  if (state.player.regenPowerW > 500 && state.player.frictionPowerW < 1000) {
    state.score += Math.round((state.player.regenPowerW / 1000) * dt * 1.2);
  }

  if (state.player.finished) {
    state.phase = 'ended';
    // Efficiency bonus on finish
    const savedPct = energySavingPercent(state);
    if (savedPct > 0) state.score += Math.round(savedPct * 12);
  }
}

export function netConsumptionKwhPer100km(car: RegenCarSim): number {
  const km = Math.max(0.05, (car.x - 12) / 1000);
  const netKwh = (car.energyUsedJ - car.energyRegenJ) / 3600000;
  return (netKwh / km) * 100;
}

export function energySavingPercent(state: RegenAiState): number {
  const ghostNet = Math.max(1000, state.ghost.energyUsedJ - state.ghost.energyRegenJ);
  const playerNet = state.player.energyUsedJ - state.player.energyRegenJ;
  return Math.round(((ghostNet - playerNet) / ghostNet) * 100);
}

export function regenAiStars(state: RegenAiState): number {
  if (!state.player.finished) return 0;
  const recRatio = state.player.energyRegenJ / Math.max(1, state.player.energyRegenJ + state.player.frictionHeatJ);
  const zeroRed = state.player.redViolations === 0;
  if (zeroRed && (recRatio >= 0.72 || energySavingPercent(state) >= 12 || (state.config.battery === 'full' && state.player.frictionHeatJ < 90000))) return 3;
  if (zeroRed) return 2;
  return 1;
}
