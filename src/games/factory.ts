import type { GameAPI, MountedGame, Vehicle } from '../types';
import { createStage, roundRect, label, downloadFile, escapeHTML } from '../platform';
import { drawPremiumCar, premiumCarSVG } from '../car-art';
import { createChallenge, answerEvent, challengeStars, type Challenge } from './factory-challenge';
import './factory.css';

type Part = 'battery' | 'motor' | 'body';
type RouteId = 'city' | 'hill' | 'range';
interface BatterySpec { value: number; title: string; power: number; mass: number; coins: number; hint: string }
interface MotorSpec { value: number; title: string; torque: number; mass: number; coins: number }
interface BodySpec { value: string; title: string; mass: number; drag: number; rolling: number; gear: number; coins: number }
interface Road { id: RouteId; title: string; subtitle: string; distance: number; speed: number; grade: number; payload: number; seconds: number }
interface Trace { time: number; distance: number; speed: number; energy: number }
interface Outcome {
  route: RouteId; routeName: string; vehicle: Vehicle; fingerprint: string;
  targetDistance: number; distance: number; ratio: number; duration: number;
  energy: number; remaining: number; peakPower: number; maxSpeed: number;
  mass: number; rangeEstimate: number; limiting: string; trace: Trace[];
}
interface SavedRun extends Omit<Outcome, 'trace'> { timestamp: string; stars?: number; decisions?: Challenge['answers']; mistakes?: number }
interface Playback { outcome: Outcome; elapsed: number; displaySeconds: number; paused: boolean; finished: boolean; challenge: Challenge; eventPhase: 'question' | 'feedback' | null }

const BATTERIES: BatterySpec[] = [
  { value: 24, title: '轻巧电池', power: 28, mass: 180, coins: 24, hint: '轻便省预算 · 供电 28 kW' },
  { value: 40, title: '全能电池', power: 85, mass: 290, coins: 38, hint: '动力搭档 · 供电 85 kW' },
  { value: 60, title: '长航电池', power: 65, mass: 420, coins: 52, hint: '带更多电 · 供电 65 kW' },
];
const MOTORS: MotorSpec[] = [
  { value: 60, title: '轻巧电机', torque: 140, mass: 70, coins: 20 },
  { value: 90, title: '全能电机', torque: 210, mass: 90, coins: 28 },
  { value: 140, title: '劲力电机', torque: 280, mass: 120, coins: 44 },
];
const BODIES: BodySpec[] = [
  { value: 'city', title: '豆豆 · 城市轻巧车', mass: 780, drag: .58, rolling: .012, gear: 8.4, coins: 16 },
  { value: 'touring', title: '山野 · 旅行跨界车', mass: 940, drag: .69, rolling: .014, gear: 9.2, coins: 22 },
  { value: 'sport', title: '闪电 · 流线运动型', mass: 850, drag: .52, rolling: .013, gear: 7.6, coins: 24 },
];
const ROADS: Road[] = [
  { id: 'city', title: '校园快递员', subtitle: '100 kg 快递任务 · 安全送达才算酷', distance: 1200, speed: 42, grade: 0, payload: 100, seconds: 14 },
  { id: 'hill', title: '山顶补给站', subtitle: '18% 教学坡道 · 护送 300 kg 物资', distance: 400, speed: 36, grade: .18, payload: 300, seconds: 16 },
  { id: 'range', title: '追风远征队', subtitle: '240 km 加速演示 · 把每一度电用好', distance: 240000, speed: 48, grade: 0, payload: 40, seconds: 18 },
];
const COLORS = ['#62bd95', '#73aaf1', '#ef9579', '#efc45d', '#a594d6', '#f4f2e9'];
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const round = (n: number, digits = 1) => Number(n.toFixed(digits));
const batteryOf = (v: Vehicle) => BATTERIES.find(b => b.value === v.battery) ?? BATTERIES[1];
const motorOf = (v: Vehicle) => MOTORS.find(m => m.value === v.motor) ?? MOTORS[1];
const bodyOf = (v: Vehicle) => BODIES.find(b => b.value === v.body) ?? BODIES[0];
const fingerprint = (v: Vehicle) => `${v.battery}-${v.motor}-${v.body}`;
const configurationCost = (v: Vehicle) => batteryOf(v).coins + motorOf(v).coins + bodyOf(v).coins + 12;
const consumptionOf = (run: Pick<Outcome, 'distance' | 'energy'>) => run.distance > 1 ? run.energy * 100000 / run.distance : 0;

function normalizeVehicle(input: Partial<Vehicle>): Vehicle {
  return {
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 16) : '我的小电车',
    color: typeof input.color === 'string' && /^#[\da-f]{6}$/i.test(input.color) ? input.color : COLORS[0],
    battery: BATTERIES.some(b => b.value === input.battery) ? input.battery! : 40,
    motor: MOTORS.some(m => m.value === input.motor) ? input.motor! : 90,
    body: BODIES.some(b => b.value === input.body) ? input.body! : 'city',
  };
}

/** Deterministic teaching model: battery supply -> inverter -> motor -> gear -> wheel.
 * No vehicle manufacturer data is used. Capacity (kWh) and discharge power (kW)
 * are independent fields. Each road starts at 65% SOC for repeatable comparisons.
 */
function simulateRoad(vehicle: Vehicle, road: Road): Outcome {
  const battery = batteryOf(vehicle), motor = motorOf(vehicle), body = bodyOf(vehicle);
  const mass = body.mass + battery.mass + motor.mass + 90 + road.payload;
  const availableEnergy = battery.value * .65;
  const targetSpeed = road.speed / 3.6;
  const deadline = road.distance / targetSpeed * 1.3 + 8;
  const dt = road.id === 'range' ? 2 : .25;
  const inverterEfficiency = .95, gearEfficiency = .94, auxiliaryWatts = 700;
  // A matched inverter, gear and cooling package is supplied, not an invisible bonus.
  const wheelPowerLimit = Math.min(
    Math.max(0, battery.power * 1000 - auxiliaryWatts) * inverterEfficiency * .84 * gearEfficiency,
    100000 * inverterEfficiency * .84 * gearEfficiency,
    motor.value * 1000 * gearEfficiency,
  );
  const torqueForceLimit = motor.torque * body.gear * gearEfficiency / .3;
  let time = 0, speed = 0, distance = 0, energy = 0, peakPower = 0, maxSpeed = 0, stalled = 0;
  const trace: Trace[] = [{ time: 0, distance: 0, speed: 0, energy: 0 }];
  const sampleInterval = Math.max(.5, deadline / 110);
  let nextSample = sampleInterval;
  while (time < deadline && distance < road.distance && energy < availableEnergy) {
    const step = Math.min(dt, deadline - time);
    const resistance = mass * 9.81 * (body.rolling + road.grade) + .5 * 1.225 * body.drag * speed * speed;
    const desiredAcceleration = clamp((targetSpeed - speed) * .7, 0, 2.3);
    const requestedForce = resistance + mass * desiredAcceleration;
    let force = Math.min(requestedForce, torqueForceLimit, wheelPowerLimit / Math.max(speed, 2));
    let nextSpeed = clamp(speed + (force - resistance) / mass * step, 0, targetSpeed);
    // Apply the supply constraint to the step's mean speed, not only its start:
    // otherwise acceleration could briefly draw more power than the battery allows.
    for (let iteration = 0; iteration < 3; iteration++) {
      const predictedMean = (speed + nextSpeed) / 2;
      force = Math.min(force, wheelPowerLimit / Math.max(predictedMean, .1));
      nextSpeed = clamp(speed + (force - resistance) / mass * step, 0, targetSpeed);
    }
    const meanSpeed = (speed + nextSpeed) / 2;
    const motorLoad = clamp(force * meanSpeed / gearEfficiency / (motor.value * 1000));
    const motorEfficiency = .84 + .06 * Math.sqrt(motorLoad);
    const batteryPower = (force * meanSpeed / gearEfficiency / motorEfficiency / inverterEfficiency + auxiliaryWatts) / 1000;
    let travel = meanSpeed * step;
    let used = batteryPower * step / 3600;
    const portion = Math.min(1,
      travel > 0 ? (road.distance - distance) / travel : 1,
      used > 0 ? (availableEnergy - energy) / used : 1,
    );
    travel *= portion; used *= portion;
    time += step * portion; distance += travel; energy += used;
    speed = nextSpeed; maxSpeed = Math.max(maxSpeed, speed * 3.6);
    peakPower = Math.max(peakPower, batteryPower);
    stalled = speed < .08 ? stalled + step : 0;
    if (time >= nextSample || portion < 1 || stalled > 8) {
      trace.push({ time, distance, speed: speed * 3.6, energy });
      nextSample = time + sampleInterval;
    }
    if (stalled > 8 || portion < 1) break;
  }
  trace.push({ time, distance, speed: speed * 3.6, energy });
  const usedPerKm = distance > 1 ? energy / (distance / 1000) : 0;
  return {
    route: road.id, routeName: road.title, vehicle: { ...vehicle }, fingerprint: fingerprint(vehicle),
    targetDistance: road.distance, distance, ratio: clamp(distance / road.distance), duration: time,
    energy, remaining: Math.max(0, availableEnergy - energy), peakPower, maxSpeed, mass,
    rangeEstimate: usedPerKm > 0 ? availableEnergy / usedPerKm : 0,
    limiting: battery.power < motor.value ? '电池供电能力' : motor.value < 100 ? '电机输出能力' : '匹配的逆变器上限',
    trace,
  };
}

function sampleOutcome(outcome: Outcome, progress: number): Trace {
  const target = outcome.duration * clamp(progress);
  let index = 0;
  while (index < outcome.trace.length - 2 && outcome.trace[index + 1].time < target) index++;
  const a = outcome.trace[index], b = outcome.trace[Math.min(index + 1, outcome.trace.length - 1)];
  const mix = b.time > a.time ? clamp((target - a.time) / (b.time - a.time)) : 1;
  return { time: target, distance: a.distance + (b.distance - a.distance) * mix,
    speed: a.speed + (b.speed - a.speed) * mix, energy: a.energy + (b.energy - a.energy) * mix };
}

function batteryIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  roundRect(ctx, -42, -22, 84, 44, 8, color, '#325f52');
  roundRect(ctx, 42, -10, 6, 20, 2, '#325f52');
  ctx.strokeStyle = '#f5fff8'; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-25 + i * 22, -10); ctx.lineTo(-25 + i * 22, 10); ctx.stroke(); }
  ctx.restore();
}
function motorIcon(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  roundRect(ctx, -33, -25, 62, 50, 12, '#97bbed', '#48668f');
  roundRect(ctx, 27, -7, 20, 14, 3, '#48668f');
  ctx.strokeStyle = '#dbe9ff'; ctx.lineWidth = 3;
  for (let i = -17; i <= 14; i += 10) { ctx.beginPath(); ctx.moveTo(i, -15); ctx.lineTo(i, 15); ctx.stroke(); }
  ctx.restore();
}
function drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, vehicle: Vehicle, scale = 1, rotation = 0) {
  drawPremiumCar(ctx, x, y, vehicle.color, scale, rotation, vehicle.body);
}

export function mountFactory(host: HTMLElement, api: GameAPI): MountedGame {
  const stored = api.getRecord('factory');
  let vehicle = normalizeVehicle((stored.configuration as Partial<Vehicle> | undefined) ?? api.getVehicle());
  let saved = stored.saved === true;
  let compared = stored.compared === true;
  const runs: SavedRun[] = Array.isArray(stored.runs) ? (stored.runs as SavedRun[]).filter(r =>
    r && ROADS.some(road => road.id === r.route) && Number.isFinite(r.ratio) && Number.isFinite(r.energy)).slice(-24) : [];
  const storedBest = typeof stored.best === 'object' && stored.best ? stored.best as Partial<Record<RouteId, number>> : {};
  const best: Record<RouteId, number> = { city: 0, hill: 0, range: 0 };
  const stars: Record<RouteId, number> = { city: 0, hill: 0, range: 0 };
  const attempts: Record<RouteId, number> = { city: 0, hill: 0, range: 0 };
  ROADS.forEach(road => {
    const value = storedBest[road.id];
    if (typeof value === 'number' && Number.isFinite(value)) best[road.id] = clamp(value);
    const mark = (stored.stars as Record<string, unknown> | undefined)?.[road.id];
    if (typeof mark === 'number' && Number.isFinite(mark)) stars[road.id] = Math.floor(clamp(mark, 0, 3));
    const count = (stored.attempts as Record<string, unknown> | undefined)?.[road.id];
    if (typeof count === 'number' && Number.isFinite(count)) attempts[road.id] = Math.max(0, Math.floor(count));
  });
  runs.forEach(r => best[r.route] = Math.max(best[r.route], clamp(r.ratio)));
  let chosenPart: Part = 'battery';
  let cutaway = stored.cutaway === true;
  let playback: Playback | null = null;
  let dragging: { part: Part; x: number; y: number } | null = null;
  let snap: { part: Part; remaining: number } | null = null;
  let destroyed = false, elapsed = 0;
  let stage: ReturnType<typeof createStage>;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let message = runs.length ? '车和试跑记录都在。新任务有三次路况挑战，试着拿到三颗星！' : '选一辆喜欢的车，带它接任务！途中遇到路况时，由你来决定怎么做。';
  let comparison: { previous: SavedRun; current: SavedRun } | null = null;

  host.innerHTML = `<div class="experience factory-experience">
    <section class="playfield factory-playfield">
      <div class="factory-stage"><div class="factory-view-toggle" role="group" aria-label="汽车展示方式"><button type="button" data-view="exterior">完整车身</button><button type="button" data-view="cutaway">查看动力底盘</button></div></div>
      <div class="factory-mission-progress" hidden aria-label="本次任务进度"></div>
      <section class="factory-event" hidden aria-labelledby="factory-event-title">
        <div class="factory-event-top"><span class="factory-event-number"></span><span>小车已停稳，想好了再选</span></div>
        <h4 id="factory-event-title" tabindex="-1"></h4><p class="factory-event-question"></p>
        <div class="factory-event-choices"></div>
        <p class="factory-event-feedback" role="status" aria-live="polite"></p>
        <button type="button" class="btn btn-primary factory-event-continue" hidden>继续出发</button>
      </section>
      <div class="factory-test-dock">
        <div class="factory-test-heading"><span class="factory-step">02</span><div><h3>接个任务，开出去！</h3><p>跑完全程 ＋ 首选答对两次 ＋ 三次全对 ＝ 三星</p></div><div class="factory-drive-actions"><button type="button" class="btn factory-pause" hidden>暂停试跑</button><button type="button" class="btn factory-return" hidden>回到工坊</button></div></div>
        <div class="factory-route-list">${ROADS.map((r, i) => `<button type="button" class="factory-route" data-route="${r.id}"><span class="factory-route-number">0${i + 1}</span><span><strong>${r.title}</strong><small>${r.id === 'hill' ? '重载爬坡 / 动力匹配' : r.id === 'range' ? '长途远行 / 续航规划' : '礼让行人 / 平稳送达'}</small><span class="factory-route-stars" data-stars="${r.id}" aria-label="最佳0星">☆☆☆</span></span><span class="factory-route-arrow">↗</span></button>`).join('')}</div>
      </div>
      <div class="factory-message" role="status" aria-live="polite"><span class="factory-message-dot"></span><span class="factory-message-text"></span></div>
      <div class="factory-result" hidden>
        <div class="factory-result-heading"><span class="factory-result-title"></span><span class="chip">教学模型 · 同条件试跑</span></div>
        <div class="factory-result-values"></div><div class="factory-result-extra"></div><div class="factory-comparison" hidden></div>
        <div class="factory-challenge-result"></div><div class="factory-result-actions"><button type="button" class="btn factory-retry">再挑战 · 换一组路况</button><button type="button" class="btn btn-primary factory-next">下一个任务</button></div>
      </div>
      <p class="science-note factory-note">电池容量决定带多少电，供电能力决定电送得多快。途中选择决定挑战星级；里程与能耗由同条件教学模型计算，选择补能不会给本次测量增加电量。</p>
    </section>
    <aside class="control-panel factory-controls">
      <div class="factory-panel-heading"><span class="factory-step">01</span><div><span class="factory-eyebrow">YOUR OWN EV</span><h3>我的造车工位</h3></div></div>
      <label class="factory-name-label" for="factory-name">给它起个名字<input id="factory-name" class="factory-name" maxlength="16" value="${escapeHTML(vehicle.name)}" autocomplete="off"></label>
      <div class="factory-colors" aria-label="车身颜色">${COLORS.map(c => `<button type="button" class="factory-color" data-color="${c}" style="--swatch:${c}" aria-label="选择${c}车身颜色" aria-pressed="${vehicle.color === c}"></button>`).join('')}<label class="factory-custom-color" title="自选颜色"><input type="color" aria-label="自选车身颜色" value="${vehicle.color}"><span>＋</span></label></div>
      <div class="factory-part-tabs" role="group" aria-label="选择装配部件"><button type="button" data-part="battery">电池</button><button type="button" data-part="motor">电机</button><button type="button" data-part="body">车身</button></div>
      <div class="factory-options"></div>
      <div class="factory-part-detail"></div>
      <div class="factory-save-row"><button type="button" class="btn btn-primary factory-save">保存我的车 <span>＋20</span></button><button type="button" class="btn factory-poster" aria-label="下载我的汽车海报">海报 ↓</button></div>
      <div class="factory-stamp"><span class="factory-stamp-symbol">✦</span><span class="factory-stamp-text"></span></div>
      <details class="factory-score-help"><summary>积分怎么获得？</summary><p>保存车辆20，爬坡体验20，续航体验20；三条路各按最佳完成比例加0—10；换部件、同条件重测加10。同一件事只取最高分，低分也能玩全部内容。</p></details>
    </aside>
  </div>`;

  const get = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`Factory element missing: ${selector}`);
    return element;
  };
  const nameInput = get<HTMLInputElement>('.factory-name');
  const stageHost = get('.factory-stage');
  const feedback = (text: string) => { message = text; get('.factory-message-text').textContent = text; };

  function persist() {
    const latest = runs[runs.length - 1];
    const battery = batteryOf(vehicle), motor = motorOf(vehicle), body = bodyOf(vehicle);
    api.record('factory', {
      configuration: { ...vehicle }, saved, compared, cutaway, runs: runs.slice(-24), best: { ...best }, stars: { ...stars }, attempts: { ...attempts },
      summary: comparison ? `我在${comparison.current.routeName}换了部件：每100 km折算用电从${round(consumptionOf(comparison.previous), 2)}变为${round(consumptionOf(comparison.current), 2)} kWh，要结合行驶完成比例看。`
        : latest ? `我的${vehicle.name}在${latest.routeName}跑了${round(latest.distance / 1000, 2)} km，发现容量和供电能力是两回事。` : '我装配了自己的新能源小车，准备带它上路。',
      report: [
        { label: '我的汽车', value: vehicle.name },
        { label: '电池容量 / 最大供电', value: `${battery.value} kWh / ${battery.power} kW` },
        { label: '电机 / 车身', value: `${motor.value} kW / ${body.title}` },
        { label: '动力链', value: '电池 → 逆变器 → 电机 → 减速器 → 车轮' },
        { label: '校园 / 爬坡 / 长途最佳比例', value: `${round(best.city * 100)}% / ${round(best.hill * 100)}% / ${round(best.range * 100)}%` },
        { label: '任务最佳星级', value: `校园 ${stars.city}/3 · 山顶 ${stars.hill}/3 · 远征 ${stars.range}/3` },
        ...(latest ? [
          { label: '最近试跑', value: `${latest.routeName}，完成 ${round(latest.distance / 1000, 2)} / ${round(latest.targetDistance / 1000, 2)} km` },
          { label: '最近能耗', value: `${round(latest.energy, 2)} kWh；起始电量固定为65%` },
          { label: '最近供电峰值', value: `${round(latest.peakPower)} kW` },
          { label: '最近最高速度 / 模拟时长', value: `${round(latest.maxSpeed)} km/h / ${round(latest.duration)} s` },
        ] : []),
        { label: '数据说明', value: '合成教学车辆参数；加速演示；不代表实车性能或安全建议' },
      ],
    });
  }

  function updateControls() {
    if (destroyed) return;
    get('.factory-message-text').textContent = message;
    host.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
      const active = button.dataset.view === (cutaway ? 'cutaway' : 'exterior');
      button.setAttribute('aria-pressed', String(active));
    });
    get('.factory-view-toggle').hidden = !!playback;
    host.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => {
      const selected = button.dataset.part === chosenPart;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    host.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === vehicle.color)));
    const customColor = get<HTMLInputElement>('.factory-custom-color input');
    if (document.activeElement !== customColor) customColor.value = vehicle.color;
    const options = chosenPart === 'battery' ? BATTERIES.map(b => ({ value: b.value, title: b.title, detail: `${b.value} kWh · ${b.power} kW`, coins: b.coins }))
      : chosenPart === 'motor' ? MOTORS.map(m => ({ value: m.value, title: m.title, detail: `${m.value} kW · ${m.torque} N·m`, coins: m.coins }))
        : BODIES.map(b => ({ value: b.value, title: b.title, detail: `${b.mass} kg · ${b.value === 'city' ? '短车身，轻装出行' : b.value === 'touring' ? '高车顶，旅行行李架' : '双门溜背，运动尾翼'}`, coins: b.coins }));
    get('.factory-options').innerHTML = options.map(o => `<button type="button" class="factory-option ${String(vehicle[chosenPart]) === String(o.value) ? 'is-selected' : ''}" data-option="${o.value}" aria-pressed="${String(vehicle[chosenPart]) === String(o.value)}">${chosenPart === 'body' ? `<span class="factory-body-preview" aria-hidden="true">${premiumCarSVG(vehicle.color, String(o.value))}</span>` : `<span class="factory-option-check">${String(vehicle[chosenPart]) === String(o.value) ? '✓' : '○'}</span>`}<span><strong>${o.title}</strong><small>${o.detail}</small></span><span class="factory-option-coins">${o.coins}<small>币</small></span></button>`).join('');
    get('.factory-part-detail').textContent = chosenPart === 'battery' ? 'kWh 是装多少电；kW 是供电有多快。长航电池容量更大，也更重。'
      : chosenPart === 'motor' ? '大电机需要电池供得上电。换大电机，也要看整条动力链。' : '轻车体减少负担；减速器传动比、车体阻力也会影响路测。';
    host.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(button => {
      button.classList.toggle('is-selected', playback?.outcome.route === button.dataset.route);
      button.title = ROADS.find(r => r.id === button.dataset.route)?.subtitle ?? '';
    });
    ROADS.forEach(road => {
      const mark = get(`[data-stars="${road.id}"]`);
      mark.textContent = '★'.repeat(stars[road.id]) + '☆'.repeat(3 - stars[road.id]);
      mark.setAttribute('aria-label', `最佳${stars[road.id]}星，共3星`);
    });
    get('.factory-mission-progress').hidden = !playback;
    if (playback) get('.factory-mission-progress').innerHTML = playback.challenge.events.map((event, i) => `<span class="${i < playback!.challenge.index ? 'is-done' : i === playback!.challenge.index ? 'is-current' : ''}">${i < playback!.challenge.index ? '✓' : i + 1} ${event.scene}</span>`).join('');
    get('.factory-event').hidden = !playback?.eventPhase;
    get('.factory-pause').hidden = !playback || playback.finished;
    get<HTMLButtonElement>('.factory-pause').disabled = !!playback?.eventPhase;
    get('.factory-pause').textContent = playback?.paused ? '继续试跑' : '暂停试跑';
    get('.factory-return').hidden = !playback;
    get('.factory-stamp-text').textContent = saved && runs.length ? '新能源造车体验章已点亮' : saved ? '车已保存，试跑一次就点亮体验章' : '保存＋试跑，领取我的造车体验章';
    get('.factory-stamp').classList.toggle('is-earned', saved && runs.length > 0);
    get<HTMLButtonElement>('.factory-save').innerHTML = saved ? '更新我的车 <span>已记录</span>' : '保存我的车 <span>＋20</span>';
    host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.factory-controls input, .factory-controls button').forEach(control => control.disabled = !!playback && !playback.finished);
  }

  function displayResult(current: SavedRun) {
    const result = get('.factory-result');
    result.hidden = false;
    get('.factory-result-title').textContent = `${current.routeName} · 这次的发现`;
    get('.factory-result-values').innerHTML = `<span><strong>${round(current.ratio * 100)}<small>%</small></strong>行驶完成比例</span><span><strong>${round(current.energy, 2)}<small> kWh</small></strong>本次消耗</span><span><strong>${round(current.peakPower)}<small> kW</small></strong>实际供电峰值</span>`;
    get('.factory-result-extra').textContent = `这条路最高跑到 ${round(current.maxSpeed)} km/h，模拟行驶 ${round(current.duration)} s，折算每100 km用电 ${round(consumptionOf(current), 2)} kWh。容量、供电能力和车重一起影响结果。`;
    get('.factory-challenge-result').innerHTML = `<div class="factory-earned-stars" aria-label="本次${current.stars ?? 0}星">${'★'.repeat(current.stars ?? 0)}${'☆'.repeat(3 - (current.stars ?? 0))}</div><strong>${current.stars === 3 ? '三星车手，漂亮送达！' : '任务复盘，下次再多拿一颗星'}</strong><p>首次判断正确 ${current.decisions?.filter(a => a.firstTry).length ?? 0}/3 · 重试 ${current.mistakes ?? 0} 次${current.ratio < .999 ? ' · 未跑完全程，换个动力或电池搭档再来' : ''}</p><ul>${(current.decisions ?? []).map(a => `<li><span>${a.firstTry ? '✓' : '↻'} ${escapeHTML(a.title)}</span>${escapeHTML(a.explanation)}</li>`).join('')}</ul>`;
    const comparisonBox = get('.factory-comparison');
    comparisonBox.hidden = !comparison;
    if (comparison) {
      comparisonBox.textContent = `同路线、同起始电量：完成比例 ${round(comparison.previous.ratio * 100)}% → ${round(comparison.current.ratio * 100)}%；总用电 ${round(comparison.previous.energy, 2)} → ${round(comparison.current.energy, 2)} kWh；折算每100 km ${round(consumptionOf(comparison.previous), 2)} → ${round(consumptionOf(comparison.current), 2)} kWh。${Math.abs(comparison.previous.distance - comparison.current.distance) > 10 ? '行驶距离不同，要结合完成比例判断。' : '本次两车行驶距离相同。'}`;
    }
  }

  function finishRun() {
    if (!playback || playback.finished) return;
    playback.finished = true;
    const { trace: _trace, ...outcome } = playback.outcome;
    const current: SavedRun = { ...outcome, timestamp: new Date().toISOString(), stars: challengeStars(playback.challenge, outcome.ratio), decisions: playback.challenge.answers, mistakes: playback.challenge.mistakes };
    stars[current.route] = Math.max(stars[current.route], current.stars!);
    const previous = [...runs].reverse().find(r => r.route === current.route && r.fingerprint !== current.fingerprint);
    comparison = previous ? { previous, current } : null;
    runs.push(current); if (runs.length > 24) runs.shift();
    best[current.route] = Math.max(best[current.route], current.ratio);
    api.award('factory', `${current.route}-distance`, round(best[current.route] * 10), `${current.routeName}最佳行驶比例`);
    if (current.route === 'hill') api.award('factory', 'hill-experience', 20, '体验爬坡冒险');
    if (current.route === 'range') api.award('factory', 'range-experience', 20, '体验远方探索');
    if (previous) { compared = true; api.award('factory', 'same-route-remix', 10, '换部件，同条件对照'); }
    if (saved) api.complete('factory');
    const wentAllTheWay = current.ratio >= .999;
    feedback(wentAllTheWay ? `到站啦！拿到 ${current.stars} 颗星。重玩会遇到不同路况，也可以换部件挑战其他任务。`
      : current.remaining < .01 ? `电量用完，跑到${round(current.distance / 1000, 1)} km。体验积分照样记录，换电池再试试看！`
        : `这次完成${round(current.ratio * 100)}%。${current.limiting}与车辆负担都影响速度，换个搭档再试一次。`);
    displayResult(current); persist(); updateControls();
  }

  function startRoad(routeId: RouteId) {
    vehicle.name = nameInput.value.trim().slice(0, 16) || '我的小电车';
    dragging = null; comparison = null;
    const road = ROADS.find(r => r.id === routeId)!;
    const challenge = createChallenge(routeId, attempts[routeId]++);
    playback = { outcome: simulateRoad(vehicle, road), elapsed: 0, displaySeconds: reduceMotion ? 8 : road.seconds, paused: false, finished: false, challenge, eventPhase: null };
    get('.factory-result').hidden = true;
    feedback(`${road.title}出发！途中有三次选择，答错可以重试；跑完全程且三次首选正确就能拿到三星。`);
    persist();
    updateControls();
  }

  function showRoadEvent() {
    if (!playback) return;
    const event = playback.challenge.events[playback.challenge.index];
    playback.eventPhase = 'question';
    get('.factory-event-number').textContent = `路况挑战 ${playback.challenge.index + 1} / 3`;
    get('#factory-event-title').textContent = event.title;
    get('.factory-event-question').textContent = event.question;
    get('.factory-event-choices').innerHTML = event.choices.map((choice, index) => `<button type="button" data-decision="${index}"><span>${index + 1}</span>${escapeHTML(choice.title)}</button>`).join('');
    get('.factory-event-feedback').textContent = '';
    get('.factory-event-feedback').classList.remove('is-correct');
    get('.factory-event-continue').hidden = true;
    feedback('遇到新路况了！小车已停下，选一个合适的做法再继续。');
    updateControls();
    get('#factory-event-title').focus({ preventScroll: true });
    get('.factory-event').scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  function chooseAction(index: number) {
    if (!playback || playback.paused || playback.eventPhase !== 'question') return;
    const event = playback.challenge.events[playback.challenge.index];
    const choice = event.choices[index];
    if (!choice) return;
    playback.challenge = answerEvent(playback.challenge, index);
    get('.factory-event-feedback').textContent = choice.correct ? `✓ ${choice.explanation}` : `${choice.explanation} 换一个做法，再试一次。`;
    get('.factory-event-feedback').classList.toggle('is-correct', choice.correct);
    if (choice.correct) {
      playback.eventPhase = 'feedback';
      host.querySelectorAll<HTMLButtonElement>('[data-decision]').forEach(button => { button.disabled = true; button.classList.toggle('is-correct', Number(button.dataset.decision) === index); });
      get('.factory-event-continue').hidden = false;
      get('.factory-event-continue').focus({ preventScroll: true });
      updateControls();
    } else {
      const button = get<HTMLButtonElement>(`[data-decision="${index}"]`);
      button.disabled = true;
      button.classList.add('is-wrong');
      host.querySelector<HTMLButtonElement>('[data-decision]:not(:disabled)')?.focus({ preventScroll: true });
    }
  }

  function changePart(part: Part, value: string) {
    if (part === 'battery') vehicle.battery = Number(value);
    else if (part === 'motor') vehicle.motor = Number(value);
    else vehicle.body = value;
    playback = null; dragging = null; snap = { part, remaining: .7 };
    get('.factory-result').hidden = true;
    feedback(`${part === 'battery' ? batteryOf(vehicle).title : part === 'motor' ? motorOf(vehicle).title : bodyOf(vehicle).title}已装上！可以拖动部件玩装配，也可以马上试跑。`);
    persist(); updateControls();
  }

  function makePoster(): string {
    const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 2400;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    const bg = ctx.createLinearGradient(0, 0, 1000, 1200); bg.addColorStop(0, '#eef6ee'); bg.addColorStop(1, '#fff6e7');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1000, 1200);
    label(ctx, 'MY FIRST ELECTRIC CAR', 78, 104, 20, '#648675', 600);
    label(ctx, vehicle.name, 78, 184, 50, '#244839', 700);
    label(ctx, `${api.getProfile().nickname || '小工程师'}的新能源造车作品`, 80, 227, 24, '#5f796a');
    roundRect(ctx, 70, 294, 860, 394, 32, '#fffdf5', '#d3e2d3');
    ctx.fillStyle = '#dbead7'; ctx.beginPath(); ctx.ellipse(500, 659, 300, 23, 0, 0, Math.PI * 2); ctx.fill();
    drawBody(ctx, 500, 565, vehicle, 2.85);
    const battery = batteryOf(vehicle), motor = motorOf(vehicle);
    label(ctx, `${bodyOf(vehicle).title} · ${configurationCost(vehicle)} 工程币`, 111, 342, 20, '#496e58');
    for (const [i, pair] of [['电池容量', `${battery.value} kWh`], ['最大供电', `${battery.power} kW`], ['电机输出', `${motor.value} kW`]].entries()) {
      const x = 85 + i * 305;
      label(ctx, pair[0], x, 771, 21, '#6b8072'); label(ctx, pair[1], x, 823, 38, '#244839', 700);
    }
    label(ctx, '电池 → 逆变器 → 电机 → 减速器 → 车轮', 85, 933, 25, '#42604f');
    const matchingRuns = runs.filter(run => run.fingerprint === fingerprint(vehicle));
    const routeMarks = ROADS.map(road => {
      const routeRuns = matchingRuns.filter(run => run.route === road.id);
      return `${road.id === 'city' ? '校园' : road.id === 'hill' ? '爬坡' : '远方'} ${routeRuns.length ? `${round(Math.max(...routeRuns.map(run => run.ratio)) * 100)}%` : '未试跑'}`;
    });
    label(ctx, '这套配置的路测记录', 85, 978, 20, '#6b8072');
    label(ctx, routeMarks.join('    '), 85, 1021, 23, '#42604f');
    label(ctx, '我装配，我试跑，我发现。', 85, 1083, 28, '#dc866b', 600);
    label(ctx, '合成教学参数与加速展示，不代表实车性能。', 85, 1147, 18, '#7b8c7d');
    return canvas.toDataURL('image/png');
  }

  function saveVehicle() {
    vehicle.name = nameInput.value.trim().slice(0, 16) || '我的小电车'; nameInput.value = vehicle.name;
    api.setVehicle({ ...vehicle }); saved = true;
    api.award('factory', 'saved-car', 20, '保存我的新能源车');
    if (runs.length) api.complete('factory');
    persist(); updateControls();
    feedback('你的车已保存！其他游戏也能认出它，海报可以带回家。');
    requestAnimationFrame(() => { if (!destroyed) api.saveImage('factory', stage.capture()); });
  }

  const onClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !host.contains(button)) return;
    if (button.dataset.decision !== undefined) chooseAction(Number(button.dataset.decision));
    else if (button.classList.contains('factory-event-continue') && playback?.eventPhase === 'feedback') {
      playback.eventPhase = null;
      feedback(`判断完成 ${playback.challenge.index}/3，继续出发！`); updateControls();
      get('.factory-pause').focus({ preventScroll: true });
    }
    else if (button.classList.contains('factory-retry') && playback?.finished) startRoad(playback.outcome.route);
    else if (button.classList.contains('factory-next') && playback?.finished) startRoad(ROADS[(ROADS.findIndex(r => r.id === playback!.outcome.route) + 1) % ROADS.length].id);
    else if (button.dataset.view) { cutaway = button.dataset.view === 'cutaway'; persist(); updateControls(); }
    else if (button.dataset.part) { chosenPart = button.dataset.part as Part; updateControls(); }
    else if (button.dataset.option) changePart(chosenPart, button.dataset.option);
    else if (button.dataset.color) { vehicle.color = button.dataset.color; persist(); updateControls(); }
    else if (button.dataset.route) startRoad(button.dataset.route as RouteId);
    else if (button.classList.contains('factory-save')) saveVehicle();
    else if (button.classList.contains('factory-poster')) {
      saveVehicle();
      const image = makePoster();
      const binary = atob(image.split(',')[1]);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      downloadFile(`${vehicle.name.replace(/[\\/:*?"<>|]/g, '') || '我的汽车'}-新能源海报.png`, new Blob([bytes], { type: 'image/png' }), 'image/png');
      api.notify('汽车海报已下载，也已保存到作品报告。');
    } else if (button.classList.contains('factory-pause') && playback && !playback.eventPhase) { playback.paused = !playback.paused; updateControls(); }
    else if (button.classList.contains('factory-return')) { playback = null; get('.factory-result').hidden = true; feedback('回到造车工坊，挑一个新部件再试试看。'); updateControls(); }
  };
  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target === nameInput) { vehicle.name = target.value.slice(0, 16); }
    else if (target.matches('.factory-custom-color input')) { vehicle.color = target.value; updateControls(); }
  };
  const onChange = () => persist();
  const onVisibility = () => { if (document.hidden && playback && !playback.finished && !playback.eventPhase) { playback.paused = true; updateControls(); } };
  const onPointerLeave = () => { if (dragging) { dragging = null; feedback('部件回到工位了。可以再拖一次，也可以直接点配方。'); } };
  host.addEventListener('click', onClick); host.addEventListener('input', onInput); host.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', onVisibility);
  stageHost.addEventListener('pointerleave', onPointerLeave);

  function drawChain(ctx: CanvasRenderingContext2D, y: number, running: boolean) {
    const names = ['电池', '逆变器', '电机', '减速器', '车轮'];
    const xs = [280, 390, 500, 610, 720];
    ctx.strokeStyle = '#b8cbb8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xs[0], y); ctx.lineTo(xs[4], y); ctx.stroke();
    xs.forEach((x, i) => {
      roundRect(ctx, x - 40, y - 17, 80, 34, 17, i === 0 ? '#d0ead8' : i === 2 ? '#d9e5f7' : '#edf1e5', '#bccdbd');
      label(ctx, names[i], x - (names[i].length * 7), y + 5, 14, '#446554');
    });
    const dotX = xs[0] + (reduceMotion ? .45 : (elapsed * (running ? .5 : .2)) % 1) * (xs[4] - xs[0]);
    ctx.beginPath(); ctx.arc(dotX, y + 22, 4, 0, Math.PI * 2); ctx.fillStyle = '#dfa165'; ctx.fill();
  }

  function drawWorkshop(ctx: CanvasRenderingContext2D) {
    const bg = ctx.createLinearGradient(0, 0, 0, 520); bg.addColorStop(0, '#f4f6e9'); bg.addColorStop(.67, '#eef0df'); bg.addColorStop(1, '#dae4d4');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1000, 520);
    // Architectural windows and a little assembly robot keep the scene a workshop.
    for (let i = 0; i < 6; i++) {
      roundRect(ctx, 72 + i * 158, 159, 132, 94, 9, '#e0ece2', '#c8d8cb');
      ctx.strokeStyle = '#c8d8cb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(138 + i * 158, 160); ctx.lineTo(138 + i * 158, 251); ctx.stroke();
    }
    ctx.fillStyle = '#cfdccc'; ctx.fillRect(0, 363, 1000, 3);
    ctx.strokeStyle = '#c9d8c4'; ctx.lineWidth = 1;
    for (let x = -100; x < 1100; x += 120) { ctx.beginPath(); ctx.moveTo(500 + (x - 500) * .4, 365); ctx.lineTo(x, 520); ctx.stroke(); }
    label(ctx, 'NEW ENERGY WORKSHOP', 43, 43, 13, '#7f947e', 600);
    label(ctx, '让你的想法，开上路。', 43, 79, 27, '#2e4f3c', 600);
    roundRect(ctx, 792, 88, 163, 50, 14, '#fffdf4', '#d7e0cc');
    label(ctx, '我的配置', 808, 108, 12, '#778a76'); label(ctx, `${configurationCost(vehicle)} 工程币`, 808, 128, 18, '#49654c', 600);
    drawChain(ctx, 103, false);
    // Assembly station and hanging robotic tools.
    ctx.strokeStyle = '#b4c9b5'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(186, 184); ctx.lineTo(221, 227); ctx.lineTo(195, 275); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(835, 184); ctx.lineTo(797, 227); ctx.lineTo(817, 275); ctx.stroke();
    for (const [x, y] of [[186, 184], [221, 227], [835, 184], [797, 227]]) { ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = '#789d83'; ctx.fill(); }
    ctx.lineWidth = 1;
    roundRect(ctx, 214, 387, 597, 18, 8, '#d3dfcc', '#b4cbb6');
    drawBody(ctx, 503, 310, vehicle, 2.45);
    roundRect(ctx, 43, 149, 191, 31, 12, '#fffdf4', '#cad8c4');
    label(ctx, vehicle.name.length > 11 ? `${vehicle.name.slice(0, 11)}…` : vehicle.name || '我的小电车', 58, 170, 15, '#4b6d56', 600);
    if (cutaway) {
      // The low, flat pack is under the passenger cabin; the motor drives the axle.
      roundRect(ctx, 420, 317, 170, 24, 5, '#b4e6c1e8', '#527d6a');
      for (let i = 0; i < 12; i++) roundRect(ctx, 426 + i * 13, 322, 10, 14, 1.5, '#d8f4dd', '#75a78a');
      motorIcon(ctx, 652, 324, .42);
      ctx.strokeStyle = '#6f9681'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(505, 343); ctx.lineTo(505, 370); ctx.stroke();
      roundRect(ctx, 414, 366, 185, 23, 8, '#fffdf6', '#bdd2bf');
      label(ctx, `底盘电池 · ${batteryOf(vehicle).value} kWh`, 430, 382, 12, '#567661', 600);
      ctx.beginPath(); ctx.moveTo(672, 324); ctx.lineTo(748, 324); ctx.lineTo(779, 308); ctx.stroke();
      roundRect(ctx, 779, 289, 158, 43, 11, '#fffdf6', '#bdd2bf');
      label(ctx, '前轴驱动电机', 792, 307, 12, '#678198');
      label(ctx, `${motorOf(vehicle).value} kW`, 792, 324, 14, '#486d8e', 600);
    }
    // Three actual draggable crates. The menu is the keyboard/click alternative.
    const trays: { part: Part; x: number; title: string }[] = [
      { part: 'battery', x: 236, title: '电池包' }, { part: 'motor', x: 500, title: '电驱电机' }, { part: 'body', x: 765, title: '个性车身' },
    ];
    trays.forEach(({ part, x, title }) => {
      const active = chosenPart === part;
      roundRect(ctx, x - 110, 414, 220, 81, 16, active ? '#fffdf3' : '#edf2e8', active ? '#8bb798' : '#c7d4c2');
      if (part === 'battery') batteryIcon(ctx, x - 47, 453, '#8bc89b', .65);
      else if (part === 'motor') motorIcon(ctx, x - 47, 453, .63);
      else drawBody(ctx, x - 51, 454, vehicle, .57);
      label(ctx, title, x + 5, 446, 16, '#46624d', 600);
      label(ctx, part === 'battery' ? `${batteryOf(vehicle).value} kWh · ${batteryOf(vehicle).power} kW` : part === 'motor' ? `${motorOf(vehicle).value} kW 电机` : bodyOf(vehicle).title, x + 5, 466, 11, '#587561');
      label(ctx, '拖上车 / 点击', x + 5, 483, 10, '#80917b');
    });
    if (snap) {
      const sx = snap.part === 'battery' ? 454 : snap.part === 'motor' ? 653 : 503;
      const sy = snap.part === 'body' ? 256 : 304;
      ctx.strokeStyle = '#dd9b56'; ctx.lineWidth = 3; ctx.globalAlpha = clamp(snap.remaining / .7);
      ctx.beginPath(); ctx.ellipse(sx, sy, snap.part === 'body' ? 200 : 68, snap.part === 'body' ? 76 : 40, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (dragging) {
      const target = dragging.part === 'battery' ? { x: 454, y: 304 } : dragging.part === 'motor' ? { x: 653, y: 304 } : { x: 503, y: 256 };
      ctx.setLineDash([6, 5]); roundRect(ctx, target.x - 80, target.y - 41, 160, 82, 12, '#fff8e855', '#dfaa68'); ctx.setLineDash([]);
      ctx.save(); ctx.shadowColor = '#607e5966'; ctx.shadowBlur = 18;
      if (dragging.part === 'battery') batteryIcon(ctx, dragging.x, dragging.y, '#8bc89b', 1.1);
      else if (dragging.part === 'motor') motorIcon(ctx, dragging.x, dragging.y, 1.1);
      else drawBody(ctx, dragging.x, dragging.y, vehicle, 1.1);
      ctx.restore();
    }
  }

  function drawRoad(ctx: CanvasRenderingContext2D, playbackState: Playback) {
    const outcome = playbackState.outcome, road = ROADS.find(r => r.id === outcome.route)!;
    const sample = sampleOutcome(outcome, playbackState.elapsed / playbackState.displaySeconds);
    const progress = clamp(sample.distance / road.distance);
    const sky = ctx.createLinearGradient(0, 0, 0, 400); sky.addColorStop(0, '#e5f2ec'); sky.addColorStop(1, '#fcf7e4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1000, 520);
    label(ctx, road.title, 43, 56, 29, '#35543f', 600); label(ctx, road.subtitle, 44, 83, 14, '#758771');
    roundRect(ctx, 725, 29, 227, 59, 14, '#fffdf2', '#d0dec9');
    label(ctx, `${playbackState.eventPhase || playbackState.paused || playbackState.finished ? 0 : round(sample.speed)} km/h`, 745, 55, 19, '#42644d', 600);
    label(ctx, `电量 ${round((batteryOf(outcome.vehicle).value * .65 - sample.energy) / batteryOf(outcome.vehicle).value * 100)}%`, 745, 77, 14, '#7a8d74');
    // Distant hills, trees, campus and a charge stop are all native 2D shapes.
    ctx.fillStyle = '#d2e3ce'; ctx.beginPath(); ctx.moveTo(0, 288); ctx.quadraticCurveTo(120, 165, 255, 289); ctx.quadraticCurveTo(425, 140, 607, 285); ctx.quadraticCurveTo(800, 186, 1000, 276); ctx.lineTo(1000, 520); ctx.lineTo(0, 520); ctx.closePath(); ctx.fill();
    for (const [x, y, h] of [[66, 257, 42], [216, 232, 60], [744, 237, 49], [899, 220, 73]]) {
      ctx.fillStyle = '#a4c59c'; ctx.beginPath(); ctx.ellipse(x, y, h * .4, h * .65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8eaa80'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y + 11); ctx.lineTo(x, y + h); ctx.stroke();
    }
    if (outcome.route === 'city') {
      roundRect(ctx, 372, 200, 172, 103, 8, '#f2dbab', '#d1bb91');
      roundRect(ctx, 414, 240, 28, 63, 3, '#c0d7c2');
      for (let i = 0; i < 4; i++) roundRect(ctx, 389 + i * 35, 218, 19, 23, 3, '#fff8df');
      label(ctx, '小芽校园', 417, 192, 16, '#8d966c', 600);
    }
    const roadY = (x: number) => outcome.route === 'hill' ? 378 - clamp((x - 125) / 760) * 134 : 337;
    const roadPath = (offset: number) => {
      ctx.beginPath(); ctx.moveTo(-40, roadY(0) + offset);
      if (outcome.route === 'hill') { ctx.lineTo(125, roadY(125) + offset); ctx.lineTo(885, roadY(885) + offset); }
      ctx.lineTo(1040, roadY(1000) + offset);
    };
    ctx.strokeStyle = '#bdc9af'; ctx.lineWidth = 61; ctx.lineCap = 'round'; roadPath(0); ctx.stroke();
    ctx.strokeStyle = '#f6f7e8'; ctx.lineWidth = 3; ctx.setLineDash([24, 19]); roadPath(18); ctx.stroke(); ctx.setLineDash([]);
    // Start/finish flags avoid a misleading implication of real-time scale.
    for (const [x, text] of [[115, '出发'], [901, '终点']] as const) {
      const y = roadY(x) - 33;
      ctx.strokeStyle = '#758d69'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 58); ctx.lineTo(x, y); ctx.stroke();
      roundRect(ctx, x, y - 57, 55, 26, 3, text === '终点' ? '#eeb98d' : '#adc7a1'); label(ctx, text, x + 9, y - 39, 13, '#526d4b');
    }
    const carX = 118 + progress * 768, carY = roadY(carX) - 20;
    ctx.save(); ctx.translate(carX, carY); if (outcome.route === 'hill') ctx.rotate(-Math.atan(.18));
    drawBody(ctx, 0, 0, outcome.vehicle, 1.15, sample.distance * .14); ctx.restore();
    if (outcome.route === 'city') roundRect(ctx, carX - 56, carY - 6, 25, 19, 3, '#e4bd82', '#aa8a60');
    const activeEvent = playbackState.challenge.events[Math.min(playbackState.challenge.index, 2)];
    if (!playbackState.finished) {
      const markerX = clamp(carX + 130, 265, 875), markerY = roadY(markerX);
      roundRect(ctx, markerX - 63, markerY - 124, 126, 42, 10, playbackState.eventPhase ? '#fff0cb' : '#fffdf2', '#c9ad78');
      label(ctx, activeEvent.scene, markerX - 48, markerY - 98, 17, '#806334', 600);
      ctx.strokeStyle = '#9a8b69'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(markerX, markerY - 82); ctx.lineTo(markerX, markerY - 27); ctx.stroke();
      if (outcome.route === 'city') {
        if (activeEvent.scene === '红灯停车') {
          roundRect(ctx, markerX + 28, markerY - 84, 24, 61, 7, '#3d5350');
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(markerX + 40, markerY - 72 + i * 18, 6, 0, Math.PI * 2); ctx.fillStyle = i === 0 ? '#ed8469' : '#768b75'; ctx.fill(); }
          ctx.fillStyle = '#fffdf1'; ctx.fillRect(markerX - 42, markerY - 24, 5, 49);
        } else if (activeEvent.scene === '减速带') {
          for (let i = 0; i < 5; i++) roundRect(ctx, markerX - 40 + i * 18, markerY - 22, 9, 45, 2, i % 2 ? '#55645a' : '#e7bd60');
        } else if (activeEvent.scene === '视线遮挡') {
          drawPremiumCar(ctx, markerX + 12, markerY - 28, '#e5bd63', .85, 0, 'touring');
        } else if (activeEvent.scene === '安全送达') {
          roundRect(ctx, markerX - 22, markerY - 56, 40, 31, 3, '#dbb176', '#99734c');
          roundRect(ctx, markerX + 18, markerY - 46, 29, 21, 3, '#e8c99b', '#99734c');
        } else {
          for (let i = 0; i < 5; i++) roundRect(ctx, markerX - 35 + i * 16, markerY - 20, 9, 44, 1, '#fffdf1');
          ctx.fillStyle = '#d68a66'; ctx.beginPath(); ctx.arc(markerX + 10, markerY - 51, 8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#637d8a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(markerX + 10, markerY - 42); ctx.lineTo(markerX + 10, markerY - 22); ctx.lineTo(markerX, markerY - 9); ctx.moveTo(markerX + 10, markerY - 22); ctx.lineTo(markerX + 21, markerY - 9); ctx.stroke();
        }
      } else if (outcome.route === 'range') {
        roundRect(ctx, markerX - 18, markerY - 65, 36, 45, 5, '#83b8a2', '#4b7e68');
        label(ctx, 'ϟ', markerX - 8, markerY - 34, 29, '#fffdf2', 700);
        if (activeEvent.scene === '雨天车距') {
          ctx.strokeStyle = '#8aaeb9'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 22; i++) { const rx = 70 + i * 41; const ry = 130 + (i % 4) * 35; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 7, ry + 16); ctx.stroke(); }
        }
      } else {
        ctx.fillStyle = '#dd9b60'; ctx.beginPath(); ctx.moveTo(markerX, markerY - 64); ctx.lineTo(markerX - 20, markerY - 24); ctx.lineTo(markerX + 20, markerY - 24); ctx.closePath(); ctx.fill();
        label(ctx, '!', markerX - 4, markerY - 33, 21, '#fff8df', 700);
      }
    }
    roundRect(ctx, 40, 422, 920, 65, 16, '#f7f7ea', '#d0ddc7');
    label(ctx, `${round(sample.distance / 1000, outcome.route === 'range' ? 1 : 2)} / ${round(road.distance / 1000, 1)} km`, 62, 452, 20, '#52764e', 600);
    label(ctx, `使用 ${round(sample.energy, 2)} kWh`, 63, 475, 13, '#8a977f');
    drawChain(ctx, 452, !playbackState.paused && !playbackState.finished && !playbackState.eventPhase);
    label(ctx, playbackState.finished ? '挑战记录已保存' : playbackState.eventPhase ? '已停稳 · 请在下方选择' : playbackState.paused ? '已暂停 · 可以继续' : '前进中 · 留意路况', 784, 455, 12, '#526b4c');
    if (playbackState.finished) {
      roundRect(ctx, 372, 115, 263, 53, 20, '#fff9e8', '#ddc99c');
      label(ctx, outcome.ratio >= .999 ? '✦ 到站啦！你的小车真棒' : '✦ 有新发现，再换个搭档', 397, 148, 18, '#92733e', 600);
    }
  }

  stage = createStage(stageHost, {
    label: '新能源造车工坊：可拖动电池、电机与车身，使用旁边按钮也能装配；路测使用合成教学模型。',
    draw(ctx) { if (playback) drawRoad(ctx, playback); else drawWorkshop(ctx); },
    update(dt) {
      if (destroyed) return;
      if (!playback || (!playback.paused && !playback.eventPhase)) elapsed += dt;
      if (snap) { snap.remaining -= dt; if (snap.remaining <= 0) snap = null; }
      if (playback && !playback.paused && !playback.finished && !playback.eventPhase) {
        playback.elapsed = Math.min(playback.displaySeconds, playback.elapsed + dt);
        const nextEvent = playback.challenge.events[playback.challenge.index];
        if (nextEvent && playback.elapsed / playback.displaySeconds >= nextEvent.at) {
          playback.elapsed = playback.displaySeconds * nextEvent.at;
          showRoadEvent();
          return;
        }
        if (playback.elapsed >= playback.displaySeconds) finishRun();
      }
    },
    pointer(kind, x, y) {
      if (playback) return;
      if (kind === 'down') {
        if (y >= 414 && y <= 495) {
          const part: Part | undefined = Math.abs(x - 236) <= 110 ? 'battery' : Math.abs(x - 500) <= 110 ? 'motor' : Math.abs(x - 765) <= 110 ? 'body' : undefined;
          if (part) { chosenPart = part; dragging = { part, x, y }; updateControls(); }
        }
      } else if (kind === 'move' && dragging) { dragging.x = x; dragging.y = y; }
      else if (kind === 'up' && dragging) {
        const part = dragging.part;
        const target = part === 'battery' ? { x: 454, y: 304 } : part === 'motor' ? { x: 653, y: 304 } : { x: 503, y: 256 };
        const onTarget = Math.abs(x - target.x) < (part === 'body' ? 230 : 150) && Math.abs(y - target.y) < 90;
        // Clicking a crate is the zero-precision alternative to dragging.
        const isClick = y >= 414 && y <= 495;
        if (onTarget || isClick) {
          snap = { part, remaining: .7 };
          feedback(`${part === 'battery' ? '电池包' : part === 'motor' ? '电机' : '车身'}已吸附到装配位！选旁边的配方，就能换新搭档。`);
        } else feedback('部件已回到工位。再拖一次，或直接点击旁边的配方。');
        dragging = null;
      }
    },
  });
  updateControls();
  persist();
  return { destroy() {
    if (destroyed) return; destroyed = true;
    persist(); stage.destroy();
    host.removeEventListener('click', onClick); host.removeEventListener('input', onInput); host.removeEventListener('change', onChange);
    document.removeEventListener('visibilitychange', onVisibility);
    stageHost.removeEventListener('pointerleave', onPointerLeave);
  } };
}
