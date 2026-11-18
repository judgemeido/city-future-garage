export interface ChargingShift {
  id: number;
  name: string;
  subtitle: string;
  baseCapacity: number; // kW
  goalServed: number;
  spawnInterval: number; // seconds
  boostBonus: number; // extra kW from solar battery storage
}

export interface QueuedCar {
  uid: number;
  slot: number; // 0, 1, 2
  name: string;
  body: 'city' | 'touring' | 'sport';
  color: string;
  capacityKwh: number;
  energyKwh: number;
  targetSoc: number; // usually 0.80 (80% fast-charge sweet spot!)
  maxAcceptKw: number;
  patience: number; // seconds remaining
  maxPatience: number;
  plug: number | null; // 0 or 1
  powerKw: number;
  inTrickle: boolean;
  reachedTarget: boolean;
}

export interface ChargingArcadeState {
  shift: number;
  phase: 'ready' | 'running' | 'ended';
  paused: boolean;
  elapsed: number;
  baseCapacity: number;
  strategy: 'balanced' | 'priority';
  prioritySlot: number;
  solarCharge: number; // 0..100%
  boostRemaining: number; // seconds
  cars: QueuedCar[];
  served: number;
  missed: number;
  combo: number;
  bestCombo: number;
  score: number;
  totalDeliveredKwh: number;
  nextUid: number;
  spawnTimer: number;
  lastEvent: string;
}

export const CHARGING_SHIFTS: ChargingShift[] = [
  { id: 0, name: '午间快充潮', subtitle: '90 kW 共享电网 · 体验 80% 满格即放行', baseCapacity: 90, goalServed: 4, spawnInterval: 7.5, boostBonus: 50 },
  { id: 1, name: '晚高峰博弈', subtitle: '100 kW 限容 · 灵活切换优先给急单车', baseCapacity: 100, goalServed: 6, spawnInterval: 6.2, boostBonus: 60 },
  { id: 2, name: '800V 超充风暴', subtitle: '120 kW 旗舰站 · 善用光伏储能大招救急', baseCapacity: 120, goalServed: 7, spawnInterval: 5.2, boostBonus: 70 },
];

const CAR_TEMPLATES: { name: string; body: 'city' | 'touring' | 'sport'; color: string; cap: number; soc: number; accept: number; patience: number }[] = [
  { name: '智驾闪送车', body: 'city', color: '#62bd95', cap: 40, soc: 0.32, accept: 65, patience: 34 },
  { name: '城市无人出租', body: 'city', color: '#69b4ff', cap: 50, soc: 0.38, accept: 60, patience: 38 },
  { name: '星舰大 SUV', body: 'touring', color: '#f5bc65', cap: 64, soc: 0.42, accept: 55, patience: 44 },
  { name: '800V 极光超跑', body: 'sport', color: '#bc98ff', cap: 56, soc: 0.28, accept: 110, patience: 30 },
  { name: '急单急救车', body: 'touring', color: '#ff8a8a', cap: 45, soc: 0.35, accept: 85, patience: 26 },
];

export function effectiveCapacity(s: ChargingArcadeState): number {
  const cfg = CHARGING_SHIFTS[s.shift];
  return s.baseCapacity + (s.boostRemaining > 0 ? cfg.boostBonus : 0);
}

export function spawnCarIntoSlot(s: ChargingArcadeState, slot: number, playerBody: 'city' | 'touring' | 'sport' = 'city', playerColor = '#62bd95'): QueuedCar {
  const idx = (s.nextUid + s.shift * 2) % CAR_TEMPLATES.length;
  const tpl = CAR_TEMPLATES[idx];
  const usePlayer = s.nextUid === 1;
  const cap = tpl.cap;
  const car: QueuedCar = {
    uid: s.nextUid++,
    slot,
    name: usePlayer ? '我的未来座驾' : tpl.name,
    body: usePlayer ? playerBody : tpl.body,
    color: usePlayer ? playerColor : tpl.color,
    capacityKwh: cap,
    energyKwh: cap * tpl.soc,
    targetSoc: 0.8,
    maxAcceptKw: tpl.accept,
    patience: tpl.patience,
    maxPatience: tpl.patience,
    plug: null,
    powerKw: 0,
    inTrickle: false,
    reachedTarget: false,
  };
  s.cars.push(car);
  return car;
}

export function createChargingArcade(shiftIndex = 0, playerBody: 'city' | 'touring' | 'sport' = 'city', playerColor = '#62bd95'): ChargingArcadeState {
  const cfg = CHARGING_SHIFTS[Math.max(0, Math.min(CHARGING_SHIFTS.length - 1, shiftIndex))];
  const state: ChargingArcadeState = {
    shift: cfg.id,
    phase: 'ready',
    paused: false,
    elapsed: 0,
    baseCapacity: cfg.baseCapacity,
    strategy: 'balanced',
    prioritySlot: 0,
    solarCharge: 55,
    boostRemaining: 0,
    cars: [],
    served: 0,
    missed: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    totalDeliveredKwh: 0,
    nextUid: 1,
    spawnTimer: 2.5,
    lastEvent: '点击车位插上超充枪，充到 80% 绿线即可点击放行！',
  };
  spawnCarIntoSlot(state, 0, playerBody, playerColor);
  spawnCarIntoSlot(state, 1, playerBody, playerColor);
  return state;
}

export function allocateArcadePower(s: ChargingArcadeState): void {
  const totalCap = effectiveCapacity(s);
  for (const c of s.cars) {
    c.powerKw = 0;
    c.inTrickle = c.energyKwh / c.capacityKwh >= c.targetSoc;
  }
  const active = s.cars.filter(c => c.plug !== null && c.energyKwh < c.capacityKwh - 0.01);
  if (!active.length) return;

  // Authentic EV charging curve: above 80% SOC, battery BMS limits acceptance to 35% (trickle protection)
  const capOf = (c: QueuedCar) => (c.inTrickle ? c.maxAcceptKw * 0.35 : c.maxAcceptKw);

  if (s.strategy === 'priority') {
    const ordered = [...active].sort((a, b) => (a.slot === s.prioritySlot ? -1 : b.slot === s.prioritySlot ? 1 : a.patience - b.patience));
    let rem = totalCap;
    for (const c of ordered) {
      c.powerKw = Math.min(capOf(c), rem);
      rem = Math.max(0, rem - c.powerKw);
    }
  } else {
    let rem = totalCap;
    let pool = [...active];
    while (pool.length && rem > 1e-6) {
      const share = rem / pool.length;
      const next: QueuedCar[] = [];
      let used = 0;
      for (const c of pool) {
        const room = capOf(c) - c.powerKw;
        if (room <= share + 1e-6) {
          c.powerKw += room;
          used += room;
        } else {
          c.powerKw += share;
          used += share;
          next.push(c);
        }
      }
      rem = Math.max(0, rem - used);
      if (next.length === pool.length) break;
      pool = next;
    }
  }
}

export function connectPlugToSlot(s: ChargingArcadeState, slot: number): { ok: boolean; action: 'connected' | 'released' | 'unplugged' | 'no-plug' | 'empty' } {
  const car = s.cars.find(c => c.slot === slot);
  if (!car) return { ok: false, action: 'empty' };

  // If already reached 80% target, clicking releases the car for big reward!
  if (car.reachedTarget) {
    const idx = s.cars.indexOf(car);
    s.cars.splice(idx, 1);
    s.served++;
    s.combo++;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    const speedBonus = Math.round((car.patience / car.maxPatience) * 120);
    s.score += 200 + speedBonus + s.combo * 40;
    s.lastEvent = `⚡ ${car.name} 达标放行！+${200 + speedBonus + s.combo * 40} 分（连击 ×${s.combo}）`;
    allocateArcadePower(s);
    if (s.served >= CHARGING_SHIFTS[s.shift].goalServed) s.phase = 'ended';
    return { ok: true, action: 'released' };
  }

  // If already plugged in, unplug it
  if (car.plug !== null) {
    car.plug = null;
    allocateArcadePower(s);
    s.lastEvent = `已拔下 ${car.name} 的超充枪，腾出给急单车辆！`;
    return { ok: true, action: 'unplugged' };
  }

  // Find a free plug (0 or 1)
  const usedPlugs = new Set(s.cars.map(c => c.plug).filter(p => p !== null));
  const freePlug = [0, 1].find(p => !usedPlugs.has(p));
  if (freePlug === undefined) {
    s.lastEvent = '两把超充枪都在使用中！先拔下已达 80% 的车或点击其他车切换！';
    return { ok: false, action: 'no-plug' };
  }

  car.plug = freePlug;
  s.prioritySlot = slot;
  allocateArcadePower(s);
  s.lastEvent = `🔌 ${freePlug + 1} 号超充枪已接入 ${car.name}（实时 ${Math.round(car.powerKw)} kW）！`;
  return { ok: true, action: 'connected' };
}

export function triggerSolarBoost(s: ChargingArcadeState): boolean {
  if (s.solarCharge < 100 || s.boostRemaining > 0) return false;
  s.solarCharge = 0;
  s.boostRemaining = 8;
  allocateArcadePower(s);
  s.lastEvent = `☀️ 光伏储能已释放！站点功率飙升至 ${effectiveCapacity(s)} kW（持续 8 秒）！`;
  return true;
}

export function stepChargingArcade(
  s: ChargingArcadeState,
  dt: number,
  playerBody: 'city' | 'touring' | 'sport' = 'city',
  playerColor = '#62bd95'
): void {
  if (s.phase !== 'running' || s.paused || dt <= 0) return;
  const cfg = CHARGING_SHIFTS[s.shift];
  s.elapsed += dt;

  // Solar storage recharges steadily when not boosting
  if (s.boostRemaining > 0) {
    s.boostRemaining = Math.max(0, s.boostRemaining - dt);
  } else {
    s.solarCharge = Math.min(100, s.solarCharge + dt * 6.5);
  }

  allocateArcadePower(s);

  // Energy integration (scaled so 1 real second = 1.65 simulated charging minutes => snappy 8-14s per car!)
  const simHours = (dt * 1.65) / 60;
  for (let i = s.cars.length - 1; i >= 0; i--) {
    const c = s.cars[i];
    if (c.powerKw > 0) {
      const gained = Math.min(c.capacityKwh - c.energyKwh, c.powerKw * simHours);
      c.energyKwh += gained;
      s.totalDeliveredKwh += gained;
      if (!c.reachedTarget && c.energyKwh / c.capacityKwh >= c.targetSoc) {
        c.reachedTarget = true;
        s.lastEvent = `✅ ${c.name} 已达 80% 快充甜点！立刻点击放行（超过 80% 会变慢）！`;
      }
    }
    // Patience ticks down slower once target is reached, faster while waiting uncharged
    c.patience -= dt * (c.reachedTarget ? 0.35 : c.plug !== null ? 0.65 : 1.0);
    if (c.patience <= 0) {
      s.cars.splice(i, 1);
      s.missed++;
      s.combo = 0;
      s.lastEvent = `⏰ ${c.name} 等待超时离开了！优先照看倒计时红条的急单车！`;
    }
  }

  // Spawn new cars into free slots if needed
  const remainingNeeded = cfg.goalServed - s.served;
  s.spawnTimer -= dt;
  const occupied = new Set(s.cars.map(c => c.slot));
  const freeSlot = [0, 1, 2].find(sl => !occupied.has(sl));
  if (freeSlot !== undefined && s.cars.length < Math.min(3, remainingNeeded) && (s.spawnTimer <= 0 || s.cars.length === 0)) {
    spawnCarIntoSlot(s, freeSlot, playerBody, playerColor);
    s.spawnTimer = cfg.spawnInterval;
  }

  // End condition: served enough or missed 3 cars
  if (s.served >= cfg.goalServed || s.missed >= 3) {
    s.phase = 'ended';
  }
}

export function chargingArcadeStars(s: ChargingArcadeState): number {
  const cfg = CHARGING_SHIFTS[s.shift];
  if (s.served < cfg.goalServed) return s.served >= Math.ceil(cfg.goalServed / 2) ? 1 : 0;
  if (s.missed === 0 && s.bestCombo >= 3) return 3;
  if (s.missed <= 1) return 2;
  return 1;
}
