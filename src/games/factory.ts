import { nightBackdrop } from '../theme';
import type { GameAPI, MountedGame } from '../types';
import { COLORS, ROADS, SETUPS, PART_NAMES, PART_HINTS, partOptions, batteryOf, inverterOf, motorOf, reducerOf, wheelsOf, bodyOf, normalizeVehicle, fingerprint, configurationCost, configurationStats, operatingPoint, consumptionOf, simulateRoad, round, clamp, type Part, type RouteId, type Trace, type Outcome, type FactoryVehicle as Vehicle } from './factory-model';
import { parameterDiagram, parameterGroups } from './factory-parameters';
import { createStage, roundRect, label, downloadFile, escapeHTML } from '../platform';
import { drawPremiumCar, premiumCarSVG } from '../car-art';
import { createChallenge, answerEvent, challengeStars, type Challenge } from './factory-challenge';
import './factory.css';

interface SavedRun extends Omit<Outcome, 'trace'> { timestamp: string; stars?: number; decisions?: Challenge['answers']; mistakes?: number }
interface Playback { outcome: Outcome; elapsed: number; displaySeconds: number; paused: boolean; finished: boolean; challenge: Challenge; eventPhase: 'question' | 'feedback' | null }

function sampleOutcome(outcome: Outcome, progress: number): Trace {
  const target = outcome.duration * clamp(progress);
  let index = 0;
  while (index < outcome.trace.length - 2 && outcome.trace[index + 1].time < target) index++;
  const a = outcome.trace[index], b = outcome.trace[Math.min(index + 1, outcome.trace.length - 1)];
  const mix = b.time > a.time ? clamp((target - a.time) / (b.time - a.time)) : 1;
  return { time: target, distance: a.distance + (b.distance - a.distance) * mix,
    speed: a.speed + (b.speed - a.speed) * mix, energy: a.energy + (b.energy - a.energy) * mix };
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
  let playback: Playback | null = null;
  let destroyed = false, elapsed = 0;
  let stage: ReturnType<typeof createStage>;
  const reduceMotion = () => api.reducedMotion();
  let message = runs.length ? '车和试跑记录都在。新任务有三次路况挑战，试着拿到三颗星！' : '选一辆喜欢的车，带它接任务！途中遇到路况时，由你来决定怎么做。';
  let comparison: { previous: SavedRun; current: SavedRun } | null = null;
  let diagramKey = '';
  let demoSpeed = 40;
  const storedWidget = stored.widget as { closed?: unknown; x?: unknown; y?: unknown } | undefined;
  let widgetClosed = storedWidget?.closed === true;
  let widgetPosition = { x: typeof storedWidget?.x === 'number' && Number.isFinite(storedWidget.x) ? clamp(storedWidget.x) : 1, y: typeof storedWidget?.y === 'number' && Number.isFinite(storedWidget.y) ? clamp(storedWidget.y) : 0 };
  let widgetDrag: { id: number; startX: number; startY: number; left: number; top: number; original: { x: number; y: number } } | null = null;
  let previewCarX = 500, previewCarScale = 3.1;

  host.innerHTML = `<div class="experience factory-experience">
    <section class="playfield factory-playfield">
      <div class="factory-stage">
        <section class="factory-widget" aria-label="整车数据浮动面板">
          <header class="factory-widget-header"><button type="button" class="factory-widget-handle" aria-label="移动整车数据面板：拖拽或使用方向键，Home回到右上角" title="拖动标题移动，方向键也可移动"><span aria-hidden="true">⠿</span> 整车数据</button><button type="button" class="factory-widget-close" aria-label="关闭整车数据面板" title="关闭">×</button></header>
          <div class="factory-widget-body">
            <div class="factory-config-summary" aria-label="当前配置摘要"></div>
            <div class="factory-stamp"><span class="factory-stamp-symbol">✦</span><span class="factory-stamp-text"></span></div>
            <details class="factory-widget-more"><summary>匹配提示与积分说明</summary><p class="factory-matching" role="status" aria-live="polite"></p><p class="factory-score-help">保存车辆20，爬坡体验20，续航体验20；三条路各按最佳完成比例加0—10；换部件、同条件重测加10。同一件事只取最高分，低分也可体验全部内容。</p></details>
          </div>
          <footer class="factory-widget-footer"><div class="factory-save-row"><button type="button" class="btn btn-primary factory-save">保存我的车 <span>＋20</span></button><button type="button" class="btn factory-poster" aria-label="下载我的汽车海报">海报 ↓</button></div></footer>
        </section>
        <button type="button" class="factory-widget-open" hidden aria-label="重新打开整车数据面板">显示车辆数据</button>
      </div>
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
      <p class="factory-assembly-intro">六大部件自由搭配，看看整条动力链如何合作。</p>
      <div class="factory-setups" role="group" aria-label="一键参考配置">${SETUPS.map(setup => `<button type="button" data-setup="${setup.id}">${setup.title}</button>`).join('')}</div>
      <div class="factory-part-tabs" role="group" aria-label="选择装配部件">${Object.entries(PART_NAMES).map(([part, title]) => `<button type="button" data-part="${part}">${title}</button>`).join('')}</div>
      <div class="factory-options"></div>
      <div class="factory-part-detail"></div>
    </aside>
    <section class="factory-parameters" aria-labelledby="factory-parameters-title">
      <div class="factory-parameters-heading"><div><span class="factory-eyebrow">EV ENGINEERING / BUILD SHEET</span><h3 id="factory-parameters-title">我的整车 · 完整参数图</h3><p>点图中的部件可选装。图、试跑、保存和导出使用同一套参数。</p></div><div class="factory-parameter-actions"><button type="button" class="btn" data-export-parameters="png">下载参数图 PNG ↓</button><button type="button" class="btn" data-export-parameters="svg">矢量图 SVG ↓</button></div></div>
      <div class="factory-parameter-scroll" tabindex="0" aria-label="完整参数图，可横向滚动"><div class="factory-parameter-diagram"></div></div>
      <p class="factory-scroll-hint">小屏可横向滑动查看；下载图片可放大阅读。</p>
      <div class="factory-speed-lab"><div><h4>试着转一转：车速和转速</h4><p>稳态运动示意；不消耗试跑电量。</p></div><label for="factory-demo-speed">示意车速 <output id="factory-demo-speed-value">40 km/h</output><input id="factory-demo-speed" type="range" min="0" max="80" step="1" value="40"></label><div class="factory-speed-readings" aria-live="polite"></div></div>
      <details class="factory-parameter-lessons"><summary>怎么读这些参数？展开六个部件的说明</summary><div>${Object.entries(PART_HINTS).map(([part, hint]) => `<article><h4>${PART_NAMES[part as Part]}</h4><p>${hint}</p></article>`).join('')}</div><p>保守轮端功率上限按电机效率84%计算；实际效率随负载在84–90%间变化。前驱轴承担55%法向载荷，抓地也限制驱动力。规格用于教学比较，不是任何品牌的实车数据。</p></details>
    </section>
  </div>`;

  const get = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`Factory element missing: ${selector}`);
    return element;
  };
  const nameInput = get<HTMLInputElement>('.factory-name');
  const stageHost = get('.factory-stage');
  const widget = get('.factory-widget');
  const widgetHandle = get<HTMLButtonElement>('.factory-widget-handle');
  const feedback = (text: string) => { message = text; get('.factory-message-text').textContent = text; };

  function widgetBounds() {
    const margin = 10;
    return { margin, x: Math.max(0, stageHost.clientWidth - widget.offsetWidth - margin * 2), y: Math.max(0, stageHost.clientHeight - widget.offsetHeight - margin * 2) };
  }
  function positionWidget() {
    if (destroyed) return;
    widget.hidden = widgetClosed || !!playback;
    get('.factory-widget-open').hidden = !widgetClosed || !!playback;
    if (widget.hidden) { previewCarX = 500; previewCarScale = 3.1; return; }
    const bounds = widgetBounds();
    widget.style.left = `${bounds.margin + bounds.x * widgetPosition.x}px`;
    widget.style.top = `${bounds.margin + bounds.y * widgetPosition.y}px`;
    const width = stageHost.clientWidth || 1000;
    const available = Math.max(60, width - widget.offsetWidth - 28);
    previewCarX = (available / 2 + 10) / width * 1000;
    previewCarScale = clamp((available - 12) / width * 1000 / 180, 1.2, 3.1);
  }
  function setWidgetClosed(closed: boolean) {
    finishWidgetDrag(true);
    widgetClosed = closed; positionWidget(); persist();
    (closed ? get<HTMLButtonElement>('.factory-widget-open') : widgetHandle).focus({ preventScroll: true });
  }
  function finishWidgetDrag(cancel = false) {
    if (!widgetDrag) return;
    const drag = widgetDrag; widgetDrag = null;
    if (cancel) widgetPosition = drag.original;
    widget.classList.remove('is-dragging');
    if (widgetHandle.hasPointerCapture(drag.id)) widgetHandle.releasePointerCapture(drag.id);
    positionWidget(); if (!cancel) persist();
  }
  const onWidgetPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || widgetDrag || widget.hidden) return;
    const bounds = widgetBounds();
    widgetDrag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: bounds.margin + bounds.x * widgetPosition.x, top: bounds.margin + bounds.y * widgetPosition.y, original: { ...widgetPosition } };
    widgetHandle.setPointerCapture(event.pointerId); widgetHandle.focus({ preventScroll: true });
    widget.classList.add('is-dragging'); event.preventDefault();
  };
  const onWidgetPointerMove = (event: PointerEvent) => {
    if (!widgetDrag || event.pointerId !== widgetDrag.id) return;
    const bounds = widgetBounds();
    widgetPosition = { x: bounds.x ? clamp((widgetDrag.left + event.clientX - widgetDrag.startX - bounds.margin) / bounds.x) : 0, y: bounds.y ? clamp((widgetDrag.top + event.clientY - widgetDrag.startY - bounds.margin) / bounds.y) : 0 };
    positionWidget(); event.preventDefault();
  };
  const onWidgetPointerUp = (event: PointerEvent) => { if (widgetDrag?.id === event.pointerId) finishWidgetDrag(); };
  const onWidgetPointerCancel = () => finishWidgetDrag(true);
  const onWidgetBlur = () => finishWidgetDrag(true);
  widgetHandle.addEventListener('pointerdown', onWidgetPointerDown);
  widgetHandle.addEventListener('pointermove', onWidgetPointerMove);
  widgetHandle.addEventListener('pointerup', onWidgetPointerUp);
  widgetHandle.addEventListener('pointercancel', onWidgetPointerCancel);
  widgetHandle.addEventListener('lostpointercapture', onWidgetPointerCancel);
  window.addEventListener('blur', onWidgetBlur);
  const widgetObserver = new ResizeObserver(positionWidget);
  widgetObserver.observe(stageHost); widgetObserver.observe(widget);

  function updateSpeedLab() {
    const speedLimit = Math.floor(Math.min(80, configurationStats(vehicle).speedCeiling));
    demoSpeed = clamp(demoSpeed, 0, speedLimit);
    const slider = get<HTMLInputElement>('#factory-demo-speed'); slider.max = String(speedLimit); slider.value = String(demoSpeed);
    const point = operatingPoint(vehicle, demoSpeed);
    get('#factory-demo-speed-value').textContent = `${demoSpeed} km/h`;
    get('.factory-speed-readings').innerHTML = `<span><small>车轮转速</small><strong>${round(point.wheelRPM)} <small>r/min</small></strong></span><span><small>电机转速</small><strong>${round(point.motorRPM)} <small>r/min</small></strong></span><p>${demoSpeed === 0 ? '车已停稳，转速为0。' : `车轮每转1圈，电机转${vehicle.reducer}圈。`} 大传动比或小轮径会让同车速的电机转得更快。</p>`;
  }

  async function exportParameters(format: string) {
    const title = `${vehicle.name.replace(/[\\/:*?"<>|]/g, '') || '我的汽车'}-完整参数图`;
    const svg = parameterDiagram(vehicle);
    if (format === 'svg') { downloadFile(`${title}.svg`, svg, 'image/svg+xml;charset=utf-8'); api.notify('完整参数矢量图已下载，可放大或打印。'); return; }
    try {
      const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 2100;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG encode failed');
      downloadFile(`${title}.png`, blob, 'image/png'); api.notify('完整参数图已下载，包含六大部件和计算关系。');
    } catch { api.notify('参数图片暂时无法生成，请使用矢量图 SVG 下载。'); }
  }

  function persist() {
    const latest = runs[runs.length - 1];
    const battery = batteryOf(vehicle);
    api.record('factory', {
      configuration: { ...vehicle }, saved, compared, widget: { closed: widgetClosed, ...widgetPosition }, runs: runs.slice(-24), best: { ...best }, stars: { ...stars }, attempts: { ...attempts },
      summary: comparison ? `我在${comparison.current.routeName}换了部件：每100 km折算用电从${round(consumptionOf(comparison.previous), 2)}变为${round(consumptionOf(comparison.current), 2)} kWh，要结合行驶完成比例看。`
        : latest ? `我的${vehicle.name}在${latest.routeName}跑了${round(latest.distance / 1000, 2)} km，发现容量和供电能力是两回事。` : '我装配了自己的新能源小车，准备带它上路。',
      report: [
        { label: '我的汽车', value: vehicle.name },
        { label: '电池容量 / 最大供电', value: `${battery.value} kWh / ${battery.power} kW` },
        ...parameterGroups(vehicle).map(group => ({ label: `${PART_NAMES[group.part]} · ${group.title}`, value: group.rows.map(([label, value]) => `${label} ${value}`).join('；') })),
        { label: '整备质量 / 工程预算', value: `${configurationStats(vehicle).emptyMass} kg / ${configurationCost(vehicle)} 币` },
        { label: '保守轮端功率 / 低速扭矩上限', value: `${round(configurationStats(vehicle).wheelPower)} kW / ${round(configurationStats(vehicle).wheelTorque)} N·m；驱动力还受抓地限制` },
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
    host.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => {
      const selected = button.dataset.part === chosenPart;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    host.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === vehicle.color)));
    const customColor = get<HTMLInputElement>('.factory-custom-color input');
    if (document.activeElement !== customColor) customColor.value = vehicle.color;
    const options = partOptions(chosenPart);
    get('.factory-options').innerHTML = options.map(o => `<button type="button" class="factory-option ${String(vehicle[chosenPart]) === String(o.value) ? 'is-selected' : ''}" data-option="${o.value}" aria-pressed="${String(vehicle[chosenPart]) === String(o.value)}">${chosenPart === 'body' ? `<span class="factory-body-preview" aria-hidden="true">${premiumCarSVG(vehicle.color, String(o.value))}</span>` : `<span class="factory-option-check">${String(vehicle[chosenPart]) === String(o.value) ? '✓' : '○'}</span>`}<span><strong>${o.title}</strong><small>${o.detail}</small></span><span class="factory-option-coins">${o.coins}<small>币</small></span></button>`).join('');
    get('.factory-part-detail').textContent = PART_HINTS[chosenPart];
    const stats = configurationStats(vehicle);
    get('.factory-config-summary').innerHTML = `<span><small>工程预算</small><strong>${stats.cost} 币</strong></span><span><small>整备质量</small><strong>${stats.emptyMass} kg</strong></span><span><small>保守轮端功率</small><strong>${round(stats.wheelPower)} kW</strong></span><span><small>轮端扭矩上限</small><strong>${round(stats.wheelTorque)} N·m</strong></span>`;
    get('.factory-matching').textContent = `匹配提示：当前保守功率上限主要受${stats.limiting}限制。${chosenPart === 'reducer' ? '大传动比增加低速扭矩，也降低转速对应的车速。' : chosenPart === 'wheels' ? '轮径、滚阻与抓地各有取舍，试跑比较更直观。' : '换大电机前，先看电池和逆变器能否供得上。'}`;
    const nextDiagramKey = `${fingerprint(vehicle)}:${vehicle.name}:${vehicle.color}`;
    if (nextDiagramKey !== diagramKey) { get('.factory-parameter-diagram').innerHTML = parameterDiagram(vehicle, true); diagramKey = nextDiagramKey; }
    host.querySelectorAll<SVGElement>('[data-diagram-part]').forEach(node => { node.setAttribute('aria-pressed', String(node.dataset.diagramPart === chosenPart)); node.setAttribute('aria-disabled', String(!!playback && !playback.finished)); });
    updateSpeedLab();
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
    host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.factory-controls input, .factory-controls button, .factory-widget .factory-save, .factory-widget .factory-poster').forEach(control => control.disabled = !!playback && !playback.finished);
    positionWidget();
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
    const previous = [...runs].reverse().find(r => r.route === current.route && typeof r.fingerprint === 'string' && r.fingerprint.startsWith('powertrain-v2:') && r.fingerprint !== current.fingerprint);
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
    comparison = null;
    const road = ROADS.find(r => r.id === routeId)!;
    const challenge = createChallenge(routeId, attempts[routeId]++);
    playback = { outcome: simulateRoad(vehicle, road), elapsed: 0, displaySeconds: reduceMotion() ? 8 : road.seconds, paused: false, finished: false, challenge, eventPhase: null };
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
    else if (part === 'inverter') vehicle.inverter = Number(value);
    else if (part === 'reducer') vehicle.reducer = Number(value);
    else if (part === 'wheels') vehicle.wheels = value;
    else vehicle.body = value;
    playback = null;
    get('.factory-result').hidden = true;
    feedback(`${partOptions(part).find(p => String(p.value) === value)?.title ?? PART_NAMES[part]}已装上！参数图已更新，试跑看看有什么变化。`);
    persist(); updateControls();
  }

  function makePoster(): string {
    const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 2400;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    nightBackdrop(ctx, 1000, 1200);
    label(ctx, 'MY FIRST ELECTRIC CAR', 78, 104, 20, '#a6bad0', 600);
    label(ctx, vehicle.name, 78, 184, 50, '#e8f3ff', 700);
    label(ctx, `${api.getProfile().nickname || '小工程师'}的新能源造车作品`, 80, 227, 24, '#a6bad0');
    roundRect(ctx, 70, 294, 860, 394, 32, '#111c32', '#3e5476');
    ctx.fillStyle = '#47eaff22'; ctx.beginPath(); ctx.ellipse(500, 674, 275, 15, 0, 0, Math.PI * 2); ctx.fill();
    drawBody(ctx, 500, 590, vehicle, 2.5);
    const battery = batteryOf(vehicle), motor = motorOf(vehicle), inverter = inverterOf(vehicle), reducer = reducerOf(vehicle), wheels = wheelsOf(vehicle);
    label(ctx, `${bodyOf(vehicle).title} · ${configurationCost(vehicle)} 工程币`, 111, 342, 20, '#e8f3ff');
    for (const [i, pair] of [['电池容量 / 供电', `${battery.value} kWh / ${battery.power} kW`], ['逆变器输入 / 效率', `${inverter.value} kW / ${round(inverter.efficiency * 100)}%`], ['电机功率 / 扭矩', `${motor.value} kW / ${motor.torque} N·m`], ['减速器 / 效率', `${reducer.value}∶1 / ${round(reducer.efficiency * 100)}%`], ['车轮 / 有效半径', `${wheels.size} / ${wheels.radius} m`], ['整备质量', `${configurationStats(vehicle).emptyMass} kg`]].entries()) {
      const x = 85 + i % 3 * 305, y = 737 + Math.floor(i / 3) * 85;
      label(ctx, pair[0], x, y, 17, '#a6bad0'); label(ctx, pair[1], x, y + 35, 21, '#e8f3ff', 700);
    }
    label(ctx, '电池 → 逆变器 → 电机 → 减速器 → 车轮', 85, 933, 25, '#e8f3ff');
    const matchingRuns = runs.filter(run => run.fingerprint === fingerprint(vehicle));
    const routeMarks = ROADS.map(road => {
      const routeRuns = matchingRuns.filter(run => run.route === road.id);
      return `${road.id === 'city' ? '校园' : road.id === 'hill' ? '爬坡' : '远方'} ${routeRuns.length ? `${round(Math.max(...routeRuns.map(run => run.ratio)) * 100)}%` : '未试跑'}`;
    });
    label(ctx, '这套配置的路测记录', 85, 978, 20, '#a6bad0');
    label(ctx, routeMarks.join('    '), 85, 1021, 23, '#e8f3ff');
    label(ctx, '我装配，我试跑，我发现。', 85, 1083, 28, '#f5bc65', 600);
    label(ctx, '合成教学参数与加速展示，不代表实车性能。', 85, 1147, 18, '#a6bad0');
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
    const diagramPart = (event.target as Element).closest<SVGElement>('[data-diagram-part]');
    if (diagramPart && !(playback && !playback.finished)) { chosenPart = diagramPart.dataset.diagramPart as Part; updateControls(); get('.factory-options').scrollIntoView({ block: 'nearest', behavior: 'instant' }); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !host.contains(button) || button.disabled) return;
    if (button.classList.contains('factory-widget-close')) setWidgetClosed(true);
    else if (button.classList.contains('factory-widget-open')) setWidgetClosed(false);
    else if (button.dataset.exportParameters) void exportParameters(button.dataset.exportParameters);
    else if (button.dataset.decision !== undefined) chooseAction(Number(button.dataset.decision));
    else if (button.classList.contains('factory-event-continue') && playback?.eventPhase === 'feedback') {
      playback.eventPhase = null;
      feedback(`判断完成 ${playback.challenge.index}/3，继续出发！`); updateControls();
      get('.factory-pause').focus({ preventScroll: true });
    }
    else if (button.classList.contains('factory-retry') && playback?.finished) startRoad(playback.outcome.route);
    else if (button.classList.contains('factory-next') && playback?.finished) startRoad(ROADS[(ROADS.findIndex(r => r.id === playback!.outcome.route) + 1) % ROADS.length].id);
    else if (button.dataset.part) { chosenPart = button.dataset.part as Part; updateControls(); }
    else if (button.dataset.setup) {
      const setup = SETUPS.find(p => p.id === button.dataset.setup);
      if (setup) { vehicle = { ...vehicle, ...setup.parts }; playback = null; get('.factory-result').hidden = true; persist(); updateControls(); feedback(`${setup.title}已装配。${setup.hint}`); }
    }
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
    if (target === nameInput) { vehicle.name = target.value.slice(0, 16); updateControls(); }
    else if (target.matches('.factory-custom-color input')) { vehicle.color = target.value; updateControls(); }
    else if (target.id === 'factory-demo-speed') { demoSpeed = Number(target.value); updateSpeedLab(); }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target === widgetHandle && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) {
      event.preventDefault(); finishWidgetDrag(true);
      const bounds = widgetBounds(), step = event.shiftKey ? 40 : 16;
      if (event.key === 'Home') widgetPosition = { x: 1, y: 0 };
      else widgetPosition = { x: clamp(widgetPosition.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0) / Math.max(1, bounds.x)), y: clamp(widgetPosition.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) / Math.max(1, bounds.y)) };
      positionWidget(); persist(); return;
    }
    if (event.key === 'Escape' && widget.contains(event.target as Node)) { event.preventDefault(); if (widgetDrag) finishWidgetDrag(true); else setWidgetClosed(true); return; }
    const part = (event.target as Element).closest<SVGElement>('[data-diagram-part]');
    if (part && (event.key === 'Enter' || event.key === ' ') && !(playback && !playback.finished)) { event.preventDefault(); chosenPart = part.dataset.diagramPart as Part; updateControls(); get('.factory-options').scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
  };
  const onChange = () => persist();
  const onVisibility = () => { if (document.hidden && playback && !playback.finished && !playback.eventPhase) { playback.paused = true; updateControls(); } };
  host.addEventListener('click', onClick); host.addEventListener('input', onInput); host.addEventListener('change', onChange);
  host.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);

  function drawChain(ctx: CanvasRenderingContext2D, y: number, running: boolean) {
    const names = ['电池', '逆变器', '电机', '减速器', '车轮'];
    const xs = [280, 390, 500, 610, 720];
    ctx.strokeStyle = '#406381'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xs[0], y); ctx.lineTo(xs[4], y); ctx.stroke();
    xs.forEach((x, i) => {
      roundRect(ctx, x - 40, y - 17, 80, 34, 17, i === 0 ? '#174643' : i === 2 ? '#253456' : '#18263e', '#476786');
      label(ctx, names[i], x - (names[i].length * 7), y + 5, 14, '#e8f3ff');
    });
    const dotX = xs[0] + (reduceMotion() ? .45 : running ? (elapsed * .5) % 1 : 0) * (xs[4] - xs[0]);
    ctx.beginPath(); ctx.arc(dotX, y + 22, 4, 0, Math.PI * 2); ctx.fillStyle = '#f5bc65'; ctx.fill();
  }

  function drawWorkshop(ctx: CanvasRenderingContext2D) {
    // The assembly preview contains only the selected vehicle on a plain surface.
    ctx.fillStyle = '#0c1729'; ctx.fillRect(0, 0, 1000, 520);
    drawBody(ctx, previewCarX, 260 + 25 * previewCarScale, vehicle, previewCarScale);
  }

  function drawRoad(ctx: CanvasRenderingContext2D, playbackState: Playback) {
    const outcome = playbackState.outcome, road = ROADS.find(r => r.id === outcome.route)!;
    const sample = sampleOutcome(outcome, playbackState.elapsed / playbackState.displaySeconds);
    const progress = clamp(sample.distance / road.distance);
    nightBackdrop(ctx, 1000, 520, true);
    label(ctx, road.title, 43, 56, 29, '#e8f3ff', 600); label(ctx, road.subtitle, 44, 83, 14, '#a6bad0');
    roundRect(ctx, 725, 29, 227, 59, 14, '#111c32', '#3d5b7a');
    label(ctx, `${playbackState.eventPhase || playbackState.paused || playbackState.finished ? 0 : round(sample.speed)} km/h`, 745, 55, 19, '#e8f3ff', 600);
    label(ctx, `电量 ${round((batteryOf(outcome.vehicle).value * .65 - sample.energy) / batteryOf(outcome.vehicle).value * 100)}%`, 745, 77, 14, '#a6bad0');
    // Distant hills, trees, campus and a charge stop are all native 2D shapes.
    ctx.fillStyle = '#162944'; ctx.beginPath(); ctx.moveTo(0, 288); ctx.quadraticCurveTo(120, 165, 255, 289); ctx.quadraticCurveTo(425, 140, 607, 285); ctx.quadraticCurveTo(800, 186, 1000, 276); ctx.lineTo(1000, 520); ctx.lineTo(0, 520); ctx.closePath(); ctx.fill();
    for (const [x, y, h] of [[66, 257, 42], [216, 232, 60], [744, 237, 49], [899, 220, 73]]) {
      ctx.fillStyle = '#244255'; ctx.beginPath(); ctx.ellipse(x, y, h * .4, h * .65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#456885'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y + 11); ctx.lineTo(x, y + h); ctx.stroke();
    }
    if (outcome.route === 'city') {
      roundRect(ctx, 372, 200, 172, 103, 8, '#27324a', '#bc98ff70');
      roundRect(ctx, 414, 240, 28, 63, 3, '#175265');
      for (let i = 0; i < 4; i++) roundRect(ctx, 389 + i * 35, 218, 19, 23, 3, '#75f1bb');
      label(ctx, '小芽校园', 417, 192, 16, '#a6bad0', 600);
    }
    const roadY = (x: number) => outcome.route === 'hill' ? 378 - clamp((x - 125) / 760) * 134 : 337;
    const roadPath = (offset: number) => {
      ctx.beginPath(); ctx.moveTo(-40, roadY(0) + offset);
      if (outcome.route === 'hill') { ctx.lineTo(125, roadY(125) + offset); ctx.lineTo(885, roadY(885) + offset); }
      ctx.lineTo(1040, roadY(1000) + offset);
    };
    ctx.strokeStyle = '#1a293e'; ctx.lineWidth = 61; ctx.lineCap = 'round'; roadPath(0); ctx.stroke();
    ctx.strokeStyle = '#47eaffb8'; ctx.lineWidth = 3; ctx.setLineDash([24, 19]); roadPath(18); ctx.stroke(); ctx.setLineDash([]);
    // Start/finish flags avoid a misleading implication of real-time scale.
    for (const [x, text] of [[115, '出发'], [901, '终点']] as const) {
      const y = roadY(x) - 33;
      ctx.strokeStyle = '#5a7492'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 58); ctx.lineTo(x, y); ctx.stroke();
      roundRect(ctx, x, y - 57, 55, 26, 3, text === '终点' ? '#452f48' : '#184d49'); label(ctx, text, x + 9, y - 39, 13, '#e8f3ff');
    }
    const carX = 118 + progress * 768, carY = roadY(carX) - 20;
    ctx.save(); ctx.translate(carX, carY); if (outcome.route === 'hill') ctx.rotate(-Math.atan(.18));
    drawBody(ctx, 0, 0, outcome.vehicle, 1.15, sample.distance * .14); ctx.restore();
    if (outcome.route === 'city') roundRect(ctx, carX - 56, carY - 6, 25, 19, 3, '#e4bd82', '#aa8a60');
    const activeEvent = playbackState.challenge.events[Math.min(playbackState.challenge.index, 2)];
    if (!playbackState.finished) {
      const markerX = clamp(carX + 130, 265, 875), markerY = roadY(markerX);
      roundRect(ctx, markerX - 63, markerY - 124, 126, 42, 10, playbackState.eventPhase ? '#493841' : '#111c32', '#f5bc65');
      label(ctx, activeEvent.scene, markerX - 48, markerY - 98, 17, '#f5bc65', 600);
      ctx.strokeStyle = '#6b819d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(markerX, markerY - 82); ctx.lineTo(markerX, markerY - 27); ctx.stroke();
      if (outcome.route === 'city') {
        if (activeEvent.scene === '红灯停车') {
          roundRect(ctx, markerX + 28, markerY - 84, 24, 61, 7, '#101d33');
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(markerX + 40, markerY - 72 + i * 18, 6, 0, Math.PI * 2); ctx.fillStyle = i === 0 ? '#ff6e91' : '#354864'; ctx.fill(); }
          ctx.fillStyle = '#d7f5ff'; ctx.fillRect(markerX - 42, markerY - 24, 5, 49);
        } else if (activeEvent.scene === '减速带') {
          for (let i = 0; i < 5; i++) roundRect(ctx, markerX - 40 + i * 18, markerY - 22, 9, 45, 2, i % 2 ? '#17263b' : '#f5bc65');
        } else if (activeEvent.scene === '视线遮挡') {
          drawPremiumCar(ctx, markerX + 12, markerY - 28, '#e5bd63', .85, 0, 'touring');
        } else if (activeEvent.scene === '安全送达') {
          roundRect(ctx, markerX - 22, markerY - 56, 40, 31, 3, '#dbb176', '#99734c');
          roundRect(ctx, markerX + 18, markerY - 46, 29, 21, 3, '#e8c99b', '#99734c');
        } else {
          for (let i = 0; i < 5; i++) roundRect(ctx, markerX - 35 + i * 16, markerY - 20, 9, 44, 1, '#d7f5ff');
          ctx.fillStyle = '#d68a66'; ctx.beginPath(); ctx.arc(markerX + 10, markerY - 51, 8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#637d8a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(markerX + 10, markerY - 42); ctx.lineTo(markerX + 10, markerY - 22); ctx.lineTo(markerX, markerY - 9); ctx.moveTo(markerX + 10, markerY - 22); ctx.lineTo(markerX + 21, markerY - 9); ctx.stroke();
        }
      } else if (outcome.route === 'range') {
        roundRect(ctx, markerX - 18, markerY - 65, 36, 45, 5, '#236b63', '#75f1bb');
        label(ctx, 'ϟ', markerX - 8, markerY - 34, 29, '#e8f3ff', 700);
        if (activeEvent.scene === '雨天车距') {
          ctx.strokeStyle = '#79b8e3'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 22; i++) { const rx = 70 + i * 41; const ry = 130 + (i % 4) * 35; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 7, ry + 16); ctx.stroke(); }
        }
      } else {
        ctx.fillStyle = '#f5bc65'; ctx.beginPath(); ctx.moveTo(markerX, markerY - 64); ctx.lineTo(markerX - 20, markerY - 24); ctx.lineTo(markerX + 20, markerY - 24); ctx.closePath(); ctx.fill();
        label(ctx, '!', markerX - 4, markerY - 33, 21, '#e8f3ff', 700);
      }
    }
    roundRect(ctx, 40, 422, 920, 65, 16, '#111c32', '#3d5b7a');
    label(ctx, `${round(sample.distance / 1000, outcome.route === 'range' ? 1 : 2)} / ${round(road.distance / 1000, 1)} km`, 62, 452, 20, '#e8f3ff', 600);
    label(ctx, `使用 ${round(sample.energy, 2)} kWh`, 63, 475, 13, '#a6bad0');
    drawChain(ctx, 452, !playbackState.paused && !playbackState.finished && !playbackState.eventPhase);
    label(ctx, playbackState.finished ? '挑战记录已保存' : playbackState.eventPhase ? '已停稳 · 请在下方选择' : playbackState.paused ? '已暂停 · 可以继续' : '前进中 · 留意路况', 784, 455, 12, '#e8f3ff');
    if (playbackState.finished) {
      roundRect(ctx, 372, 115, 263, 53, 20, '#302941', '#f5bc65');
      label(ctx, outcome.ratio >= .999 ? '✦ 到站啦！你的小车真棒' : '✦ 有新发现，再换个搭档', 397, 148, 18, '#f5bc65', 600);
    }
  }

  stage = createStage(stageHost, {
    label: '新能源车辆展示：主图只显示当前车型与车身颜色，部件可通过选装按钮或下方参数图配置；路测使用合成教学模型。',
    draw(ctx) { if (playback) drawRoad(ctx, playback); else drawWorkshop(ctx); },
    update(dt) {
      if (destroyed) return;
      if (!playback || (!playback.paused && !playback.eventPhase)) elapsed += dt;
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
  });
  updateControls();
  persist();
  return { destroy() {
    if (destroyed) return; destroyed = true;
    finishWidgetDrag(true); widgetObserver.disconnect();
    widgetHandle.removeEventListener('pointerdown', onWidgetPointerDown);
    widgetHandle.removeEventListener('pointermove', onWidgetPointerMove);
    widgetHandle.removeEventListener('pointerup', onWidgetPointerUp);
    widgetHandle.removeEventListener('pointercancel', onWidgetPointerCancel);
    widgetHandle.removeEventListener('lostpointercapture', onWidgetPointerCancel);
    window.removeEventListener('blur', onWidgetBlur);
    persist(); stage.destroy();
    host.removeEventListener('click', onClick); host.removeEventListener('input', onInput); host.removeEventListener('change', onChange);
    host.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibility);
  } };
}
