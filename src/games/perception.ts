import { createStage, label, roundRect } from '../platform';
import { drawPremiumTopCar } from '../car-art';
import type { GameAPI, MountedGame } from '../types';
import './perception.css';
import { PERCEPTION_SCENES, PERCEPTION_SCENE_CATALOG, SCORED_CATEGORIES, TARGET_CATEGORY_NAMES, type SceneTarget, type TargetId, type ScoredCategory } from './perception-scenes';
import { clickTargetAt, drawSceneAnnotations } from './perception-annotations';
import { drawPerceptionWeather } from './perception-weather';
import { drawLaserCloud, drawScannerLens, SCANNER_RADIUS } from './perception-scan';

type Sensor = 'camera' | 'lidar' | 'radar';
const SENSOR_LABELS: Record<Sensor, string> = { camera: '摄像头', lidar: '激光雷达', radar: '毫米波雷达' };
const PHOTO = { x: 16, y: 40, w: 968, h: 602 };
// Diagnostics have their own collapsible canvas, so the street photo keeps its detail.
const BEV = { x: 18, y: 16, w: 300, h: 328 };
const WAVE = { x: 338, y: 162, w: 644, h: 182 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sensorSignature = (config: Pick<PerceptionConfig, Sensor>) => JSON.stringify({ camera: config.camera, lidar: config.lidar, radar: config.radar });

export interface PerceptionConfig {
  camera: boolean; lidar: boolean; radar: boolean;
  fog: number; rain: number; light: number; speed: number;
}
interface TrialState {
  elapsed: number; gap: number; speed: number; traveled: number;
  detectedAt: number | null; brakeAt: number | null; delay: number;
  ended: boolean; safe: boolean; config: PerceptionConfig;
}
interface TrialRecord {
  config: PerceptionConfig; safe: boolean; stopDistance: number; margin: number;
  detectedAt: number | null; brakingDistance: number; sensorRange: number;
  timestamp: string; signature: string;
}

export function perceptionModel(config: PerceptionConfig) {
  const fog = config.fog / 100, rain = config.rain / 100, light = config.light / 100;
  const quality = {
    camera: clamp((.98 - .63 * fog - .30 * rain) * (.38 + .62 * light), .05, .99),
    lidar: clamp((.97 - .42 * fog - .28 * rain) * (.94 + .06 * light), .08, .99),
    radar: clamp(.94 - .09 * fog - .14 * rain, .20, .99)
  };
  const ranges = { camera: 54 * quality.camera, lidar: 60 * quality.lidar, radar: 64 * quality.radar };
  const effectiveRange = Math.max(...(['camera', 'lidar', 'radar'] as Sensor[]).map(s => config[s] ? ranges[s] : 0));
  const deceleration = 5.8 - 2.1 * rain;
  const speed = config.speed / 3.6;
  const latency = .65;
  const brakingDistance = speed * speed / (2 * deceleration);
  return { quality, ranges, effectiveRange, deceleration, latency, brakingDistance,
    requiredDistance: speed * latency + brakingDistance + 3 };
}

function beginTrial(config: PerceptionConfig): TrialState {
  return { elapsed: 0, gap: 48, speed: config.speed / 3.6, traveled: 0,
    detectedAt: null, brakeAt: null, delay: 0, ended: false, safe: false, config: { ...config } };
}
function advanceTrial(trial: TrialState, dt: number) {
  if (trial.ended) return;
  const model = perceptionModel(trial.config);
  trial.elapsed += dt;
  if (trial.detectedAt === null && trial.gap <= model.effectiveRange) trial.detectedAt = trial.gap;
  if (trial.detectedAt !== null && trial.brakeAt === null && trial.gap <= model.requiredDistance) {
    trial.brakeAt = trial.gap; trial.delay = model.latency;
  }
  const oldSpeed = trial.speed;
  if (trial.brakeAt !== null) {
    if (trial.delay > 0) trial.delay = Math.max(0, trial.delay - dt);
    else trial.speed = Math.max(0, trial.speed - model.deceleration * dt);
  }
  const travel = (oldSpeed + trial.speed) * .5 * dt;
  trial.gap -= travel; trial.traveled += travel;
  if (trial.gap <= 0 || trial.speed < .025 || trial.elapsed > 30) {
    trial.ended = true; trial.safe = trial.gap > .5 && trial.speed < .025;
    trial.speed = 0;
  }
}
// Deterministic physics used by both the live trial and integration checks.
export function runPerceptionTrial(config: PerceptionConfig) {
  const trial = beginTrial(config);
  for (let i = 0; i < 3600 && !trial.ended; i++) advanceTrial(trial, 1 / 120);
  return { safe: trial.safe, margin: trial.gap, traveled: trial.traveled, detectedAt: trial.detectedAt,
    brakingDistance: perceptionModel(config).brakingDistance };
}

export function mountPerception(host: HTMLElement, api: GameAPI): MountedGame {
  const old = api.getRecord('perception');
  const savedConfig = old.configuration as Partial<PerceptionConfig> | undefined;
  const config: PerceptionConfig = {
    camera: savedConfig?.camera ?? true, lidar: savedConfig?.lidar ?? false, radar: savedConfig?.radar ?? false,
    rain: clamp(Number(savedConfig?.rain ?? 0), 0, 100), fog: clamp(Number(savedConfig?.fog ?? 0), 0, 100),
    light: clamp(Number(savedConfig?.light ?? 100), 0, 100), speed: clamp(Number(savedConfig?.speed ?? 40), 20, 60)
  };
  let scene = PERCEPTION_SCENES.find(item => item.id === old.sceneId) ?? PERCEPTION_SCENES[0];
  let targets = scene.targets;
  const currentCatalog = old.sceneCatalog === PERCEPTION_SCENE_CATALOG;
  const allTargetIds = new Set(SCORED_CATEGORIES);
  const found = new Set<ScoredCategory>();
  const discoveredByScene: Record<string, TargetId[]> = {};
  for (const item of PERCEPTION_SCENES) {
    const saved = currentCatalog ? (old.discoveredByScene as Record<string, unknown> | undefined)?.[item.id] : undefined;
    discoveredByScene[item.id] = (Array.isArray(saved) ? saved : []).filter((id): id is TargetId => item.targets.some(target => target.id === id));
  }
  let sceneFound = new Set(discoveredByScene[scene.id]);
  function updateFoundCategories() {
    found.clear();
    for (const item of PERCEPTION_SCENES) for (const target of item.targets) {
      if (SCORED_CATEGORIES.includes(target.category as ScoredCategory) && discoveredByScene[item.id].includes(target.id)) found.add(target.category as ScoredCategory);
    }
  }
  updateFoundCategories();
  const trials: TrialRecord[] = Array.isArray(old.trials) ? old.trials.slice(-6) as TrialRecord[] : [];
  const signatures = new Set<string>(Array.isArray(old.comparedConfigurations) ? (old.comparedConfigurations as string[]).map(value => {
    try { return sensorSignature(JSON.parse(value) as PerceptionConfig); } catch { return value; }
  }) : []);
  let split = clamp(Number(old.split ?? 50), 6, 94), distance = clamp(Number(old.tofDistance ?? 18), 5, 60);
  let view: 'photo' | 'compare' | 'scan' | 'full' = 'photo', selected: TargetId = (currentCatalog ? targets.find(target => target.id === old.selectedTarget)?.id : undefined) ?? targets[0].id;
  let pointer = { x: PHOTO.x + PHOTO.w * .54, y: PHOTO.y + PHOTO.h * .54 };
  let trial: TrialState | null = null, disposed = false, recordTimer = 0, captureTimer = 0;
  let scanCompleted = found.size === allTargetIds.size, splitEarned = Boolean(old.splitExplored), tofEarned = Boolean(old.tofExplored);
  let imageLoaded = false, imageFailed = false;
  let photoSamples: { x: number; y: number; strength: number }[] = [];
  let scanPhoto: HTMLCanvasElement | null = null;
  let draggingSplit = false, pressed = false;
  let toolStage: ReturnType<typeof createStage> | null = null;
  let zoomNatural = false;
  let annotationsVisible = old.annotationsVisible !== false;
  let image = new Image();
  function loadSceneImage() {
    const nextImage = new Image();
    image = nextImage; imageLoaded = false; imageFailed = false; photoSamples = []; scanPhoto = null;
    nextImage.decoding = 'async';
    nextImage.onload = () => {
      if (disposed || image !== nextImage) return;
      imageLoaded = true;
      scanPhoto = document.createElement('canvas');
      scanPhoto.width = image.naturalWidth; scanPhoto.height = image.naturalHeight;
      const scanCtx = scanPhoto.getContext('2d')!;
      scanCtx.filter = 'grayscale(100%) contrast(185%) brightness(38%)';
      scanCtx.drawImage(image, 0, 0); scanCtx.filter = 'none';
      scanCtx.fillStyle = '#053e252e'; scanCtx.fillRect(0, 0, scanPhoto.width, scanPhoto.height);
      // Photo edges are 2D teaching samples, not measured 3D returns.
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 288; sampleCanvas.height = Math.round(288 * image.naturalHeight / image.naturalWidth);
      const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (sampleCtx) {
        sampleCtx.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const data = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
        const brightness = (sx: number, sy: number) => { const index = (sy * sampleCanvas.width + sx) * 4; return (data[index] + data[index + 1] + data[index + 2]) / 3; };
        for (let sy = 2; sy < sampleCanvas.height - 2; sy += 2) for (let sx = 2; sx < sampleCanvas.width - 2; sx += 2) {
          const edge = Math.abs(brightness(sx + 1, sy) - brightness(sx - 1, sy)) + Math.abs(brightness(sx, sy + 1) - brightness(sx, sy - 1));
          if (edge > 42 && ((sx * 13 + sy * 29) % 7) < 4) photoSamples.push({ x: sx / sampleCanvas.width, y: sy / sampleCanvas.height, strength: Math.min(1, edge / 160) });
        }
      }
      status.textContent = `${scene.location}：${scene.hint}。点击照片中的目标或下方目标卡，逐个手动标记。`;
      updateUI(); scheduleRecord();
      if (!currentCatalog && old.sceneId) {
        clearTimeout(captureTimer);
        captureTimer = window.setTimeout(() => { if (!disposed && image === nextImage) api.saveImage('perception', stage.capture()); }, 120);
      }
    };
    nextImage.onerror = () => {
      if (disposed || image !== nextImage) return;
      imageFailed = true; status.textContent = '场景照片未能载入，请重试或选择其他场景。'; updateUI();
    };
    nextImage.src = scene.image;
    updateUI();
  }
  const targetButtons = () => targets.map((t, index) => `<button class="btn perception-target" data-target="${t.id}" data-category="${t.category}" aria-pressed="${t.id === selected}" title="${TARGET_CATEGORY_NAMES[t.category]} · ${t.name}"><span class="perception-target-dot" style="--target-color:${t.color}"></span><span>${index + 1} ${t.name}</span><span class="perception-found-mark" aria-hidden="true">＋</span></button>`).join('');

  host.innerHTML = `
    <section class="experience perception-experience">
      <div class="perception-toolbar">
        <div class="perception-mode-group" role="group" aria-label="观察方式">
          <button class="btn perception-mode is-active" data-view="photo" aria-pressed="true">清晰实景</button>
          <button class="btn perception-mode" data-view="compare" aria-pressed="false">◐ 分屏对照</button>
          <button class="btn perception-mode" data-view="scan" aria-pressed="false">⌖ 激光探照镜</button>
          <button class="btn perception-mode" data-view="full" aria-pressed="false">▧ 全融合点云</button>
        </div>
        <div class="perception-toolbar-end"><button class="btn perception-annotations" aria-pressed="${annotationsVisible}">显示标记 · ${annotationsVisible ? '开' : '关'}</button><button class="btn perception-restore" title="清空当前照片的手动标记，重新开始">↺ 还原本图</button><button class="btn perception-photo-zoom">⤢ 放大实景</button><button class="btn perception-capture">保存实验照片</button></div>
      </div>
      <div class="perception-scene-picker" role="group" aria-label="选择道路场景">
        ${PERCEPTION_SCENES.map(item => `<button class="perception-scene" data-scene="${item.id}" aria-pressed="${item.id === scene.id}" title="${item.location} · ${item.hint}"><img src="${item.image}" alt="" loading="lazy"><span>${item.name}</span></button>`).join('')}
      </div>
      <div class="perception-workspace">
        <div class="perception-main">
          <div class="playfield perception-playfield" tabindex="0" aria-label="高清实景感知实验舞台，点击目标手动标记，方向键移动光标，回车或空格标记光标处的目标"></div>
          <div class="perception-target-heading"><strong>手动标记目标</strong><span class="perception-target-count"></span></div>
          <div class="perception-objects" role="group" aria-label="点击目标卡逐个手动标记，编号对应照片中的标框">
            ${targetButtons()}
          </div>
          <div class="perception-photo-caption"><span class="perception-data-chip"></span><span>点击照片目标或目标卡逐个标记；“还原本图”清空本图标记</span></div>
        </div>
        <aside class="control-panel perception-settings">
          <div class="perception-control-heading"><strong>给汽车换一双眼睛</strong></div>
          <div class="control-group perception-sensors"><div class="perception-sensor-heading"><span class="perception-control-label">传感器组合</span><button class="btn perception-fusion">⚡ 三模融合</button></div><div class="perception-sensor-row">
            ${(['camera', 'lidar', 'radar'] as Sensor[]).map(s => `<label class="perception-sensor"><input type="checkbox" data-sensor="${s}" ${config[s] ? 'checked' : ''}><span>${SENSOR_LABELS[s]}</span></label>`).join('')}
          </div></div>
          <div class="control-group perception-range-group"><label for="perception-fog">雾的浓度 <output data-value="fog">${config.fog}%</output></label><input id="perception-fog" type="range" min="0" max="100" value="${config.fog}" data-config="fog"></div>
          <div class="control-group perception-range-group"><label for="perception-rain">雨的强度 <output data-value="rain">${config.rain}%</output></label><input id="perception-rain" type="range" min="0" max="100" value="${config.rain}" data-config="rain"></div>
          <div class="control-group perception-range-group"><label for="perception-light">环境光照 <output data-value="light">${config.light}%</output></label><input id="perception-light" type="range" min="0" max="100" value="${config.light}" data-config="light"></div>
          <button class="btn perception-image-retry" hidden>重新载入照片</button><button class="btn perception-clear-weather">恢复晴天与正常光照</button>
          <div class="control-group perception-range-group" data-split-control hidden><label for="perception-split">分屏位置 <output data-value="split">${split}%</output></label><input id="perception-split" type="range" min="6" max="94" value="${split}" data-range="split"></div>
          <div class="perception-control-divider"></div>
          <button class="btn perception-target-zoom">⤢ 查看行人细节</button>
          <div class="control-group perception-range-group"><label for="perception-speed">虚拟测试车速 <output data-value="speed">${config.speed} km/h</output></label><input id="perception-speed" type="range" min="20" max="60" step="5" value="${config.speed}" data-config="speed"></div>
          <button class="btn btn-primary perception-test">开始 AEB 路测 <span aria-hidden="true">→</span></button>
          <p class="perception-control-hint">移动激光探照镜，看绿色点云与立体轮廓；点击目标才会标记。开启毫米波雷达查看教学测距。“还原本图”清空当前照片的标记。</p>
        </aside>
      </div>
      <div class="perception-feedback" aria-live="polite"><div><span class="perception-feedback-icon">⌖</span><span class="perception-status">先观察清晰实景，点击目标逐个手动标记，再试试分屏对照。</span></div><span class="perception-progress">已发现 ${found.size}/4</span></div>
      <details class="perception-tools">
        <summary><span><strong>实验工具</strong><small>教学鸟瞰图 · 光波飞行时间 · AEB 路测</small></span><span class="perception-tools-action">展开 <span aria-hidden="true">⌄</span></span></summary>
        <div class="perception-tools-content">
          <div class="perception-tool-viewport"><div class="perception-tool-playfield" aria-label="独立教学鸟瞰图与光波飞行时间诊断工具"></div></div>
          <span class="perception-small-screen-hint">横向滑动，查看完整实验工具 →</span>
          <div class="control-group perception-range-group perception-tof-control"><label for="perception-distance">改变 ToF 教学距离，观察回波 <output data-value="distance">${distance} m</output></label><input id="perception-distance" type="range" min="5" max="60" value="${distance}" data-range="distance"></div>
          <p class="perception-tool-note">图像提供外观线索，飞行时间提供距离线索。这里的距离、位置和制动都是教学设定。</p>
        </div>
      </details>
      <div class="perception-evidence" aria-label="最近两次配置对照"></div>
      <p class="science-note perception-science"><strong>数据说明</strong> <span class="perception-credit"></span>框选为人工教学标注；点云、距离、天气影响和制动均为教学仿真，并非照片实测。雨雾也会影响激光雷达。</p>
      <dialog class="perception-zoom-dialog" aria-labelledby="perception-zoom-title">
        <div class="perception-zoom-header"><div><h3 id="perception-zoom-title">清晰实景</h3></div><button class="btn perception-zoom-close" aria-label="关闭实景放大">✕</button></div>
        <div class="perception-zoom-toolbar"><span class="perception-zoom-meta"></span><div><button class="btn perception-zoom-fit is-active">适应窗口</button><button class="btn perception-zoom-native">100% 原图</button></div></div>
        <div class="perception-zoom-viewport"><img class="perception-zoom-image" alt="道路实景照片"></div>
        <p class="perception-zoom-credit"></p>
      </dialog>
    </section>`;

  const root = host.querySelector<HTMLElement>('.perception-experience')!;
  const playfield = root.querySelector<HTMLElement>('.perception-playfield')!;
  const status = root.querySelector<HTMLElement>('.perception-status')!;
  const progress = root.querySelector<HTMLElement>('.perception-progress')!;
  const testButton = root.querySelector<HTMLButtonElement>('.perception-test')!;
  const evidence = root.querySelector<HTMLElement>('.perception-evidence')!;
  const tools = root.querySelector<HTMLDetailsElement>('.perception-tools')!;
  const toolPlayfield = root.querySelector<HTMLElement>('.perception-tool-playfield')!;
  const zoomDialog = root.querySelector<HTMLDialogElement>('.perception-zoom-dialog')!;
  const zoomImage = root.querySelector<HTMLImageElement>('.perception-zoom-image')!;
  const abort = new AbortController();
  const listen = (el: EventTarget, event: string, fn: EventListener) => el.addEventListener(event, fn, { signal: abort.signal });
  const selectedTarget = () => targets.find(t => t.id === selected)!;

  function saveRecord() {
    const last = trials.at(-1);
    const reportConfig = last?.config ?? config;
    const sensors = (['camera', 'lidar', 'radar'] as Sensor[]).filter(s => reportConfig[s]).map(s => SENSOR_LABELS[s]).join('＋') || '未启用';
    const summary = last
      ? `我用${sensors}完成了感知路测，发现时机与车速会共同影响能否及时停车。`
      : '我正在比较实景图像和教学感知数据，探索汽车如何获得道路线索。';
    api.record('perception', {
      summary,
      report: [
        { label: last ? '最近路测传感器' : '我的传感器组合', value: sensors },
        { label: '观察场景', value: `${scene.name} · ${scene.location}` },
        { label: '本图手动标记', value: `${sceneFound.size}/${targets.length} 个教学标注目标` },
        { label: '累计发现', value: `${found.size}/4 类教学标注目标` },
        { label: '照片署名', value: `${scene.author} / Wikimedia Commons · ${scene.license}` },
        { label: '照片来源', value: scene.source },
        { label: '路测雨 / 雾 / 光照', value: `${reportConfig.rain}% / ${reportConfig.fog}% / ${reportConfig.light}%（教学环境）` },
        { label: '路测虚拟车速', value: `${reportConfig.speed} km/h` },
        { label: '光波教学测距', value: `${distance} m，对应往返 ${(distance * 2 / .299792458).toFixed(1)} ns` },
        { label: '配置对照', value: `${Math.min(signatures.size, 2)}/2 套不同配置` },
        { label: '最近路测', value: last ? last.safe ? `安全停下，停车余量 ${last.margin.toFixed(1)} m` : '教学系统已安全暂停，可以改配置再试' : '尚未进行' },
        { label: '数据来源', value: '照片为实景；点云、距离和制动为教学仿真，并非照片实测' }
      ],
      configuration: { ...config }, discovered: [...found], sceneId: scene.id, sceneCatalog: PERCEPTION_SCENE_CATALOG, annotationsVisible,
      discoveredByScene: { ...discoveredByScene, [scene.id]: [...sceneFound] }, split, tofDistance: distance,
      splitExplored: splitEarned, tofExplored: tofEarned, scanCompleted,
      comparedConfigurations: [...signatures], trials: trials.slice(-6),
      dataOrigin: { image: imageLoaded ? `${scene.name} · ${scene.location}` : imageFailed ? '照片载入失败' : '照片载入中',
        annotations: '用户逐个手动标记的教学目标', distances: '教学设定，非实测',
        waveform: '按 d=cΔt/2 计算的教学波形', detection: '教学探测模型，非设备置信度',
        pointLayer: '照片二维边缘采样与教学目标点示意，非真实三维点云' },
      selectedTarget: selected, lastUpdated: new Date().toISOString()
    });
  }
  function scheduleRecord() {
    clearTimeout(recordTimer); recordTimer = window.setTimeout(saveRecord, 180);
  }
  function markComplete() {
    if (scanCompleted && trials.length > 0) api.complete('perception');
  }
  function discover(id: TargetId) {
    if (sceneFound.has(id) || !imageLoaded) return;
    sceneFound.add(id); discoveredByScene[scene.id] = [...sceneFound];
    const target = targets.find(t => t.id === id)!;
    if (SCORED_CATEGORIES.includes(target.category as ScoredCategory)) {
      found.add(target.category as ScoredCategory);
      api.award('perception', `target-${target.category}`, 5, `扫描发现${TARGET_CATEGORY_NAMES[target.category]}`);
    }
    if (found.size === allTargetIds.size && !scanCompleted) {
      scanCompleted = true;
      status.textContent = '四种目标已定位！现在换传感器，看看虚拟汽车能否及时停下。';
      api.notify('已集齐四种目标，完成感知扫描！'); markComplete();
    } else status.textContent = `已手动标记${target.name}。继续点击其他目标，或点击“还原本图”重新开始。`;
    updateUI(); scheduleRecord();
  }
  function exploreSplit(value: number) {
    split = clamp(value, 6, 94);
    if (!splitEarned && Math.abs(split - 50) > 7) {
      splitEarned = true; api.award('perception', 'split', 20, '观察实景与感知分屏');
      status.textContent = '同一个目标，图像和测距提供不同线索。试试移动扫描窗口。';
    }
    updateUI(); scheduleRecord();
  }
  function setDistance(value: number) {
    const before = distance; distance = clamp(value, 5, 60);
    if (!tofEarned && Math.abs(distance - before) >= 1) {
      tofEarned = true; api.award('perception', 'tof', 20, '改变距离观察回波延迟');
      status.textContent = '目标越远，回波返回越晚。波形按教学距离计算，并非真实照片测量。';
    }
    updateUI(); scheduleRecord();
  }
  function showDiagnostics() {
    if (toolStage || disposed) return;
    toolStage = createStage(toolPlayfield, {
      width: 1000, height: 360,
      label: '独立教学诊断：鸟瞰图、虚拟自动紧急制动、按距离计算的光波回波。',
      draw(ctx, time) { drawDiagnostics(ctx, time); }
    });
  }
  function updateZoomScale() {
    zoomImage.classList.toggle('is-native', zoomNatural);
    root.querySelector('.perception-zoom-fit')!.classList.toggle('is-active', !zoomNatural);
    root.querySelector('.perception-zoom-native')!.classList.toggle('is-active', zoomNatural);
    root.querySelector('.perception-zoom-viewport')!.scrollTo(0, 0);
  }
  function openZoom(id: TargetId | null) {
    if (!imageLoaded) { api.notify('实景照片正在载入，请稍后再打开。'); return; }
    zoomNatural = false;
    const target = id ? targets.find(t => t.id === id)! : null;
    const heading = root.querySelector<HTMLElement>('#perception-zoom-title')!;
    const meta = root.querySelector<HTMLElement>('.perception-zoom-meta')!;
    if (target) {
      // Crop the original photo; the manifest is shared with the main canvas annotations.
      const source = sourceRect(target);
      const padX = Math.max(35, source.w * .75), padY = Math.max(25, source.h * .30);
      const sx = Math.floor(Math.max(0, source.x - padX)), sy = Math.floor(Math.max(0, source.y - padY));
      const sw = Math.ceil(Math.min(image.naturalWidth - sx, source.x + source.w + padX - sx));
      const sh = Math.ceil(Math.min(image.naturalHeight - sy, source.y + source.h + padY - sy));
      const crop = document.createElement('canvas'); crop.width = sw; crop.height = sh;
      const ctx = crop.getContext('2d')!;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      if (annotationsVisible && sceneFound.has(target.id)) {
        ctx.strokeStyle = target.color; ctx.lineWidth = 2;
        ctx.strokeRect(source.x - sx, source.y - sy, source.w, source.h);
      }
      zoomImage.src = crop.toDataURL('image/png');
      zoomImage.alt = `${target.name}原图局部${annotationsVisible && sceneFound.has(target.id) ? '，含手动标记' : ''}`;
      heading.textContent = `${target.name} · 原图局部`;
      meta.textContent = `来源 ${image.naturalWidth} × ${image.naturalHeight} px · 局部 ${sw} × ${sh} px`;
      zoomImage.classList.add('is-crop');
    } else {
      if (annotationsVisible && sceneFound.size) {
        const annotated = document.createElement('canvas'); annotated.width = image.naturalWidth; annotated.height = image.naturalHeight;
        const ctx = annotated.getContext('2d')!; ctx.drawImage(image, 0, 0);
        drawSceneAnnotations(ctx, targets, { x: 0, y: 0, w: annotated.width, h: annotated.height }, selected, sceneFound);
        zoomImage.src = annotated.toDataURL('image/jpeg', .94);
      } else zoomImage.src = image.src;
      zoomImage.alt = `${scene.location}高清实景照片${annotationsVisible && sceneFound.size ? `，含 ${sceneFound.size} 个手动标记` : ''}`;
      heading.textContent = `${scene.name} · ${scene.location}`;
      meta.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · 100% 模式可以滚动查看原图`;
      zoomImage.classList.remove('is-crop');
    }
    updateZoomScale(); if (!zoomDialog.open) zoomDialog.showModal();
  }
  function updateUI() {
    if (disposed) return;
    root.dataset.scene = scene.id; root.dataset.scanMode = view; root.dataset.imageState = imageLoaded ? 'ready' : imageFailed ? 'error' : 'loading';
    root.dataset.annotations = String(annotationsVisible); root.dataset.targetCount = String(targets.length); root.dataset.markedCount = String(sceneFound.size);
    const annotationButton = root.querySelector<HTMLButtonElement>('.perception-annotations')!;
    annotationButton.textContent = `显示标记 · ${annotationsVisible ? '开' : '关'}`;
    annotationButton.setAttribute('aria-pressed', String(annotationsVisible));
    root.querySelector<HTMLButtonElement>('.perception-restore')!.disabled = !imageLoaded || sceneFound.size === 0;
    root.querySelector('.perception-target-count')!.textContent = `已标记 ${sceneFound.size}/${targets.length} · 点击逐个标记`;
    playfield.setAttribute('aria-busy', String(!imageLoaded && !imageFailed));
    progress.textContent = `本图 ${sceneFound.size}/${targets.length} · 累计 ${found.size}/4 类`;
    root.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.scene === scene.id));
      button.disabled = Boolean(trial && !trial.ended);
    });
    root.querySelectorAll<HTMLButtonElement>('.perception-photo-zoom, .perception-target-zoom, .perception-capture, [data-target]').forEach(button => button.disabled = !imageLoaded);
    root.querySelector<HTMLButtonElement>('.perception-image-retry')!.hidden = !imageFailed;
    root.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(btn => {
      const id = btn.dataset.target as TargetId;
      btn.classList.toggle('is-found', sceneFound.has(id)); btn.classList.toggle('is-selected', selected === id);
      btn.setAttribute('aria-pressed', String(selected === id));
      btn.querySelector('.perception-found-mark')!.textContent = sceneFound.has(id) ? '✓' : '＋';
    });
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === view); btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
    });
    root.querySelector<HTMLElement>('[data-split-control]')!.hidden = view !== 'compare';
    root.querySelector<HTMLElement>('.perception-target-zoom')!.textContent = `⤢ 查看${selectedTarget().name}细节`;
    for (const key of ['fog', 'rain', 'light', 'speed'] as const) {
      root.querySelector<HTMLOutputElement>(`[data-value="${key}"]`)!.value = `${config[key]}${key === 'speed' ? ' km/h' : '%'}`;
    }
    root.querySelector<HTMLOutputElement>('[data-value="split"]')!.value = `${Math.round(split)}%`;
    root.querySelector<HTMLOutputElement>('[data-value="distance"]')!.value = `${distance} m`;
    const splitInput = root.querySelector<HTMLInputElement>('[data-range="split"]')!;
    splitInput.value = String(split);
    testButton.disabled = Boolean(trial && !trial.ended);
    testButton.innerHTML = trial && !trial.ended ? '正在路测…' : `再来一次 AEB 路测 <span aria-hidden="true">→</span>`;
    if (!trials.length && !trial) testButton.innerHTML = '开始 AEB 路测 <span aria-hidden="true">→</span>';
    root.querySelectorAll<HTMLInputElement>('[data-config], [data-sensor]').forEach(input => input.disabled = Boolean(trial && !trial.ended));
    root.querySelector<HTMLButtonElement>('.perception-fusion')!.disabled = Boolean(trial && !trial.ended);
    root.querySelector<HTMLButtonElement>('.perception-clear-weather')!.disabled = Boolean(trial && !trial.ended);
    root.querySelector('.perception-data-chip')!.textContent = imageFailed ? '照片载入失败' : `${scene.location} · ${scene.author}`;
    root.querySelector('.perception-credit')!.textContent = `照片：${scene.author} / Wikimedia Commons · ${scene.license}。`;
    root.querySelector('.perception-zoom-credit')!.textContent = `照片：${scene.author} / Wikimedia Commons · ${scene.license}。局部标框为人工教学标注。`;
    const recent = trials.slice(-2);
    evidence.innerHTML = recent.map((t, i) => `<div class="perception-evidence-item ${t.safe ? 'is-safe' : 'needs-adjustment'}"><span>测试 ${trials.length - recent.length + i + 1}</span><strong>${(['camera', 'lidar', 'radar'] as Sensor[]).filter(s => t.config[s]).map(s => SENSOR_LABELS[s]).join(' + ') || '未启用传感器'}</strong><span>${t.config.speed} km/h · ${t.safe ? `安全停下，余量 ${Math.max(0, t.margin).toFixed(1)} m` : '安全暂停，换配置再试'}</span></div>`).join('');
  }
  function finishTrial() {
    if (!trial) return;
    const model = perceptionModel(trial.config);
    const signature = sensorSignature(trial.config);
    const result: TrialRecord = { config: { ...trial.config }, safe: trial.safe, margin: trial.gap,
      stopDistance: trial.traveled, detectedAt: trial.detectedAt, brakingDistance: model.brakingDistance,
      sensorRange: model.effectiveRange, timestamp: new Date().toISOString(), signature };
    trials.push(result);
    api.award('perception', 'road-test', 20, '完成自动紧急制动教学路测');
    if (!signatures.has(signature) && signatures.size < 2) {
      signatures.add(signature);
      api.award('perception', `configuration-${signatures.size}`, 10, `传感器配置对照 ${signatures.size}/2`);
    }
    status.textContent = trial.safe
      ? `安全停下，距教学安全线还有 ${trial.gap.toFixed(1)} 米。换一套传感器，比较发现时机。`
      : '路测已安全暂停：发现太晚，停车距离不足。试试其他传感器组合或降低测试车速。';
    markComplete(); updateUI(); saveRecord();
    clearTimeout(captureTimer);
    captureTimer = window.setTimeout(() => { if (!disposed) api.saveImage('perception', stage.capture()); }, 120);
  }

  function selectTarget(id: TargetId) {
    if (!imageLoaded || !targets.some(target => target.id === id)) return;
    selected = id; const target = selectedTarget();
    const rect = targetRect(target);
    pointer = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    annotationsVisible = true;
    distance = target.distance;
    root.querySelector<HTMLInputElement>('[data-range="distance"]')!.value = String(distance);
    status.textContent = `已手动标记${target.name}。可以继续点击其他目标，或点击“还原本图”重新开始。`;
    discover(id);
    updateUI(); scheduleRecord();
  }
  listen(root, 'click', ((event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.scene && button.dataset.scene !== scene.id) {
      const next = PERCEPTION_SCENES.find(item => item.id === button.dataset.scene);
      if (!next || (trial && !trial.ended)) return;
      discoveredByScene[scene.id] = [...sceneFound];
      scene = next; targets = scene.targets; sceneFound = new Set(discoveredByScene[scene.id]);
      selected = targets[0].id; view = 'photo'; trial = null;
      pressed = false; draggingSplit = false; clearTimeout(captureTimer);
      root.querySelector('.perception-objects')!.innerHTML = targetButtons();
      status.textContent = `正在载入${scene.name}…`;
      loadSceneImage(); scheduleRecord();
    }
    if (button.classList.contains('perception-image-retry')) loadSceneImage();
    if (button.classList.contains('perception-restore')) {
      sceneFound.clear(); discoveredByScene[scene.id] = [];
      updateFoundCategories(); scanCompleted = found.size === allTargetIds.size;
      view = 'photo'; annotationsVisible = true; pressed = false; draggingSplit = false;
      status.textContent = '本图已还原，手动标记已清空。点击照片目标或下方目标卡重新标记。';
      updateUI(); saveRecord();
    }
    if (button.classList.contains('perception-annotations')) {
      annotationsVisible = !annotationsVisible;
      if (zoomDialog.open && !zoomImage.classList.contains('is-crop')) openZoom(null);
      updateUI(); scheduleRecord();
    }
    if (button.dataset.view) {
      view = button.dataset.view as typeof view;
      if (view !== 'photo' && !config.lidar && (!trial || trial.ended)) {
        config.lidar = true; root.querySelector<HTMLInputElement>('[data-sensor="lidar"]')!.checked = true;
        scheduleRecord();
      }
      updateUI();
      status.textContent = view === 'photo' ? '清晰实景模式：点击照片目标手动标记，点击“放大实景”可查看原始像素。' : view === 'scan' ? '移动激光探照镜观察绿色点云，点击才会标记；触屏可拖动，方向键也能移动探照镜。' : view === 'full' ? '全融合点云：整幅实景显示激光轮廓。点击“三模融合”，同时对照摄像头、激光与毫米波测距。' : '拖动白色分屏线，对照原始实景与绿色激光感知层。';
    }
    if (button.classList.contains('perception-fusion') && (!trial || trial.ended)) {
      config.camera = true; config.lidar = true; config.radar = true;
      root.querySelectorAll<HTMLInputElement>('[data-sensor]').forEach(input => input.checked = true);
      if (view === 'photo') view = 'full';
      status.textContent = '三模融合已开启：蓝色视觉标记、绿色激光轮廓、琥珀色毫米波教学测距一起工作。';
      updateUI(); scheduleRecord();
    }
    if (button.dataset.target) selectTarget(button.dataset.target as TargetId);
    if (button.classList.contains('perception-test') && (!trial || trial.ended)) {
      trial = beginTrial(config);
      tools.open = true; showDiagnostics();
      status.textContent = '自动小车正在测试：传感器配置决定何时获得障碍线索，固定 AEB 程序负责制动。';
      updateUI();
      tools.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    }
    if (button.classList.contains('perception-capture')) {
      api.saveImage('perception', stage.capture()); saveRecord(); api.notify('实验照片已加入你的电子报告。');
    }
    if (button.classList.contains('perception-clear-weather') && (!trial || trial.ended)) {
      config.fog = 0; config.rain = 0; config.light = 100; view = 'photo';
      if (trial?.ended) trial = null;
      for (const key of ['fog', 'rain', 'light'] as const) root.querySelector<HTMLInputElement>(`[data-config="${key}"]`)!.value = String(config[key]);
      status.textContent = '已恢复晴天、正常光照和清晰实景。切换分屏或扫描，可以继续做天气实验。';
      updateUI(); scheduleRecord();
    }
    if (button.classList.contains('perception-photo-zoom')) openZoom(null);
    if (button.classList.contains('perception-target-zoom')) openZoom(selected);
    if (button.classList.contains('perception-zoom-close')) zoomDialog.close();
    if (button.classList.contains('perception-zoom-fit')) { zoomNatural = false; updateZoomScale(); }
    if (button.classList.contains('perception-zoom-native')) { zoomNatural = true; updateZoomScale(); }
  }) as EventListener);
  listen(root, 'input', ((event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.range === 'split') exploreSplit(Number(input.value));
    if (input.dataset.range === 'distance') setDistance(Number(input.value));
    if (input.dataset.config) {
      const key = input.dataset.config as 'fog' | 'rain' | 'light' | 'speed';
      config[key] = Number(input.value); if (trial?.ended) trial = null;
      if (key !== 'speed' && view === 'photo') { view = 'compare'; status.textContent = '已开启天气教学对照。点击“清晰实景”随时查看未加天气效果的原图。'; }
      updateUI(); scheduleRecord();
    }
  }) as EventListener);
  listen(tools, 'toggle', (() => {
    tools.querySelector('.perception-tools-action')!.innerHTML = tools.open ? '收起 <span aria-hidden="true">⌃</span>' : '展开 <span aria-hidden="true">⌄</span>';
    if (tools.open) showDiagnostics();
    else { toolStage?.destroy(); toolStage = null; }
  }) as EventListener);
  listen(zoomDialog, 'click', ((event: MouseEvent) => {
    if (event.target !== zoomDialog) return;
    const rect = zoomDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) zoomDialog.close();
  }) as EventListener);
  listen(root, 'change', ((event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.sensor) {
      config[input.dataset.sensor as Sensor] = input.checked;
      if (trial?.ended) trial = null;
      status.textContent = '配置已更新。雨雾会影响传感器；毫米波测距也不等于识别物体类别。';
      updateUI(); scheduleRecord();
    }
  }) as EventListener);
  listen(playfield, 'keydown', ((event: KeyboardEvent) => {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-22, 0], ArrowRight: [22, 0], ArrowUp: [0, -22], ArrowDown: [0, 22] };
    if (offsets[event.key]) {
      event.preventDefault(); view = 'scan';
      if (!config.lidar && (!trial || trial.ended)) {
        config.lidar = true; root.querySelector<HTMLInputElement>('[data-sensor="lidar"]')!.checked = true; scheduleRecord();
      }
      const [dx, dy] = offsets[event.key];
      pointer.x = clamp(pointer.x + dx, PHOTO.x, PHOTO.x + PHOTO.w); pointer.y = clamp(pointer.y + dy, PHOTO.y, PHOTO.y + PHOTO.h);
      updateUI();
    }
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      const hit = clickTargetAt(targets, imageRect(), pointer.x, pointer.y);
      if (hit) selectTarget(hit.id);
    }
  }) as EventListener);

  const stage = createStage(playfield, {
    width: 1000, height: 660, label: '汽车超级眼睛：高清实景照片，可切换教学分屏和扫描目标，鸟瞰图与光波测距在下方独立实验工具。',
    pointer(kind, x, y) {
      if (kind === 'down' && x >= PHOTO.x && x <= PHOTO.x + PHOTO.w && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h) pointer = { x, y };
      if (kind === 'down') {
        pressed = true;
        draggingSplit = view === 'compare' && Math.abs(x - (PHOTO.x + PHOTO.w * split / 100)) < 28 && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h;
        if (!draggingSplit && x >= PHOTO.x && x <= PHOTO.x + PHOTO.w && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h) {
          const hit = clickTargetAt(targets, imageRect(), x, y);
          if (hit) selectTarget(hit.id);
        }
      }
      if (kind === 'move') {
        if (draggingSplit && pressed) exploreSplit((x - PHOTO.x) / PHOTO.w * 100);
        else if (x >= PHOTO.x && x <= PHOTO.x + PHOTO.w && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h) pointer = { x, y };
      }
      if (kind === 'up') { pressed = false; draggingSplit = false; }
    },
    update(dt) {
      if (trial && !trial.ended) {
        // Fixed simulation substeps keep scoring and stopping independent of rendering frame rate.
        let remaining = dt * 2.1;
        while (remaining > 0 && !trial.ended) { const step = Math.min(1 / 120, remaining); advanceTrial(trial, step); remaining -= step; }
        if (trial.ended) finishTrial();
      }
    },
    draw(ctx, time) { drawWorld(ctx, time); }
  });

  function drawPhoto(ctx: CanvasRenderingContext2D, time: number) {
    const { x, y, w, h } = PHOTO;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.clip();
    if (imageLoaded) {
      const rect = imageRect();
      ctx.fillStyle = '#111c32'; ctx.fillRect(x, y, w, h);
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    } else {
      ctx.fillStyle = '#111c32'; ctx.fillRect(x, y, w, h);
      label(ctx, imageFailed ? '照片未能载入，请重试或切换场景' : '正在载入道路照片…', x + 260, y + h / 2, 22, '#b4d0e0');
    }
    if (view === 'photo') { ctx.restore(); return; }
    ctx.fillStyle = `rgba(4,13,30,${(100 - config.light) / 100 * .62})`; ctx.fillRect(x, y, w, h);
    drawPerceptionWeather(ctx, PHOTO, config.fog, config.rain, time, api.reducedMotion());
    ctx.restore();
  }
  function imageRect() {
    const scale = imageLoaded ? Math.min(PHOTO.w / image.naturalWidth, PHOTO.h / image.naturalHeight) : 1;
    const w = imageLoaded ? image.naturalWidth * scale : PHOTO.w;
    const h = imageLoaded ? image.naturalHeight * scale : PHOTO.h;
    return { x: PHOTO.x + (PHOTO.w - w) / 2, y: PHOTO.y + (PHOTO.h - h) / 2, w, h };
  }
  function sourceRect(target: SceneTarget) {
    return { x: target.x * image.naturalWidth, y: target.y * image.naturalHeight, w: target.w * image.naturalWidth, h: target.h * image.naturalHeight };
  }
  function targetRect(target: SceneTarget) {
    const rect = imageRect();
    return { x: rect.x + target.x * rect.w, y: rect.y + target.y * rect.h, w: target.w * rect.w, h: target.h * rect.h };
  }
  function drawPointCloud(ctx: CanvasRenderingContext2D, time: number) {
    const model = perceptionModel(config);
    drawLaserCloud(ctx, {
      image: scanPhoto, rect: imageRect(), points: photoSamples, targets,
      marked: sceneFound, annotations: annotationsVisible, lidar: config.lidar, radar: config.radar,
      quality: config.lidar ? model.quality.lidar : model.quality.radar,
      time, reducedMotion: api.reducedMotion()
    });
  }
  function drawTargetAnnotations(ctx: CanvasRenderingContext2D) {
    drawSceneAnnotations(ctx, targets, imageRect(), selected, sceneFound);
  }
  function drawBEV(ctx: CanvasRenderingContext2D, time: number) {
    const { x, y, w, h } = BEV;
    roundRect(ctx, x, y, w, h, 12, '#111c32', '#3d5b7a');
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.clip();
    ctx.strokeStyle = '#233d60'; ctx.lineWidth = 1;
    for (let yy = y + 37; yy < y + h; yy += 24) { ctx.beginPath(); ctx.moveTo(x + 14, yy); ctx.lineTo(x + w - 14, yy); ctx.stroke(); }
    for (let xx = x + 14; xx < x + w; xx += 24) { ctx.beginPath(); ctx.moveTo(xx, y + 35); ctx.lineTo(xx, y + h); ctx.stroke(); }
    ctx.fillStyle = '#182b44'; ctx.fillRect(x + w * .32, y + 37, w * .37, h - 61);
    ctx.strokeStyle = '#486886'; ctx.setLineDash([7, 9]); ctx.beginPath(); ctx.moveTo(x + w * .50, y + 46); ctx.lineTo(x + w * .50, y + h - 22); ctx.stroke(); ctx.setLineDash([]);
    const carY = trial ? y + h - 47 - Math.min(195, trial.traveled * 4.06) : y + h - 47;
    const carX = x + w * .5;
    const model = perceptionModel(trial && !trial.ended ? trial.config : config);
    const frontY = carY - 21;
    ctx.fillStyle = '#61e7d214'; ctx.beginPath(); ctx.moveTo(carX, frontY); ctx.lineTo(carX - 70, frontY - Math.min(200, model.effectiveRange * 4.06)); ctx.lineTo(carX + 70, frontY - Math.min(200, model.effectiveRange * 4.06)); ctx.closePath(); ctx.fill();
    for (const target of trial ? [] : targets) {
      const tx = x + target.bevX * w, ty = y + 35 + target.bevY * (h - 75);
      const isSelected = selected === target.id;
      if (isSelected) {
        ctx.strokeStyle = target.color; ctx.globalAlpha = .48;
        ctx.beginPath(); ctx.arc(tx, ty, 16 + Math.sin(time * 2) * 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (target.category === 'vehicle') {
        ctx.save(); ctx.translate(tx, ty + 8); ctx.rotate(-Math.PI / 2);
        drawPremiumTopCar(ctx, 0, 0, target.color, .35, 'city'); ctx.restore();
      } else roundRect(ctx, tx - 5, ty - 5, 10, 10, 3, target.color);
      if (isSelected) label(ctx, target.name, tx + 13, ty + 6, 11, target.color);
    }
    if (trial) {
      // The trial is a separate teaching scene. The obstacle line and front bumper share
      // the same 4.06 px/m scale as the simulation's gap, so a safe stop is visibly safe.
      const obstacleY = y + h - 68 - 48 * 4.06;
      ctx.strokeStyle = '#ffbc87'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x + 60, obstacleY); ctx.lineTo(x + w - 25, obstacleY); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffbf88'; ctx.beginPath(); ctx.arc(carX + 18, obstacleY - 5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffbf88'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(carX + 18, obstacleY + 1); ctx.lineTo(carX + 18, obstacleY + 13); ctx.moveTo(carX + 18, obstacleY + 4); ctx.lineTo(carX + 9, obstacleY + 9); ctx.moveTo(carX + 18, obstacleY + 13); ctx.lineTo(carX + 13, obstacleY + 20); ctx.stroke();
      label(ctx, '教学行人', carX + 34, obstacleY + 8, 10, '#ffbf88');
    }
    const vehicle = api.getVehicle();
    ctx.save(); ctx.translate(carX, carY); ctx.rotate(-Math.PI / 2);
    drawPremiumTopCar(ctx, 0, 0, vehicle.color, .47, vehicle.body); ctx.restore();
    ctx.restore();
    label(ctx, trial ? 'BEV / 虚拟路测' : 'BEV / 教学鸟瞰图', x + 13, y + 22, 13, '#c0d9e7', 600);
    label(ctx, '位置与路径为教学设定', x + 13, y + h - 13, 10, '#83a8ba');
    if (trial) {
      const current = trial.ended ? trial.safe ? '安全停下' : '安全暂停' : trial.brakeAt !== null ? trial.delay > 0 ? '系统延迟阶段' : 'AEB 制动中' : trial.detectedAt !== null ? '已发现路线障碍' : '搜集障碍线索';
      roundRect(ctx, x + 12, y + 36, w - 24, 28, 5, trial.ended && !trial.safe ? '#542d3a' : '#153e43');
      label(ctx, current, x + 23, y + 54, 12, '#e2f9f1');
      label(ctx, `${Math.max(0, trial.speed * 3.6).toFixed(0)} km/h   余量 ${Math.max(0, trial.gap).toFixed(1)} m`, x + 15, y + h - 35, 11, '#d6e6ee');
    }
  }
  function drawWave(ctx: CanvasRenderingContext2D) {
    const { x, y, w, h } = WAVE;
    roundRect(ctx, x, y, w, h, 10, '#111c32', '#3d5b7a');
    const tofNs = distance * 2 / .299792458;
    label(ctx, 'ToF / 光波飞行时间', x + 14, y + 22, 13, '#c6deeb', 600);
    label(ctx, `${distance} m → 往返 ${tofNs.toFixed(1)} ns`, x + 14, y + 47, 12, '#65e3cb');
    label(ctx, 'd = c × Δt ÷ 2', x + w - 183, y + 24, 15, '#d7e9f1');
    label(ctx, '距离越远，回波越晚', x + w - 183, y + 47, 11, '#9fc0d1');
    const wx = x + 24, wy = y + 122, ww = w - 48;
    ctx.strokeStyle = '#486886'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.stroke();
    const emitted = wx + 15, received = emitted + tofNs / 420 * (ww - 40);
    ctx.strokeStyle = '#75b8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let xx = 0; xx <= ww; xx += 2) { const py = wy - 35 * Math.exp(-Math.pow((wx + xx - emitted) / 8, 2)); if (xx === 0) ctx.moveTo(wx + xx, py); else ctx.lineTo(wx + xx, py); } ctx.stroke();
    ctx.strokeStyle = '#61e7cd'; ctx.beginPath(); for (let xx = 0; xx <= ww; xx += 2) { const py = wy - 31 * Math.exp(-Math.pow((wx + xx - received) / 11, 2)); if (xx === 0) ctx.moveTo(wx + xx, py); else ctx.lineTo(wx + xx, py); } ctx.stroke();
    label(ctx, '发射', emitted - 7, y + 77, 10, '#75b8ff'); label(ctx, '回波', Math.min(received - 8, wx + ww - 24), y + 77, 10, '#61e7cd');
    for (let tick = 0; tick <= 400; tick += 100) label(ctx, `${tick}`, emitted + tick / 420 * (ww - 40) - 5, y + 139, 9, '#9eb4cd');
    label(ctx, 'ns', wx + ww - 12, y + 139, 9, '#9eb4cd');
    label(ctx, '光速 c ≈ 0.30 m/ns · 教学波形，并非照片实测', x + 14, y + h - 14, 10, '#85a8ba');
  }
  function drawDiagnostics(ctx: CanvasRenderingContext2D, time: number) {
    ctx.fillStyle = '#080e21'; ctx.fillRect(0, 0, 1000, 360);
    drawBEV(ctx, time); drawWave(ctx);
    roundRect(ctx, 338, 16, 644, 130, 10, '#111c32', '#3d5b7a');
    const resultHeading = trial?.ended
      ? trial.safe ? `本次 AEB：安全停下 · 余量 ${trial.gap.toFixed(1)} m` : '本次 AEB：发现过晚 · 教学系统已暂停'
      : '传感器状态 / 教学探测模型';
    label(ctx, resultHeading, 353, 39, 13, trial?.ended ? trial.safe ? '#b8edd9' : '#eac3ae' : '#c6deeb', 600);
    const modelConfig = trial && !trial.ended ? trial.config : config;
    const model = perceptionModel(modelConfig);
    (['camera', 'lidar', 'radar'] as Sensor[]).forEach((sensor, i) => {
      const sx = 353 + i * 209;
      label(ctx, SENSOR_LABELS[sensor], sx, 67, 12, modelConfig[sensor] ? '#d6eef6' : '#9eb4cd');
      label(ctx, modelConfig[sensor] ? `${Math.round(model.quality[sensor] * 100)}%` : '未启用', sx, 99, 23, modelConfig[sensor] ? '#7af0d3' : '#9eb4cd', 600);
      label(ctx, `教学范围 ${model.ranges[sensor].toFixed(1)} m`, sx, 125, 10, '#89aabd');
    });
  }
  function drawWorld(ctx: CanvasRenderingContext2D, time: number) {
    ctx.fillStyle = '#080e21'; ctx.fillRect(0, 0, 1000, 660);
    label(ctx, 'PERCEPTION / 杭州地标感知', 20, 25, 13, '#47eaff', 600);
    label(ctx, imageLoaded ? view === 'photo' ? '清晰原图 · 点击“放大实景”查看原始细节' : '实景照片 + 人工教学标注' : imageFailed ? '照片载入失败' : '照片载入中', 687, 25, 11, '#8fb3c6');
    drawPhoto(ctx, time);
    if (view !== 'photo') {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, 12); ctx.clip();
      if (view === 'compare') {
        ctx.beginPath(); ctx.rect(PHOTO.x + PHOTO.w * split / 100, PHOTO.y, PHOTO.w * (1 - split / 100), PHOTO.h); ctx.clip();
        drawPointCloud(ctx, time);
      } else if (view === 'scan') {
        ctx.beginPath(); ctx.arc(pointer.x, pointer.y, SCANNER_RADIUS, 0, Math.PI * 2); ctx.clip(); drawPointCloud(ctx, time);
      } else drawPointCloud(ctx, time);
      ctx.restore();
    }
    if (imageLoaded && annotationsVisible && config.camera) drawTargetAnnotations(ctx);
    if (view === 'scan') {
      ctx.save(); ctx.beginPath(); ctx.roundRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, 12); ctx.clip();
      drawScannerLens(ctx, pointer.x, pointer.y, time, api.reducedMotion()); ctx.restore();
    }
    if (view === 'compare') {
      const lineX = PHOTO.x + PHOTO.w * split / 100;
      ctx.strokeStyle = '#edf9ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lineX, PHOTO.y); ctx.lineTo(lineX, PHOTO.y + PHOTO.h); ctx.stroke();
      roundRect(ctx, lineX - 17, PHOTO.y + PHOTO.h * .5 - 22, 34, 44, 17, '#e6f6fb');
      label(ctx, '‹ ›', lineX - 12, PHOTO.y + PHOTO.h * .5 + 6, 15, '#174759', 600);
    }
    if (view !== 'photo') {
      if (view !== 'full') { roundRect(ctx, PHOTO.x + 12, PHOTO.y + 10, 89, 22, 4, '#080e21c9'); label(ctx, '实景 / 图像', PHOTO.x + 20, PHOTO.y + 26, 11, '#dceaf2'); }
      roundRect(ctx, PHOTO.x + PHOTO.w - 169, PHOTO.y + 10, 157, 22, 4, '#080e21e8'); label(ctx, '激光点云 / 教学仿真', PHOTO.x + PHOTO.w - 159, PHOTO.y + 26, 11, '#74e9d3');
    }
    label(ctx, `Photo: ${scene.author} / Wikimedia Commons · ${scene.license}`, 22, 655, 9, '#9eb4cd');
    label(ctx, view === 'photo' ? '原图模式 · 无天气遮罩' : '点云为二维边缘与目标示意 · 距离为教学设定', 706, 655, 9, '#9eb4cd');
  }

  loadSceneImage(); markComplete();
  // Initial physics results are not awarded; points require the child's actual interactions.
  return { destroy() {
    if (disposed) return;
    saveRecord(); disposed = true; abort.abort(); clearTimeout(recordTimer); clearTimeout(captureTimer);
    image.onload = null; image.onerror = null; zoomDialog.close(); toolStage?.destroy(); stage.destroy(); host.innerHTML = '';
  } };
}
