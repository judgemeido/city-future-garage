import { createStage, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import './perception.css';
import { PERCEPTION_SCENES, PERCEPTION_SCENE_CATALOG, SCORED_CATEGORIES, TARGET_CATEGORY_NAMES, type SceneTarget, type TargetId, type ScoredCategory } from './perception-scenes';
import { clickTargetAt, drawSceneAnnotations, annotationRect } from './perception-annotations';
import { drawPerceptionWeather } from './perception-weather';
import { drawClickEffects, drawLaserCloud, drawPerceptionHUD, drawScannerLens, SCANNER_RADIUS, type PerceptionEffect } from './perception-scan';

type Sensor = 'camera' | 'lidar' | 'radar';
const SENSOR_LABELS: Record<Sensor, string> = { camera: '摄像头', lidar: '激光雷达', radar: '毫米波雷达' };
const PHOTO = { x: 16, y: 40, w: 968, h: 602 };
const CHALLENGE_VERSION = 'photo-hunt-v1';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface PerceptionConfig {
  camera: boolean; lidar: boolean; radar: boolean;
  fog: number; rain: number; light: number; speed: number;
}
interface TrialState {
  elapsed: number; gap: number; speed: number; traveled: number;
  detectedAt: number | null; brakeAt: number | null; delay: number;
  ended: boolean; safe: boolean; config: PerceptionConfig;
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
  return {
    quality, ranges, effectiveRange, deceleration, latency, brakingDistance,
    requiredDistance: speed * latency + brakingDistance + 3
  };
}

function beginTrial(config: PerceptionConfig): TrialState {
  return {
    elapsed: 0, gap: 48, speed: config.speed / 3.6, traveled: 0,
    detectedAt: null, brakeAt: null, delay: 0, ended: false, safe: false, config: { ...config }
  };
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
export function runPerceptionTrial(config: PerceptionConfig) {
  const trial = beginTrial(config);
  for (let i = 0; i < 3600 && !trial.ended; i++) advanceTrial(trial, 1 / 120);
  return {
    safe: trial.safe, margin: trial.gap, traveled: trial.traveled, detectedAt: trial.detectedAt,
    brakingDistance: perceptionModel(config).brakingDistance
  };
}

export function mountPerception(host: HTMLElement, api: GameAPI): MountedGame {
  const old = api.getRecord('perception');
  const savedConfig = old.configuration as Partial<PerceptionConfig> | undefined;
  const config: PerceptionConfig = {
    camera: savedConfig?.camera ?? true, lidar: savedConfig?.lidar ?? false, radar: savedConfig?.radar ?? false,
    rain: clamp(Number(savedConfig?.rain ?? 0), 0, 100), fog: clamp(Number(savedConfig?.fog ?? 0), 0, 100),
    light: 100, speed: 40
  };
  let scene = PERCEPTION_SCENES.find(item => item.id === old.sceneId) ?? PERCEPTION_SCENES[0];
  let targets = scene.targets;
  const currentCatalog = old.sceneCatalog === PERCEPTION_SCENE_CATALOG;
  const allTargetIds = new Set(SCORED_CATEGORIES);
  const found = new Set<ScoredCategory>();
  const discoveredByScene: Record<string, TargetId[]> = {};
  for (const item of PERCEPTION_SCENES) {
    const saved = currentCatalog && old.challengeVersion === CHALLENGE_VERSION ? (old.discoveredByScene as Record<string, unknown> | undefined)?.[item.id] : undefined;
    discoveredByScene[item.id] = (Array.isArray(saved) ? saved : []).filter((id): id is TargetId => item.targets.some(target => target.id === id));
  }
  let sceneFound = new Set(discoveredByScene[scene.id]);
  const completedLevels = () => PERCEPTION_SCENES.filter(item => item.targets.every(target => discoveredByScene[item.id].includes(target.id)));
  const levelComplete = () => targets.every(target => sceneFound.has(target.id));
  function updateFoundCategories() {
    found.clear();
    for (const item of PERCEPTION_SCENES) for (const target of item.targets) {
      if (SCORED_CATEGORIES.includes(target.category as ScoredCategory) && discoveredByScene[item.id].includes(target.id)) found.add(target.category as ScoredCategory);
    }
  }
  updateFoundCategories();
  let split = clamp(Number(old.split ?? 50), 6, 94);
  let view: 'photo' | 'compare' | 'scan' | 'full' = 'photo';
  let selected: TargetId = (currentCatalog ? targets.find(target => target.id === old.selectedTarget)?.id : undefined) ?? targets[0].id;
  let pointer = { x: PHOTO.x + PHOTO.w * .54, y: PHOTO.y + PHOTO.h * .54 };
  let disposed = false, recordTimer = 0, captureTimer = 0;
  let scanCompleted = found.size === allTargetIds.size, splitEarned = Boolean(old.splitExplored);
  let imageLoaded = false, imageFailed = false;
  let photoSamples: { x: number; y: number; strength: number }[] = [];
  let scanPhoto: HTMLCanvasElement | null = null;
  let draggingSplit = false, pressed = false;
  let photoZoom = 1, clickStart: { x: number; y: number } | null = null, clickMoved = false;
  let pan: { x: number; y: number; left: number; top: number } | null = null, photoDragging = false;
  let zoomNatural = false;
  let annotationsVisible = old.annotationsVisible !== false;
  let stageTime = 0;
  let effects: PerceptionEffect[] = [];
  const emitEffect = (fx: Omit<PerceptionEffect, 'startedAt'>) => {
    effects.push({ ...fx, startedAt: stageTime });
    if (effects.length > 10) effects = effects.slice(-10);
  };
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
      status.textContent = `${scene.location}：${scene.hint}。按关卡清单在照片里找目标，点中实际位置才算找到。`;
      updateUI(); scheduleRecord();
      if ((!currentCatalog || old.challengeVersion !== CHALLENGE_VERSION) && old.sceneId) {
        clearTimeout(captureTimer);
        captureTimer = window.setTimeout(() => { if (!disposed && image === nextImage) { saveRecord(); api.saveImage('perception', stage.capture()); } }, 120);
      }
    };
    nextImage.onerror = () => {
      if (disposed || image !== nextImage) return;
      imageFailed = true; status.textContent = '场景照片未能载入，请重试或选择其他场景。'; updateUI();
    };
    nextImage.src = scene.image;
    updateUI();
  }
  const targetButtons = () => targets.map((t, index) => `<li><button class="btn perception-target" data-target="${t.id}" data-category="${t.category}" aria-pressed="${t.id === selected}" title="在照片中找到${t.name}"><span class="perception-goal-index">${index + 1}</span><span class="perception-goal-name">${t.name}<small>${TARGET_CATEGORY_NAMES[t.category]}</small></span><span class="perception-found-mark">待找</span></button></li>`).join('');

  host.innerHTML = `
    <section class="experience perception-experience">
      <div class="perception-toolbar">
        <span class="perception-intro">六张实景 · 六个找目标关卡</span>
        <div class="perception-toolbar-end"><button class="btn perception-annotations" aria-pressed="${annotationsVisible}">显示标记 · ${annotationsVisible ? '开' : '关'}</button><button class="btn perception-restore" title="重新寻找本关目标，已有积分保留">↺ 重玩本关</button><button class="btn perception-photo-zoom">⤢ 放大实景</button><button class="btn perception-capture">保存实验照片</button></div>
      </div>
      <div class="perception-scene-picker" role="group" aria-label="选择道路场景">
        ${PERCEPTION_SCENES.map((item, index) => `<button class="perception-scene" data-scene="${item.id}" aria-pressed="${item.id === scene.id}" title="${item.location} · ${item.hint}"><img src="${item.image}" alt="" loading="lazy"><span><small>第 ${index + 1} 关</small>${item.name}</span></button>`).join('')}
      </div>
      <div class="perception-workspace">
        <div class="perception-main">
          <div class="perception-photo-actions">
            <div class="perception-zoom-cluster" role="group" aria-label="照片缩放">
              <button class="btn perception-image-retry" hidden>重新载入照片</button>
              <button class="btn" data-photo-zoom="out" aria-label="缩小照片">−</button>
              <output class="perception-photo-scale">100%</output>
              <button class="btn" data-photo-zoom="in" aria-label="放大照片">＋</button>
              <button class="btn" data-photo-zoom="reset">全图</button>
            </div>
            <div class="perception-weather-controls" role="group" aria-label="实时雨雾天气调节">
              <label class="perception-weather-item" for="perception-rain">
                <span>🌧️ 降雨</span>
                <input id="perception-rain" type="range" min="0" max="100" value="${config.rain}" data-config="rain">
                <output data-value="rain">${config.rain}%</output>
              </label>
              <label class="perception-weather-item" for="perception-fog">
                <span>☁️ 浓雾</span>
                <input id="perception-fog" type="range" min="0" max="100" value="${config.fog}" data-config="fog">
                <output data-value="fog">${config.fog}%</output>
              </label>
              <button type="button" class="btn perception-clear-weather" title="一键恢复晴朗天气">☀️ 晴天</button>
            </div>
          </div>
          <div class="perception-sensor-bar" aria-label="超级眼睛传感器与观察模式">
            <div class="perception-mode-group" role="group" aria-label="观察方式"><button class="btn perception-mode is-active" data-view="photo" aria-pressed="true">清晰实景</button><button class="btn perception-mode" data-view="compare" aria-pressed="false">◐ 分屏对照</button><button class="btn perception-mode" data-view="scan" aria-pressed="false">⌖ 激光探照镜</button><button class="btn perception-mode" data-view="full" aria-pressed="false">▧ 全融合点云</button></div>
            <div class="perception-sensors" role="group" aria-label="传感器开关"><div class="perception-sensor-row">
              ${(['camera', 'lidar', 'radar'] as Sensor[]).map(s => `<label class="perception-sensor" data-sensor-kind="${s}"><input type="checkbox" data-sensor="${s}" ${config[s] ? 'checked' : ''}><i aria-hidden="true"></i><span>${SENSOR_LABELS[s]}</span></label>`).join('')}
            </div><button class="btn perception-fusion">⚡ 三模融合</button></div>
          </div>
          <div class="perception-photo-viewport"><div class="playfield perception-playfield" tabindex="0" aria-label="关卡实景照片，点中目标实际位置才能找到；放大后可拖动照片；方向键移动探照镜，回车确认当前位置"></div></div>
          <div class="perception-photo-caption"><span class="perception-data-chip"></span><span>点中才标记 · 放大后拖动照片查看各处</span></div>
        </div>
        <aside class="perception-goals" aria-label="本关目标清单"><div class="perception-level-heading"><span class="perception-level-number"></span><h2 class="perception-level-name"></h2><p>找齐清单上的目标，完成本关。</p></div><div class="perception-target-heading"><strong>本关要找</strong><span class="perception-target-count"></span></div><ol class="perception-objects" aria-label="待寻找的目标，点击清单只选择目标，不会完成标记">${targetButtons()}</ol><p class="perception-goal-hint">先看目标清单，再点照片中的实际位置。找到后这里会亮起 ✓。</p><div class="perception-level-result" aria-live="polite"></div><button class="btn btn-primary perception-next-level" disabled>找齐目标后进入下一关</button></aside>
      </div>
      <div class="perception-feedback" aria-live="polite"><div><span class="perception-feedback-icon">⌖</span><span class="perception-status">第一关：看目标清单，在照片里点中对应物体。小目标可以放大寻找。</span></div><span class="perception-progress"></span></div>
      <dialog class="perception-zoom-dialog" aria-labelledby="perception-zoom-title">
        <div class="perception-zoom-header"><div><h3 id="perception-zoom-title">清晰实景</h3></div><button class="btn perception-zoom-close" aria-label="关闭实景放大">✕</button></div>
        <div class="perception-zoom-toolbar"><span class="perception-zoom-meta"></span><div><button class="btn perception-zoom-fit is-active">适应窗口</button><button class="btn perception-zoom-native">100% 原图</button></div></div>
        <div class="perception-zoom-viewport"><img class="perception-zoom-image" alt="道路实景照片"></div>
        <p class="perception-zoom-credit"></p>
      </dialog>
    </section>`;

  const root = host.querySelector<HTMLElement>('.perception-experience')!;
  const playfield = root.querySelector<HTMLElement>('.perception-playfield')!;
  const photoViewport = root.querySelector<HTMLElement>('.perception-photo-viewport')!;
  const status = root.querySelector<HTMLElement>('.perception-status')!;
  const progress = root.querySelector<HTMLElement>('.perception-progress')!;
  const zoomDialog = root.querySelector<HTMLDialogElement>('.perception-zoom-dialog')!;
  const zoomImage = root.querySelector<HTMLImageElement>('.perception-zoom-image')!;
  const abort = new AbortController();
  const listen = (el: EventTarget, event: string, fn: EventListener) => el.addEventListener(event, fn, { signal: abort.signal });
  const selectedTarget = () => targets.find(t => t.id === selected)!;

  function saveRecord() {
    const sensors = (['camera', 'lidar', 'radar'] as Sensor[]).filter(s => config[s]).map(s => SENSOR_LABELS[s]).join('＋') || '未启用';
    const summary = `我在实景照片里使用${sensors}寻找目标，已完成 ${completedLevels().length}/${PERCEPTION_SCENES.length} 关；本关找到 ${sceneFound.size}/${targets.length} 个目标。`;
    api.record('perception', {
      summary,
      report: [
        { label: '我的传感器组合', value: sensors },
        { label: '观察场景', value: `${scene.name} · ${scene.location}` },
        { label: '本关寻找目标', value: `${sceneFound.size}/${targets.length} 个 · ${levelComplete() ? '已通关' : '寻找中'}` },
        { label: '关卡进度', value: `${completedLevels().length}/${PERCEPTION_SCENES.length} 关 · ${completedLevels().map(item => item.name).join('、') || '正在挑战第一关'}` },
        { label: '天气仿真设置', value: `降雨 ${config.rain}% / 浓雾 ${config.fog}%` },
      ],
      configuration: { ...config }, discovered: [...found], sceneId: scene.id, sceneCatalog: PERCEPTION_SCENE_CATALOG, challengeVersion: CHALLENGE_VERSION, annotationsVisible,
      completedLevels: completedLevels().map(item => item.id),
      discoveredByScene: { ...discoveredByScene, [scene.id]: [...sceneFound] }, split,
      splitExplored: splitEarned, scanCompleted,
      selectedTarget: selected, lastUpdated: new Date().toISOString()
    });
  }
  function scheduleRecord() {
    clearTimeout(recordTimer); recordTimer = window.setTimeout(saveRecord, 180);
  }
  function markComplete() {
    if (completedLevels().length === PERCEPTION_SCENES.length) api.complete('perception');
  }
  function discover(id: TargetId) {
    if (sceneFound.has(id) || !imageLoaded) return;
    sceneFound.add(id); discoveredByScene[scene.id] = [...sceneFound];
    const target = targets.find(t => t.id === id)!;
    if (SCORED_CATEGORIES.includes(target.category as ScoredCategory)) {
      found.add(target.category as ScoredCategory);
      api.award('perception', `target-${target.category}`, 5, `找到${TARGET_CATEGORY_NAMES[target.category]}`);
    }
    if (found.size === allTargetIds.size && !scanCompleted) scanCompleted = true;
    status.textContent = `找到了：${target.name}！还剩 ${targets.length - sceneFound.size} 个目标。`;
    if (levelComplete()) {
      api.award('perception', `level-${scene.id}`, 10, `${scene.name}关卡完成`);
      status.textContent = `本关 ${targets.length} 个目标全部找到！${completedLevels().length === PERCEPTION_SCENES.length ? '六关全部完成，超级眼睛挑战通关！' : '可以进入下一关，继续寻找。'}`;
      api.notify(`${scene.name}：本关目标全部找到！`); markComplete();
      clearTimeout(captureTimer);
      const completedScene = scene;
      captureTimer = window.setTimeout(() => { if (!disposed && scene === completedScene) { saveRecord(); api.saveImage('perception', stage.capture()); } }, 120);
    }
    updateUI(); scheduleRecord();
  }
  function exploreSplit(value: number) {
    split = clamp(value, 6, 94);
    if (!splitEarned && Math.abs(split - 50) > 7) {
      splitEarned = true; api.award('perception', 'split', 20, '观察实景与感知分屏');
      status.textContent = '同一个目标，图像和测距提供不同线索。试试切换激光探照镜或全融合点云。';
    }
    updateUI(); scheduleRecord();
  }
  function updateZoomScale() {
    zoomImage.classList.toggle('is-native', zoomNatural);
    root.querySelector('.perception-zoom-fit')!.classList.toggle('is-active', !zoomNatural);
    root.querySelector('.perception-zoom-native')!.classList.toggle('is-active', zoomNatural);
    root.querySelector('.perception-zoom-viewport')!.scrollTo(0, 0);
  }
  function openZoom(id: TargetId | null, preserveScale = false) {
    if (!imageLoaded) { api.notify('实景照片正在载入，请稍后再打开。'); return; }
    if (id && !sceneFound.has(id)) return;
    const viewport = root.querySelector<HTMLElement>('.perception-zoom-viewport')!;
    const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
    if (!preserveScale) zoomNatural = false;
    const target = id ? targets.find(t => t.id === id)! : null;
    const heading = root.querySelector<HTMLElement>('#perception-zoom-title')!;
    const meta = root.querySelector<HTMLElement>('.perception-zoom-meta')!;
    if (target) {
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
      meta.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · 可以在放大照片上点击寻找目标`;
      zoomImage.classList.remove('is-crop');
    }
    updateZoomScale();
    if (preserveScale) viewport.scrollTo(scroll.left, scroll.top);
    if (!zoomDialog.open) zoomDialog.showModal();
  }
  function updateUI() {
    if (disposed) return;
    root.dataset.scene = scene.id; root.dataset.scanMode = view; root.dataset.imageState = imageLoaded ? 'ready' : imageFailed ? 'error' : 'loading';
    root.dataset.annotations = String(annotationsVisible); root.dataset.targetCount = String(targets.length); root.dataset.markedCount = String(sceneFound.size);
    root.dataset.levelComplete = String(levelComplete()); root.dataset.completedLevels = String(completedLevels().length); root.dataset.photoZoom = String(photoZoom);
    const annotationButton = root.querySelector<HTMLButtonElement>('.perception-annotations')!;
    annotationButton.textContent = `显示标记 · ${annotationsVisible ? '开' : '关'}`;
    annotationButton.setAttribute('aria-pressed', String(annotationsVisible));
    root.querySelector<HTMLButtonElement>('.perception-restore')!.disabled = !imageLoaded || sceneFound.size === 0;
    root.querySelector('.perception-target-count')!.textContent = `${sceneFound.size} / ${targets.length}`;
    root.querySelector('.perception-level-number')!.textContent = `第 ${PERCEPTION_SCENES.indexOf(scene) + 1} / ${PERCEPTION_SCENES.length} 关`;
    root.querySelector('.perception-level-name')!.textContent = scene.name;
    root.querySelector('.perception-level-result')!.textContent = levelComplete() ? '✓ 本关全部找到！' : `还要找到 ${targets.length - sceneFound.size} 个目标`;
    const nextButton = root.querySelector<HTMLButtonElement>('.perception-next-level')!;
    nextButton.disabled = !levelComplete() || scene === PERCEPTION_SCENES.at(-1);
    nextButton.textContent = scene === PERCEPTION_SCENES.at(-1) ? completedLevels().length === PERCEPTION_SCENES.length ? '六关全部完成 ✓' : '最后一关 · 找齐目标' : levelComplete() ? '下一关 →' : '找齐目标后进入下一关';
    root.querySelector('.perception-photo-scale')!.textContent = `${Math.round(photoZoom * 100)}%`;
    root.querySelector<HTMLButtonElement>('[data-photo-zoom="out"]')!.disabled = photoZoom <= 1;
    root.querySelector<HTMLButtonElement>('[data-photo-zoom="in"]')!.disabled = photoZoom >= 3;
    playfield.setAttribute('aria-busy', String(!imageLoaded && !imageFailed));
    progress.textContent = `本关 ${sceneFound.size}/${targets.length} · 通关 ${completedLevels().length}/${PERCEPTION_SCENES.length}`;
    root.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.scene === scene.id));
      button.classList.toggle('is-complete', completedLevels().some(item => item.id === button.dataset.scene));
    });
    root.querySelectorAll<HTMLButtonElement>('.perception-photo-zoom, .perception-capture, [data-target]').forEach(button => button.disabled = !imageLoaded);
    root.querySelector<HTMLButtonElement>('.perception-image-retry')!.hidden = !imageFailed;
    root.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(btn => {
      const id = btn.dataset.target as TargetId;
      btn.classList.toggle('is-found', sceneFound.has(id)); btn.classList.toggle('is-selected', selected === id);
      btn.setAttribute('aria-pressed', String(selected === id));
      btn.querySelector('.perception-found-mark')!.textContent = sceneFound.has(id) ? '✓ 找到' : '待找';
    });
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === view); btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
    });
    for (const key of ['fog', 'rain'] as const) {
      root.querySelector<HTMLOutputElement>(`[data-value="${key}"]`)!.value = `${config[key]}%`;
    }
    const clearBtn = root.querySelector<HTMLButtonElement>('.perception-clear-weather')!;
    clearBtn.disabled = config.fog === 0 && config.rain === 0;
    root.querySelector('.perception-data-chip')!.textContent = imageFailed ? '照片载入失败' : `${scene.location} · ${scene.author}`;
    root.querySelector('.perception-zoom-credit')!.textContent = `照片：${scene.author} / Wikimedia Commons · ${scene.license}`;
  }

  function selectTarget(id: TargetId) {
    if (!imageLoaded || !targets.some(target => target.id === id)) return;
    selected = id; const target = selectedTarget();
    status.textContent = sceneFound.has(id) ? `${target.name}已经找到，可点击放大查看局部。` : `寻找「${target.name}」：请在照片中点中它的实际位置。`;
    updateUI(); scheduleRecord();
  }
  function confirmTarget(x: number, y: number) {
    if (!imageLoaded) return;
    const rect = imageRect();
    const hit = clickTargetAt(targets, rect, x, y);
    if (!hit) {
      emitEffect({ kind: 'miss', x, y, color: '#47eaff', duration: 0.45 });
      status.textContent = '这里没有清单里的目标。再观察一下，小目标可以放大寻找。';
      return;
    }
    const box = annotationRect(hit, rect);
    const newlyFound = !sceneFound.has(hit.id);
    emitEffect({ kind: 'hit', x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w, h: box.h, color: hit.color, duration: 0.85 });
    selected = hit.id; pointer = { x, y }; annotationsVisible = true;
    if (!newlyFound) { status.textContent = `「${hit.name}」已经找到，继续寻找清单中剩下的目标。`; updateUI(); return; }
    api.playCue?.('reward');
    discover(hit.id);
    if (zoomDialog.open && !zoomImage.classList.contains('is-crop')) openZoom(null, true);
  }
  function setPhotoZoom(value: number) {
    const next = clamp(value, 1, 3), ratio = next / photoZoom;
    const left = (photoViewport.scrollLeft + photoViewport.clientWidth / 2) * ratio - photoViewport.clientWidth / 2;
    const top = (photoViewport.scrollTop + photoViewport.clientHeight / 2) * ratio - photoViewport.clientHeight / 2;
    photoZoom = next; photoViewport.style.setProperty('--photo-zoom', String(photoZoom));
    photoViewport.scrollTo(next === 1 ? 0 : left, next === 1 ? 0 : top); updateUI();
  }

  listen(root, 'click', ((event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.classList.contains('perception-next-level')) {
      const next = PERCEPTION_SCENES[PERCEPTION_SCENES.indexOf(scene) + 1];
      if (levelComplete() && next) root.querySelector<HTMLButtonElement>(`[data-scene="${next.id}"]`)!.click();
      return;
    }
    if (button.dataset.photoZoom) { setPhotoZoom(button.dataset.photoZoom === 'reset' ? 1 : photoZoom + (button.dataset.photoZoom === 'in' ? .5 : -.5)); return; }
    if (button.dataset.scene && button.dataset.scene !== scene.id) {
      const next = PERCEPTION_SCENES.find(item => item.id === button.dataset.scene);
      if (!next) return;
      discoveredByScene[scene.id] = [...sceneFound];
      scene = next; targets = scene.targets; sceneFound = new Set(discoveredByScene[scene.id]);
      selected = targets[0].id; view = 'photo';
      setPhotoZoom(1);
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
      status.textContent = '本关已重开，请重新在照片中找到清单里的目标。';
      updateUI(); saveRecord();
    }
    if (button.classList.contains('perception-annotations')) {
      annotationsVisible = !annotationsVisible;
      if (zoomDialog.open && !zoomImage.classList.contains('is-crop')) openZoom(null);
      updateUI(); scheduleRecord();
    }
    if (button.dataset.view) {
      view = button.dataset.view as typeof view;
      if (view !== 'photo' && !config.lidar && !config.radar) {
        config.lidar = true; root.querySelector<HTMLInputElement>('[data-sensor="lidar"]')!.checked = true;
        scheduleRecord();
      }
      if (view !== 'photo') {
        emitEffect({ kind: 'switch', x: PHOTO.x, y: PHOTO.y, color: config.lidar ? '#34d399' : config.radar ? '#fbbf24' : '#47eaff', duration: 0.6 });
      }
      updateUI();
      status.textContent = view === 'photo' ? '清晰实景模式：点中照片里的实际目标才算找到，拖动右上角雨/雾滑块可实时感受天气影响。' : view === 'scan' ? '移动探照镜观察点云与雷达波，点中照片实际位置才算找到。' : view === 'full' ? '全融合点云：整幅实景显示激光轮廓与雷达波束，试试调高雨雾观察摄像头与毫米波雷达的抗干扰差异！' : '拖动发光分屏线，对照原始实景与超级眼睛感知层。';
    }
    if (button.classList.contains('perception-fusion')) {
      config.camera = true; config.lidar = true; config.radar = true;
      root.querySelectorAll<HTMLInputElement>('[data-sensor]').forEach(input => input.checked = true);
      if (view === 'photo') view = 'full';
      emitEffect({ kind: 'switch', x: PHOTO.x, y: PHOTO.y, color: '#75f1bb', duration: 0.72 });
      api.playCue?.('boost');
      status.textContent = '三模融合已开启：青蓝摄像头 HUD、翡翠绿 3D 激光点云、琥珀金毫米波雷达波束同步工作！';
      updateUI(); scheduleRecord();
    }
    if (button.dataset.target) { selectTarget(button.dataset.target as TargetId); if (sceneFound.has(button.dataset.target)) openZoom(button.dataset.target); }
    if (button.classList.contains('perception-capture')) {
      api.saveImage('perception', stage.capture()); saveRecord(); api.notify('实验照片已加入你的电子报告。');
    }
    if (button.classList.contains('perception-clear-weather')) {
      config.fog = 0; config.rain = 0;
      for (const key of ['fog', 'rain'] as const) root.querySelector<HTMLInputElement>(`[data-config="${key}"]`)!.value = '0';
      status.textContent = '已恢复晴朗天气！随时拖动雨/雾滑块对比传感器穿透表现。';
      updateUI(); scheduleRecord();
    }
    if (button.classList.contains('perception-photo-zoom')) openZoom(null);
    if (button.classList.contains('perception-zoom-close')) zoomDialog.close();
    if (button.classList.contains('perception-zoom-fit')) { zoomNatural = false; updateZoomScale(); }
    if (button.classList.contains('perception-zoom-native')) { zoomNatural = true; updateZoomScale(); }
  }) as EventListener);

  listen(root, 'input', ((event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.config === 'fog' || input.dataset.config === 'rain') {
      config[input.dataset.config] = Number(input.value);
      const weatherNote = config.rain > 55 && config.fog > 45
        ? '暴雨浓雾交加：纯视觉清晰度骤降，打开「毫米波雷达」可穿透雨雾继续探测！'
        : config.rain > 40
          ? `降雨 ${config.rain}%：挡风玻璃形成水滴与雨帘，试试开启三模融合观察雷达穿透效果！`
          : config.fog > 40
            ? `浓雾 ${config.fog}%：远景被雾气散射遮蔽，摄像头视野大幅缩短！`
            : '拖动雨、雾滑块，对比不同天气下肉眼与智驾传感器的视野变化。';
      status.textContent = weatherNote;
      updateUI(); scheduleRecord();
    }
  }) as EventListener);

  listen(zoomDialog, 'click', ((event: MouseEvent) => {
    if (event.target !== zoomDialog) return;
    const rect = zoomDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) zoomDialog.close();
  }) as EventListener);

  listen(root, 'change', ((event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.sensor) {
      const sensor = input.dataset.sensor as Sensor;
      config[sensor] = input.checked;
      if (input.checked && (sensor === 'lidar' || sensor === 'radar') && view === 'photo') view = 'full';
      const fxColor = sensor === 'lidar' ? '#34d399' : sensor === 'radar' ? '#fbbf24' : '#47eaff';
      emitEffect({ kind: 'switch', x: PHOTO.x, y: PHOTO.y, color: fxColor, duration: 0.62 });
      status.textContent = input.checked
        ? `已开启${SENSOR_LABELS[sensor]}：${sensor === 'lidar' ? '翡翠绿 3D 激光点云与测距脉冲已激活。' : sensor === 'radar' ? '琥珀金毫米波扇形雷达波束已激活，穿透雨雾能力强。' : '青蓝摄像头视觉识别与目标标记已激活。'}`
        : `已关闭${SENSOR_LABELS[sensor]}。可以组合不同传感器，观察画面与雨雾探测差异。`;
      updateUI(); scheduleRecord();
    }
  }) as EventListener);

  listen(playfield, 'keydown', ((event: KeyboardEvent) => {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-22, 0], ArrowRight: [22, 0], ArrowUp: [0, -22], ArrowDown: [0, 22] };
    if (offsets[event.key]) {
      event.preventDefault(); view = 'scan';
      if (!config.lidar) { config.lidar = true; root.querySelector<HTMLInputElement>('[data-sensor="lidar"]')!.checked = true; scheduleRecord(); }
      const [dx, dy] = offsets[event.key];
      pointer.x = clamp(pointer.x + dx, PHOTO.x, PHOTO.x + PHOTO.w); pointer.y = clamp(pointer.y + dy, PHOTO.y, PHOTO.y + PHOTO.h);
      updateUI();
    }
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      confirmTarget(pointer.x, pointer.y);
    }
  }) as EventListener);

  listen(photoViewport, 'pointerdown', ((event: PointerEvent) => {
    photoDragging = false;
    pan = photoZoom > 1 && view === 'photo' && event.button === 0 ? { x: event.clientX, y: event.clientY, left: photoViewport.scrollLeft, top: photoViewport.scrollTop } : null;
  }) as EventListener);
  listen(photoViewport, 'pointermove', ((event: PointerEvent) => {
    if (!pan) return;
    const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
    if (Math.hypot(dx, dy) > 8) photoDragging = true;
    if (photoDragging) photoViewport.scrollTo(pan.left - dx, pan.top - dy);
  }) as EventListener);
  const stopPan = () => { pan = null; };
  listen(photoViewport, 'pointerup', stopPan);
  listen(photoViewport, 'pointercancel', stopPan);
  listen(window, 'blur', stopPan);
  let zoomClickStart: { x: number; y: number } | null = null, zoomClickMoved = false;
  listen(zoomImage, 'pointerdown', ((event: PointerEvent) => { zoomClickStart = { x: event.clientX, y: event.clientY }; zoomClickMoved = false; }) as EventListener);
  listen(zoomImage, 'pointermove', ((event: PointerEvent) => { if (zoomClickStart && Math.hypot(event.clientX - zoomClickStart.x, event.clientY - zoomClickStart.y) > 8) zoomClickMoved = true; }) as EventListener);
  listen(zoomImage, 'dragstart', ((event: Event) => event.preventDefault()) as EventListener);
  listen(zoomImage, 'click', ((event: MouseEvent) => {
    if (zoomClickMoved || zoomImage.classList.contains('is-crop')) return;
    const rect = zoomImage.getBoundingClientRect(), photo = imageRect();
    confirmTarget(photo.x + (event.clientX - rect.left) / rect.width * photo.w, photo.y + (event.clientY - rect.top) / rect.height * photo.h);
  }) as EventListener);

  const stage = createStage(playfield, {
    width: 1000, height: 660, label: '汽车超级眼睛：高清实景照片，支持实时雨雾仿真、多传感器点云与雷达波束观察。',
    pointer(kind, x, y) {
      if (kind === 'down' && x >= PHOTO.x && x <= PHOTO.x + PHOTO.w && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h) pointer = { x, y };
      if (kind === 'down') {
        pressed = true;
        clickStart = { x, y }; clickMoved = false; photoDragging = false;
        draggingSplit = view === 'compare' && Math.abs(x - (PHOTO.x + PHOTO.w * split / 100)) < 28 && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h;
      }
      if (kind === 'move') {
        if (pressed && clickStart && Math.hypot(x - clickStart.x, y - clickStart.y) * playfield.getBoundingClientRect().width / 1000 > 8) clickMoved = true;
        if (draggingSplit && pressed) exploreSplit((x - PHOTO.x) / PHOTO.w * 100);
        else if (x >= PHOTO.x && x <= PHOTO.x + PHOTO.w && y >= PHOTO.y && y <= PHOTO.y + PHOTO.h) pointer = { x, y };
      }
      if (kind === 'up') {
        if (pressed && clickStart && !clickMoved && !photoDragging && !draggingSplit && Math.hypot(x - clickStart.x, y - clickStart.y) * playfield.getBoundingClientRect().width / 1000 <= 8) confirmTarget(x, y);
        pressed = false; draggingSplit = false; clickStart = null;
      }
    },
    draw(ctx, time) { drawWorld(ctx, time); }
  });

  function drawPhoto(ctx: CanvasRenderingContext2D, time: number) {
    const { x, y, w, h } = PHOTO;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.clip();
    ctx.fillStyle = '#0d1729'; ctx.fillRect(x, y, w, h);
    if (imageLoaded) {
      const rect = imageRect();
      const fogF = config.fog / 100;
      const rainF = config.rain / 100;
      ctx.save();
      ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
      // Authentic optical atmospheric attenuation: real fog & storm rain soften edges,
      // desaturate color, and lower contrast/brightness slightly.
      if (fogF > 0 || rainF > 0) {
        const blurPx = (fogF * 2.6 + rainF * 0.85).toFixed(2);
        const sat = Math.round(100 - fogF * 48 - rainF * 30);
        const con = Math.round(100 - fogF * 28 - rainF * 8);
        const bri = Math.round(100 + fogF * 6 - rainF * 16);
        ctx.filter = `blur(${blurPx}px) saturate(${sat}%) contrast(${con}%) brightness(${bri}%)`;
      }
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      ctx.filter = 'none';
      if (config.fog > 0 || config.rain > 0) {
        drawPerceptionWeather(ctx, rect, config.fog, config.rain, time, api.reducedMotion());
      }
      ctx.restore();
    } else {
      label(ctx, imageFailed ? '照片未能载入，请重试或切换场景' : '正在载入道路照片…', x + 260, y + h / 2, 22, '#b4d0e0');
    }
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
  function drawPointCloud(ctx: CanvasRenderingContext2D, time: number) {
    const model = perceptionModel(config);
    drawLaserCloud(ctx, {
      image: scanPhoto, rect: imageRect(), points: photoSamples, targets,
      marked: sceneFound, annotations: annotationsVisible,
      camera: config.camera, lidar: config.lidar, radar: config.radar,
      quality: config.lidar ? model.quality.lidar : config.radar ? model.quality.radar : model.quality.camera,
      cameraQuality: model.quality.camera, lidarQuality: model.quality.lidar, radarQuality: model.quality.radar,
      time, reducedMotion: api.reducedMotion()
    });
  }
  function drawTargetAnnotations(ctx: CanvasRenderingContext2D) {
    drawSceneAnnotations(ctx, targets, imageRect(), selected, sceneFound);
  }
  function drawWorld(ctx: CanvasRenderingContext2D, time: number) {
    stageTime = time;
    if (effects.length) effects = effects.filter(fx => time - fx.startedAt <= fx.duration);
    ctx.fillStyle = '#080e21'; ctx.fillRect(0, 0, 1000, 660);
    label(ctx, 'PERCEPTION / 杭州地标感知', 20, 25, 13, '#47eaff', 600);
    const weatherTag = config.rain > 0 || config.fog > 0 ? `🌧️ 雨 ${config.rain}% · ☁️ 雾 ${config.fog}%` : '☀️ 晴朗实景';
    label(ctx, imageLoaded ? `${weatherTag} · ${view === 'photo' ? '实景模式' : '超级眼睛感知层已开启'}` : imageFailed ? '照片载入失败' : '照片载入中', 630, 25, 11, '#8fb3c6');
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
      drawScannerLens(ctx, pointer.x, pointer.y, time, api.reducedMotion(), { camera: config.camera, lidar: config.lidar, radar: config.radar }); ctx.restore();
    }
    if (view === 'compare') {
      const lineX = PHOTO.x + PHOTO.w * split / 100;
      ctx.save();
      ctx.strokeStyle = '#75f1bb'; ctx.lineWidth = 2.4; ctx.shadowColor = '#47eaff'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(lineX, PHOTO.y); ctx.lineTo(lineX, PHOTO.y + PHOTO.h); ctx.stroke();
      ctx.shadowBlur = 0;
      roundRect(ctx, lineX - 18, PHOTO.y + PHOTO.h * .5 - 24, 36, 48, 18, '#0b2235', '#75f1bb');
      label(ctx, '‹ ›', lineX - 11, PHOTO.y + PHOTO.h * .5 + 6, 16, '#a7f3d0', 700);
      ctx.restore();
    }
    if (view !== 'photo') {
      const model = perceptionModel(config);
      drawPerceptionHUD(ctx, PHOTO, {
        sensors: { camera: config.camera, lidar: config.lidar, radar: config.radar },
        quality: model.quality, time, reducedMotion: api.reducedMotion(), view
      });
      if (view !== 'full') { roundRect(ctx, PHOTO.x + 18, PHOTO.y + 16, 89, 22, 4, '#080e21d9', '#30455f'); label(ctx, '实景 / 图像', PHOTO.x + 26, PHOTO.y + 31, 11, '#dceaf2'); }
      const modeTag = config.camera && config.lidar && config.radar ? '三模融合感知层' : config.lidar && config.radar ? '激光 + 毫米波感知' : config.lidar ? '激光点云' : config.radar ? '毫米波雷达' : '视觉轮廓';
      roundRect(ctx, PHOTO.x + PHOTO.w - 178, PHOTO.y + 16, 160, 22, 4, '#080e21eb', '#34d39980'); label(ctx, modeTag, PHOTO.x + PHOTO.w - 166, PHOTO.y + 31, 11, '#74e9d3');
    }
    drawClickEffects(ctx, PHOTO, effects, time, api.reducedMotion());
    label(ctx, `Photo: ${scene.author} / Wikimedia Commons · ${scene.license}`, 22, 655, 9, '#9eb4cd');
  }

  loadSceneImage(); markComplete();
  return {
    destroy() {
      if (disposed) return;
      saveRecord(); disposed = true; abort.abort(); clearTimeout(recordTimer); clearTimeout(captureTimer);
      image.onload = null; image.onerror = null; zoomDialog.close(); stage.destroy(); host.innerHTML = '';
    }
  };
}
