import { nightBackdrop } from '../theme';
import type { GameAPI, MountedGame } from '../types';
import {
  COLORS,
  SETUPS,
  PART_NAMES,
  PART_HINTS,
  partOptions,
  batteryOf,
  inverterOf,
  motorOf,
  reducerOf,
  wheelsOf,
  bodyOf,
  normalizeVehicle,
  fingerprint,
  configurationCost,
  configurationStats,
  round,
  type Part,
  type FactoryVehicle as Vehicle,
} from './factory-model';
import {
  SENSOR_PACKS,
  CHIP_TIERS,
  sensorOf,
  chipOf,
  adRating,
  drawCyberWorkshop,
  drawCarRoofSensors,
  type SensorPackId,
  type ChipTierId,
  type CyberViewMode,
  type ExtendedPart,
} from './factory-cyber';
import { parameterDiagram, parameterGroups } from './factory-parameters';
import { createStage, roundRect, label, downloadFile, escapeHTML } from '../platform';
import { drawPremiumCar, premiumCarSVG } from '../car-art';
import './factory.css';

const CYBER_SETUP_AD: Record<string, { sensor: SensorPackId; chip: ChipTierId; label: string }> = {
  city: { sensor: 'vision', chip: 'pro', label: '轻巧智行 L2+' },
  hill: { sensor: 'fusion', chip: 'pro', label: '重载领航 L3' },
  range: { sensor: 'omni', chip: 'ultra', label: '旗舰无人 L4' },
};

const EXT_PART_NAMES: Record<ExtendedPart, string> = {
  sensor: '智驾感知',
  chip: '算力芯片',
  ...PART_NAMES,
};

function drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, vehicle: Vehicle, scale = 1, rotation = 0) {
  drawPremiumCar(ctx, x, y, vehicle.color, scale, rotation, vehicle.body);
}

export function mountFactory(host: HTMLElement, api: GameAPI): MountedGame {
  const stored = api.getRecord('factory');
  let vehicle = normalizeVehicle((stored.configuration as Partial<Vehicle> | undefined) ?? api.getVehicle());
  let sensorPack: SensorPackId = sensorOf(stored.sensorPack as string | undefined).value;
  let chipTier: ChipTierId = chipOf(stored.chipTier as string | undefined).value;
  let viewMode: CyberViewMode = 'hologram';
  let assemblePulse = 0;

  let saved = stored.saved === true;
  let chosenPart: ExtendedPart = 'sensor';
  let destroyed = false;
  let stage: ReturnType<typeof createStage>;
  const reduceMotion = () => api.reducedMotion();
  let message = saved
    ? '欢迎回到未来智驾车厂！随时调整智驾套件与三电部件，切换「X 光透视」或「风洞气流」实时检视。'
    : '自由装配智驾感知、超算芯片与三电动力链，切换全息/X光/风洞视图检视，保存座驾即可同步到所有体验世界！';
  let diagramKey = '';

  host.innerHTML = `<div class="experience factory-experience">
    <section class="playfield factory-playfield">
      <div class="factory-view-bar" aria-label="全息车厂视图与保存">
        <div class="factory-view-modes" role="group" aria-label="切换科技展台视图">
          <button type="button" class="btn is-active" data-view-mode="hologram" aria-pressed="true">✨ 全息展台</button>
          <button type="button" class="btn" data-view-mode="xray" aria-pressed="false">🩻 X 光透视</button>
          <button type="button" class="btn" data-view-mode="aero" aria-pressed="false">💨 风洞气流</button>
        </div>
        <div class="factory-view-actions">
          <button type="button" class="btn btn-primary factory-save">保存我的智驾车 <span>＋40</span></button>
          <button type="button" class="btn factory-poster" aria-label="下载未来智驾车海报">海报 ↓</button>
        </div>
      </div>

      <div class="factory-stage"></div>

      <div class="factory-telemetry-strip" aria-label="整车实时遥测数据">
        <div class="factory-config-summary" aria-label="当前配置摘要"></div>
        <div class="factory-telemetry-meta">
          <div class="factory-stamp"><span class="factory-stamp-symbol">✦</span><span class="factory-stamp-text"></span></div>
          <p class="factory-matching" role="status" aria-live="polite"></p>
        </div>
      </div>

      <div class="factory-message" role="status" aria-live="polite"><span class="factory-message-dot"></span><span class="factory-message-text"></span></div>
      <p class="science-note factory-note">未来智能汽车 = <strong>智驾大脑与传感器（眼睛与神经）</strong> ＋ <strong>三电动力链（心脏与肌肉）</strong>。激光雷达与超算芯片决定智驾等级（L2–L4），电池、电机与传动比共同决定动力与续航。</p>
    </section>

    <aside class="control-panel factory-controls">
      <div class="factory-panel-heading"><span class="factory-step">01</span><div><span class="factory-eyebrow">CYBER AUTOPILOT GARAGE</span><h3>未来智驾装配台</h3></div></div>
      <label class="factory-name-label" for="factory-name">座驾代号<input id="factory-name" class="factory-name" maxlength="16" value="${escapeHTML(vehicle.name)}" autocomplete="off"></label>
      <div class="factory-colors" aria-label="车身纳米涂装">${COLORS.map(c => `<button type="button" class="factory-color" data-color="${c}" style="--swatch:${c}" aria-label="选择${c}车身颜色" aria-pressed="${vehicle.color === c}"></button>`).join('')}<label class="factory-custom-color" title="自选涂装"><input type="color" aria-label="自选车身颜色" value="${vehicle.color}"><span>＋</span></label></div>

      <div class="factory-setups" role="group" aria-label="一键智驾蓝图">${SETUPS.map(setup => `<button type="button" data-setup="${setup.id}">${CYBER_SETUP_AD[setup.id].label}</button>`).join('')}</div>

      <div class="factory-part-group-label">⚡ 智驾系统（决定 L2–L4 无人驾驶能力）</div>
      <div class="factory-part-tabs factory-part-tabs-ad" role="group" aria-label="选择智驾核心硬件">
        <button type="button" data-part="sensor">📡 智驾感知</button>
        <button type="button" data-part="chip">🧠 算力芯片</button>
      </div>

      <div class="factory-part-group-label">🔋 三电动力链（决定动力、爬坡与续航）</div>
      <div class="factory-part-tabs" role="group" aria-label="选择三电动力部件">${Object.entries(PART_NAMES).map(([part, title]) => `<button type="button" data-part="${part}">${title}</button>`).join('')}</div>

      <div class="factory-options"></div>
      <div class="factory-part-detail"></div>
    </aside>

    <section class="factory-parameters" aria-labelledby="factory-parameters-title">
      <div class="factory-parameters-heading">
        <div>
          <span class="factory-eyebrow">CYBER EV BLUEPRINT</span>
          <h3 id="factory-parameters-title">整车核心参数图</h3>
          <p>点击图中任意硬件卡片可直接跳转选装，实时同步当前涂装、智驾套件与三电规格。</p>
        </div>
        <div class="factory-parameter-actions">
          <button type="button" class="btn" data-export-parameters="png">下载参数图 PNG ↓</button>
          <button type="button" class="btn" data-export-parameters="svg">矢量图 SVG ↓</button>
        </div>
      </div>
      <div class="factory-parameter-scroll" tabindex="0" aria-label="整车核心参数图，可横向滚动">
        <div class="factory-parameter-diagram"></div>
      </div>
      <p class="factory-scroll-hint">小屏可横向滑动查看；下载图片可放大保存。</p>
    </section>
  </div>`;

  const get = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`Factory element missing: ${selector}`);
    return element;
  };
  const nameInput = get<HTMLInputElement>('.factory-name');
  const stageHost = get('.factory-stage');
  const feedback = (text: string) => {
    message = text;
    get('.factory-message-text').textContent = text;
  };

  function totalBudget() {
    return configurationCost(vehicle) + sensorOf(sensorPack).coins + chipOf(chipTier).coins;
  }

  async function exportParameters(format: string) {
    const title = `${vehicle.name.replace(/[\\/:*?"<>|]/g, '') || '我的智驾车'}-核心参数图`;
    const svg = parameterDiagram(vehicle, false, { sensorPack, chipTier });
    if (format === 'svg') {
      downloadFile(`${title}.svg`, svg, 'image/svg+xml;charset=utf-8');
      api.notify('核心参数矢量图已下载，可放大或打印。');
      return;
    }
    try {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1160;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG encode failed');
      downloadFile(`${title}.png`, blob, 'image/png');
      api.notify('核心参数图 PNG 已下载。');
    } catch {
      api.notify('参数图片暂时无法生成，请使用矢量图 SVG 下载。');
    }
  }

  function persist() {
    const battery = batteryOf(vehicle);
    const sensor = sensorOf(sensorPack);
    const chip = chipOf(chipTier);
    const rating = adRating(sensorPack, chipTier);
    api.record('factory', {
      configuration: { ...vehicle },
      sensorPack,
      chipTier,
      saved,
      summary: `我装配了「${vehicle.name}」（${rating.title} · ${sensor.title} + ${chip.title}），轮端功率 ${round(configurationStats(vehicle).wheelPower)} kW。`,
      report: [
        { label: '我的智驾座驾', value: `${vehicle.name} · ${rating.title}` },
        { label: '智驾感知与超算大脑', value: `${sensor.title}（${sensor.range}m / ${sensor.fov}°） · ${chip.title}（${chip.tops} TOPS）` },
        { label: '电池容量 / 最大供电', value: `${battery.value} kWh / ${battery.power} kW` },
        ...parameterGroups(vehicle).map(group => ({ label: `${PART_NAMES[group.part]} · ${group.title}`, value: group.rows.map(([l, v]) => `${l} ${v}`).join('；') })),
        { label: '整备质量 / 总工程预算', value: `${configurationStats(vehicle).emptyMass} kg / ${totalBudget()} 币` },
        { label: '轮端功率 / 低速扭矩上限', value: `${round(configurationStats(vehicle).wheelPower)} kW / ${round(configurationStats(vehicle).wheelTorque)} N·m` },
        { label: '双系统架构', value: '智驾链路（感知→超算→车身）＋ 动力链（电池→逆变器→电机→减速器→车轮）' },
      ],
    });
  }

  function updateControls() {
    if (destroyed) return;
    get('.factory-message-text').textContent = message;
    host.querySelectorAll<HTMLButtonElement>('[data-view-mode]').forEach(btn => {
      const active = btn.dataset.viewMode === viewMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    host.querySelectorAll<HTMLButtonElement>('[data-part]').forEach(button => {
      const selected = button.dataset.part === chosenPart;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    host.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.color === vehicle.color))
    );
    const customColor = get<HTMLInputElement>('.factory-custom-color input');
    if (document.activeElement !== customColor) customColor.value = vehicle.color;

    if (chosenPart === 'sensor') {
      get('.factory-options').innerHTML = SENSOR_PACKS.map(o => `<button type="button" class="factory-option factory-option-ad ${sensorPack === o.value ? 'is-selected' : ''}" data-option="${o.value}" aria-pressed="${sensorPack === o.value}"><span class="factory-option-check">${sensorPack === o.value ? '✓' : '○'}</span><span><strong>${o.title}</strong><small>${o.detail}</small></span><span class="factory-option-coins">${o.coins}<small>币</small></span></button>`).join('');
      get('.factory-part-detail').textContent = sensorOf(sensorPack).desc;
    } else if (chosenPart === 'chip') {
      get('.factory-options').innerHTML = CHIP_TIERS.map(o => `<button type="button" class="factory-option factory-option-ad ${chipTier === o.value ? 'is-selected' : ''}" data-option="${o.value}" aria-pressed="${chipTier === o.value}"><span class="factory-option-check">${chipTier === o.value ? '✓' : '○'}</span><span><strong>${o.title}</strong><small>${o.detail}</small></span><span class="factory-option-coins">${o.coins}<small>币</small></span></button>`).join('');
      get('.factory-part-detail').textContent = chipOf(chipTier).desc;
    } else {
      const evPart: Part = chosenPart;
      const options = partOptions(evPart);
      get('.factory-options').innerHTML = options.map(o => `<button type="button" class="factory-option ${String(vehicle[evPart]) === String(o.value) ? 'is-selected' : ''}" data-option="${o.value}" aria-pressed="${String(vehicle[evPart]) === String(o.value)}">${evPart === 'body' ? `<span class="factory-body-preview" aria-hidden="true">${premiumCarSVG(vehicle.color, String(o.value))}</span>` : `<span class="factory-option-check">${String(vehicle[evPart]) === String(o.value) ? '✓' : '○'}</span>`}<span><strong>${o.title}</strong><small>${o.detail}</small></span><span class="factory-option-coins">${o.coins}<small>币</small></span></button>`).join('');
      get('.factory-part-detail').textContent = PART_HINTS[evPart];
    }

    const stats = configurationStats(vehicle);
    const sensor = sensorOf(sensorPack);
    const chip = chipOf(chipTier);
    const rating = adRating(sensorPack, chipTier);
    get('.factory-config-summary').innerHTML = `
      <span><small>智驾等级</small><strong style="color:${rating.color}">${rating.level} · ${chip.tops} TOPS</strong></span>
      <span><small>探测范围</small><strong style="color:#47eaff">${sensor.range} m / ${sensor.fov}°</strong></span>
      <span><small>轮端功率</small><strong>${round(stats.wheelPower)} kW</strong></span>
      <span><small>轮端扭矩</small><strong>${round(stats.wheelTorque)} N·m</strong></span>
      <span><small>总预算 / 质量</small><strong>${totalBudget()} 币 · ${stats.emptyMass} kg</strong></span>
    `;
    get('.factory-matching').textContent = `工程匹配：当前动力上限受「${stats.limiting}」制约；智驾配置已达 ${rating.title}（响应延迟 ${chip.latencyMs} ms）。`;

    const nextDiagramKey = `${fingerprint(vehicle)}:${vehicle.name}:${vehicle.color}:${sensorPack}:${chipTier}`;
    if (nextDiagramKey !== diagramKey) {
      get('.factory-parameter-diagram').innerHTML = parameterDiagram(vehicle, true, { sensorPack, chipTier });
      diagramKey = nextDiagramKey;
    }
    host.querySelectorAll<SVGElement>('[data-diagram-part]').forEach(node => {
      node.setAttribute('aria-pressed', String(node.dataset.diagramPart === chosenPart));
    });

    get('.factory-stamp-text').textContent = saved ? '未来智驾造车体验章已点亮 · 爱车已同步至全站游戏' : '装配座驾并点击「保存我的智驾车」，即可点亮体验章';
    get('.factory-stamp').classList.toggle('is-earned', saved);
    get<HTMLButtonElement>('.factory-save').innerHTML = saved ? '更新我的智驾车 <span>已同步</span>' : '保存我的智驾车 <span>＋40</span>';
  }

  function changePart(part: ExtendedPart, value: string) {
    if (part === 'sensor') sensorPack = value as SensorPackId;
    else if (part === 'chip') chipTier = value as ChipTierId;
    else if (part === 'battery') vehicle.battery = Number(value);
    else if (part === 'motor') vehicle.motor = Number(value);
    else if (part === 'inverter') vehicle.inverter = Number(value);
    else if (part === 'reducer') vehicle.reducer = Number(value);
    else if (part === 'wheels') vehicle.wheels = value;
    else vehicle.body = value;
    assemblePulse = 1;
    api.playCue?.('boost');
    api.award('factory', 'custom-build', 30, '完成个性化智驾装配');
    const labelName = part === 'sensor' ? sensorOf(sensorPack).title : part === 'chip' ? chipOf(chipTier).title : (partOptions(part).find(p => String(p.value) === value)?.title ?? EXT_PART_NAMES[part]);
    feedback(`⚡ 已完成纳米装配：${labelName}！五维能力、展台与参数图已实时更新。`);
    persist();
    updateControls();
  }

  function makePoster(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 2400;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    nightBackdrop(ctx, 1000, 1200);
    const rating = adRating(sensorPack, chipTier);
    const sensor = sensorOf(sensorPack);
    const chip = chipOf(chipTier);
    label(ctx, 'CYBER AUTONOMOUS EV · 未来智驾座驾', 78, 98, 20, '#47eaff', 700);
    label(ctx, vehicle.name, 78, 178, 50, '#e8f3ff', 700);
    label(ctx, `${api.getProfile().nickname || '小工程师'}设计 · ${rating.title} · ${chip.tops} TOPS`, 80, 224, 23, rating.color, 600);
    roundRect(ctx, 70, 290, 860, 400, 32, '#0d1a30', rating.color);
    ctx.fillStyle = '#47eaff26';
    ctx.beginPath(); ctx.ellipse(500, 650, 285, 22, 0, 0, Math.PI * 2); ctx.fill();
    drawBody(ctx, 500, 565, vehicle, 2.5);
    drawCarRoofSensors(ctx, 500, 565, 2.5, sensorPack, 0, true, true, vehicle.body);
    const battery = batteryOf(vehicle), motor = motorOf(vehicle), inverter = inverterOf(vehicle), reducer = reducerOf(vehicle), wheels = wheelsOf(vehicle);
    label(ctx, `${bodyOf(vehicle).title} · ${totalBudget()} 工程币`, 111, 340, 20, '#e8f3ff');
    for (const [i, pair] of [
      ['智驾感知套件', `${sensor.title} (${sensor.range}m)`],
      ['智驾超算芯片', `${chip.title} (${chip.tops} TOPS)`],
      ['电池容量 / 供电', `${battery.value} kWh / ${battery.power} kW`],
      ['逆变器 / 电机', `${inverter.value} kW / ${motor.value} kW`],
      ['减速器 / 车轮', `${reducer.value}∶1 / ${wheels.size}`],
      ['整备质量 / 功率', `${configurationStats(vehicle).emptyMass} kg / ${round(configurationStats(vehicle).wheelPower)} kW`],
    ].entries()) {
      const x = 85 + (i % 3) * 305, y = 742 + Math.floor(i / 3) * 86;
      label(ctx, pair[0], x, y, 16, '#9cb8d4');
      label(ctx, pair[1], x, y + 34, 19, '#e8f3ff', 700);
    }
    label(ctx, '感知 → 超算大脑 → 车身  |  电池 → 逆变器 → 电机 → 减速器 → 车轮', 85, 945, 21, '#75f1bb', 600);
    label(ctx, '我装配，我透视，我领航未来。', 85, 1083, 28, '#f5bc65', 600);
    label(ctx, '合成教学参数与加速展示，不代表实车性能。', 85, 1147, 18, '#a6bad0');
    return canvas.toDataURL('image/png');
  }

  function saveVehicle() {
    vehicle.name = nameInput.value.trim().slice(0, 16) || '未来智驾号';
    nameInput.value = vehicle.name;
    api.setVehicle({ ...vehicle });
    saved = true;
    api.award('factory', 'saved-car', 40, '保存我的未来智驾车');
    api.complete('factory');
    persist();
    updateControls();
    feedback('爱车已保存！你的座驾涂装和车型已同步至所有体验世界。');
    requestAnimationFrame(() => {
      if (!destroyed) api.saveImage('factory', stage.capture());
    });
  }

  const onClick = (event: MouseEvent) => {
    const diagramPart = (event.target as Element).closest<SVGElement>('[data-diagram-part]');
    if (diagramPart) {
      chosenPart = diagramPart.dataset.diagramPart as ExtendedPart;
      updateControls();
      get('.factory-options').scrollIntoView({ block: 'nearest', behavior: 'instant' });
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !host.contains(button) || button.disabled) return;
    if (button.dataset.viewMode) {
      viewMode = button.dataset.viewMode as CyberViewMode;
      assemblePulse = 0.85;
      if (viewMode !== 'hologram') api.award('factory', 'cyber-inspect', 30, '开启透视与风洞检视');
      feedback(
        viewMode === 'xray'
          ? '🩻 X 光透视已开启：观察金色三电动力链与紫色智驾超算总线如何协同工作！'
          : viewMode === 'aero'
            ? '💨 空气动力风洞已开启：试试在「车身」里切换轿跑、SUV 与超跑，观察风阻与尾流变化！'
            : '✨ 全息展台已开启：实时查看车顶智驾传感器套件与五维能力雷达图。'
      );
      updateControls();
    } else if (button.dataset.exportParameters) void exportParameters(button.dataset.exportParameters);
    else if (button.dataset.part) {
      chosenPart = button.dataset.part as ExtendedPart;
      updateControls();
    } else if (button.dataset.setup) {
      const setup = SETUPS.find(p => p.id === button.dataset.setup);
      const ad = CYBER_SETUP_AD[button.dataset.setup];
      if (setup && ad) {
        vehicle = { ...vehicle, ...setup.parts };
        sensorPack = ad.sensor;
        chipTier = ad.chip;
        assemblePulse = 1;
        api.playCue?.('boost');
        api.award('factory', 'custom-build', 30, '完成个性化智驾装配');
        persist();
        updateControls();
        feedback(`⚡ 已加载蓝图「${ad.label}」！${setup.hint}`);
      }
    } else if (button.dataset.option) changePart(chosenPart, button.dataset.option);
    else if (button.dataset.color) {
      vehicle.color = button.dataset.color;
      assemblePulse = 0.7;
      persist();
      updateControls();
    } else if (button.classList.contains('factory-save')) saveVehicle();
    else if (button.classList.contains('factory-poster')) {
      saveVehicle();
      const image = makePoster();
      const binary = atob(image.split(',')[1]);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      downloadFile(`${vehicle.name.replace(/[\\/:*?"<>|]/g, '') || '未来智驾车'}-智驾海报.png`, new Blob([bytes], { type: 'image/png' }), 'image/png');
      api.notify('未来智驾车海报已下载，也已保存到作品报告。');
    }
  };

  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target === nameInput) {
      vehicle.name = target.value.slice(0, 16);
      updateControls();
    } else if (target.matches('.factory-custom-color input')) {
      vehicle.color = target.value;
      updateControls();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const part = (event.target as Element).closest<SVGElement>('[data-diagram-part]');
    if (part && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      chosenPart = part.dataset.diagramPart as ExtendedPart;
      updateControls();
      get('.factory-options').scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  };

  const onChange = () => persist();
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  host.addEventListener('change', onChange);
  host.addEventListener('keydown', onKeyDown);

  stage = createStage(stageHost, {
    label: '未来智驾全息造车展台：支持全息展台、X光透视与风洞气流模式。',
    draw(ctx, time) {
      drawCyberWorkshop(ctx, { vehicle, sensorPack, chipTier, chosenPart, viewMode, time, assemblePulse, reduced: reduceMotion() });
    },
    update(dt) {
      if (destroyed) return;
      if (assemblePulse > 0) assemblePulse = Math.max(0, assemblePulse - dt * 1.6);
    },
  });

  updateControls();
  persist();
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      persist();
      stage.destroy();
      host.removeEventListener('click', onClick);
      host.removeEventListener('input', onInput);
      host.removeEventListener('change', onChange);
      host.removeEventListener('keydown', onKeyDown);
    },
  };
}
