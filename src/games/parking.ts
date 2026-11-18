import { drawPremiumTopCar } from '../car-art';
import { createStage, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import { PARKING_LEVELS } from './parking-levels';
import {
  BOUNDS,
  MAX_STEER,
  SCALE,
  STEP,
  WHEELBASE,
  carCenter,
  carCorners,
  clamp,
  collision,
  createRun,
  integrateBicycle,
  nearestContact,
  parkingQuality,
  stepRun,
  type ParkingLevel,
  type ParkingRun,
  type Point,
  type Pose,
} from './parking-model';
import { drawParkingCar } from './parking-view';
import './arcade-science.css';

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function mountParking(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('parking');
  const bestStars: Record<string, number> =
    typeof saved.bestStars === 'object' && saved.bestStars ? { ...(saved.bestStars as Record<string, number>) } : {};

  let theme = 0;
  let challenge = false;
  let level: ParkingLevel = PARKING_LEVELS[0];
  let pose: Pose = { ...level.start };
  let steer = 0;
  let gear: 1 | -1 = 1;
  let speed = 0;
  let shifts = 0;
  let bumps = 0;
  let distance = 0;
  let timer = 0;
  let holdParked = 0;
  let mode: 'ready' | 'manual' | 'ai' | 'demo-done' | 'won' = 'ready';
  let aiRun: ParkingRun | null = null;
  let aiUsed = false;
  let showGuide = true;
  let bumpFlash = 0;
  let trail: Point[] = [];

  const keys = { up: false, down: false, left: false, right: false };

  const currentLevel = () => PARKING_LEVELS.find(l => l.theme === theme && l.challenge === challenge)!;

  host.innerHTML = `<div class="as-shell" style="--as-accent:#47eaff">
    <div class="as-topbar">
      <div class="as-levels" role="group" aria-label="选择泊车关卡">
        ${[0, 1, 2].map(i => `<button type="button" class="as-level-btn" data-theme="${i}" aria-pressed="${i === 0}"><span>0${i + 1} ${['商场倒库', '街边侧方', '窄位挪车'][i]}</span><b data-star="${i}">☆☆☆</b></button>`).join('')}
      </div>
      <div class="as-top-controls">
        <div class="as-pill-group" role="group" aria-label="切换难度">
          <button type="button" data-diff="0" aria-pressed="true">标准车位</button>
          <button type="button" data-diff="1" aria-pressed="false">极窄挑战</button>
        </div>
        <button type="button" class="btn btn-small" data-ai-demo>🤖 AI 自动泊车（不计分）</button>
        <button type="button" class="btn btn-small" data-reset>复位起点</button>
      </div>
    </div>

    <div class="as-main">
      <div class="as-stage-col">
        <div class="as-stage-wrap">
          <div data-stage></div>
          <div class="as-overlay" data-intro>
            <span class="as-overlay-tag">APA PARKING · 泊车大师</span>
            <h2>亲手把未来车<br>稳稳倒进车位！</h2>
            <p>用 <strong>W / S</strong>（或按钮）控制 D 前进 / R 倒车，用 <strong>A / D</strong> 转动前轮。车身会实时投射<strong>阿克曼轨迹弧线</strong>与<strong>超声波距离雷达</strong>。提示：观看 AI 自动泊车示范仅作教学，<strong>不计分、不计星级</strong>！</p>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-play>🚗 我来亲自泊车（计分）</button>
              <button type="button" class="btn" data-ai-demo>🤖 先看 AI 示范（不计分）</button>
            </div>
          </div>
          <div class="as-overlay" data-result hidden>
            <span class="as-overlay-tag" data-result-tag>PARKED · 精准入位</span>
            <h2 data-result-title>完美入库！</h2>
            <div class="as-overlay-stars" data-result-stars></div>
            <div class="as-overlay-metrics" data-result-metrics></div>
            <div class="as-overlay-science" data-result-science></div>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-next>下一关卡 →</button>
              <button type="button" class="btn" data-play>再泊一次</button>
              <button type="button" class="btn" data-save>保存战绩</button>
            </div>
          </div>
        </div>

        <div class="as-controls-bar" role="group" aria-label="泊车操控踏板">
          <button type="button" class="as-action-btn" data-hold="left">⟲ 左打轮<small>A / ←</small></button>
          <button type="button" class="as-action-btn" data-center>◎ 回正<small>空格</small></button>
          <button type="button" class="as-action-btn" data-hold="right">⟳ 右打轮<small>D / →</small></button>
          <button type="button" class="as-action-btn is-green" data-hold="up">▲ D 档前进<small>按住 · W / ↑</small></button>
          <button type="button" class="as-action-btn is-amber" data-hold="down">▼ R 档倒车<small>按住 · S / ↓</small></button>
        </div>

        <div class="as-status-line">
          <span data-status>按住 W 前进 / S 倒车，A/D 转向，让车身按箭头对齐蓝色 P 车位。</span>
          <div class="as-mini-actions">
            <button type="button" class="btn" data-guide>轨迹线：开</button>
            <button type="button" class="btn" data-save>保存画面</button>
          </div>
        </div>
      </div>

      <aside class="as-sidebar" aria-label="泊车雷达与物理科普">
        <div class="as-card">
          <div class="as-card-head">
            <h3>📡 超声波雷达 & 入位仪</h3>
            <span class="as-badge" data-gear-badge>D 档</span>
          </div>
          <div class="as-stat-grid">
            <div class="as-stat"><span>最近障碍距离</span><strong data-gap style="color:#75f1bb">-- cm</strong></div>
            <div class="as-stat"><span>前轮转角</span><strong data-steer>0°</strong></div>
            <div class="as-stat"><span>车位角度偏差</span><strong data-angle>--°</strong></div>
            <div class="as-stat"><span>换挡 / 刮擦</span><strong data-stats>0 次 / 0 次</strong></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ebad4;margin-bottom:4px">
              <span>入位对准进度</span><strong data-align-pct style="color:#47eaff">0%</strong>
            </div>
            <div class="as-meter"><i data-align-bar></i></div>
          </div>
          <label style="font-size:11px;color:#9ebad4;display:grid;gap:4px">
            <span>精细方向盘微调（拖动）</span>
            <input type="range" min="-100" max="100" value="0" data-wheel-slider style="accent-color:#47eaff">
          </label>
        </div>

        <div class="as-card">
          <div class="as-card-head">
            <h3>🧭 泊车科学密码</h3>
            <span class="as-badge">阿克曼转向</span>
          </div>
          <p class="as-science-tip" data-level-hint></p>
          <p class="as-science-tip" style="--as-accent:#f5bc65">
            <strong>为什么老司机都「倒着入库」？</strong><br>
            汽车靠<strong>前轮</strong>转向，后轮不会左右摆动。倒车时后轮先找准车位，前轮在宽敞通道里大角度扫弧，所需转弯空间比车头扎入小得多！
          </p>
        </div>
      </aside>
    </div>
  </div>`;

  const q = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s)!;

  function refreshStars() {
    [0, 1, 2].forEach(t => {
      const s1 = bestStars[`${['garage', 'parallel', 'alley'][t]}-standard`] || 0;
      const s2 = bestStars[`${['garage', 'parallel', 'alley'][t]}-tight`] || 0;
      q(`[data-star="${t}"]`).textContent = starText(Math.max(s1, s2));
    });
  }

  function reset(nextTheme = theme, nextChallenge = challenge, startImmediately = false) {
    theme = nextTheme;
    challenge = nextChallenge;
    level = currentLevel();
    pose = { ...level.start };
    steer = 0;
    gear = 1;
    speed = 0;
    shifts = 0;
    bumps = 0;
    distance = 0;
    timer = 0;
    holdParked = 0;
    aiRun = null;
    aiUsed = false;
    bumpFlash = 0;
    trail = [carCenter(pose)];
    keys.up = keys.down = keys.left = keys.right = false;
    mode = startImmediately ? 'manual' : 'ready';
    q('[data-intro]').hidden = startImmediately;
    q('[data-result]').hidden = true;
    host.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.theme) === theme)));
    host.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.diff === '1') === challenge)));
    q('[data-level-hint]').innerHTML = `<strong>${level.name}秘籍：</strong>${level.hint}`;
    q('[data-status]').textContent = startImmediately ? `已进入「${level.name}」，请稳稳把车停进发光 P 框！` : level.hint;
    refreshStars();
    updateUI();
  }

  function startAiDemo() {
    reset(theme, challenge, true);
    aiUsed = true;
    mode = 'ai';
    aiRun = createRun(level.start, level.reference, true);
    q('[data-status]').textContent = '🤖 APA 自动泊车示范中（AI 辅助模式不计分、不计星级）——观察前轮大角度倒车轨迹！';
    api.playCue?.('start');
    updateUI();
  }

  function finishAiDemo() {
    mode = 'demo-done';
    speed = 0;
    aiRun = null;
    const quality = parkingQuality(pose, level, 0);
    q('[data-result-tag]').textContent = 'APA DEMO · AI 辅助演示（不计分）';
    q('[data-result-title]').textContent = '🤖 AI 自动泊车示范完成（不计分）';
    q('[data-result-stars]').textContent = '☆☆☆';
    q('[data-result-metrics]').innerHTML = `
      <span>本次得分<strong style="color:#ff9e78">0 分（AI 辅助）</strong></span>
      <span>AI 入位精度<strong>${quality.precise ? '特级精停' : `偏差 ${(quality.offset / SCALE * 100).toFixed(0)} cm`}</strong></span>
      <span>AI 示范状态<strong style="color:#47eaff">仅教学演示</strong></span>
    `;
    q('[data-result-science]').innerHTML = `⚠️ <strong>无积分提示：</strong>本趟由 <strong>AI APA 自动泊车</strong>辅助完成，仅作阿克曼轨迹教学演示，<strong>不获得积分与星级</strong>。请点击「再泊一次」复位起点，亲自掌舵倒车入库赢取三星与积分！`;
    q('[data-result]').hidden = false;
    q('[data-status]').textContent = '🤖 AI 自动泊车示范完成（不计分）！点击「复位起点」亲自驾驶即可拿分！';
    api.playCue?.('boost');
  }

  function finishManualWin() {
    if (aiUsed) {
      finishAiDemo();
      return;
    }
    mode = 'won';
    speed = 0;
    const quality = parkingQuality(pose, level, 0);
    const stars = bumps === 0 && (quality.precise || shifts <= level.maxShifts + 1) ? 3 : bumps <= 1 ? 2 : 1;
    bestStars[level.id] = Math.max(bestStars[level.id] || 0, stars);
    refreshStars();

    q('[data-result-tag]').textContent = 'PARKED · 亲手精准入位';
    q('[data-result-title]').textContent = stars === 3 ? '🏆 完美零刮擦入库！' : '🎉 成功停入车位！';
    q('[data-result-stars]').textContent = starText(stars);
    q('[data-result-metrics]').innerHTML = `
      <span>精准度<strong>${quality.precise ? '特级精停' : `偏差 ${(quality.offset / SCALE * 100).toFixed(0)} cm`}</strong></span>
      <span>换挡次数<strong>${shifts} 次</strong></span>
      <span>刮擦提醒<strong>${bumps} 次</strong></span>
      <span>用时<strong>${timer.toFixed(1)} s</strong></span>
    `;
    q('[data-result-science]').innerHTML = `💡 <strong>阿克曼转向揭秘：</strong>${level.question} 在「${level.name}」里，你通过 <strong>${shifts} 次换挡</strong>调整前轮转角，利用后轴最小转弯半径避开了所有障碍！`;
    q('[data-result]').hidden = false;
    api.playCue?.('reward');

    api.award('parking', `level-${level.id}`, Math.max(25, stars * 15), `完成${level.name}泊车`);
    api.complete('parking');
    api.record('parking', {
      bestStars,
      summary: `在「${level.name}」亲手泊车入位，换挡 ${shifts} 次、零刮擦=${bumps === 0 ? '是' : '否'}，获得 ${stars} 星。`,
      report: [
        { label: '完成关卡', value: `${level.name}（${challenge ? '极窄挑战' : '标准车位'}）` },
        { label: '星级 / 精准度', value: `${stars} 星 · 中心偏差 ${(quality.offset / SCALE * 100).toFixed(0)} cm` },
        { label: '换挡 / 刮擦 / 用时', value: `${shifts} 次 / ${bumps} 次 / ${timer.toFixed(1)} s` },
      ],
    });
    api.saveImage('parking', stage.capture());
  }

  function updateUI() {
    const contact = nearestContact(pose, level);
    const gapCm = Math.max(0, Math.round((contact.gap / SCALE) * 100));
    const quality = parkingQuality(pose, level, 0);
    const angleDeg = Math.round((quality.heading * 180) / Math.PI);
    const distToBay = Math.hypot(carCenter(pose).x - level.bay.x, carCenter(pose).y - level.bay.y);
    const alignPct = quality.inside
      ? Math.max(75, Math.min(100, Math.round(100 - angleDeg * 2.5)))
      : Math.max(0, Math.min(72, Math.round((1 - distToBay / 460) * 72)));

    const gapEl = q('[data-gap]');
    gapEl.textContent = `${gapCm} cm`;
    gapEl.style.color = gapCm < 35 ? '#ff7c7c' : gapCm < 80 ? '#f5bc65' : '#75f1bb';
    q('[data-steer]').textContent = `${Math.round((steer * 180) / Math.PI)}°`;
    q('[data-angle]').textContent = `${angleDeg}°`;
    q('[data-stats]').textContent = `${shifts} 次 / ${bumps} 次`;
    q('[data-gear-badge]').textContent = mode === 'ai' ? '🤖 APA 智驾' : gear === 1 ? 'D 前进档' : 'R 倒车档';
    q('[data-align-pct]').textContent = quality.parked ? '100% 已停正!' : `${alignPct}%`;
    q<HTMLElement>('[data-align-bar]').style.width = `${quality.parked ? 100 : alignPct}%`;
    const slider = q<HTMLInputElement>('[data-wheel-slider]');
    if (document.activeElement !== slider) slider.value = String(Math.round((steer / MAX_STEER) * 100));
  }

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    // Deep cyber parking lot backdrop
    ctx.fillStyle = '#070f1f';
    ctx.fillRect(0, 0, 1000, 560);
    const bg = ctx.createLinearGradient(0, 0, 1000, 560);
    bg.addColorStop(0, '#0f2036');
    bg.addColorStop(1, '#101a2e');
    roundRect(ctx, BOUNDS.left, BOUNDS.top, BOUNDS.right - BOUNDS.left, BOUNDS.bottom - BOUNDS.top, 14, bg as unknown as string, '#335270');

    // Subtle blueprint grid
    ctx.strokeStyle = 'rgba(71, 234, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 68; x < 960; x += 40) { ctx.beginPath(); ctx.moveTo(x, 48); ctx.lineTo(x, 516); ctx.stroke(); }
    for (let y = 86; y < 516; y += 40) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(970, y); ctx.stroke(); }

    // Lane centerline
    ctx.setLineDash([14, 14]);
    ctx.strokeStyle = 'rgba(130, 175, 205, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(56, 256); ctx.lineTo(level.theme === 2 ? 360 : 930, 256); ctx.stroke();
    ctx.setLineDash([]);

    // Top bar labels
    label(ctx, `P / ${level.name} · ${challenge ? '极窄挑战' : '标准车位'}`, 34, 30, 14, '#47eaff', 700);
    label(ctx, mode === 'ai' ? '🤖 APA 智驾自动规划执行中' : '实时阿克曼前轮转向 + 360° 超声波雷达', 705, 30, 12, '#95b8d4');

    // Parked obstacles
    for (const o of level.obstacles) {
      if (o.kind === 'car') {
        roundRect(ctx, o.x - o.w / 2 - 5, o.y - o.h / 2 - 5, o.w + 10, o.h + 10, 6, 'rgba(18, 34, 54, 0.5)', '#456480');
        ctx.save();
        ctx.translate(o.x, o.y);
        if (o.h > o.w) ctx.rotate(Math.PI / 2);
        ctx.scale(Math.max(o.w, o.h) / 92, Math.min(o.w, o.h) / 48);
        drawPremiumTopCar(ctx, 0, 0, '#728aa6', 1, 'touring');
        ctx.restore();
      } else if (o.kind === 'pillar') {
        roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 5, '#593b2e', '#f5bc65');
        ctx.strokeStyle = '#f5bc65';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(o.x - o.w / 2 + 4, o.y + o.h / 2 - 4);
        ctx.lineTo(o.x + o.w / 2 - 4, o.y - o.h / 2 + 4);
        ctx.stroke();
      } else {
        roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 6, '#1a363e', '#4f827c');
        for (let gx = o.x - o.w / 2 + 16; gx < o.x + o.w / 2 - 10; gx += 26) {
          ctx.fillStyle = '#386d64';
          ctx.beginPath(); ctx.arc(gx, o.y, 7, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Target glowing parking bay
    const bay = level.bay;
    const quality = parkingQuality(pose, level, 0);
    const bayColor = quality.parked ? '#75f1bb' : quality.inside ? '#f5bc65' : '#47eaff';
    ctx.save();
    ctx.translate(bay.x, bay.y);
    ctx.rotate(bay.angle || 0);
    roundRect(ctx, -bay.w / 2, -bay.h / 2, bay.w, bay.h, 6, quality.parked ? 'rgba(117,241,187,0.22)' : 'rgba(71,234,255,0.08)', bayColor);
    // Corner neon L-brackets
    ctx.strokeStyle = bayColor;
    ctx.lineWidth = 4;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * (bay.w / 2 - 14), sy * (bay.h / 2));
        ctx.lineTo(sx * (bay.w / 2), sy * (bay.h / 2));
        ctx.lineTo(sx * (bay.w / 2), sy * (bay.h / 2 - 14));
        ctx.stroke();
      }
    }
    ctx.textAlign = 'center';
    label(ctx, quality.parked ? '✓' : 'P', 0, 7, 22, bayColor, 800);
    // Front arrow inside bay
    ctx.strokeStyle = bayColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bay.w / 2 - 16, -7);
    ctx.lineTo(bay.w / 2 - 6, 0);
    ctx.lineTo(bay.w / 2 - 16, 7);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.restore();

    // Driven trail
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(117, 241, 187, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      trail.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Real-time Ackermann trajectory prediction ribbons + ICR center
    if (showGuide && mode !== 'won') {
      const activeGear = mode === 'ai' && aiRun ? aiRun.gear : gear;
      const activeSteer = mode === 'ai' && aiRun ? aiRun.steer : steer;
      const guideColor = activeGear === 1 ? '#47eaff' : '#f5bc65';
      const steps = 16;
      const leftTrack: Point[] = [];
      const rightTrack: Point[] = [];
      let sim: Pose = { ...pose };
      for (let i = 0; i <= steps; i++) {
        const cs = carCorners(sim);
        // Front corners if D, rear corners if R
        leftTrack.push(activeGear === 1 ? cs[1] : cs[0]);
        rightTrack.push(activeGear === 1 ? cs[2] : cs[3]);
        sim = integrateBicycle(sim, activeGear * 9, activeSteer, 1);
      }
      ctx.save();
      ctx.strokeStyle = guideColor;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.65;
      ctx.setLineDash([6, 6]);
      for (const pts of [leftTrack, rightTrack]) {
        ctx.beginPath();
        pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Draw subtle Instantaneous Center of Rotation (ICR) when steering sharply
      if (Math.abs(activeSteer) > 0.14) {
        const radius = WHEELBASE / Math.tan(activeSteer);
        if (Math.abs(radius) < 340) {
          const icrX = pose.x - Math.sin(pose.angle) * radius;
          const icrY = pose.y + Math.cos(pose.angle) * radius;
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#bc98ff';
          ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.moveTo(pose.x, pose.y); ctx.lineTo(icrX, icrY); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#bc98ff';
          ctx.beginPath(); ctx.arc(icrX, icrY, 4.5, 0, Math.PI * 2); ctx.fill();
          label(ctx, '转弯圆心', icrX + 8, icrY + 4, 10, '#d7c4ff');
        }
      }
      ctx.restore();
    }

    // 360° Ultrasonic sonar wave pulse + nearest obstacle laser
    const contact = nearestContact(pose, level);
    const gapCm = Math.round((contact.gap / SCALE) * 100);
    const sonarColor = gapCm < 35 ? '#ff6f6f' : gapCm < 80 ? '#f5bc65' : '#47eaff';
    const center = carCenter(pose);
    if (!api.reducedMotion() && (mode === 'ai' || gapCm < 120)) {
      const pulse = (time * (mode === 'ai' ? 1.5 : 1.1)) % 1;
      ctx.save();
      ctx.strokeStyle = sonarColor;
      ctx.globalAlpha = (1 - pulse) * 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 44 + pulse * 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (gapCm < 110) {
      ctx.save();
      ctx.strokeStyle = sonarColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(contact.carPoint.x, contact.carPoint.y);
      ctx.lineTo(contact.point.x, contact.point.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = sonarColor;
      ctx.beginPath(); ctx.arc(contact.point.x, contact.point.y, 4.5, 0, Math.PI * 2); ctx.fill();
      label(ctx, `${gapCm} cm`, (contact.carPoint.x + contact.point.x) / 2 + 6, (contact.carPoint.y + contact.point.y) / 2 - 6, 12, sonarColor, 700);
      ctx.restore();
    }

    // Player EV
    const v = api.getVehicle();
    drawParkingCar(ctx, pose, bumpFlash > 0 ? '#ff8484' : v.color, v.body, mode === 'ai' && aiRun ? aiRun.steer : steer, false);

    // Bottom legend
    label(ctx, '青色弧线 = 前进预测轨迹   ·   橙色弧线 = 倒车预测轨迹   ·   按住 W / S 移动，A / D 打方向', 34, 545, 12, '#8eb2cf');
  }

  const stage = createStage(q('[data-stage]'), {
    width: 1000,
    height: 560,
    label: '实时阿克曼泊车场地：支持亲手驾驶与 APA 自动泊车演示。',
    update(dt) {
      if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - dt);

      if (mode === 'ai' && aiRun) {
        aiRun.accumulator += Math.min(0.08, dt) * 1.45;
        while (aiRun.accumulator >= STEP && aiRun.status === 'moving') {
          aiRun.accumulator -= STEP;
          stepRun(aiRun, level, true);
        }
        pose = { ...aiRun.pose };
        steer = aiRun.steer;
        gear = aiRun.gear;
        const c = carCenter(pose);
        if (trail.length === 0 || Math.hypot(c.x - trail.at(-1)!.x, c.y - trail.at(-1)!.y) > 8) trail.push(c);
        if (aiRun.status !== 'moving') {
          finishAiDemo();
        }
        updateUI();
        return;
      }

      if (mode !== 'manual') return;
      timer += dt;

      // Smooth front wheel steering
      const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (steerInput !== 0) {
        steer = clamp(steer + steerInput * 1.65 * dt, -MAX_STEER, MAX_STEER);
      }

      // Smooth forward / reverse throttle
      const driveInput = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
      if (driveInput !== 0) {
        const nextGear: 1 | -1 = driveInput > 0 ? 1 : -1;
        if (nextGear !== gear && distance > 8) {
          shifts++;
          gear = nextGear;
        } else {
          gear = nextGear;
        }
        speed += (driveInput * 115 - speed) * Math.min(1, dt * 8);
      } else {
        speed *= Math.max(0, 1 - dt * 11);
        if (Math.abs(speed) < 1.5) speed = 0;
      }

      if (Math.abs(speed) > 0.2) {
        const nextPose = integrateBicycle(pose, speed, steer, dt);
        if (collision(nextPose, level)) {
          // Gentle safety bounce & bump counter
          if (bumpFlash <= 0) {
            bumps++;
            bumpFlash = 0.55;
            api.playCue?.('hit');
            q('[data-status]').textContent = '⚠️ 雷达防撞触发！稍微反向挪一点再打方向。';
          }
          speed = -Math.sign(speed) * 18;
        } else {
          distance += Math.abs(speed * dt);
          pose = nextPose;
          const c = carCenter(pose);
          if (trail.length === 0 || Math.hypot(c.x - trail.at(-1)!.x, c.y - trail.at(-1)!.y) > 8) {
            trail.push(c);
            if (trail.length > 260) trail.shift();
          }
        }
      }

      // Check parking win (all 4 corners inside bay, heading <= 10°, nearly stopped)
      const quality = parkingQuality(pose, level, Math.abs(speed) < 8 ? 0 : speed);
      if (quality.parked) {
        holdParked += dt;
        if (holdParked >= 0.25) finishManualWin();
      } else {
        holdParked = 0;
      }

      updateUI();
    },
    draw,
  });

  // Event bindings
  host.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(b =>
    b.addEventListener('click', () => reset(Number(b.dataset.theme), challenge, true))
  );
  host.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(b =>
    b.addEventListener('click', () => reset(theme, b.dataset.diff === '1', true))
  );
  host.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(b =>
    b.addEventListener('click', () => { reset(theme, challenge, true); api.playCue?.('start'); })
  );
  host.querySelectorAll<HTMLButtonElement>('[data-ai-demo]').forEach(b =>
    b.addEventListener('click', startAiDemo)
  );
  q('[data-reset]').addEventListener('click', () => reset(theme, challenge, true));
  q('[data-next]').addEventListener('click', () => reset((theme + 1) % 3, challenge, true));
  q('[data-center]').addEventListener('click', () => { steer = 0; updateUI(); });
  q('[data-guide]').addEventListener('click', () => {
    showGuide = !showGuide;
    q('[data-guide]').textContent = `轨迹线：${showGuide ? '开' : '关'}`;
  });
  q<HTMLInputElement>('[data-wheel-slider]').addEventListener('input', e => {
    steer = (Number((e.target as HTMLInputElement).value) / 100) * MAX_STEER;
    updateUI();
  });
  host.querySelectorAll<HTMLButtonElement>('[data-save]').forEach(b =>
    b.addEventListener('click', () => { api.saveImage('parking', stage.capture()); api.notify('已保存泊车画面到作品档案！'); })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach(b => {
    const key = b.dataset.hold as keyof typeof keys;
    const set = (v: boolean) => {
      if (v && mode === 'ready') reset(theme, challenge, true);
      if (v && mode === 'ai') { mode = 'manual'; aiRun = null; }
      keys[key] = v;
      b.classList.toggle('is-active', v);
    };
    b.addEventListener('pointerdown', e => { e.preventDefault(); set(true); });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointerleave', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (!['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) return;
    if (mode === 'ready') reset(theme, challenge, true);
    if (mode === 'ai') { mode = 'manual'; aiRun = null; }
    if (mode !== 'manual') return;
    e.preventDefault();
    if (k === 'w' || k === 'arrowup') { keys.up = true; q('[data-hold="up"]').classList.add('is-active'); }
    if (k === 's' || k === 'arrowdown') { keys.down = true; q('[data-hold="down"]').classList.add('is-active'); }
    if (k === 'a' || k === 'arrowleft') { keys.left = true; q('[data-hold="left"]').classList.add('is-active'); }
    if (k === 'd' || k === 'arrowright') { keys.right = true; q('[data-hold="right"]').classList.add('is-active'); }
    if (k === ' ') { steer = 0; updateUI(); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') { keys.up = false; q('[data-hold="up"]').classList.remove('is-active'); }
    if (k === 's' || k === 'arrowdown') { keys.down = false; q('[data-hold="down"]').classList.remove('is-active'); }
    if (k === 'a' || k === 'arrowleft') { keys.left = false; q('[data-hold="left"]').classList.remove('is-active'); }
    if (k === 'd' || k === 'arrowright') { keys.right = false; q('[data-hold="right"]').classList.remove('is-active'); }
  };
  const onBlur = () => { keys.up = keys.down = keys.left = keys.right = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  reset(0, false, false);

  return {
    destroy() {
      stage.destroy();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
