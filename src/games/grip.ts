import { drawPremiumTopCar } from '../car-art';
import { createStage, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import {
  GRIP_RACE_DT,
  RACE_TIRES,
  RAIN_COURSES,
  ROAD_HALF_WIDTH,
  createGripRace,
  rainAdvice,
  rainFriction,
  rainRoad,
  rainStars,
  rainTimeLimit,
  rescueGripRace,
  stepGripRace,
  type GripRace,
  type RaceTire,
} from './grip-race-model';
import './arcade-science.css';

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

const TIRE_INFO: Record<RaceTire, { label: string; tip: string }> = {
  rain: { label: '🌧️ 排水雨天胎', tip: '深导水沟槽迅速排开路面积水，摩擦圆最大，弯中抓地力最稳！' },
  standard: { label: '⚡ 日常全季胎', tip: '综合均衡；进急弯或积水前记得先点刹车减速再转向！' },
  worn: { label: '🏎️ 磨损光头胎', tip: '花纹磨平无法排水，一遇湿路和积水摩擦圆骤缩，极易推头侧滑！' },
};

interface Spray {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function mountGrip(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('grip');
  const bestStars: number[] = Array.isArray(saved.bestStars)
    ? [0, 1, 2].map(i => Number((saved.bestStars as unknown[])[i]) || 0)
    : [0, 0, 0];

  let course = 0;
  let tire: RaceTire = 'rain';
  let seed = 1;
  let state: GripRace = createGripRace(course, seed, tire);
  let accumulator = 0;
  let resultShown = false;
  let lastStars = 0;
  let lastCorners = 0;
  let flashText = '';
  let flashColor = '#47eaff';
  let flashTimer = 0;
  const sprays: Spray[] = [];
  const hold = { left: false, right: false, brake: false, accel: false };

  host.innerHTML = `<div class="as-shell" style="--as-accent:#47eaff">
    <div class="as-topbar">
      <div class="as-levels" role="group" aria-label="选择雨夜赛道">
        ${RAIN_COURSES.map((c, i) => `<button type="button" class="as-level-btn" data-course="${i}" aria-pressed="${i === 0}"><span>0${i + 1} ${c.name}</span><b data-star="${i}">${starText(bestStars[i])}</b></button>`).join('')}
      </div>
      <div class="as-top-controls">
        <div class="as-pill-group" role="group" aria-label="赛前更换轮胎（对比摩擦力）">
          ${(['rain', 'standard', 'worn'] as RaceTire[]).map(t => `<button type="button" data-tire="${t}" aria-pressed="${t === 'rain'}">${TIRE_INFO[t].label}</button>`).join('')}
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
            <span class="as-overlay-tag">RAIN GRIP · 轮胎摩擦圆挑战</span>
            <h2>暴雨盘山夜，<br>守住你的摩擦圆！</h2>
            <p>车辆巡航前进，按 <strong>A / D（← / →）</strong> 避开蓝色积水并吃下金星；看到弯道标牌时<strong>先按住刹车减速</strong>，再轻打方向优雅过弯！盯紧右侧<strong>实时轮胎摩擦圆</strong>，千万别让光点冲出圆外！</p>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-start>🌧️ 雨夜发车 ↗</button>
            </div>
          </div>
          <div class="as-overlay" data-paused hidden>
            <span class="as-overlay-tag">PAUSED</span>
            <h2>雨中稍歇</h2>
            <p>车辆速度、抓地力与计时已暂停。</p>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-resume>继续护航 →</button>
              <button type="button" class="btn" data-restart>重新发车</button>
            </div>
          </div>
          <div class="as-overlay" data-result hidden>
            <span class="as-overlay-tag">FINISH · 雨夜战绩</span>
            <h2 data-result-title>暴雨护航抵达！</h2>
            <div class="as-overlay-stars" data-result-stars></div>
            <div class="as-overlay-metrics" data-result-metrics></div>
            <div class="as-overlay-science" data-result-science></div>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-again>换路况再来一趟 ↗</button>
              <button type="button" class="btn" data-next>下一条暴雨赛道 →</button>
              <button type="button" class="btn" data-save>保存战绩</button>
            </div>
          </div>
        </div>

        <div class="as-controls-bar" role="group" aria-label="雨夜驾驶控制">
          <button type="button" class="as-action-btn" data-hold="left">← 向左避让<small>A / ←</small></button>
          <button type="button" class="as-action-btn" data-hold="right">→ 向右避让<small>D / →</small></button>
          <button type="button" class="as-action-btn is-amber" data-hold="brake">🛑 弯前减速<small>按住 · 空格 / ↓</small></button>
          <button type="button" class="as-action-btn is-green" data-hold="accel">⚡ 直道加速<small>按住 · W / ↑</small></button>
          <button type="button" class="as-action-btn" data-rescue>🛟 救援回道<small>滑出时可回位</small></button>
        </div>

        <div class="as-status-line">
          <span data-status>绕开反光积水、弯前先减速再转向，保持连击拿三星！</span>
          <div class="as-mini-actions">
            <button type="button" class="btn" data-save>保存画面</button>
          </div>
        </div>
      </div>

      <aside class="as-sidebar" aria-label="实时轮胎摩擦圆仪表">
        <div class="as-card">
          <div class="as-card-head">
            <h3>🎯 实时轮胎摩擦圆</h3>
            <span class="as-badge" data-grip-badge>抓地充足</span>
          </div>
          <canvas class="as-friction-canvas" data-friction-canvas width="220" height="220" aria-label="实时轮胎摩擦圆示意图"></canvas>
          <div class="as-stat-grid">
            <div class="as-stat"><span>摩擦系数 μ</span><strong data-mu style="color:#47eaff">0.55</strong></div>
            <div class="as-stat"><span>弯前建议车速</span><strong data-advice style="color:#75f1bb">25 km/h</strong></div>
            <div class="as-stat"><span>完美过弯 / 连击</span><strong data-perfect style="color:#f5bc65">0 · ×0</strong></div>
            <div class="as-stat"><span>收集护航星</span><strong data-stars-col>0 / 0</strong></div>
          </div>
        </div>

        <div class="as-card">
          <div class="as-card-head">
            <h3>🔬 摩擦圆驾驶奥秘</h3>
            <span class="as-badge" data-tire-badge>排水雨天胎</span>
          </div>
          <p class="as-science-tip" data-science-tip></p>
          <p class="as-science-tip" style="--as-accent:#f5bc65">
            <strong>为什么不能「边急刹边猛打方向」？</strong><br>
            轮胎的总摩擦力是一个圆：刹车占掉纵向抓地力后，留给转向的横向抓地力就变小了！<strong>直道先减速 → 入弯轻转向</strong>最稳！
          </p>
        </div>
      </aside>
    </div>
  </div>`;

  const q = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const fCanvas = q<HTMLCanvasElement>('[data-friction-canvas]');
  const fCtx = fCanvas.getContext('2d')!;

  function popFlash(text: string, color: string) {
    flashText = text;
    flashColor = color;
    flashTimer = 1.3;
  }

  function drawFrictionCircle() {
    const w = 220, h = 220, cx = 110, cy = 110;
    fCtx.clearRect(0, 0, w, h);
    fCtx.fillStyle = '#071122';
    fCtx.fillRect(0, 0, w, h);

    // Axes
    fCtx.strokeStyle = 'rgba(130, 175, 210, 0.25)';
    fCtx.lineWidth = 1;
    fCtx.beginPath();
    fCtx.moveTo(cx, 18); fCtx.lineTo(cx, h - 18);
    fCtx.moveTo(18, cy); fCtx.lineTo(w - 18, cy);
    fCtx.stroke();

    // Axis labels
    fCtx.font = '600 10px "Microsoft YaHei", sans-serif';
    fCtx.fillStyle = '#7fa0be';
    fCtx.textAlign = 'center';
    fCtx.fillText('加速 ▲', cx, 14);
    fCtx.fillText('▼ 刹车', cx, h - 6);
    fCtx.textAlign = 'left';
    fCtx.fillText('左转', 6, cy - 4);
    fCtx.textAlign = 'right';
    fCtx.fillText('右转', w - 6, cy - 4);
    fCtx.textAlign = 'left';

    // Dry road reference circle (outer dashed)
    const maxR = 80;
    fCtx.strokeStyle = 'rgba(120, 165, 200, 0.28)';
    fCtx.setLineDash([4, 4]);
    fCtx.beginPath(); fCtx.arc(cx, cy, maxR, 0, Math.PI * 2); fCtx.stroke();
    fCtx.setLineDash([]);

    // Current live available grip circle (scales physically with mu!)
    const mu = state.mu || rainFriction(state);
    const liveR = Math.max(22, Math.min(maxR, (mu / 0.9) * maxR));
    const slipping = state.slip > 0.22;
    const circleCol = slipping ? '#ff7676' : state.gripUse > 0.8 ? '#f5bc65' : '#47eaff';

    fCtx.fillStyle = slipping ? 'rgba(255, 118, 118, 0.14)' : 'rgba(71, 234, 255, 0.12)';
    fCtx.strokeStyle = circleCol;
    fCtx.lineWidth = 2.4;
    fCtx.beginPath(); fCtx.arc(cx, cy, liveR, 0, Math.PI * 2); fCtx.fill(); fCtx.stroke();

    // Compute live longitudinal & lateral force demand vector
    const road = rainRoad(state.course, state.progress);
    const latForce = state.speed * state.speed * road.curvature + state.steer * 1.9;
    const lonForce = state.braking ? 3.8 : state.accelerating ? -2.2 : -0.4;
    const totalLimit = Math.max(0.5, mu * 9.81);
    const vx = Math.max(-88, Math.min(88, (latForce / totalLimit) * liveR));
    const vy = Math.max(-88, Math.min(88, (lonForce / totalLimit) * liveR));

    // Vector arrow from center to current tire load
    fCtx.strokeStyle = slipping ? '#ff8282' : '#75f1bb';
    fCtx.lineWidth = 2.5;
    fCtx.beginPath(); fCtx.moveTo(cx, cy); fCtx.lineTo(cx + vx, cy + vy); fCtx.stroke();

    fCtx.fillStyle = slipping ? '#ff6464' : '#75f1bb';
    fCtx.shadowColor = slipping ? '#ff6464' : '#75f1bb';
    fCtx.shadowBlur = 10;
    fCtx.beginPath(); fCtx.arc(cx + vx, cy + vy, 6, 0, Math.PI * 2); fCtx.fill();
    fCtx.shadowBlur = 0;
  }

  function reset(nextCourse = course, nextTire = tire, bumpSeed = false, startNow = false) {
    course = nextCourse;
    tire = nextTire;
    if (bumpSeed) seed++;
    state = createGripRace(course, seed, tire);
    state.mu = rainFriction(state);
    accumulator = 0;
    resultShown = false;
    lastStars = 0;
    lastCorners = 0;
    sprays.length = 0;
    hold.left = hold.right = hold.brake = hold.accel = false;
    if (startNow) state.phase = 'running';
    q('[data-intro]').hidden = startNow;
    q('[data-paused]').hidden = true;
    q('[data-result]').hidden = true;
    q<HTMLButtonElement>('[data-pause]').disabled = !startNow;
    host.querySelectorAll<HTMLButtonElement>('[data-course]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.course) === course)));
    host.querySelectorAll<HTMLButtonElement>('[data-tire]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tire === tire)));
    updateUI();
  }

  function showResult() {
    resultShown = true;
    const stars = rainStars(state);
    bestStars[course] = Math.max(bestStars[course], stars);
    q(`[data-star="${course}"]`).textContent = starText(bestStars[course]);
    const totalStarItems = state.items.filter(e => e.kind === 'star').length;
    const won = state.phase === 'complete';

    q('[data-result-title]').textContent = stars === 3 ? '🏆 雨夜贴弯车神！三星通关' : won ? '🌧️ 暴雨护航成功抵达！' : '⚠️ 冲出赛道，调低入弯速度再战';
    q('[data-result-stars]').textContent = starText(stars);
    q('[data-result-metrics]').innerHTML = `
      <span>本趟得分<strong style="color:#f5bc65">${state.score}</strong></span>
      <span>完美过弯<strong style="color:#75f1bb">${state.perfectCorners} / ${state.corners.length}</strong></span>
      <span>护航星<strong>${state.starsCollected} / ${totalStarItems}</strong></span>
      <span>累计打滑<strong>${state.slipTime.toFixed(1)} s</strong></span>
    `;
    q('[data-result-science]').innerHTML = `💡 <strong>摩擦圆实测结论（${TIRE_INFO[tire].label}）：</strong>在湿滑度 ${Math.round(RAIN_COURSES[course].wet * 100)}% 的「${RAIN_COURSES[course].name}」中，你的累计侧滑时间为 <strong>${state.slipTime.toFixed(1)} 秒</strong>。试试把轮胎换成「${tire === 'worn' ? '排水雨天胎' : '磨损光头胎'}」跑同一条赛道，感受摩擦圆大小的变化！`;
    q('[data-result]').hidden = false;
    q<HTMLButtonElement>('[data-pause]').disabled = true;
    api.playCue?.(won ? 'reward' : 'hit');

    if (won || state.progress > RAIN_COURSES[course].length * 0.4) {
      api.award('grip', `course-${course}`, Math.max(25, stars * 14), `完成${RAIN_COURSES[course].name}`);
      if (tire !== 'rain') api.award('grip', 'tire-compare', 20, '对比不同轮胎雨天抓地力');
      api.complete('grip');
    }
    api.record('grip', {
      bestStars,
      summary: `使用${TIRE_INFO[tire].label}跑完「${RAIN_COURSES[course].name}」，完美过弯 ${state.perfectCorners} 次、收集 ${state.starsCollected} 颗星，获 ${stars} 星。`,
      report: [
        { label: '挑战赛道 / 轮胎', value: `${RAIN_COURSES[course].name} · ${TIRE_INFO[tire].label}` },
        { label: '星级 / 完美过弯', value: `${stars} 星 · ${state.perfectCorners}/${state.corners.length} 弯` },
        { label: '打滑时长 / 得分', value: `${state.slipTime.toFixed(1)} s · ${state.score} 分` },
      ],
    });
    api.saveImage('grip', stage.capture());
  }

  function updateUI() {
    const mu = state.mu || rainFriction(state);
    const adviceKmh = Math.round(rainAdvice(state) * 3.6);
    const totalStars = state.items.filter(e => e.kind === 'star').length;
    const inPuddle = state.items.some(e => e.kind === 'puddle' && Math.abs(e.at - state.progress) < 8 && Math.abs(e.offset - state.offset) < 1.55);

    q('[data-mu]').textContent = mu.toFixed(2);
    q('[data-advice]').textContent = `${adviceKmh} km/h`;
    q('[data-perfect]').textContent = `${state.perfectCorners} · ×${state.combo}`;
    q('[data-stars-col]').textContent = `${state.starsCollected} / ${totalStars}`;
    q('[data-tire-badge]').textContent = RACE_TIRES[tire].name;
    q('[data-grip-badge]').textContent = state.slip > 0.25 ? '⚠️ 打滑失控!' : inPuddle ? '💧 踩中积水!' : state.gripUse > 0.8 ? '接近极限' : '抓地充足';
    q('[data-science-tip]').innerHTML = inPuddle
      ? '<strong>💧 正在穿过深积水！</strong>水膜托起轮胎导致摩擦系数 μ 瞬间减半，右图摩擦圆肉眼可见地缩小！'
      : state.slip > 0.25
        ? '<strong>⚠️ 超出摩擦圆极限！</strong>松开方向盘或先减速，把受力点拉回圆内就能稳住车身！'
        : `<strong>${TIRE_INFO[tire].label}：</strong>${TIRE_INFO[tire].tip}`;

    q('[data-status]').textContent = `${state.notice.title} — ${state.notice.copy}`;
    q('[data-pause]').textContent = state.paused ? '▶ 继续' : 'Ⅱ 暂停';
    drawFrictionCircle();
  }

  function draw(ctx: CanvasRenderingContext2D, time: number) {
    const width = 1000, height = 540;
    const cfg = RAIN_COURSES[course];
    const scale = 11.2;
    const roadNow = rainRoad(course, state.progress);
    const look = rainRoad(course, state.progress + 20);
    const camX = roadNow.x + (look.x - roadNow.x) * 0.2;
    const baseY = height * 0.76;
    const map = (at: number, offset = 0) => {
      const r = rainRoad(course, at);
      return { x: width / 2 + (r.x + r.normalX * offset - camX) * scale, y: baseY + (state.progress - at + r.normalY * offset) * scale };
    };

    // Stormy cyberpunk background
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#091024');
    bg.addColorStop(1, '#0d2230');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const start = Math.max(-10, state.progress - 22);
    const end = state.progress + 78;

    // Roadside pine trees
    for (let at = Math.floor(start / 11) * 11; at < end; at += 11) {
      for (const side of [-1, 1]) {
        const pt = map(at, side * (8.5 + ((Math.floor(at) + 100) % 3) * 1.8));
        ctx.fillStyle = '#15303d';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 15 + (at % 6), 0, Math.PI * 2); ctx.fill();
      }
    }

    // Wet neon asphalt road
    const roadPath = (offset = 0) => {
      ctx.beginPath();
      for (let at = start; at <= end; at += 1) {
        const p = map(at, offset);
        if (at === start) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    roadPath(); ctx.lineWidth = (ROAD_HALF_WIDTH * 2 + 1.2) * scale; ctx.strokeStyle = '#3d5e78'; ctx.stroke();
    roadPath(); ctx.lineWidth = ROAD_HALF_WIDTH * 2 * scale; ctx.strokeStyle = '#192c40'; ctx.stroke();
    roadPath(); ctx.lineWidth = (ROAD_HALF_WIDTH * 2 - 0.5) * scale; ctx.strokeStyle = '#20374c'; ctx.stroke();

    // Center dashed line & glowing wet edges
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(145, 220, 245, 0.45)'; ctx.setLineDash([10, 14]); roadPath(); ctx.stroke(); ctx.setLineDash([]);
    for (const off of [-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH]) {
      roadPath(off); ctx.strokeStyle = 'rgba(71, 234, 255, 0.55)'; ctx.lineWidth = 2.5; ctx.stroke();
    }

    // Shimmering puddles & golden Apex stars
    for (const item of state.items) {
      if (item.at < start || item.at > end || item.resolved) continue;
      const p = map(item.at, item.offset);
      if (item.kind === 'puddle') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan(rainRoad(course, item.at).dx));
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 74);
        g.addColorStop(0, 'rgba(71, 210, 255, 0.55)');
        g.addColorStop(1, 'rgba(30, 80, 120, 0.08)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 72, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(170, 235, 255, 0.55)';
        ctx.lineWidth = 1.4;
        for (let r = 0; r < 3; r++) {
          ctx.beginPath(); ctx.ellipse(0, -34 + r * 34, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y + (api.reducedMotion() ? 0 : Math.sin(time * 4 + item.id) * 3));
        ctx.fillStyle = '#ffe294';
        ctx.strokeStyle = '#f5bc65';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f5bc65';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = i % 2 ? 6 : 13;
          ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Corner chevron signs
    for (const c of state.corners) {
      if (c.at < start || c.at > end || c.resolved) continue;
      const p = map(c.at, 6.8);
      roundRect(ctx, p.x - 20, p.y - 18, 40, 34, 6, '#142b42', '#f5bc65');
      ctx.textAlign = 'center';
      label(ctx, rainRoad(course, c.at).curvature > 0 ? '↗' : '↖', p.x, p.y + 6, 22, '#ffe099', 700);
      ctx.textAlign = 'left';
    }

    // Finish line
    if (state.progress + 78 > cfg.length) {
      const fp = map(cfg.length);
      ctx.strokeStyle = '#75f1bb';
      ctx.lineWidth = 8;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(fp.x - 56, fp.y); ctx.lineTo(fp.x + 56, fp.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      label(ctx, '🏁 护航终点', fp.x, fp.y - 18, 18, '#b8ffe0', 700);
      ctx.textAlign = 'left';
    }

    // Tire track trail (turns glowing amber-red when slipping!)
    const tr = state.trail.filter(pt => pt.at >= start);
    if (tr.length > 1) {
      ctx.strokeStyle = state.slip > 0.25 ? 'rgba(255, 145, 100, 0.78)' : 'rgba(130, 220, 245, 0.45)';
      ctx.lineWidth = state.slip > 0.25 ? 4.5 : 3;
      ctx.beginPath();
      tr.forEach((pt, i) => {
        const p = map(pt.at, pt.offset);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // Hydroplane water spray plumes
    for (const sp of sprays) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - sp.life / 0.45);
      ctx.fillStyle = sp.color;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Player EV
    const player = map(state.progress, state.offset);
    const v = api.getVehicle();
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(-Math.PI / 2 + Math.atan(roadNow.dx) + Math.atan2(state.lateralVelocity, Math.max(1, state.speed)) * 0.68);
    drawPremiumTopCar(ctx, 0, 0, v.color, 0.84, v.body);
    ctx.restore();

    if (state.slip > 0.25) {
      ctx.textAlign = 'center';
      label(ctx, '⚠️ 抓地突破极限！先减速稳住！', player.x, player.y - 54, 16, '#ffad85', 700);
      ctx.textAlign = 'left';
    }

    // Animated slanting rain streaks
    const moving = state.phase === 'running' && !state.paused && !api.reducedMotion();
    const rt = moving ? state.tick * GRIP_RACE_DT : 0;
    ctx.strokeStyle = `rgba(170, 224, 255, ${0.14 + cfg.wet * 0.2})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 85; i++) {
      const rx = (i * 131 + rt * 50) % width;
      const ry = (i * 67 + rt * 280) % height;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 5, ry + 15); ctx.stroke();
    }

    // Floating feedback flash
    if (flashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, flashTimer * 1.4);
      ctx.textAlign = 'center';
      label(ctx, flashText, 500, 175 - (1.3 - flashTimer) * 26, 24, flashColor, 800);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Top HUD overlays
    roundRect(ctx, 18, 16, 175, 62, 12, 'rgba(9, 18, 35, 0.88)', '#314f6e');
    label(ctx, `${Math.round(state.speed * 3.6)}`, 34, 60, 34, state.slip > 0.25 ? '#ff9878' : '#eef8ff', 800);
    label(ctx, 'km/h', 105, 58, 14, '#8db0ce', 600);
    label(ctx, `建议 ≤ ${Math.round(rainAdvice(state) * 3.6)} km/h`, 34, 31, 11, '#75f1bb', 600);

    roundRect(ctx, 370, 16, 260, 62, 12, 'rgba(9, 18, 35, 0.88)', '#314f6e');
    ctx.textAlign = 'center';
    label(ctx, `得分 ${String(state.score).padStart(4, '0')} · 连击 ×${Math.max(1, state.combo)}`, 500, 43, 17, '#f5bc65', 700);
    label(ctx, `进度 ${Math.min(100, Math.round((state.progress / cfg.length) * 100))}% · 剩余 ${Math.max(0, Math.ceil(rainTimeLimit(state) - state.tick * GRIP_RACE_DT))}s`, 500, 66, 12, '#9ebad4');
    ctx.textAlign = 'left';

    // Route mini-map (top-right)
    const mx = width - 104, my = 18, mw = 82, mh = 116;
    roundRect(ctx, mx - 8, my, mw + 16, mh + 16, 10, 'rgba(10, 20, 38, 0.88)', '#385876');
    ctx.beginPath();
    for (let at = 0; at <= cfg.length; at += 5) {
      const r = rainRoad(course, at);
      const x = mx + 14 + (r.x / (cfg.amplitude * 2)) * 54;
      const y = my + 8 + mh - (at / cfg.length) * mh;
      if (at === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#5ebad4';
    ctx.lineWidth = 2;
    ctx.stroke();
    const cur = rainRoad(course, state.progress);
    ctx.fillStyle = '#f5bc65';
    ctx.beginPath();
    ctx.arc(mx + 14 + (cur.x / (cfg.amplitude * 2)) * 54, my + 8 + mh - (state.progress / cfg.length) * mh, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const stage = createStage(q('[data-stage]'), {
    width: 1000,
    height: 540,
    label: '暴雨盘山抓地力赛道：左右避让积水、弯前减速并观察右侧摩擦圆变化。',
    update(dt) {
      if (flashTimer > 0) flashTimer = Math.max(0, flashTimer - dt);
      for (let i = sprays.length - 1; i >= 0; i--) {
        sprays[i].life += dt;
        sprays[i].x += sprays[i].vx * dt;
        sprays[i].y += sprays[i].vy * dt;
        if (sprays[i].life >= 0.45) sprays.splice(i, 1);
      }

      if (state.phase === 'running' && !state.paused && !document.hidden) {
        const steerDir = (hold.right ? 1 : 0) - (hold.left ? 1 : 0);
        state.steer = steerDir;
        state.braking = hold.brake;
        state.accelerating = hold.accel;

        accumulator += Math.min(0.08, dt);
        while (accumulator >= GRIP_RACE_DT && state.phase === 'running') {
          accumulator -= GRIP_RACE_DT;
          stepGripRace(state);
        }

        if (state.starsCollected > lastStars) {
          lastStars = state.starsCollected;
          api.playCue?.('boost');
          popFlash('★ +50 护航星！', '#ffe08a');
        }
        if (state.perfectCorners > lastCorners) {
          lastCorners = state.perfectCorners;
          api.playCue?.('reward');
          popFlash(`✨ 完美贴弯 APEX ×${state.combo}！`, '#75f1bb');
        }

        if (!api.reducedMotion() && (state.slip > 0.2 || state.speed > 5)) {
          const col = state.slip > 0.25 ? '#ff9d78' : 'rgba(130, 220, 255, 0.85)';
          const px = 500 + state.offset * 11.2;
          sprays.push({
            x: px + (Math.random() - 0.5) * 26,
            y: 425,
            vx: (Math.random() - 0.5) * 70,
            vy: 60 + Math.random() * 80,
            life: 0,
            color: col,
          });
        }

        const phaseNow: string = state.phase;
        if ((phaseNow === 'complete' || phaseNow === 'failed') && !resultShown) showResult();
        updateUI();
      }
    },
    draw,
  });

  // Event bindings
  host.querySelectorAll<HTMLButtonElement>('[data-course]').forEach(b =>
    b.addEventListener('click', () => reset(Number(b.dataset.course), tire, false, false))
  );
  host.querySelectorAll<HTMLButtonElement>('[data-tire]').forEach(b =>
    b.addEventListener('click', () => reset(course, b.dataset.tire as RaceTire, false, state.phase === 'running'))
  );
  q('[data-start]').addEventListener('click', () => { reset(course, tire, false, true); api.playCue?.('start'); });
  q('[data-resume]').addEventListener('click', () => { state.paused = false; q('[data-paused]').hidden = true; updateUI(); });
  q('[data-pause]').addEventListener('click', () => {
    if (state.phase !== 'running') return;
    state.paused = !state.paused;
    q('[data-paused]').hidden = !state.paused;
    updateUI();
  });
  host.querySelectorAll<HTMLButtonElement>('[data-restart]').forEach(b =>
    b.addEventListener('click', () => { reset(course, tire, false, true); api.playCue?.('start'); })
  );
  q('[data-again]').addEventListener('click', () => { reset(course, tire, true, true); api.playCue?.('start'); });
  q('[data-next]').addEventListener('click', () => { reset((course + 1) % RAIN_COURSES.length, tire, false, true); api.playCue?.('start'); });
  q('[data-rescue]').addEventListener('click', () => { rescueGripRace(state); api.playCue?.('start'); updateUI(); });
  host.querySelectorAll<HTMLButtonElement>('[data-save]').forEach(b =>
    b.addEventListener('click', () => { api.saveImage('grip', stage.capture()); api.notify('已保存雨天抓地力挑战画面！'); })
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
    if (state.phase !== 'running' || state.paused) return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') { e.preventDefault(); hold.left = true; q('[data-hold="left"]').classList.add('is-active'); }
    if (k === 'd' || k === 'arrowright') { e.preventDefault(); hold.right = true; q('[data-hold="right"]').classList.add('is-active'); }
    if (k === ' ' || k === 's' || k === 'arrowdown') { e.preventDefault(); hold.brake = true; q('[data-hold="brake"]').classList.add('is-active'); }
    if (k === 'w' || k === 'arrowup') { e.preventDefault(); hold.accel = true; q('[data-hold="accel"]').classList.add('is-active'); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') { hold.left = false; q('[data-hold="left"]').classList.remove('is-active'); }
    if (k === 'd' || k === 'arrowright') { hold.right = false; q('[data-hold="right"]').classList.remove('is-active'); }
    if (k === ' ' || k === 's' || k === 'arrowdown') { hold.brake = false; q('[data-hold="brake"]').classList.remove('is-active'); }
    if (k === 'w' || k === 'arrowup') { hold.accel = false; q('[data-hold="accel"]').classList.remove('is-active'); }
  };
  const onBlur = () => { hold.left = hold.right = hold.brake = hold.accel = false; if (state.phase === 'running' && !state.paused) { state.paused = true; q('[data-paused]').hidden = false; updateUI(); } };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  reset(0, 'rain', false, false);

  return {
    destroy() {
      stage.destroy();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
