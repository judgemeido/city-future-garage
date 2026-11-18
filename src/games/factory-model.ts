import type { Vehicle } from '../types';

export type Part = 'battery' | 'inverter' | 'motor' | 'reducer' | 'wheels' | 'body';
export type RouteId = 'city' | 'hill' | 'range';
export interface FactoryVehicle extends Vehicle { inverter: number; reducer: number; wheels: string }
export interface Road { id: RouteId; title: string; subtitle: string; distance: number; speed: number; grade: number; payload: number; seconds: number }
export interface Trace { time: number; distance: number; speed: number; energy: number }
export interface Outcome {
  route: RouteId; routeName: string; vehicle: FactoryVehicle; fingerprint: string;
  targetDistance: number; distance: number; ratio: number; duration: number;
  energy: number; remaining: number; peakPower: number; maxSpeed: number;
  mass: number; rangeEstimate: number; limiting: string; trace: Trace[];
}
export const BATTERIES = [
  { value: 24, title: '轻巧电池', power: 28, voltage: 400, mass: 180, coins: 24 },
  { value: 40, title: '全能电池', power: 85, voltage: 400, mass: 290, coins: 38 },
  { value: 60, title: '长航电池', power: 65, voltage: 400, mass: 420, coins: 52 },
];
// Power is the inverter's DC input limit. All options share the 400 V teaching bus.
export const INVERTERS = [
  { value: 45, title: '轻巧逆变器', efficiency: .94, mass: 12, coins: 10 },
  { value: 100, title: '全能逆变器', efficiency: .96, mass: 18, coins: 18 },
  { value: 160, title: '高效逆变器', efficiency: .98, mass: 26, coins: 30 },
];
export const MOTORS = [
  { value: 60, title: '轻巧电机', torque: 140, rpm: 6000, mass: 70, coins: 20 },
  { value: 90, title: '全能电机', torque: 210, rpm: 8500, mass: 90, coins: 28 },
  { value: 140, title: '劲力电机', torque: 280, rpm: 11000, mass: 120, coins: 44 },
];
export const REDUCERS = [
  { value: 7, title: '巡航减速器', efficiency: .97, torque: 1800, mass: 22, coins: 10 },
  { value: 9, title: '均衡减速器', efficiency: .95, torque: 2500, mass: 28, coins: 16 },
  { value: 12, title: '爬坡减速器', efficiency: .93, torque: 3800, mass: 38, coins: 24 },
];
export const WHEELS = [
  { value: 'eco', title: '低阻城市轮', size: '175/65 R14', radius: .28, rolling: .010, grip: .72, mass: 44, coins: 10 },
  { value: 'grip', title: '均衡抓地轮', size: '205/55 R16', radius: .30, rolling: .014, grip: .95, mass: 60, coins: 18 },
  { value: 'trail', title: '大径旅行轮', size: '225/60 R18', radius: .34, rolling: .019, grip: .83, mass: 76, coins: 26 },
];
export const BODIES = [
  { value: 'city', title: '星驰 · 智驾轿跑', mass: 780, drag: .58, coins: 16 },
  { value: 'touring', title: '星舰 · 智驾 SUV', mass: 940, drag: .69, coins: 22 },
  { value: 'sport', title: '极光 · 电动超跑', mass: 850, drag: .52, coins: 24 },
];
export const ROADS: Road[] = [
  { id: 'city', title: '校园快递员', subtitle: '100 kg 快递任务 · 安全送达才算酷', distance: 1200, speed: 42, grade: 0, payload: 100, seconds: 14 },
  { id: 'hill', title: '山顶补给站', subtitle: '18% 教学坡道 · 护送 300 kg 物资', distance: 400, speed: 36, grade: .18, payload: 300, seconds: 16 },
  { id: 'range', title: '追风远征队', subtitle: '240 km 加速演示 · 把每一度电用好', distance: 240000, speed: 48, grade: 0, payload: 40, seconds: 18 },
];
export const COLORS = ['#62bd95', '#73aaf1', '#ef9579', '#efc45d', '#a594d6', '#f4f2e9'];
export const PART_NAMES: Record<Part, string> = { battery: '电池', inverter: '逆变器', motor: '电机', reducer: '减速器', wheels: '车轮', body: '车身' };
export const SETUPS = [
  { id: 'city', title: '轻巧通勤', parts: { battery: 24, inverter: 45, motor: 60, reducer: 9, wheels: 'eco', body: 'city' }, hint: '小电池、轻电机和低滚阻车轮，适合校园短途；长途要留意电量。' },
  { id: 'hill', title: '重载爬坡', parts: { battery: 40, inverter: 100, motor: 140, reducer: 12, wheels: 'grip', body: 'touring' }, hint: '高供电电池、大扭矩电机和12∶1减速器合作；大电机的功率仍受上游供电限制。' },
  { id: 'range', title: '长途巡航', parts: { battery: 60, inverter: 100, motor: 90, reducer: 7, wheels: 'eco', body: 'city' }, hint: '大容量电池、巡航减速器和低滚阻车轮，适合远征；车重和供电能力仍要一起看。' },
];
export const PART_HINTS: Record<Part, string> = {
  battery: 'kWh 是装多少电；kW 是供电有多快。大容量电池更重，供电功率也不一定更大。',
  inverter: '把电池的直流电变成电机需要的三相交流电。输入功率上限决定能送多少电，效率越高，转换损耗越少。',
  motor: '把电能变成转动。kW 看输出功率，N·m 看扭矩，r/min 看转速；大电机还需要电池和逆变器供得上电。',
  reducer: '把电机的高转速变成车轮的大扭矩。12∶1 表示电机转12圈，车轮转1圈；大传动比更易爬坡，但相同电机转速下车速更低。',
  wheels: '轮胎连着地面。小有效半径让同一扭矩产生更大驱动力；低滚阻省电，抓地系数决定驱动力上限。标称尺寸与教学有效半径分别列出。',
  body: '车身基础质量不含六大部件中的其他部件；轻车身更易加速。CdA 是风阻系数×迎风面积，越小，高速时空气阻力越低。',
};
export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export const round = (n: number, digits = 1) => Number(n.toFixed(digits));
export const batteryOf = (v: Vehicle) => BATTERIES.find(b => b.value === v.battery) ?? BATTERIES[1];
export const inverterOf = (v: Vehicle) => INVERTERS.find(b => b.value === v.inverter) ?? INVERTERS[1];
export const motorOf = (v: Vehicle) => MOTORS.find(m => m.value === v.motor) ?? MOTORS[1];
export const reducerOf = (v: Vehicle) => REDUCERS.find(b => b.value === v.reducer) ?? REDUCERS[1];
export const wheelsOf = (v: Vehicle) => WHEELS.find(b => b.value === v.wheels) ?? WHEELS[1];
export const bodyOf = (v: Vehicle) => BODIES.find(b => b.value === v.body) ?? BODIES[0];
export function normalizeVehicle(input: Partial<Vehicle>): FactoryVehicle {
  return {
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 16) : '我的小电车',
    color: typeof input.color === 'string' && /^#[\da-f]{6}$/i.test(input.color) ? input.color : COLORS[0],
    battery: batteryOf(input as Vehicle).value, motor: motorOf(input as Vehicle).value, body: bodyOf(input as Vehicle).value,
    inverter: inverterOf(input as Vehicle).value, reducer: reducerOf(input as Vehicle).value, wheels: wheelsOf(input as Vehicle).value,
  };
}
// Prefix isolates new physics from legacy run comparisons; legacy records remain visible.
export const fingerprint = (v: Vehicle) => `powertrain-v2:${v.battery}-${inverterOf(v).value}-${v.motor}-${reducerOf(v).value}-${wheelsOf(v).value}-${v.body}`;
export const configurationCost = (v: Vehicle) => batteryOf(v).coins + inverterOf(v).coins + motorOf(v).coins + reducerOf(v).coins + wheelsOf(v).coins + bodyOf(v).coins;
export const consumptionOf = (run: Pick<Outcome, 'distance' | 'energy'>) => run.distance > 1 ? run.energy * 100000 / run.distance : 0;
export function partOptions(part: Part) {
  if (part === 'battery') return BATTERIES.map(p => ({ ...p, detail: `${p.value} kWh · 供电 ${p.power} kW` }));
  if (part === 'inverter') return INVERTERS.map(p => ({ ...p, detail: `输入 ${p.value} kW · 效率 ${round(p.efficiency * 100)}%` }));
  if (part === 'motor') return MOTORS.map(p => ({ ...p, detail: `${p.value} kW · ${p.torque} N·m · ${p.rpm} r/min` }));
  if (part === 'reducer') return REDUCERS.map(p => ({ ...p, detail: `${p.value}∶1 · 效率 ${round(p.efficiency * 100)}%` }));
  if (part === 'wheels') return WHEELS.map(p => ({ ...p, detail: `${p.size} · 滚阻 ${p.rolling.toFixed(3)}` }));
  return BODIES.map(p => ({ ...p, detail: `${p.mass} kg · CdA ${p.drag.toFixed(2)} m²` }));
}
export function configurationStats(v: Vehicle) {
  const battery = batteryOf(v), inverter = inverterOf(v), motor = motorOf(v), reducer = reducerOf(v), wheels = wheelsOf(v), body = bodyOf(v);
  const emptyMass = battery.mass + inverter.mass + motor.mass + reducer.mass + wheels.mass + body.mass + 45;
  const limits = [
    { title: '电池供电能力', power: Math.max(0, battery.power - .7) * inverter.efficiency * .84 * reducer.efficiency },
    { title: '逆变器输入上限', power: inverter.value * inverter.efficiency * .84 * reducer.efficiency },
    { title: '电机输出能力', power: motor.value * reducer.efficiency },
  ];
  const limiting = limits.reduce((a, b) => a.power <= b.power ? a : b);
  const wheelTorque = Math.min(motor.torque * reducer.value * reducer.efficiency, reducer.torque);
  return { emptyMass, cost: configurationCost(v), wheelPower: limiting.power, limiting: limiting.title,
    wheelTorque, torqueForce: wheelTorque / wheels.radius,
    speedCeiling: motor.rpm / reducer.value * 2 * Math.PI * wheels.radius * 60 / 1000,
    efficiencyMin: inverter.efficiency * .84 * reducer.efficiency,
    efficiencyMax: inverter.efficiency * .90 * reducer.efficiency,
  };
}
export function operatingPoint(v: Vehicle, speed: number) {
  const wheels = wheelsOf(v), reducer = reducerOf(v), stats = configurationStats(v);
  const wheelRPM = Math.max(0, speed) / 3.6 / (2 * Math.PI * wheels.radius) * 60;
  return { wheelRPM, motorRPM: wheelRPM * reducer.value, force: Math.min(stats.torqueForce, stats.wheelPower * 1000 / Math.max(speed / 3.6, 2)) };
}

/** Synthetic, deterministic model. Every route starts with 65% SOC; 700 W
 * auxiliaries, 45 kg fixed equipment, 75 kg driver, 55% front-axle load.
 * Motor efficiency varies 84–90%; torque, power, grip and RPM caps all apply.
 */
export function simulateRoad(input: Vehicle, road: Road): Outcome {
  const vehicle = normalizeVehicle(input);
  const battery = batteryOf(vehicle), inverter = inverterOf(vehicle), motor = motorOf(vehicle), reducer = reducerOf(vehicle), wheels = wheelsOf(vehicle), body = bodyOf(vehicle);
  const stats = configurationStats(vehicle), mass = stats.emptyMass + 75 + road.payload;
  const availableEnergy = battery.value * .65, targetSpeed = Math.min(road.speed, stats.speedCeiling) / 3.6;
  const deadline = road.distance / (road.speed / 3.6) * 1.3 + 8, dt = road.id === 'range' ? 2 : .25;
  const wheelPowerLimit = stats.wheelPower * 1000;
  const slope = Math.atan(road.grade);
  const gripForce = wheels.grip * mass * 9.81 * Math.cos(slope) * .55;
  const torqueForceLimit = Math.min(stats.torqueForce, gripForce);
  let time = 0, speed = 0, distance = 0, energy = 0, peakPower = 0, maxSpeed = 0, stalled = 0;
  const trace: Trace[] = [{ time: 0, distance: 0, speed: 0, energy: 0 }];
  const sampleInterval = Math.max(.5, deadline / 110); let nextSample = sampleInterval;
  while (time < deadline && distance < road.distance && energy < availableEnergy) {
    const step = Math.min(dt, deadline - time);
    const resistance = mass * 9.81 * (wheels.rolling * Math.cos(slope) + Math.sin(slope)) + .5 * 1.225 * body.drag * speed * speed;
    const desiredAcceleration = clamp((targetSpeed - speed) * .7, 0, 2.3);
    let force = Math.min(resistance + mass * desiredAcceleration, torqueForceLimit, wheelPowerLimit / Math.max(speed, 2));
    let nextSpeed = clamp(speed + (force - resistance) / mass * step, 0, targetSpeed);
    for (let iteration = 0; iteration < 3; iteration++) {
      force = Math.min(force, wheelPowerLimit / Math.max((speed + nextSpeed) / 2, .1));
      nextSpeed = clamp(speed + (force - resistance) / mass * step, 0, targetSpeed);
    }
    const meanSpeed = (speed + nextSpeed) / 2;
    const motorLoad = clamp(force * meanSpeed / reducer.efficiency / (motor.value * 1000));
    const motorEfficiency = .84 + .06 * Math.sqrt(motorLoad);
    const batteryPower = (force * meanSpeed / reducer.efficiency / motorEfficiency / inverter.efficiency + 700) / 1000;
    let travel = meanSpeed * step, used = batteryPower * step / 3600;
    const portion = Math.min(1, travel > 0 ? (road.distance - distance) / travel : 1, used > 0 ? (availableEnergy - energy) / used : 1);
    travel *= portion; used *= portion; time += step * portion; distance += travel; energy += used;
    speed = nextSpeed; maxSpeed = Math.max(maxSpeed, speed * 3.6); peakPower = Math.max(peakPower, batteryPower);
    stalled = speed < .08 ? stalled + step : 0;
    if (time >= nextSample || portion < 1 || stalled > 8) { trace.push({ time, distance, speed: speed * 3.6, energy }); nextSample = time + sampleInterval; }
    if (stalled > 8 || portion < 1) break;
  }
  trace.push({ time, distance, speed: speed * 3.6, energy });
  const usedPerKm = distance > 1 ? energy / (distance / 1000) : 0;
  return { route: road.id, routeName: road.title, vehicle: { ...vehicle }, fingerprint: fingerprint(vehicle),
    targetDistance: road.distance, distance, ratio: clamp(distance / road.distance), duration: time,
    energy, remaining: Math.max(0, availableEnergy - energy), peakPower, maxSpeed, mass,
    rangeEstimate: usedPerKm > 0 ? availableEnergy / usedPerKm : 0, limiting: stats.limiting, trace };
}
