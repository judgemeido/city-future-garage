import { drawPremiumCar } from '../car-art';
import { createStage, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import {
  HORIZON_METERS,
  REGEN_AI_DT,
  REGEN_AI_ROUTES,
  createRegenAiState,
  elevationAt,
  energySavingPercent,
  lightStateAt,
  netConsumptionKwhPer100km,
  regenAiStars,
  stepRegenAi,
  type AiHorizonMode,
  type AiRegenStyle,
  type ControlMode,
  type ManualPedal,
  type RegenAiState,
  type RegenBatteryMode,
} from './regen-ai-model';
import './arcade-science.css';

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

const BATTERY_LABELS: Record<RegenBatteryMode, string> = {
  normal: '常温 25°C',
  cold: '寒冬 -5°C',
  full: '满电 98%',
};

const HORIZON_LABELS: Record<AiHorizonMode, string> = {
  short: '近视 42m',
  medium: '雷达 115m',
  v2x: 'V2X 210m',
};

const STYLE_LABELS: Record<AiRegenStyle, string> = {
  mild: '弱回收',
  adaptive: '智能 CRBS',
  strong: '强单踏板',
};

interface EnergyParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function mountRegen(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('regen');
  const bestStars: number[] = Array.isArray(saved.bestStars)
    ? [0, 1, 2].map(i => Number((saved.bestStars as unknown[])[i]) || 0)
    : [0, 0, 0];

  let routeIdx = 0;
  let state: RegenAiState = createRegenAiState(0);
  let accumulator = 0;
  let resultShown = false;
  let aiAssistedRun = false;
  const particles: EnergyParticle[] = [];
  const hold = { accel: false, regen: false, brake: false };

  host.innerHTML = `<div class="as-shell" style="--as-accent:#75f1bb">
    <div class="as-topbar">
      <div class="as-levels" role="group" aria-label="选择智驾回能赛道">
        ${REGEN_AI_ROUTES.map((r, i) => `<button type="button" class="as-level-btn" data-route="${i}" aria-pressed="${i === 0}"><span>0${i + 1} ${r.name}</span><b data-star="${i}">${starText(bestStars[i])}</b></button>`).join('')}
      </div>
      <div class="as-top-controls">
        <div class="as-pill-group" role="group" aria-label="电池工况物理约束">
          ${(['normal', 'cold', 'full'] as RegenBatteryMode[]).map(b => `<button type="button" data-battery="${b}" aria-pressed="${b === 'normal'}">${BATTERY_LABELS[b]}</button>`).join('')}
        </div>
        <button type="button" class="btn btn-small" data-pause disabled>Ⅱ 暂停</button>
        <button type="button" class="btn btn-small" data-restart>重开</button>
      </div>
    </div>

    <div class="as-main">
      <div class="as-stage-col">
        <div class="as-stage-wrap">
          <div data-stage></div>
          <div class="as-overlay" data-intro>
            <span class="as-overlay-tag">AI ECO-PILOT · 智驾预测性能量回收</span>
            <h2>为什么智驾车比老司机<br>更省电 35%？</h2>
            <p>你可以<strong>亲手驾驶挑战</strong>（结合 V2X 红绿灯倒计时精准松电门回能，赢取三星与积分），也可以先启动 <strong>AI 智驾领航演示</strong>实时对比 V2X 超视距回能策略（提示：<strong>凡有 AI 辅助的场次仅作科普演示，不计分、不计星级</strong>）！</p>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-start="manual">🖐️ 亲手驾驶挑战（计分）</button>
              <button type="button" class="btn" data-start="ai">🤖 观摩 AI 智驾演示（不计分）</button>
            </div>
          </div>
          <div class="as-overlay" data-paused hidden>
            <span class="as-overlay-tag">PAUSED</span>
            <h2>智驾能耗仿真已暂停</h2>
            <p>你可以在右侧调整 AI 视野或回收策略，然后继续观察对比。</p>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-resume>继续领航 →</button>
              <button type="button" class="btn" data-restart>重新出发</button>
            </div>
          </div>
          <div class="as-overlay" data-result hidden>
            <span class="as-overlay-tag" data-result-tag>ENERGY SHOWDOWN · 人机能耗对决报告</span>
            <h2 data-result-title></h2>
            <div class="as-overlay-stars" data-result-stars></div>
            <div class="as-overlay-metrics" data-result-metrics></div>
            <div class="as-overlay-science" data-result-science></div>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-manual-retry hidden>🖐️ 亲手驾驶拿分 →</button>
              <button type="button" class="btn btn-primary" data-next>下一条智驾赛道 →</button>
              <button type="button" class="btn" data-restart>重跑本赛道</button>
              <button type="button" class="btn" data-save>保存能耗报告</button>
            </div>
          </div>
        </div>

        <div class="as-controls-bar" data-ai-bar>
          <button type="button" class="as-action-btn is-purple" data-toggle-control>🖐️ 切换人工（本趟已用 AI 不计分）<small>重开手动模式才计分</small></button>
          <button type="button" class="as-action-btn" data-horizon="short">👀 近视 42m<small>晚刹车 · 易发热浪费</small></button>
          <button type="button" class="as-action-btn" data-horizon="medium">📡 雷达 115m<small>中距平顺跟车回能</small></button>
          <button type="button" class="as-action-btn is-green is-active" data-horizon="v2x">🌐 V2X 210m<small>超视距绿波 · 零摩擦热</small></button>
        </div>

        <div class="as-controls-bar" data-manual-bar hidden>
          <button type="button" class="as-action-btn is-purple" data-toggle-control>🤖 交回 AI 领航（不计分）<small>切入 AI 辅助本趟将不计分</small></button>
          <button type="button" class="as-action-btn" data-hold="accel">⚡ 踩电门加速<small>按住 · W / ↑</small></button>
          <button type="button" class="as-action-btn is-green" data-hold="regen">♻️ 黄金纯电回能<small>按住 · 空格 / ↓（0 摩擦热）</small></button>
          <button type="button" class="as-action-btn is-coral" data-hold="brake">🔥 强力摩擦急刹<small>按住 · B（刹车盘发热）</small></button>
        </div>

        <div class="as-status-line">
          <span data-status>实时观察 AI 决策气泡，对比同屏「橙色急刹幽灵车」的摩擦热浪费！</span>
          <div class="as-mini-actions">
            <button type="button" class="btn" data-save>保存当前画面</button>
          </div>
        </div>
      </div>

      <aside class="as-sidebar" aria-label="智驾能量实验室">
        <div class="as-card">
          <div class="as-card-head">
            <h3>🤖 AI 智驾回收策略</h3>
            <span class="as-badge" data-ctrl-badge>AI 领航中</span>
          </div>
          <div class="as-pill-group" style="width:100%;justify-content:space-between" role="group" aria-label="AI 动能回收风格">
            ${(['mild', 'adaptive', 'strong'] as AiRegenStyle[]).map(s => `<button type="button" style="flex:1" data-style="${s}" aria-pressed="${s === 'adaptive'}">${STYLE_LABELS[s]}</button>`).join('')}
          </div>
          <div class="as-flow-box" data-flow-box>
            <div class="as-flow-node">🔋 电池<small data-flow-soc>68.0%</small></div>
            <span class="as-flow-arrow" data-arrow-1>→</span>
            <div class="as-flow-node">⚙️ 同一电机<small data-flow-motor>经济驱动</small></div>
            <span class="as-flow-arrow" data-arrow-2>→</span>
            <div class="as-flow-node">🛞 车轮<small data-flow-v>32 km/h</small></div>
          </div>
          <div class="as-stat-grid">
            <div class="as-stat"><span>电机回收进电池</span><strong data-rec-kj style="color:#75f1bb">0.0 kJ</strong></div>
            <div class="as-stat"><span>摩擦刹车热浪费</span><strong data-heat-kj style="color:#ff8e72">0.0 kJ</strong></div>
            <div class="as-stat"><span>我的百公里电耗</span><strong data-my-kwh style="color:#47eaff">-- kWh</strong></div>
            <div class="as-stat"><span>对比急刹幽灵车</span><strong data-save-pct style="color:#f5bc65">省电 --%</strong></div>
          </div>
        </div>

        <div class="as-card">
          <div class="as-card-head">
            <h3>🧠 AI 实时思考 & 科普</h3>
            <span class="as-badge" data-horizon-badge>V2X 210m</span>
          </div>
          <p class="as-science-tip" data-thought-tip></p>
          <p class="as-science-tip" style="--as-accent:#f5bc65">
            <strong>智驾能量黑科技 (CRBS + V2X)：</strong><br>
            传统开车看到红灯才急刹，动能全变成刹车盘的<strong>热浪费</strong>；智驾车靠 <strong>V2X 提前 200m 读倒计时 + 高精坡度地图</strong>，提前用电机温和发电减速，既省电又不晕车！
          </p>
        </div>
      </aside>
    </div>
  </div>`;

  const q = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s)!;

  function spawnParticle(x: number, y: number, color: string, vx: number, vy: number) {
    if (api.reducedMotion()) return;
    particles.push({ x, y, vx, vy, life: 0, color });
    if (particles.length > 90) particles.shift();
  }

  function reset(nextRoute = routeIdx, startMode?: ControlMode) {
    routeIdx = nextRoute;
    const prevCfg = state.config;
    state = createRegenAiState(routeIdx, {
      battery: prevCfg.battery,
      horizon: prevCfg.horizon,
      regenStyle: prevCfg.regenStyle,
      control: startMode ?? prevCfg.control,
    });
    accumulator = 0;
    resultShown = false;
    aiAssistedRun = state.config.control === 'ai';
    particles.length = 0;
    hold.accel = hold.regen = hold.brake = false;

    if (startMode) {
      state.phase = 'running';
      q('[data-intro]').hidden = true;
      q<HTMLButtonElement>('[data-pause]').disabled = false;
      api.playCue?.('start');
    } else {
      q('[data-intro]').hidden = false;
      q<HTMLButtonElement>('[data-pause]').disabled = true;
    }
    q('[data-paused]').hidden = true;
    q('[data-result]').hidden = true;
    syncButtons();
    updateUI();
  }

  function syncButtons() {
    host.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.route) === routeIdx)));
    host.querySelectorAll<HTMLButtonElement>('[data-battery]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.battery === state.config.battery)));
    host.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === state.config.regenStyle)));
    host.querySelectorAll<HTMLButtonElement>('[data-horizon]').forEach(b => b.classList.toggle('is-active', b.dataset.horizon === state.config.horizon));
    q('[data-ai-bar]').hidden = state.config.control !== 'ai';
    q('[data-manual-bar]').hidden = state.config.control !== 'manual';
  }

  function showResult() {
    resultShown = true;
    const isAiAssisted = aiAssistedRun || state.config.control === 'ai';
    const stars = isAiAssisted ? 0 : regenAiStars(state);
    if (!isAiAssisted) {
      bestStars[routeIdx] = Math.max(bestStars[routeIdx], stars);
      q(`[data-star="${routeIdx}"]`).textContent = starText(bestStars[routeIdx]);
    }

    const myKwh = netConsumptionKwhPer100km(state.player);
    const ghostKwh = netConsumptionKwhPer100km(state.ghost);
    const savePct = energySavingPercent(state);
    const recKj = (state.player.energyRegenJ / 1000).toFixed(1);
    const heatKj = (state.player.frictionHeatJ / 1000).toFixed(1);
    const ghostHeatKj = (state.ghost.frictionHeatJ / 1000).toFixed(1);

    q('[data-result-tag]').textContent = isAiAssisted
      ? 'AI DEMO · AI 领航演示（不计分）'
      : 'ENERGY SHOWDOWN · 纯手动挑战成绩';
    q('[data-result-title]').textContent = isAiAssisted
      ? '🤖 AI 智驾回能演示完成（不计分）'
      : stars === 3 ? '🏆 亲手节能王牌！完胜急刹老司机' : '⚡ 本趟纯手动回能挑战完成';
    q('[data-result-stars]').textContent = isAiAssisted ? '☆☆☆' : starText(stars);
    q('[data-result-metrics]').innerHTML = `
      ${isAiAssisted ? '<span>本次得分<strong style="color:#ff9e78">0 分（AI 辅助）</strong></span>' : ''}
      <span>百公里电耗<strong style="color:#75f1bb">${myKwh.toFixed(1)} kWh</strong></span>
      <span>急刹幽灵车电耗<strong style="color:#ff9e78">${ghostKwh.toFixed(1)} kWh</strong></span>
      <span>电机回收 / 摩擦热<strong>${recKj} / ${heatKj} kJ</strong></span>
      <span>综合节能率<strong style="color:#f5bc65">${savePct >= 0 ? `省电 ${savePct}%` : `多耗 ${-savePct}%`}</strong></span>
    `;
    q('[data-result-science]').innerHTML = isAiAssisted
      ? `⚠️ <strong>无积分说明：</strong>本趟使用了 <strong>AI 智驾领航辅助</strong>（${HORIZON_LABELS[state.config.horizon]} + ${STYLE_LABELS[state.config.regenStyle]}），仅作科普对比演示，<strong>不计分、不计星级</strong>！AI 仅产生 <strong>${heatKj} kJ</strong> 摩擦热（幽灵车 ${ghostHeatKj} kJ）；点击下方「亲手驾驶拿分」全程手动控制即可赢取三星与积分！`
      : `💡 <strong>亲手实测结论：</strong>急刹幽灵车因为视野短，把 <strong>${ghostHeatKj} kJ</strong> 动能白白变成了刹车摩擦热；而你全程亲手精控（${BATTERY_LABELS[state.config.battery]}）仅产生 <strong>${heatKj} kJ</strong> 摩擦热，成功收回 <strong>${recKj} kJ</strong> 进电池！`;
    q('[data-manual-retry]').hidden = !isAiAssisted;
    q('[data-next]').hidden = isAiAssisted;
    q('[data-result]').hidden = false;
    q<HTMLButtonElement>('[data-pause]').disabled = true;
    api.playCue?.(!isAiAssisted && stars >= 2 ? 'reward' : 'boost');

    if (!isAiAssisted) {
      api.award('regen', `route-${routeIdx}`, Math.max(25, stars * 14), `完成${REGEN_AI_ROUTES[routeIdx].name}亲手回能`);
      api.award('regen', 'manual-pk', 20, '纯手动精控 PK 智驾能耗');
      if (state.config.battery !== 'normal') api.award('regen', 'param-compare', 20, '挑战不同电池工况下的纯手动回能');
      api.complete('regen');
      api.record('regen', {
        bestStars,
        summary: `在「${REGEN_AI_ROUTES[routeIdx].name}」纯手动驾驶以 ${myKwh.toFixed(1)} kWh/100km 完赛（比急刹幽灵车省电 ${savePct}%），回收 ${recKj} kJ、摩擦热仅 ${heatKj} kJ，获 ${stars} 星。`,
        report: [
          { label: '赛道 / 模式', value: `${REGEN_AI_ROUTES[routeIdx].name} · 纯手动挑战` },
          { label: '电耗对比（我 vs 幽灵车）', value: `${myKwh.toFixed(1)} vs ${ghostKwh.toFixed(1)} kWh/100km（省电 ${savePct}%）` },
          { label: '纯电回收 / 摩擦热', value: `${recKj} kJ / ${heatKj} kJ · ${stars} 星` },
        ],
      });
      api.saveImage('regen', stage.capture());
    }
  }

  function updateUI() {
    const p = state.player;
    const isRegen = p.regenPowerW > 200;
    const isHeat = p.frictionPowerW > 2000;
    const flowBox = q('[data-flow-box]');
    flowBox.classList.toggle('is-drive', p.action === 'drive');
    flowBox.classList.toggle('is-regen', isRegen && !isHeat);
    flowBox.classList.toggle('is-heat', isHeat);
    q('[data-arrow-1]').textContent = isRegen ? '←' : p.action === 'coast' ? '·' : '→';
    q('[data-arrow-2]').textContent = isHeat ? '🔥' : isRegen ? '←' : p.action === 'coast' ? '·' : '→';
    q('[data-flow-soc]').textContent = `${(p.soc * 100).toFixed(2)}%`;
    q('[data-flow-motor]').textContent = isRegen ? `发电 +${(p.regenPowerW / 1000).toFixed(0)}kW` : isHeat ? '摩擦介入!' : p.action === 'coast' ? '空档滑行' : `驱动 ${(p.drivePowerW / 1000).toFixed(0)}kW`;
    q('[data-flow-v]').textContent = `${Math.round(p.v * 3.6)} km/h`;

    q('[data-rec-kj]').textContent = `${(p.energyRegenJ / 1000).toFixed(1)} kJ`;
    q('[data-heat-kj]').textContent = `${(p.frictionHeatJ / 1000).toFixed(1)} kJ`;
    const myKwh = p.x > 25 ? `${netConsumptionKwhPer100km(p).toFixed(1)} kWh` : '-- kWh';
    const savePct = p.x > 40 ? energySavingPercent(state) : null;
    q('[data-my-kwh]').textContent = myKwh;
    q('[data-save-pct]').textContent = savePct === null ? '对比中…' : savePct >= 0 ? `省电 ${savePct}%` : `多耗 ${-savePct}%`;
    q('[data-ctrl-badge]').textContent = state.config.control === 'ai'
      ? '🤖 AI 演示（不计分）'
      : aiAssistedRun ? '⚠️ 已用 AI（不计分）' : '🖐️ 纯手动计分';
    q('[data-horizon-badge]').textContent = HORIZON_LABELS[state.config.horizon];
    q('[data-thought-tip]').innerHTML = `<strong>${state.thought.badge}：</strong>${state.thought.reason}`;
    q('[data-status]').textContent = state.eventBanner || (state.config.control === 'ai'
      ? '实时切换下方「近视 42m / V2X 210m」或「常温 / 寒冬 / 满电」，立刻对比 AI 的预测回能差距！'
      : '人工接管 PK 中！看准前方 V2X 红绿灯倒计时，提前按住「空格 黄金纯电回能」避免摩擦急刹！');
    q('[data-pause]').textContent = state.paused ? '▶ 继续' : 'Ⅱ 暂停';
  }

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    const route = REGEN_AI_ROUTES[routeIdx];
    const reduced = api.reducedMotion();
    const p = state.player;
    const camX = Math.max(0, p.x - 42);
    const scaleX = 5.4; // 1 meter = 5.4 px -> ~185m visible ahead!
    const toX = (worldX: number) => 210 + (worldX - camX) * scaleX;
    const baseGroundY = 338;
    const toY = (worldX: number) => baseGroundY - elevationAt(route, worldX).height * 7.2;

    // 1. Cyberpunk Night Sky + Parallax City Skyline
    const sky = ctx.createLinearGradient(0, 0, 0, 520);
    sky.addColorStop(0, '#070c1e');
    sky.addColorStop(0.55, '#111d36');
    sky.addColorStop(1, '#091526');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1000, 520);

    // Subtle glowing stars & moon
    ctx.fillStyle = 'rgba(117, 241, 187, 0.14)';
    ctx.beginPath(); ctx.arc(870, 74, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d4f6ff';
    ctx.beginPath(); ctx.arc(870, 74, 20, 0, Math.PI * 2); ctx.fill();

    // Distant city buildings parallax
    for (let i = 0; i < 15; i++) {
      const bx = i * 82 - ((camX * 0.55) % 82);
      const bh = 38 + ((i * 37 + routeIdx * 19) % 72);
      roundRect(ctx, bx, 215 - bh, 58, bh + 95, 3, i % 2 ? '#122138' : '#152540');
      ctx.fillStyle = i % 3 === 0 ? 'rgba(71, 234, 255, 0.25)' : 'rgba(188, 152, 255, 0.2)';
      for (let r = 0; r < 3; r++) ctx.fillRect(bx + 10 + r * 14, 224 - bh, 7, 10);
    }

    // 2. High-Definition Elevation Terrain Deck
    ctx.beginPath();
    ctx.moveTo(0, toY(camX - 40));
    for (let px = 0; px <= 1000; px += 12) {
      const wx = camX + (px - 210) / scaleX;
      ctx.lineTo(px, toY(wx));
    }
    ctx.lineTo(1000, 520);
    ctx.lineTo(0, 520);
    ctx.closePath();
    const roadGrad = ctx.createLinearGradient(0, 220, 0, 480);
    roadGrad.addColorStop(0, '#182d44');
    roadGrad.addColorStop(1, '#0b1628');
    ctx.fillStyle = roadGrad;
    ctx.fill();

    // Color-coded slope ribbon along the asphalt surface (Green = downhill regen zone!)
    for (let px = 0; px < 1000; px += 16) {
      const wx1 = camX + (px - 210) / scaleX;
      const wx2 = camX + (px + 16 - 210) / scaleX;
      const sl = elevationAt(route, wx1).slope;
      ctx.strokeStyle = sl < -0.02 ? '#75f1bb' : sl > 0.02 ? '#f5bc65' : '#47eaffaa';
      ctx.lineWidth = sl < -0.02 ? 4 : 2.5;
      ctx.beginPath();
      ctx.moveTo(px, toY(wx1));
      ctx.lineTo(px + 16, toY(wx2));
      ctx.stroke();
    }

    // Road dashed centerline below surface
    for (let wx = Math.floor(camX / 15) * 15; wx < camX + 200; wx += 15) {
      const rx = toX(wx), ry = toY(wx) + 22;
      ctx.fillStyle = 'rgba(155, 200, 225, 0.32)';
      ctx.fillRect(rx, ry, 24, 3);
    }

    // Finish arch
    const finX = toX(route.length);
    if (finX > -40 && finX < 1060) {
      const fy = toY(route.length);
      ctx.strokeStyle = '#75f1bb';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(finX, fy); ctx.lineTo(finX, fy - 115); ctx.stroke();
      roundRect(ctx, finX - 44, fy - 135, 88, 30, 6, '#133a35', '#75f1bb');
      ctx.textAlign = 'center';
      label(ctx, '🏁 终点站', finX, fy - 115, 13, '#c8ffe6', 700);
      ctx.textAlign = 'left';
    }

    // 3. V2X Smart Traffic Lights
    const playerScreenX = toX(p.x);
    const playerScreenY = toY(p.x) - 24;
    const sightM = HORIZON_METERS[state.config.horizon];

    for (const light of route.lights) {
      const lx = toX(light.x);
      if (lx < -80 || lx > 1060) continue;
      const ly = toY(light.x);
      const ls = lightStateAt(light, state.time);
      const lCol = ls.color === 'green' ? '#75f1bb' : ls.color === 'amber' ? '#f5bc65' : '#ff6f78';

      // Stop line on road
      ctx.fillStyle = lCol;
      ctx.fillRect(lx - 4, ly, 6, 36);

      // Signal gantry pole
      ctx.strokeStyle = '#5c7c9c';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 118); ctx.stroke();
      roundRect(ctx, lx - 16, ly - 132, 32, 66, 8, '#0c182c', lCol);

      // Signal lamps
      for (const [idx, cName, hex] of [[0, 'red', '#ff6f78'], [1, 'amber', '#f5bc65'], [2, 'green', '#75f1bb']] as const) {
        const active = ls.color === cName;
        ctx.fillStyle = active ? hex : '#1c2b42';
        if (active) { ctx.shadowColor = hex; ctx.shadowBlur = 14; }
        ctx.beginPath(); ctx.arc(lx, ly - 118 + idx * 19, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // V2X Countdown Sign
      roundRect(ctx, lx - 48, ly - 168, 96, 28, 7, 'rgba(9, 20, 38, 0.92)', lCol);
      ctx.textAlign = 'center';
      label(ctx, `${ls.color === 'green' ? '绿灯' : ls.color === 'amber' ? '黄灯' : '红灯'} ${Math.ceil(ls.remaining)}s`, lx, ly - 149, 13, lCol, 700);
      ctx.textAlign = 'left';

      // If within player's V2X / radar sight, draw glowing wireless V2X link arc!
      const distAhead = light.x - p.x;
      if (distAhead > 4 && distAhead <= sightM) {
        ctx.save();
        ctx.strokeStyle = state.config.horizon === 'v2x' ? 'rgba(71, 234, 255, 0.55)' : 'rgba(117, 241, 187, 0.4)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = reduced ? 0 : -time * 40;
        ctx.beginPath();
        ctx.moveTo(playerScreenX + 10, playerScreenY - 34);
        ctx.quadraticCurveTo((playerScreenX + lx) * 0.5, Math.min(playerScreenY, ly - 130) - 42, lx, ly - 132);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 4. Slow Lead Traffic Vehicles + Radar Range Beam
    for (const tc of state.traffic) {
      const tx = toX(tc.x);
      if (tx < -100 || tx > 1100) continue;
      const ty = toY(tc.x) - 24;
      const sl = elevationAt(route, tc.x).slope;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(Math.atan(-sl * 7.2 / scaleX));
      drawPremiumCar(ctx, 0, 0, tc.color, 0.72, tc.x * 2.2, tc.body);
      ctx.restore();

      const gap = tc.x - p.x;
      if (gap > 6 && gap <= Math.min(sightM, 125)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 188, 101, 0.65)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(playerScreenX + 58, playerScreenY); ctx.lineTo(tx - 58, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'center';
        label(ctx, `雷达距 ${Math.round(gap)}m`, (playerScreenX + tx) * 0.5, (playerScreenY + ty) * 0.5 - 12, 11, '#ffe099', 700);
        ctx.textAlign = 'left';
        ctx.restore();
      }
    }

    // 5. Ghost "Aggressive Late-Braking Human" Reference Car (Translucent Amber!)
    const gx = toX(state.ghost.x);
    if (gx > -100 && gx < 1100) {
      const gy = toY(state.ghost.x) - 24;
      const gsl = elevationAt(route, state.ghost.x).slope;
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.translate(gx, gy);
      ctx.rotate(Math.atan(-gsl * 7.2 / scaleX));
      drawPremiumCar(ctx, 0, 0, '#ff9866', 0.72, state.ghost.x * 2.2, 'city');
      ctx.restore();

      if (Math.abs(gx - playerScreenX) > 55 || state.ghost.frictionPowerW > 2000) {
        ctx.textAlign = 'center';
        label(ctx, state.ghost.frictionPowerW > 2000 ? '👻 急刹发热中!' : '👻 传统急刹幽灵车', gx, gy - 44, 11, '#ffad85', 700);
        ctx.textAlign = 'left';
      }
    }

    // 6. Player Custom Future EV + Sensor Perception Fan + Live Energy Aura
    const pSlope = elevationAt(route, p.x).slope;
    const v = api.getVehicle();

    // Forward Sensor Perception Horizon Cone (scales directly with Short 42m / Radar 115m / V2X 210m!)
    const conePx = Math.min(720, sightM * scaleX * 0.72);
    ctx.save();
    ctx.translate(playerScreenX, playerScreenY);
    ctx.rotate(Math.atan(-pSlope * 7.2 / scaleX));

    const coneCol = state.config.horizon === 'v2x' ? '71, 234, 255' : state.config.horizon === 'medium' ? '117, 241, 187' : '245, 188, 101';
    const cg = ctx.createLinearGradient(56, -10, 56 + conePx, -10);
    cg.addColorStop(0, `rgba(${coneCol}, 0.24)`);
    cg.addColorStop(1, `rgba(${coneCol}, 0)`);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(45, -18);
    ctx.lineTo(56 + conePx, -88);
    ctx.lineTo(56 + conePx, 36);
    ctx.closePath();
    ctx.fill();

    // Draw custom player EV
    drawPremiumCar(ctx, 0, 0, v.color, 0.82, p.x * 2.2, v.body);

    // Live Chassis Energy Flow Overlay right inside the car!
    const isRegen = p.regenPowerW > 200;
    const isHeat = p.frictionPowerW > 2000;
    if (isRegen || isHeat || p.action === 'drive') {
      const flowCol = isHeat ? '#ff8e72' : isRegen ? '#75f1bb' : '#47eaff';
      ctx.strokeStyle = flowCol;
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = reduced ? 0 : (isRegen ? 1 : -1) * time * 42;
      ctx.beginPath(); ctx.moveTo(-40, 10); ctx.lineTo(40, 10); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (isHeat) {
      // Glowing hot brake disc ring on front wheel
      ctx.strokeStyle = '#ff6e54';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ff6e54';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(43, 12, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // Floating particles (emerald regen / crimson friction sparks)
    for (const pt of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pt.life / 0.5);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Live AI Thought Bubble above Player Car
    const tCol = state.thought.tone === 'mint' ? '#75f1bb' : state.thought.tone === 'coral' ? '#ff8e8e' : state.thought.tone === 'amber' ? '#f5bc65' : '#47eaff';
    const bText = state.thought.badge;
    ctx.font = '700 12px "Microsoft YaHei", sans-serif';
    const bw = Math.max(170, ctx.measureText(bText).width + 24);
    const bx = Math.max(16, Math.min(984 - bw, playerScreenX - bw * 0.35));
    const by = Math.max(84, playerScreenY - 92);
    roundRect(ctx, bx, by, bw, 28, 8, 'rgba(9, 20, 38, 0.92)', tCol);
    label(ctx, bText, bx + 12, by + 18, 12, tCol, 700);

    // Event banner popup
    if (state.bannerTimer > 0) {
      const bCol = state.bannerTone === 'mint' ? '#75f1bb' : state.bannerTone === 'coral' ? '#ff8e8e' : '#f5bc65';
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.bannerTimer);
      roundRect(ctx, 270, 96, 460, 36, 10, 'rgba(10, 22, 40, 0.94)', bCol);
      ctx.textAlign = 'center';
      label(ctx, state.eventBanner, 500, 119, 14, bCol, 700);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // 7. Top Telemetry HUD Overlay
    roundRect(ctx, 18, 14, 178, 62, 12, 'rgba(9, 18, 35, 0.88)', '#314f6e');
    label(ctx, `${Math.round(p.v * 3.6)}`, 34, 58, 34, isRegen ? '#75f1bb' : isHeat ? '#ff8e72' : '#eef8ff', 800);
    label(ctx, 'km/h', 102, 56, 13, '#8db0ce', 600);
    label(ctx, isRegen ? `⚡ 发电 +${(p.regenPowerW / 1000).toFixed(0)} kW` : isHeat ? '🔥 摩擦盘发热!' : '巡航驱动', 34, 29, 11, isRegen ? '#75f1bb' : isHeat ? '#ff8e72' : '#47eaff', 700);

    roundRect(ctx, 212, 14, 340, 62, 12, 'rgba(9, 18, 35, 0.88)', '#314f6e');
    label(ctx, `${route.name} · ${state.config.control === 'ai' ? `AI (${HORIZON_LABELS[state.config.horizon]})` : '人工接管 PK'}`, 228, 36, 13, '#eef8ff', 700);
    label(ctx, `回收 ${(p.energyRegenJ / 1000).toFixed(1)} kJ  |  摩擦热 ${(p.frictionHeatJ / 1000).toFixed(1)} kJ  |  幽灵热 ${(state.ghost.frictionHeatJ / 1000).toFixed(1)} kJ`, 228, 59, 11, '#a9c8e0');

    roundRect(ctx, 568, 14, 210, 62, 12, 'rgba(9, 18, 35, 0.88)', '#314f6e');
    label(ctx, '能耗对决 · 省电率', 584, 34, 11, '#8fb2cf', 600);
    const sp = p.x > 35 ? energySavingPercent(state) : 0;
    label(ctx, p.x > 35 ? (sp >= 0 ? `领先幽灵车 +${sp}%` : `落后幽灵车 ${sp}%`) : '出发统计中…', 584, 59, 16, sp >= 0 ? '#75f1bb' : '#ff9878', 700);

    roundRect(ctx, 794, 14, 188, 62, 12, 'rgba(9, 18, 35, 0.88)', '#314f6e');
    label(ctx, `得分 ${state.score}`, 810, 38, 16, '#f5bc65', 700);
    label(ctx, `绿波连击 ×${state.combo} · ${Math.min(100, Math.round((p.x / route.length) * 100))}%`, 810, 60, 12, '#9ebad4');

    // 8. Bottom Full-Route High-Def Elevation Mini-Map (y = 434..506)
    roundRect(ctx, 18, 434, 964, 72, 12, 'rgba(8, 17, 34, 0.92)', '#2d4a68');
    label(ctx, '高精地图海拔与 V2X 路口全局概览', 32, 452, 11, '#8fb2cf', 600);
    const mx0 = 36, mw = 928, myBase = 492;
    ctx.strokeStyle = '#3d6386';
    ctx.lineWidth = 2;
    ctx.beginPath();
    route.elevation.forEach((pt, idx) => {
      const ex = mx0 + (pt.x / route.length) * mw;
      const ey = myBase - pt.h * 1.6;
      if (idx === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
    });
    ctx.stroke();

    // Mini-map traffic lights
    for (const l of route.lights) {
      const lx = mx0 + (l.x / route.length) * mw;
      const ls = lightStateAt(l, state.time);
      ctx.fillStyle = ls.color === 'green' ? '#75f1bb' : ls.color === 'amber' ? '#f5bc65' : '#ff6f78';
      ctx.beginPath(); ctx.arc(lx, myBase - elevationAt(route, l.x).height * 1.6 - 7, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Ghost dot & Player dot on mini-map
    const gmx = mx0 + (state.ghost.x / route.length) * mw;
    ctx.fillStyle = '#ff9866';
    ctx.beginPath(); ctx.arc(gmx, myBase - elevationAt(route, state.ghost.x).height * 1.6, 4.5, 0, Math.PI * 2); ctx.fill();

    const pmx = mx0 + (p.x / route.length) * mw;
    ctx.fillStyle = '#75f1bb';
    ctx.shadowColor = '#75f1bb'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(pmx, myBase - elevationAt(route, p.x).height * 1.6, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  const stage = createStage(q('[data-stage]'), {
    width: 1000,
    height: 520,
    label: '智驾预测性能量回收大舞台：横向坡度地形、V2X 红绿灯倒计时、雷达跟车与急刹幽灵车同屏对比。',
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].life += dt;
        particles[i].x += particles[i].vx * dt;
        particles[i].y += particles[i].vy * dt;
        if (particles[i].life >= 0.5) particles.splice(i, 1);
      }

      if (state.phase === 'running' && !state.paused && !document.hidden) {
        accumulator += Math.min(0.08, dt);
        const pedal: ManualPedal = hold.brake ? 'brake' : hold.regen ? 'regen' : hold.accel ? 'accel' : 'coast';
        while (accumulator >= REGEN_AI_DT && state.phase === 'running') {
          accumulator -= REGEN_AI_DT;
          stepRegenAi(state, pedal);
        }

        const p = state.player;
        const route = REGEN_AI_ROUTES[routeIdx];
        const carSy = 338 - elevationAt(route, p.x).height * 7.2 - 16;
        if (p.regenPowerW > 400) spawnParticle(210 + (Math.random() - 0.5) * 40, carSy, '#75f1bb', -50, -35 - Math.random() * 40);
        if (p.frictionPowerW > 2200) spawnParticle(245, carSy + 6, '#ff8666', -70 - Math.random() * 40, -15 - Math.random() * 45);

        const phaseNow: string = state.phase;
        if (phaseNow === 'ended' && !resultShown) showResult();
        updateUI();
      }
    },
    draw,
  });

  // Event listeners
  host.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(b =>
    b.addEventListener('click', () => reset(Number(b.dataset.route)))
  );
  host.querySelectorAll<HTMLButtonElement>('[data-battery]').forEach(b =>
    b.addEventListener('click', () => {
      state.config.battery = b.dataset.battery as RegenBatteryMode;
      reset(routeIdx, state.phase === 'running' ? state.config.control : undefined);
    })
  );
  host.querySelectorAll<HTMLButtonElement>('[data-start]').forEach(b =>
    b.addEventListener('click', () => reset(routeIdx, b.dataset.start as ControlMode))
  );
  host.querySelectorAll<HTMLButtonElement>('[data-horizon]').forEach(b =>
    b.addEventListener('click', () => {
      state.config.horizon = b.dataset.horizon as AiHorizonMode;
      api.playCue?.('boost');
      syncButtons();
      updateUI();
    })
  );
  host.querySelectorAll<HTMLButtonElement>('[data-style]').forEach(b =>
    b.addEventListener('click', () => {
      state.config.regenStyle = b.dataset.style as AiRegenStyle;
      api.playCue?.('boost');
      syncButtons();
      updateUI();
    })
  );
  host.querySelectorAll<HTMLButtonElement>('[data-toggle-control]').forEach(b =>
    b.addEventListener('click', () => {
      state.config.control = state.config.control === 'ai' ? 'manual' : 'ai';
      if (state.config.control === 'ai') aiAssistedRun = true;
      hold.accel = hold.regen = hold.brake = false;
      api.playCue?.('start');
      syncButtons();
      updateUI();
    })
  );
  q('[data-manual-retry]').addEventListener('click', () => reset(routeIdx, 'manual'));
  q('[data-resume]').addEventListener('click', () => { state.paused = false; q('[data-paused]').hidden = true; updateUI(); });
  q('[data-pause]').addEventListener('click', () => {
    if (state.phase !== 'running') return;
    state.paused = !state.paused;
    q('[data-paused]').hidden = !state.paused;
    updateUI();
  });
  host.querySelectorAll<HTMLButtonElement>('[data-restart]').forEach(b =>
    b.addEventListener('click', () => reset(routeIdx, state.config.control))
  );
  q('[data-next]').addEventListener('click', () => reset((routeIdx + 1) % REGEN_AI_ROUTES.length, state.config.control));
  host.querySelectorAll<HTMLButtonElement>('[data-save]').forEach(b =>
    b.addEventListener('click', () => { api.saveImage('regen', stage.capture()); api.notify('已保存智驾回能画面到作品档案！'); })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach(b => {
    const k = b.dataset.hold as keyof typeof hold;
    const set = (v: boolean) => { hold[k] = v; b.classList.toggle('is-active', v); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); set(true); });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointerleave', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (state.phase !== 'running' || state.paused || state.config.control !== 'manual') return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') { e.preventDefault(); hold.accel = true; q('[data-hold="accel"]').classList.add('is-active'); }
    if (k === ' ' || k === 's' || k === 'arrowdown') { e.preventDefault(); hold.regen = true; q('[data-hold="regen"]').classList.add('is-active'); }
    if (k === 'b') { e.preventDefault(); hold.brake = true; q('[data-hold="brake"]').classList.add('is-active'); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') { hold.accel = false; q('[data-hold="accel"]').classList.remove('is-active'); }
    if (k === ' ' || k === 's' || k === 'arrowdown') { hold.regen = false; q('[data-hold="regen"]').classList.remove('is-active'); }
    if (k === 'b') { hold.brake = false; q('[data-hold="brake"]').classList.remove('is-active'); }
  };
  const onBlur = () => { hold.accel = hold.regen = hold.brake = false; if (state.phase === 'running' && !state.paused) { state.paused = true; q('[data-paused]').hidden = false; updateUI(); } };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  reset(0);

  return {
    destroy() {
      stage.destroy();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
