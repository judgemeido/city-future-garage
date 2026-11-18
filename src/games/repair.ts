import { drawPremiumCar, drawPremiumTopCar } from '../car-art';
import { createStage, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import {
  AD_FAULT_CASES,
  AD_NODES,
  REPAIR_FIXES,
  applyRepairFix,
  createRepairAdState,
  probeAdNode,
  repairAdStars,
  type AdNodeId,
  type RepairAdState,
  type RepairFixId,
} from './repair-ad-model';
import './arcade-science.css';

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function mountRepair(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('repair');
  const bestStars: number[] = Array.isArray(saved.bestStars)
    ? [0, 1, 2, 3].map(i => Number((saved.bestStars as unknown[])[i]) || 0)
    : [0, 0, 0, 0];

  let state: RepairAdState = createRepairAdState(0);
  let testProgress = 0; // 0..1 on the upper road-test track
  let verifying = false;
  let busPulse: number | null = null; // 0..1.4s animation
  let usedAiAssist = false;
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

  host.innerHTML = `<div class="as-shell" style="--as-accent:#f5bc65">
    <div class="as-topbar">
      <div class="as-levels" role="group" aria-label="选择智驾急诊病例">
        ${AD_FAULT_CASES.map((c, i) => `<button type="button" class="as-level-btn" data-case="${i}" aria-pressed="${i === 0}"><span>0${i + 1} ${c.shortTitle}</span><b data-star="${i}">${starText(bestStars[i])}</b></button>`).join('')}
      </div>
      <div class="as-top-controls">
        <button type="button" class="btn btn-small" data-reset>重置病例</button>
      </div>
    </div>

    <div class="as-main">
      <div class="as-stage-col">
        <div class="as-stage-wrap is-interactive">
          <div data-stage></div>
          <div class="as-overlay" data-result hidden>
            <span class="as-overlay-tag" data-result-tag>AD VERIFIED · 智驾复测验收通过</span>
            <h2 data-result-title>智驾系统满血复活！</h2>
            <div class="as-overlay-stars" data-result-stars></div>
            <div class="as-overlay-metrics" data-result-metrics></div>
            <div class="as-overlay-science" data-result-science></div>
            <div class="as-overlay-actions">
              <button type="button" class="btn btn-primary" data-next>下一宗智驾病例 →</button>
              <button type="button" class="btn" data-reset>重新诊断本病例</button>
              <button type="button" class="btn" data-save>保存急诊报告</button>
            </div>
          </div>
        </div>

        <div class="as-controls-bar">
          <button type="button" class="as-action-btn is-amber" data-pulse>⚡ 发射智驾全链路信号<small>看数据从传感器→超算→车轮卡在哪</small></button>
          <button type="button" class="as-action-btn is-purple" data-mrc>🛡️ 切换 MRC 安全冗余<small>体验 L4 故障自动降级靠边停车</small></button>
          <button type="button" class="as-action-btn is-green" data-probe-all>🤖 AI 一键全检（不计分）<small>自动定位 5 大节点 · 仅作教学演练</small></button>
        </div>

        <div class="as-status-line">
          <span data-status></span>
          <div class="as-mini-actions">
            <button type="button" class="btn" data-save>保存画面</button>
          </div>
        </div>
      </div>

      <aside class="as-sidebar is-compact" aria-label="智驾急诊诊断台与修复工具">
        <div class="as-card">
          <div class="as-card-head">
            <h3>🩺 5 大智驾节点诊断单</h3>
            <span class="as-badge" data-probe-count>0 / 5 已探查</span>
          </div>
          <p style="margin:0;font-size:12px;color:#ffdca0;font-weight:700" data-symptom-title></p>
          <div class="as-list" data-node-list></div>
        </div>

        <div class="as-card">
          <div class="as-card-head">
            <h3>🔧 选择对症修复方案</h3>
            <span class="as-badge" data-wrong-badge>误诊 0 次</span>
          </div>
          <div class="as-list" data-fix-list>
            ${REPAIR_FIXES.map(f => `<button type="button" class="as-list-item" data-fix="${f.id}"><span><strong>${f.icon} ${f.title}</strong><small>${f.detail}</small></span><span style="color:#75f1bb;font-weight:700;font-size:11px">执行</span></button>`).join('')}
          </div>
        </div>
      </aside>
    </div>
  </div>`;

  const q = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s)!;

  function burst(x: number, y: number, color: string, count = 14) {
    if (api.reducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 110;
      sparks.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0, color });
    }
  }

  function currentCase() {
    return AD_FAULT_CASES[state.caseIdx];
  }

  function reset(nextCaseIdx = state.caseIdx) {
    state = createRepairAdState(nextCaseIdx);
    testProgress = 0;
    verifying = false;
    busPulse = null;
    usedAiAssist = false;
    sparks.length = 0;
    q('[data-result]').hidden = true;
    host.querySelectorAll<HTMLButtonElement>('[data-case]').forEach(b =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.case) === state.caseIdx))
    );
    updateUI();
  }

  function showVictory() {
    const c = currentCase();
    const stars = usedAiAssist ? 0 : repairAdStars(state);
    if (!usedAiAssist) {
      bestStars[state.caseIdx] = Math.max(bestStars[state.caseIdx], stars);
      q(`[data-star="${state.caseIdx}"]`).textContent = starText(bestStars[state.caseIdx]);
    }
    const faultNode = AD_NODES.find(n => n.id === c.faultNode)!;

    q('[data-result-tag]').textContent = usedAiAssist
      ? 'AI ASSISTED · AI 一键全检辅助（不计分）'
      : 'AD VERIFIED · 智驾复测验收通过';
    q('[data-result-title]').textContent = usedAiAssist
      ? '🤖 AI 辅助排障演练完成（不计分）'
      : stars === 3 ? '🏆 首席智驾急诊师！一针见血' : '✅ 实车验收通过，智驾满血恢复！';
    q('[data-result-stars]').textContent = usedAiAssist ? '☆☆☆' : starText(stars);
    q('[data-result-metrics]').innerHTML = `
      ${usedAiAssist ? '<span>本次得分<strong style="color:#ff9e78">0 分（AI 辅助）</strong></span>' : ''}
      <span>故障真凶<strong style="color:#ff9e78">${faultNode.icon} ${faultNode.short}</strong></span>
      <span>探查节点<strong>${state.probed.length} / 5</strong></span>
      <span>误诊次数<strong>${state.wrongAttempts} 次</strong></span>
      <span>实车复测<strong style="color:#75f1bb">100% 通过</strong></span>
    `;
    q('[data-result-science]').innerHTML = usedAiAssist
      ? `⚠️ <strong>无积分说明：</strong>本病例使用了 <strong>AI 一键全检辅助</strong>，仅作排查演练，<strong>不获得积分与星级</strong>。请点「重新诊断本病例」，手动逐一点击车上节点读取示波器排障即可拿分！<br>💡 ${c.scienceTakeaway}`
      : `💡 <strong>智驾架构科普：</strong>${c.scienceTakeaway}`;
    q('[data-result]').hidden = false;
    api.playCue?.(usedAiAssist ? 'boost' : 'reward');

    if (!usedAiAssist) {
      api.award('repair', `ad-case-${state.caseIdx}`, Math.max(25, stars * 10), `完成${c.shortTitle}智驾排障`);
      api.complete('repair');
      api.record('repair', {
        bestStars,
        summary: `在「${c.title}」亲手定位故障源「${faultNode.name}」并完成实车验收，误诊 ${state.wrongAttempts} 次，获 ${stars} 星。`,
        report: [
          { label: '智驾病例 / 故障源', value: `${c.shortTitle} · ${faultNode.name}` },
          { label: '验收星级 / 误诊', value: `${stars} 星 · 误诊 ${state.wrongAttempts} 次` },
        ],
      });
      api.saveImage('repair', stage.capture());
    }
  }

  function updateUI() {
    const c = currentCase();
    q('[data-probe-count]').textContent = `${state.probed.length} / 5 已探查`;
    q('[data-symptom-title]').textContent = `🚨 ${c.symptomTitle}`;
    q('[data-wrong-badge]').textContent = `误诊 ${state.wrongAttempts} 次`;
    q('[data-status]').textContent = state.mrcActive ? c.mrcExplanation : state.feedback;

    host.querySelectorAll<HTMLButtonElement>('[data-mrc]').forEach(b => {
      b.setAttribute('aria-pressed', String(state.mrcActive));
      b.classList.toggle('is-active', state.mrcActive);
    });

    q('[data-node-list]').innerHTML = AD_NODES.map(n => {
      const probed = state.probed.includes(n.id) || state.repaired;
      const r = state.repaired ? c.fixedReadings[n.id] : c.readings[n.id];
      const cls = !probed ? '' : r.status === 'fault' ? 'is-fault' : r.status === 'degraded' || r.status === 'downstream' ? 'is-warn' : 'is-ok';
      const badge = !probed ? '点击探查' : r.status === 'fault' ? '⚠️ 故障源' : r.status === 'downstream' ? '受上游牵连' : r.status === 'degraded' ? '天气受限' : '✓ 正常';
      const col = !probed ? '#7fa0be' : r.status === 'fault' ? '#ff8484' : r.status === 'ok' ? '#75f1bb' : '#f5bc65';
      return `<button type="button" class="as-list-item ${cls} ${state.selectedNode === n.id ? 'is-selected' : ''}" data-node="${n.id}">
        <span><strong>${n.icon} ${n.name}</strong><small>${probed ? r.metric : n.role}</small></span>
        <span style="font-size:11px;font-weight:700;color:${col};white-space:nowrap">${badge}</span>
      </button>`;
    }).join('');

    host.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.node as AdNodeId;
        const r = probeAdNode(state, id);
        const node = AD_NODES.find(x => x.id === id)!;
        burst(node.x, node.y, r.status === 'fault' ? '#ff7a7a' : '#75f1bb', 12);
        api.playCue?.(r.status === 'fault' ? 'hit' : 'boost');
        updateUI();
      })
    );

    host.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach(b => {
      b.disabled = state.repaired;
      b.classList.toggle('is-ok', state.repaired && b.dataset.fix === c.correctFix);
    });
  }

  function drawRoadTestMonitor(ctx: CanvasRenderingContext2D, time: number) {
    const c = currentCase();
    const v = api.getVehicle();
    const reduced = api.reducedMotion();

    // Monitor frame (y = 0..216)
    const roadBg = ctx.createLinearGradient(0, 0, 0, 216);
    roadBg.addColorStop(0, '#091426');
    roadBg.addColorStop(1, '#102138');
    ctx.fillStyle = roadBg;
    ctx.fillRect(0, 0, 1000, 216);

    // 2-lane test track (top lane y=82, main lane y=148)
    ctx.fillStyle = '#14253c';
    ctx.fillRect(0, 52, 1000, 136);
    // Emergency shoulder strip at very top of road
    ctx.fillStyle = 'rgba(245, 188, 101, 0.12)';
    ctx.fillRect(0, 52, 1000, 24);
    ctx.strokeStyle = '#4f7396';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 52); ctx.lineTo(1000, 52); ctx.moveTo(0, 188); ctx.lineTo(1000, 188); ctx.stroke();

    // Dashed lane divider
    ctx.strokeStyle = 'rgba(145, 200, 230, 0.45)';
    ctx.setLineDash([18, 18]);
    ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(1000, 120); ctx.stroke();
    ctx.setLineDash([]);

    // Top-left live monitor status badge
    const modeCol = state.repaired ? '#75f1bb' : state.mrcActive ? '#f5bc65' : '#ff7c7c';
    roundRect(ctx, 16, 12, 345, 30, 8, 'rgba(9, 19, 36, 0.92)', modeCol);
    label(ctx, state.repaired ? '✅ 实车路测验收中 · 智驾链路全面恢复！' : state.mrcActive ? '🛡️ MRC 安全冗余生效 · 备份通道靠边停车' : `🚨 实时故障复现 · ${c.shortTitle}`, 28, 32, 12, modeCol, 700);

    // Finish gate on right when verifying repair
    if (state.repaired) {
      ctx.strokeStyle = '#75f1bb';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(910, 54); ctx.lineTo(910, 186); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, '验收线', 918, 125, 12, '#75f1bb', 700);
    }

    // Smoothstep helper for C1-continuous, drift-free trajectories & exact heading tangents
    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const obsX = 620;

    // Target smooth lane-change curves (used for both vehicle motion & forward AI planned line)
    const idealAvoidY = (x: number) => 152 - 58 * smoothstep(340, 490, x) + 58 * smoothstep(735, 865, x);
    const lateLagAvoidY = (x: number) => 152 - 54 * smoothstep(525, 615, x) + 54 * smoothstep(735, 860, x);
    const rainPassY = (x: number) => 152 - 58 * smoothstep(360, 500, x) + 58 * smoothstep(750, 880, x);
    const mrcShoulderY = (x: number) => 152 - 86 * smoothstep(140, 390, x);

    const headingOf = (fn: (x: number) => number, x: number) => Math.atan2(fn(x + 4) - fn(x - 4), 8);

    // Compute live car position & lane behavior per case!
    let carX = 95 + testProgress * 795;
    let carY = 152;
    let carAngle = 0;
    let alertText = '';
    let brakeLit = false;

    if (state.mrcActive && !state.repaired) {
      // MRC Fail-Operational: decelerates smoothly onto emergency shoulder and stops safely around x=470
      const easeOut = 1 - Math.pow(1 - Math.min(1, testProgress / 0.72), 2.2);
      carX = 95 + easeOut * 375;
      carY = mrcShoulderY(carX);
      carAngle = testProgress < 0.68 ? headingOf(mrcShoulderY, carX) : 0;
      brakeLit = testProgress > 0.35;
      alertText = testProgress > 0.72 ? '🛡️ MRC 已安全靠边刹停 · 双闪开启' : '🛡️ MRC 降级安全靠边';
    } else if (state.repaired) {
      // Repaired smooth autonomous behavior!
      if (c.id === 2 || c.id === 3) {
        carY = idealAvoidY(carX);
        carAngle = headingOf(idealAvoidY, carX);
        alertText = carY < 138 ? '✅ 毫秒规划 · 平滑绕障!' : '✅ 智驾巡航正常';
      } else if (c.id === 1) {
        carY = rainPassY(carX);
        carAngle = headingOf(rainPassY, carX);
        alertText = '✅ 毫米波穿透暴雨锁定前车！';
      } else {
        alertText = '✅ 激光标定正常 · 畅通无幽灵刹';
      }
    } else {
      // Unrepaired vivid fault symptoms!
      if (c.id === 0) {
        // Ghost braking in empty air: actually slows hard around x=350..385 with flashing brake lights
        if (testProgress < 0.32) {
          carX = 95 + (testProgress / 0.32) * 265;
        } else if (testProgress < 0.56) {
          carX = 360 + ((testProgress - 0.32) / 0.24) * 32;
          brakeLit = true;
          alertText = '⚠️ 幽灵急刹！激光误报 12m 假障碍';
          if (Math.sin(time * 24) > -0.3) {
            ctx.save();
            ctx.strokeStyle = '#ff6b78';
            ctx.fillStyle = 'rgba(255, 107, 120, 0.22)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.fillRect(carX + 76, 126, 48, 48);
            ctx.strokeRect(carX + 76, 126, 48, 48);
            ctx.setLineDash([]);
            label(ctx, '👻 假点云', carX + 74, 120, 11, '#ff9aa4', 700);
            ctx.restore();
          }
        } else {
          carX = 392 + ((testProgress - 0.56) / 0.44) * 498;
        }
      } else if (c.id === 1) {
        // Rainstorm blind charge toward slow truck: slams AEB right before truck instead of clipping through
        const approach = Math.min(1, testProgress / 0.68);
        const eased = approach < 0.72 ? approach / 0.72 * 0.84 : 0.84 + (1 - Math.pow(1 - (approach - 0.72) / 0.28, 2)) * 0.16;
        carX = 95 + eased * 475;
        if (carX > 420) {
          brakeLit = true;
          alertText = '🚨 雷达掉线！暴雨中逼近前车警报！';
        }
      } else if (c.id === 2) {
        // 480ms AI chip lag: reacts way too late before cones, jerks into bypass lane, clears cones smoothly without snapping back!
        carY = lateLagAvoidY(carX);
        carAngle = headingOf(lateLagAvoidY, carX);
        if (carX > 410 && carX < 525) {
          alertText = '⏳ 超算延迟 480ms！尚未响应绕障…';
        } else if (carX >= 525 && carX < 650) {
          brakeLit = true;
          alertText = '🚨 反应慢半拍！贴边急打方向避让锥桶！';
        }
      } else if (c.id === 3) {
        // Steering locked at 0°: cannot follow blue planned curve, triggers AEB stop right before cones
        const approach = Math.min(1, testProgress / 0.66);
        const eased = approach < 0.7 ? approach / 0.7 * 0.85 : 0.85 + (1 - Math.pow(1 - (approach - 0.7) / 0.3, 2)) * 0.15;
        carX = 95 + eased * 460;
        if (carX > 400) brakeLit = true;
        alertText = carX > 360 ? '❌ 转向卡死 0°！无法左转，触发急停！' : '🧠 大脑已规划左转蓝线…';
      }
    }

    // Draw road obstacles specific to the case
    if (c.id === 1) {
      // Slow truck in rainstorm
      drawPremiumTopCar(ctx, obsX + 35, 152, '#f5bc65', 0.88, 'touring');
      label(ctx, '前方慢车', obsX + 10, 122, 11, '#ffe099', 600);
    } else if (c.id === 2 || c.id === 3) {
      // Construction cones blocking main lane
      for (let k = 0; k < 3; k++) {
        const kx = obsX + k * 28;
        ctx.fillStyle = '#ff9852';
        ctx.beginPath(); ctx.moveTo(kx, 138); ctx.lineTo(kx - 9, 162); ctx.lineTo(kx + 9, 162); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff3d6'; ctx.fillRect(kx - 5, 148, 10, 4);
      }
      label(ctx, '施工占道', obsX + 8, 130, 11, '#ffb884', 600);
    }

    // Draw AI Planned Trajectory (always strictly forward along the true target lane path!)
    if ((c.id === 2 || c.id === 3 || state.repaired || state.mrcActive) && carX < 875) {
      const pathFn = state.mrcActive && !state.repaired
        ? mrcShoulderY
        : c.id === 2 || c.id === 3
          ? idealAvoidY
          : c.id === 1 && state.repaired
            ? rainPassY
            : () => 152;
      const startX = carX + 32;
      const endX = state.mrcActive && !state.repaired ? Math.min(520, startX + 220) : Math.min(910, startX + 230);
      if (endX > startX + 8) {
        ctx.save();
        ctx.strokeStyle = state.repaired ? '#75f1bb' : state.mrcActive ? '#f5bc65' : c.id === 3 ? '#47eaff' : '#f5bc65';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        const steps = 18;
        for (let s = 0; s <= steps; s++) {
          const frac = s / steps;
          const px = startX + (endX - startX) * frac;
          const blend = smoothstep(0, 0.38, frac);
          const py = carY + (pathFn(px) - carY) * blend;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Forward Sensor Perception Cone on Test Track
    ctx.save();
    ctx.translate(carX, carY);
    ctx.rotate(carAngle);
    const coneLen = c.id === 1 && !state.repaired ? 75 : 195;
    const coneCol = state.repaired ? '117, 241, 187' : c.id === 0 ? '255, 115, 125' : c.id === 1 ? '245, 188, 101' : '71, 234, 255';
    const g = ctx.createLinearGradient(24, 0, 24 + coneLen, 0);
    g.addColorStop(0, `rgba(${coneCol}, 0.28)`);
    g.addColorStop(1, `rgba(${coneCol}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(26 + coneLen, -42); ctx.lineTo(26 + coneLen, 42); ctx.closePath(); ctx.fill();

    // Draw player's custom EV top-view on test track
    drawPremiumTopCar(ctx, 0, 0, v.color, 0.78, v.body);

    // Flashing red brake glow or amber MRC hazard blinkers
    if (brakeLit) {
      ctx.fillStyle = 'rgba(255, 70, 90, 0.85)';
      ctx.beginPath(); ctx.arc(-34, -12, 6, 0, Math.PI * 2); ctx.arc(-34, 12, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (state.mrcActive && Math.sin(time * 12) > 0) {
      ctx.fillStyle = '#f5bc65';
      ctx.beginPath(); ctx.arc(32, -14, 4.5, 0, Math.PI * 2); ctx.arc(32, 14, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Floating alert callout above test car
    if (alertText) {
      const col = state.repaired ? '#75f1bb' : state.mrcActive ? '#f5bc65' : '#ff8c94';
      ctx.font = '700 11px "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(alertText).width + 18;
      const ax = Math.max(16, Math.min(984 - tw, carX - tw / 2));
      roundRect(ctx, ax, Math.max(46, carY - 52), tw, 24, 6, 'rgba(9, 19, 36, 0.92)', col);
      label(ctx, alertText, ax + 9, Math.max(46, carY - 52) + 16, 11, col, 700);
    }

    // Rain streaks in Case 02!
    if (c.weather === 'rain') {
      ctx.strokeStyle = 'rgba(170, 224, 255, 0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 65; i++) {
        const rx = (i * 97 + (reduced ? 0 : time * 180)) % 1000;
        const ry = (i * 53 + (reduced ? 0 : time * 320)) % 216;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 14); ctx.stroke();
      }
    }

    // Crisp neon divider between upper road test and lower AD architecture bay
    ctx.fillStyle = '#2e4e6e';
    ctx.fillRect(0, 216, 1000, 2);
  }

  function drawArchitectureBay(ctx: CanvasRenderingContext2D, time: number) {
    const c = currentCase();
    const v = api.getVehicle();
    const reduced = api.reducedMotion();

    // Lower cyber architecture bay (y = 218..560)
    ctx.fillStyle = '#081224';
    ctx.fillRect(0, 218, 1000, 342);
    ctx.strokeStyle = 'rgba(71, 234, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1000; x += 36) { ctx.beginPath(); ctx.moveTo(x, 218); ctx.lineTo(x, 560); ctx.stroke(); }
    for (let y = 218; y <= 560; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke(); }

    label(ctx, 'AD ARCHITECTURE · 点击车上 5 大智驾节点接入示波器探查，找出真正故障源', 22, 244, 12, '#8ec6e6', 700);

    // Translucent holographic side view of player's custom EV
    ctx.save();
    ctx.globalAlpha = 0.72;
    drawPremiumCar(ctx, 515, 412, v.color, 2.25, 0, v.body);
    ctx.restore();

    // Draw CAN / Ethernet Data Bus Lines: Sensors (camera, lidar, radar) -> AI Chip -> Steer Actuator
    const nodeMap = Object.fromEntries(AD_NODES.map(n => [n.id, n])) as Record<AdNodeId, (typeof AD_NODES)[number]>;
    const links: [AdNodeId, AdNodeId][] = [
      ['lidar', 'chip'],
      ['camera', 'chip'],
      ['radar', 'chip'],
      ['chip', 'steer'],
    ];
    for (const [fromId, toId] of links) {
      const a = nodeMap[fromId], b = nodeMap[toId];
      const fromR = state.repaired ? c.fixedReadings[fromId] : c.readings[fromId];
      const brokenLink = fromR.status === 'fault' && !state.repaired;
      ctx.save();
      ctx.strokeStyle = state.repaired ? 'rgba(117, 241, 187, 0.7)' : brokenLink ? 'rgba(255, 115, 125, 0.65)' : 'rgba(71, 234, 255, 0.45)';
      ctx.lineWidth = brokenLink ? 3.5 : 2.5;
      ctx.setLineDash(brokenLink ? [6, 6] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);

      // Animated data packets along bus when diagnostic pulse is fired (or steady ambient flow)
      if (!reduced) {
        const pTime = busPulse !== null ? Math.min(1, busPulse / 0.85) : (time * 0.7) % 1;
        if (busPulse !== null || !brokenLink) {
          const px = a.x + (b.x - a.x) * (brokenLink ? Math.min(0.45, pTime) : pTime);
          const py = a.y + (b.y - a.y) * (brokenLink ? Math.min(0.45, pTime) : pTime);
          ctx.fillStyle = brokenLink ? '#ff7a7a' : state.repaired ? '#a7ffd8' : '#7eeeff';
          ctx.shadowColor = brokenLink ? '#ff6b78' : '#47eaff';
          ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(px, py, busPulse !== null ? 6.5 : 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
    }

    // Draw 5 Interactive Hardware Nodes with live oscilloscopes when probed!
    for (const n of AD_NODES) {
      const probed = state.probed.includes(n.id) || state.repaired;
      const r = state.repaired ? c.fixedReadings[n.id] : c.readings[n.id];
      const col = !probed ? '#47eaff' : r.status === 'fault' ? '#ff7c7c' : r.status === 'ok' ? '#75f1bb' : '#f5bc65';
      const isSel = state.selectedNode === n.id;

      // Pulsing outer target ring
      if (!reduced) {
        const ph = (time * 1.3 + n.x * 0.01) % 1;
        ctx.strokeStyle = col;
        ctx.globalAlpha = (1 - ph) * (probed && r.status === 'fault' ? 0.85 : 0.4);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(n.x, n.y, 18 + ph * 16, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Node core button
      ctx.fillStyle = probed && r.status === 'fault' ? '#4a1826' : '#0f223b';
      ctx.strokeStyle = isSel ? '#ffffff' : col;
      ctx.lineWidth = isSel ? 3 : 2.2;
      ctx.beginPath(); ctx.arc(n.x, n.y, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center';
      label(ctx, n.icon, n.x, n.y + 6, 16, '#ffffff');
      ctx.textAlign = 'left';

      // Node label pill + live waveform readout
      const pillW = probed ? 156 : 86;
      const px = Math.max(12, Math.min(988 - pillW, n.x - pillW / 2));
      const py = n.y + 24;
      roundRect(ctx, px, py, pillW, probed ? 42 : 22, 7, 'rgba(9, 20, 38, 0.94)', col);
      label(ctx, probed ? `${n.short} · ${r.status === 'fault' ? '异常!' : r.status === 'ok' ? '正常' : '受限'}` : n.short, px + 8, py + 15, 11, col, 700);
      if (probed) {
        label(ctx, r.metric, px + 8, py + 32, 10, '#d7ebf8');
      }
    }

    // Live Oscilloscope Inspector Box (bottom-right of architecture bay)
    if (state.selectedNode) {
      const sel = nodeMap[state.selectedNode];
      const r = state.repaired ? c.fixedReadings[sel.id] : c.readings[sel.id];
      const col = r.status === 'fault' ? '#ff7c7c' : r.status === 'ok' ? '#75f1bb' : '#f5bc65';
      roundRect(ctx, 738, 250, 244, 96, 10, 'rgba(8, 18, 35, 0.94)', col);
      label(ctx, `示波器 · ${sel.name}`, 752, 270, 11, col, 700);
      label(ctx, r.metric, 752, 288, 11, '#eef7ff', 600);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let wx = 0; wx <= 214; wx += 4) {
        const wy = r.status === 'fault'
          ? (Math.sin(wx * 0.9 + time * 26) > 0.45 ? -14 : 6)
          : r.status === 'downstream' || r.status === 'degraded'
            ? Math.sin(wx * 0.08 - time * 3) * 4
            : Math.sin(wx * 0.14 - time * 9) * 11;
        if (wx === 0) ctx.moveTo(752 + wx, 320 + wy); else ctx.lineTo(752 + wx, 320 + wy);
      }
      ctx.stroke();
    }

    // Sparks
    for (const sp of sparks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - sp.life / 0.5);
      ctx.fillStyle = sp.color;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  const stage = createStage(q('[data-stage]'), {
    width: 1000,
    height: 560,
    label: '智驾故障急诊室：上方为实时智驾路测复现跑道，下方为全车 5 大智驾节点示波器探查架构。',
    pointer(kind, x, y) {
      if (kind !== 'down' || y < 218) return;
      const hit = AD_NODES.find(n => Math.hypot(n.x - x, n.y - y) <= 38);
      if (hit) {
        const r = probeAdNode(state, hit.id);
        burst(hit.x, hit.y, r.status === 'fault' ? '#ff7a7a' : '#75f1bb', 14);
        api.playCue?.(r.status === 'fault' ? 'hit' : 'boost');
        updateUI();
      }
    },
    update(dt) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        sparks[i].life += dt;
        sparks[i].x += sparks[i].vx * dt;
        sparks[i].y += sparks[i].vy * dt;
        if (sparks[i].life >= 0.5) sparks.splice(i, 1);
      }
      if (busPulse !== null) {
        busPulse += dt;
        if (busPulse >= 1.2) busPulse = null;
      }
      if (!document.hidden) {
        if (verifying) {
          testProgress += dt * 0.34;
          if (testProgress >= 1) {
            testProgress = 1;
            verifying = false;
            state.verified = true;
            showVictory();
          }
        } else if (!state.verified) {
          const spd = state.mrcActive ? 0.08 : 0.16;
          testProgress = (testProgress + dt * spd) % 1;
        }
      }
    },
    draw(ctx, time) {
      drawRoadTestMonitor(ctx, time);
      drawArchitectureBay(ctx, time);
    },
  });

  // Event bindings
  host.querySelectorAll<HTMLButtonElement>('[data-case]').forEach(b =>
    b.addEventListener('click', () => reset(Number(b.dataset.case)))
  );
  host.querySelectorAll<HTMLButtonElement>('[data-mrc]').forEach(b =>
    b.addEventListener('click', () => {
      if (state.repaired) return;
      state.mrcActive = !state.mrcActive;
      testProgress = 0.08;
      api.playCue?.('start');
      updateUI();
    })
  );
  q('[data-pulse]').addEventListener('click', () => {
    busPulse = 0;
    const fault = AD_NODES.find(n => n.id === currentCase().faultNode)!;
    burst(fault.x, fault.y, state.repaired ? '#75f1bb' : '#ff7a7a', 18);
    api.playCue?.('boost');
    state.feedback = state.repaired
      ? '⚡ 全链路信号 100% 绿光贯通！'
      : '⚡ 已发射全链路测试信号！盯紧下方架构图里哪条红虚线发生了中断/卡顿，点那个节点探查！';
    updateUI();
  });
  q('[data-probe-all]').addEventListener('click', () => {
    usedAiAssist = true;
    for (const n of AD_NODES) probeAdNode(state, n.id);
    const fault = AD_NODES.find(n => n.id === currentCase().faultNode)!;
    state.selectedNode = fault.id;
    state.feedback = `🤖 已启用 AI 一键全检（本病例仅作教学演练，不计分、不计星级）！重置病例并亲手探查节点即可拿分。`;
    api.playCue?.('boost');
    updateUI();
  });
  host.querySelectorAll<HTMLButtonElement>('[data-fix]').forEach(b =>
    b.addEventListener('click', () => {
      const res = applyRepairFix(state, b.dataset.fix as RepairFixId);
      if (res.ok) {
        verifying = true;
        testProgress = 0;
        busPulse = 0;
        const fault = AD_NODES.find(n => n.id === currentCase().faultNode)!;
        burst(fault.x, fault.y, '#75f1bb', 24);
        api.playCue?.('reward');
      } else {
        api.playCue?.('hit');
      }
      updateUI();
    })
  );
  host.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach(b => b.addEventListener('click', () => reset(state.caseIdx)));
  q('[data-next]').addEventListener('click', () => reset((state.caseIdx + 1) % AD_FAULT_CASES.length));
  host.querySelectorAll<HTMLButtonElement>('[data-save]').forEach(b =>
    b.addEventListener('click', () => { api.saveImage('repair', stage.capture()); api.notify('已保存智驾急诊画面到作品档案！'); })
  );

  reset(0);
  return { destroy() { stage.destroy(); } };
}
