import { drawPremiumCar } from '../car-art';
import { createStage, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import { QUIZ_BANK } from './charging-quiz-bank';
import {
  QUIZ_QUESTION_COUNT,
  QUIZ_SCORING,
  QUIZ_TIME_LIMIT,
  createQuizSession,
  gradeQuizWithAI,
  startQuizSession,
  submitQuizAnswer,
  tickQuizTimer,
  type QuizMode,
  type QuizSessionState,
} from './charging-quiz-model';
import './charging-quiz.css';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function mountCharging(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('charging');
  const bestByMode: Record<QuizMode, { score: number; normalized: number; stars: number }> = {
    normal: {
      score: Number((saved.bestNormal as { score?: number } | undefined)?.score) || 0,
      normalized: Number((saved.bestNormal as { normalized?: number } | undefined)?.normalized) || 0,
      stars: Number((saved.bestNormal as { stars?: number } | undefined)?.stars) || 0,
    },
    hard: {
      score: Number((saved.bestHard as { score?: number } | undefined)?.score) || 0,
      normalized: Number((saved.bestHard as { normalized?: number } | undefined)?.normalized) || 0,
      stars: Number((saved.bestHard as { stars?: number } | undefined)?.stars) || 0,
    },
  };

  let selectedMode: QuizMode = 'normal';
  let state: QuizSessionState = createQuizSession('normal');
  let lockTimer: number | null = null;
  let lockedOption: number | null = null;
  let gradingElapsed = 0;
  let verdictFilter: 'all' | 'wrong' = 'all';
  let pulseFlash = 0;
  let disposed = false;

  const totalBankCount = QUIZ_BANK.length;
  const easyBankCount = QUIZ_BANK.filter(q => q.difficulty === 'easy').length;
  const hardBankCount = QUIZ_BANK.filter(q => q.difficulty === 'hard').length;

  host.innerHTML = `<div class="cq-shell">
    <div class="cq-topbar">
      <div class="cq-modes" role="group" aria-label="选择问答难度">
        <button type="button" class="cq-mode-btn" data-mode="normal" aria-pressed="true">
          <span>⚡ 普通模式</span>
          <small>5简单 + 5困难</small>
        </button>
        <button type="button" class="cq-mode-btn" data-mode="hard" aria-pressed="false">
          <span>🔥 困难模式</span>
          <small>10道全困难</small>
        </button>
      </div>
      <div class="cq-top-meta">
        <span class="cq-pill">📚 ${totalBankCount} 题中国智驾题库 · 随机抽 ${QUIZ_QUESTION_COUNT} 题</span>
        <span class="cq-pill">⏱️ 每题 ${QUIZ_TIME_LIMIT}s 限时 · 🤖 AI 终审评分</span>
        <button type="button" class="btn btn-small" data-redraw>🔄 重新抽题</button>
      </div>
    </div>

    <div class="cq-stage-wrap">
      <div data-stage></div>
    </div>

    <section class="cq-board" aria-live="polite">
      <!-- 1. READY VIEW -->
      <div data-view="ready" style="display:grid;gap:14px">
        <div class="cq-intro-grid">
          <button type="button" class="cq-tier-card is-selected" data-pick-mode="normal">
            <div class="cq-tier-head">
              <h3>⚡ 普通模式</h3>
              <span class="cq-tier-badge">最高 1250 分</span>
            </div>
            <p>从 ${totalBankCount} 道中国智能驾驶题库中随机抽取 <strong>5 道简单题 + 5 道困难题</strong>，循序覆盖智驾感知、车路云、超充网络与国标安全。</p>
            <div class="cq-tier-tags">
              <span>简单题 × 5（最高 ${QUIZ_SCORING.easy.max} 分/题）</span>
              <span>困难题 × 5（最高 ${QUIZ_SCORING.hard.max} 分/题）</span>
              <span data-best-normal>历史最佳：${bestByMode.normal.score ? `${bestByMode.normal.score} 分 ${starText(bestByMode.normal.stars)}` : '待挑战'}</span>
            </div>
          </button>

          <button type="button" class="cq-tier-card is-hard" data-pick-mode="hard">
            <div class="cq-tier-head">
              <h3>🔥 困难模式</h3>
              <span class="cq-tier-badge">最高 1500 分</span>
            </div>
            <p>从 ${hardBankCount} 道高难专家题池中随机抽取 <strong>10 道全困难题</strong>，直击 L3/L4 准入试点、端到端大模型、C-V2X、800V/ChaoJi 超充与功能安全！</p>
            <div class="cq-tier-tags">
              <span>困难题 × 10（最高 ${QUIZ_SCORING.hard.max} 分/题）</span>
              <span>高难加权倍率 × 1.5</span>
              <span data-best-hard>历史最佳：${bestByMode.hard.score ? `${bestByMode.hard.score} 分 ${starText(bestByMode.hard.stars)}` : '待挑战'}</span>
            </div>
          </button>
        </div>

        <div class="cq-rule-strip">
          <div class="cq-rule-box"><span>题库规模</span><strong>${totalBankCount} 题（${easyBankCount} 简 / ${hardBankCount} 难）</strong></div>
          <div class="cq-rule-box"><span>每题限时</span><strong>${QUIZ_TIME_LIMIT} 秒倒计时</strong></div>
          <div class="cq-rule-box"><span>判卷机制</span><strong>答完 10 题由 AI 统一判题</strong></div>
          <div class="cq-rule-box"><span>AI 评分维度</span><strong>题目难度 × 剩余时间加权</strong></div>
        </div>

        <div class="cq-start-row">
          <span style="font-size:12px;color:#99b8d4">💡 提示：作答期间不提前剧透答案，支持键盘 <kbd style="padding:1px 5px;border:1px solid #355477;border-radius:4px;background:#0a1629;color:#8eeeff">A-D</kbd> 或 <kbd style="padding:1px 5px;border:1px solid #355477;border-radius:4px;background:#0a1629;color:#8eeeff">1-4</kbd> 疾速抢答以赢取更高 AI 时间加权分！</span>
          <button type="button" class="cq-start-btn" data-start>⚡ 开始随机抽题挑战</button>
        </div>
      </div>

      <!-- 2. PLAYING VIEW -->
      <div data-view="playing" hidden style="display:grid;gap:14px">
        <div class="cq-q-head">
          <div class="cq-q-badges">
            <span class="cq-q-num" data-q-num>第 01 / 10 题</span>
            <span class="cq-diff-tag is-easy" data-q-diff>简单题 · 最高 100 分</span>
            <span class="cq-cat-tag" data-q-cat>中国标准</span>
          </div>
          <div class="cq-timer-box" data-timer-box>
            <span style="font-size:11px;color:#9ab9d6">剩余时间</span>
            <strong data-timer-text>25.0s</strong>
          </div>
        </div>

        <div class="cq-timer-bar" data-timer-bar><i data-timer-fill></i></div>

        <h2 class="cq-prompt" data-q-prompt></h2>

        <div class="cq-options" data-q-options></div>

        <div class="cq-playing-foot">
          <span data-playing-hint>🔒 答案将暂存至 AI 阅卷队列，完成全部 10 题后由 AI 智能判题揭晓真相与评分。</span>
          <span data-answered-count>已提交 0 / 10 题</span>
        </div>
      </div>

      <!-- 3. AI GRADING VIEW -->
      <div data-view="grading" hidden>
        <div class="cq-grading-box">
          <span class="cq-pill" style="border-color:#75f1bb;color:#75f1bb">🤖 AI SMART GRADING ENGINE</span>
          <h3>AI 智驾评审官正在智能判题中…</h3>
          <p data-grading-step>正在核验 10 道题目答案、计算难度系数与剩余时间反应加权…</p>
          <div class="cq-grading-bar"><i data-grading-fill></i></div>
        </div>
      </div>

      <!-- 4. FINISHED AI REPORT VIEW -->
      <div data-view="finished" hidden style="display:grid;gap:16px">
        <div class="cq-report-hero">
          <div class="cq-rank-orb" data-rank-orb>
            <div>
              <strong data-rank-code>S</strong>
              <span data-rank-stars>★★★</span>
            </div>
          </div>
          <div class="cq-report-summary">
            <div class="cq-report-title-row">
              <h3 data-rank-title>AI 智能判题报告</h3>
              <div class="cq-score-big" data-score-big>0 <small>/ 1250 分</small></div>
            </div>
            <p class="cq-ai-comment" data-ai-comment></p>
          </div>
        </div>

        <div class="cq-dim-grid" data-dim-grid></div>

        <div class="cq-verdict-toolbar">
          <h4>📋 10 题 AI 逐题判卷与权威解析</h4>
          <div class="cq-filter-group" role="group" aria-label="筛选判卷明细">
            <button type="button" data-filter="all" aria-pressed="true">全部 10 题</button>
            <button type="button" data-filter="wrong" aria-pressed="false">仅看错题 / 超时</button>
          </div>
        </div>

        <div class="cq-verdict-list" data-verdict-list></div>

        <div class="cq-report-actions">
          <button type="button" class="btn" data-save>📸 保存 AI 成绩单</button>
          <button type="button" class="btn" data-switch-other>🔥 切换困难模式挑战</button>
          <button type="button" class="btn btn-primary" data-again>🔄 再抽 10 题继续挑战</button>
        </div>
      </div>
    </section>
  </div>`;

  const q = <T extends HTMLElement = HTMLElement>(s: string) => host.querySelector<T>(s)!;

  function clearLockTimer() {
    if (lockTimer !== null) {
      window.clearTimeout(lockTimer);
      lockTimer = null;
    }
    lockedOption = null;
  }

  function switchMode(mode: QuizMode, autoStart = false) {
    clearLockTimer();
    selectedMode = mode;
    state = createQuizSession(mode);
    gradingElapsed = 0;
    verdictFilter = 'all';
    if (autoStart) startQuizSession(state);
    renderUI();
  }

  function renderQuestion() {
    const item = state.questions[state.currentIdx];
    if (!item) return;
    q('[data-q-num]').textContent = `第 ${String(state.currentIdx + 1).padStart(2, '0')} / ${QUIZ_QUESTION_COUNT} 题`;
    const diffEl = q('[data-q-diff]');
    const isHard = item.difficulty === 'hard';
    diffEl.className = `cq-diff-tag ${isHard ? 'is-hard' : 'is-easy'}`;
    diffEl.textContent = isHard
      ? `🔥 困难题 · 基础 ${QUIZ_SCORING.hard.base} + 时间奖最高 ${QUIZ_SCORING.hard.speedMax}`
      : `⚡ 简单题 · 基础 ${QUIZ_SCORING.easy.base} + 时间奖最高 ${QUIZ_SCORING.easy.speedMax}`;
    q('[data-q-cat]').textContent = item.category;
    q('[data-q-prompt]').textContent = item.prompt;
    q('[data-answered-count]').textContent = `已提交 ${state.submissions.length} / ${QUIZ_QUESTION_COUNT} 题`;
    q('[data-playing-hint]').textContent = lockedOption !== null
      ? '✅ 已锁定本作答并推送至 AI 阅卷队列，正在切入下一题…'
      : '🔒 作答期间暂不公布对错，完成全部 10 题后由 AI 结合难度与剩余时间统一判题评分。';

    const optsBox = q('[data-q-options]');
    optsBox.innerHTML = item.options.map((text, idx) => `
      <button type="button" class="cq-opt-btn ${lockedOption === idx ? 'is-locked' : ''}" data-opt="${idx}" ${lockedOption !== null ? 'disabled' : ''}>
        <span class="cq-opt-key">${LETTERS[idx]}</span>
        <span>${text}</span>
      </button>
    `).join('');

    optsBox.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach(btn => {
      btn.addEventListener('click', () => handleOptionSelect(Number(btn.dataset.opt)));
    });
    updateTimerDOM();
  }

  function updateTimerDOM() {
    if (state.status !== 'playing') return;
    const t = Math.max(0, state.timeLeft);
    const pct = Math.max(0, Math.min(100, (t / QUIZ_TIME_LIMIT) * 100));
    const level = t <= 5 ? 'is-danger' : t <= 10 ? 'is-warn' : '';
    const box = q('[data-timer-box]');
    box.className = `cq-timer-box ${level}`;
    q('[data-timer-text]').textContent = `${t.toFixed(1)}s`;
    const bar = q('[data-timer-bar]');
    bar.className = `cq-timer-bar ${level}`;
    q('[data-timer-fill]').style.width = `${pct.toFixed(1)}%`;
  }

  function handleOptionSelect(idx: number) {
    if (state.status !== 'playing' || lockedOption !== null) return;
    lockedOption = idx;
    pulseFlash = 1;
    api.playCue?.('start');
    renderQuestion();
    lockTimer = window.setTimeout(() => {
      if (disposed) return;
      lockTimer = null;
      const chosen = lockedOption;
      lockedOption = null;
      if (chosen === null) return;
      submitQuizAnswer(state, chosen);
      if (state.status === 'grading') {
        gradingElapsed = 0;
        api.playCue?.('boost');
      }
      renderUI();
    }, 260);
  }

  function renderVerdictList() {
    const report = state.report;
    if (!report) return;
    const items = verdictFilter === 'wrong'
      ? report.verdicts.filter(v => !v.correct)
      : report.verdicts;

    const listEl = q('[data-verdict-list]');
    if (!items.length) {
      listEl.innerHTML = `<div class="cq-verdict-item is-ok" style="text-align:center;padding:20px">
        <strong style="color:#75f1bb;font-size:15px">🎉 太强了！本轮 10 道题全部答对，没有任何错题或超时记录！</strong>
      </div>`;
      return;
    }

    listEl.innerHTML = items.map(v => {
      const isHard = v.question.difficulty === 'hard';
      const mineText = v.timedOut || v.selectedIndex === null
        ? '⏱️ 超时未作答'
        : `${LETTERS[v.selectedIndex]}. ${v.question.options[v.selectedIndex]}`;
      const correctText = `${LETTERS[v.question.answerIndex]}. ${v.question.options[v.question.answerIndex]}`;
      const scoreText = v.correct
        ? `+${v.score} 分（基础 ${v.baseScore} + 速度奖 ${v.speedBonus} / 满 ${v.maxScore}）`
        : `0 / ${v.maxScore} 分`;

      return `<article class="cq-verdict-item ${v.correct ? 'is-ok' : 'is-bad'}">
        <div class="cq-verdict-top">
          <div class="cq-verdict-meta">
            <span class="cq-q-num" style="font-size:11px;padding:2px 7px">第 ${String(v.index + 1).padStart(2, '0')} 题</span>
            <span class="cq-diff-tag ${isHard ? 'is-hard' : 'is-easy'}" style="padding:2px 7px">${isHard ? '🔥 困难题' : '⚡ 简单题'}</span>
            <span class="cq-cat-tag" style="padding:2px 7px">${v.question.category}</span>
            <span style="color:#8db0d0">剩余 ${v.timeLeft.toFixed(1)}s / ${QUIZ_TIME_LIMIT}s</span>
          </div>
          <span class="cq-verdict-score">${v.correct ? '✓' : '✕'} ${scoreText}</span>
        </div>
        <p class="cq-verdict-prompt">${v.question.prompt}</p>
        <div class="cq-verdict-answers">
          <span class="cq-ans-mine">你的作答：<strong style="color:${v.correct ? '#75f1bb' : '#ff8c96'}">${mineText}</strong></span>
          <span class="cq-ans-correct">AI 核定标准答案：${correctText}</span>
        </div>
        <div class="cq-verdict-ai-note">🤖 ${v.aiNote}</div>
        <p class="cq-verdict-explain">💡 <strong>中国智驾科普解析：</strong>${v.question.explanation}</p>
      </article>`;
    }).join('');
  }

  function finishAiGrading() {
    const report = gradeQuizWithAI(state);
    api.playCue?.(report.stars >= 2 ? 'reward' : 'boost');

    // Update best records & global achievement awards
    const slot = bestByMode[report.mode];
    if (report.totalScore > slot.score) {
      slot.score = report.totalScore;
      slot.normalized = report.normalizedScore;
      slot.stars = Math.max(slot.stars, report.stars);
    }

    api.award('charging', 'quiz-finish', 40, '完成超充智驾 10 题知识挑战');
    if (report.normalizedScore >= 60) {
      api.award('charging', 'quiz-pass', 30, `智驾知识擂台达成 ${report.normalizedScore} 分`);
    }
    if (report.mode === 'hard' && report.normalizedScore >= 70) {
      api.award('charging', 'quiz-hard-master', 30, '征服中国智驾困难模式');
    } else if (report.normalizedScore >= 85) {
      api.award('charging', 'quiz-ace', 30, '智驾知识擂台高分优胜');
    }
    if (report.correctCount >= 6) api.complete('charging');

    const modeName = report.mode === 'hard' ? '困难模式（10道全困难）' : '普通模式（5简+5难）';
    api.record('charging', {
      summary: `在「智驾超充知识擂台」完成${modeName}，AI 智能判题综合得分 ${report.totalScore}/${report.maxTotalScore}（${report.normalizedScore} 分 · ${report.rankTitle}），答对 ${report.correctCount}/10 题。`,
      report: [
        { label: '挑战难度', value: modeName },
        { label: 'AI 综合评分', value: `${report.totalScore} / ${report.maxTotalScore}（折合 ${report.normalizedScore} 分）` },
        { label: 'AI 评级称号', value: `${report.rankCode} · ${report.rankTitle}` },
        { label: '答题正确率', value: `${report.correctCount} / 10 题（困难题 ${report.hardCorrect}/${report.hardTotal}）` },
        { label: '时间反应加权', value: `+${report.totalSpeedBonus} 分（平均剩余 ${report.avgTimeLeft.toFixed(1)}s）` },
      ],
      bestNormal: bestByMode.normal,
      bestHard: bestByMode.hard,
      lastMode: report.mode,
      lastScore: report.totalScore,
      lastNormalized: report.normalizedScore,
    });

    q('[data-best-normal]').textContent = `历史最佳：${bestByMode.normal.score ? `${bestByMode.normal.score} 分 ${starText(bestByMode.normal.stars)}` : '待挑战'}`;
    q('[data-best-hard]').textContent = `历史最佳：${bestByMode.hard.score ? `${bestByMode.hard.score} 分 ${starText(bestByMode.hard.stars)}` : '待挑战'}`;

    q('[data-rank-code]').textContent = report.rankCode;
    q('[data-rank-stars]').textContent = starText(report.stars);
    q('[data-rank-title]').textContent = `${report.rankTitle} · AI 智能判题完成`;
    q('[data-score-big]').innerHTML = `${report.totalScore} <small>/ ${report.maxTotalScore} 分（折合 ${report.normalizedScore} 分）</small>`;
    q('[data-ai-comment]').textContent = report.aiComment;

    const orb = q('[data-rank-orb]');
    const orbCol = report.normalizedScore >= 80 ? '#75f1bb' : report.normalizedScore >= 60 ? '#47eaff' : '#f5bc65';
    orb.style.borderColor = orbCol;
    q('[data-rank-code]').style.color = orbCol;

    q('[data-dim-grid]').innerHTML = report.dimensions.map(d => `
      <div class="cq-dim-card">
        <div class="cq-dim-head"><span>${d.label}</span><strong>${d.value}%</strong></div>
        <div class="cq-dim-bar"><i style="width:${d.value}%"></i></div>
        <small>${d.detail}</small>
      </div>
    `).join('');

    const switchBtn = q<HTMLButtonElement>('[data-switch-other]');
    switchBtn.textContent = report.mode === 'normal' ? '🔥 挑战困难模式（10全难）' : '⚡ 切换普通模式（5简+5难）';

    renderVerdictList();
    renderUI();
  }

  function renderUI() {
    host.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === selectedMode));
    });
    host.querySelectorAll<HTMLButtonElement>('[data-pick-mode]').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.pickMode === selectedMode);
    });
    host.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === verdictFilter));
    });

    q('[data-view="ready"]').hidden = state.status !== 'ready';
    q('[data-view="playing"]').hidden = state.status !== 'playing';
    q('[data-view="grading"]').hidden = state.status !== 'grading';
    q('[data-view="finished"]').hidden = state.status !== 'finished';

    if (state.status === 'playing') {
      renderQuestion();
    }
  }

  function drawSuperchargeStage(ctx: CanvasRenderingContext2D, time: number) {
    const v = api.getVehicle();
    const reduced = api.reducedMotion();

    // Cyber dark supercharge hub backdrop (1000 x 216)
    const bg = ctx.createLinearGradient(0, 0, 0, 216);
    bg.addColorStop(0, '#071122');
    bg.addColorStop(1, '#0e1e38');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1000, 216);

    // Subtle holographic grid
    ctx.strokeStyle = 'rgba(71, 234, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= 1000; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, 216); ctx.stroke();
    }
    for (let gy = 0; gy <= 216; gy += 36) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(1000, gy); ctx.stroke();
    }

    // Floor platform
    ctx.fillStyle = '#10233e';
    ctx.fillRect(0, 178, 1000, 38);
    ctx.strokeStyle = 'rgba(117, 241, 187, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 178); ctx.lineTo(1000, 178); ctx.stroke();

    // Left: 800V China Supercharge Tower + Player EV
    roundRect(ctx, 22, 42, 46, 136, 8, '#0c1c34', '#47eaff');
    roundRect(ctx, 30, 56, 30, 44, 5, '#071426', '#75f1bb');
    label(ctx, '800V', 31, 74, 10, '#75f1bb', 800);
    label(ctx, '超充', 34, 91, 10, '#47eaff', 700);

    // Glowing liquid-cooled cable into EV
    ctx.strokeStyle = state.status === 'playing' || state.status === 'grading' ? '#75f1bb' : '#3d6386';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(68, 118);
    ctx.bezierCurveTo(96, 152, 110, 162, 134, 134);
    ctx.stroke();

    // Animated energy pulse dots flowing along cable
    if (!reduced && (state.status === 'playing' || state.status === 'grading' || pulseFlash > 0)) {
      const p = (time * 1.4) % 1;
      const cx = 68 + (134 - 68) * p;
      const cy = 118 + Math.sin(p * Math.PI) * 30 + (134 - 118) * p;
      ctx.fillStyle = '#a7f3d0';
      ctx.shadowColor = '#75f1bb';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Player EV side profile
    drawPremiumCar(ctx, 206, 148, v.color, 0.56, 0, v.body);
    label(ctx, '中国智驾知识超充站 · 100 题库', 22, 26, 12, '#8eeeff', 700);

    // Center: 10-Cell Knowledge Energy Battery Bank (Q01..Q10)
    const bankX = 336;
    const bankY = 44;
    const bankW = 472;
    const bankH = 116;
    roundRect(ctx, bankX, bankY, bankW, bankH, 12, 'rgba(8, 19, 38, 0.92)', '#2d4f73');
    label(ctx, state.mode === 'hard' ? '🔥 困难模式电池阵列（10 题全困难）' : '⚡ 普通模式电池阵列（5 简单 + 5 困难）', bankX + 14, bankY + 21, 11, state.mode === 'hard' ? '#ffd68f' : '#9ff7d3', 700);

    const revealedCount = state.status === 'grading'
      ? Math.floor((gradingElapsed / 1.35) * QUIZ_QUESTION_COUNT)
      : state.status === 'finished' ? QUIZ_QUESTION_COUNT : 0;

    const cellGap = 7;
    const cellW = (bankW - 28 - cellGap * 9) / 10;
    for (let i = 0; i < QUIZ_QUESTION_COUNT; i++) {
      const cx = bankX + 14 + i * (cellW + cellGap);
      const cy = bankY + 34;
      const ch = 66;
      const qItem = state.questions[i];
      const sub = state.submissions[i];
      const verdict = state.report?.verdicts[i];
      const isCurrent = state.status === 'playing' && i === state.currentIdx;

      let fill = '#0c1a30';
      let stroke = '#274260';
      let badge = `0${i + 1}`.slice(-2);
      let badgeCol = '#6f92b3';
      let subLabel = qItem?.difficulty === 'hard' ? '难' : '简';

      if (state.status === 'finished' && verdict) {
        fill = verdict.correct ? 'rgba(20, 92, 68, 0.72)' : 'rgba(98, 28, 42, 0.72)';
        stroke = verdict.correct ? '#75f1bb' : '#ff7a84';
        badge = verdict.correct ? '✓' : '✕';
        badgeCol = verdict.correct ? '#b9ffe2' : '#ffb3ba';
        subLabel = verdict.correct ? `${verdict.score}` : '0分';
      } else if (state.status === 'grading' && i < revealedCount && sub && qItem) {
        const ok = !sub.timedOut && sub.selectedIndex === qItem.answerIndex;
        fill = ok ? 'rgba(20, 92, 68, 0.72)' : 'rgba(98, 28, 42, 0.72)';
        stroke = ok ? '#75f1bb' : '#ff7a84';
        badge = ok ? '✓' : '✕';
        badgeCol = ok ? '#b9ffe2' : '#ffb3ba';
        subLabel = ok ? '通过' : '失分';
      } else if (sub) {
        fill = sub.timedOut ? 'rgba(84, 42, 26, 0.6)' : 'rgba(18, 66, 98, 0.75)';
        stroke = sub.timedOut ? '#f59e0b' : '#47eaff';
        badge = sub.timedOut ? '⏱' : '●';
        badgeCol = sub.timedOut ? '#fde68a' : '#8ef4ff';
        subLabel = sub.timedOut ? '超时' : '待判';
      } else if (isCurrent) {
        const pulse = reduced ? 0.85 : 0.65 + Math.sin(time * 6) * 0.35;
        fill = `rgba(28, 86, 118, ${(0.35 + pulse * 0.25).toFixed(2)})`;
        stroke = '#75f1bb';
        badgeCol = '#ffffff';
      }

      roundRect(ctx, cx, cy, cellW, ch, 7, fill, stroke);
      // Tiny difficulty dot at top of cell
      ctx.fillStyle = qItem?.difficulty === 'hard' ? '#f5bc65' : '#47eaff';
      ctx.beginPath(); ctx.arc(cx + cellW / 2, cy + 10, 3, 0, Math.PI * 2); ctx.fill();

      ctx.font = '800 14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = badgeCol;
      ctx.fillText(badge, cx + cellW / 2, cy + 37);

      ctx.font = '600 10px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#b4d3ec';
      ctx.fillText(subLabel, cx + cellW / 2, cy + 56);
      ctx.textAlign = 'start';
    }

    // Sweeping AI Neural Scan Beam during grading
    if (state.status === 'grading') {
      const scanFrac = Math.min(1, gradingElapsed / 1.35);
      const sx = bankX + 14 + scanFrac * (bankW - 28);
      const grad = ctx.createLinearGradient(sx - 28, 0, sx + 8, 0);
      grad.addColorStop(0, 'rgba(71, 234, 255, 0)');
      grad.addColorStop(1, 'rgba(117, 241, 187, 0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - 28, bankY + 28, 36, bankH - 36);
      ctx.strokeStyle = '#d1fae5';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, bankY + 28); ctx.lineTo(sx, bankY + bankH - 8); ctx.stroke();
    }

    // Right: Circular 25s Countdown Ring OR AI Final Score Gauge
    const rx = 902;
    const ry = 102;
    const rr = 58;
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 18, 36, 0.92)'; ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#1b3454'; ctx.stroke();

    let ringFrac = 1;
    let ringCol = '#47eaff';
    let bigText = `${QUIZ_TIME_LIMIT}s`;
    let smallText = '每题限时';

    if (state.status === 'playing') {
      ringFrac = Math.max(0, state.timeLeft / QUIZ_TIME_LIMIT);
      ringCol = state.timeLeft <= 5 ? '#ff6b78' : state.timeLeft <= 10 ? '#f5bc65' : '#75f1bb';
      bigText = `${state.timeLeft.toFixed(1)}s`;
      smallText = `Q${state.currentIdx + 1} 倒计时`;
    } else if (state.status === 'grading') {
      ringFrac = Math.min(1, gradingElapsed / 1.35);
      ringCol = '#47eaff';
      bigText = `${Math.round(ringFrac * 100)}%`;
      smallText = 'AI 判题中';
    } else if (state.status === 'finished' && state.report) {
      ringFrac = state.report.normalizedScore / 100;
      ringCol = state.report.normalizedScore >= 80 ? '#75f1bb' : state.report.normalizedScore >= 60 ? '#47eaff' : '#f5bc65';
      bigText = `${state.report.normalizedScore}分`;
      smallText = `AI ${state.report.rankCode} 评级`;
    }

    ctx.beginPath();
    ctx.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringFrac);
    ctx.strokeStyle = ringCol;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.textAlign = 'center';
    ctx.font = '800 22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#f2faff';
    ctx.fillText(bigText, rx, ry + 5);
    ctx.font = '600 11px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = ringCol;
    ctx.fillText(smallText, rx, ry + 26);
    ctx.textAlign = 'start';

    // Footer status hint on stage
    const foot = state.status === 'ready'
      ? '选择普通或困难难度，从 100 题库随机抽取 10 题，完成后由 AI 结合难度与剩余时间智能评分'
      : state.status === 'playing'
        ? `当前作答第 ${state.currentIdx + 1}/${QUIZ_QUESTION_COUNT} 题 · 剩 ${state.timeLeft.toFixed(1)} 秒 · 答题越快、难题越准，AI 评分越高`
        : state.status === 'grading'
          ? '🤖 AI 智驾评审官正在逐题核验答案并加权计算最终评分…'
          : `🏆 AI 终审完成：${state.report?.totalScore ?? 0}/${state.report?.maxTotalScore ?? 0} 分 · 答对 ${state.report?.correctCount ?? 0}/10 题`;
    label(ctx, foot, 22, 202, 11, '#98b8d6', 600);
  }

  const stage = createStage(q('[data-stage]'), {
    width: 1000,
    height: 216,
    label: '智驾超充知识擂台实时能量与倒计时状态栏',
    update(dt) {
      if (pulseFlash > 0) pulseFlash = Math.max(0, pulseFlash - dt * 2.5);
      if (document.hidden) return;

      if (state.status === 'playing' && lockedOption === null) {
        const res = tickQuizTimer(state, dt);
        if (res.timedOut) {
          api.playCue?.('hit');
          if ((state.status as QuizSessionState['status']) === 'grading') {
            gradingElapsed = 0;
          }
          renderUI();
        } else {
          updateTimerDOM();
        }
      } else if (state.status === 'grading') {
        gradingElapsed += dt;
        const pct = Math.min(100, Math.round((gradingElapsed / 1.45) * 100));
        q('[data-grading-fill]').style.width = `${pct}%`;
        const stepEl = q('[data-grading-step]');
        if (pct < 38) stepEl.textContent = '1/3 · 正在比对 100 题中国智驾权威知识库核验 10 道作答…';
        else if (pct < 76) stepEl.textContent = '2/3 · 正在按「题目难度系数 × 25 秒剩余时间」计算速度加权分…';
        else stepEl.textContent = '3/3 · 正在生成 4 维智驾能力雷达与 AI 专属诊断评语…';

        if (gradingElapsed >= 1.45) {
          finishAiGrading();
        }
      }
    },
    draw(ctx, time) {
      drawSuperchargeStage(ctx, time);
    },
  });

  // Event bindings
  host.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode as QuizMode, false));
  });
  host.querySelectorAll<HTMLButtonElement>('[data-pick-mode]').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.pickMode as QuizMode, false));
  });
  q('[data-start]').addEventListener('click', () => {
    startQuizSession(state);
    api.playCue?.('start');
    renderUI();
  });
  q('[data-redraw]').addEventListener('click', () => {
    switchMode(selectedMode, state.status === 'playing');
  });
  q('[data-again]').addEventListener('click', () => {
    switchMode(selectedMode, true);
  });
  q('[data-switch-other]').addEventListener('click', () => {
    switchMode(selectedMode === 'normal' ? 'hard' : 'normal', true);
  });
  q('[data-save]').addEventListener('click', () => {
    api.saveImage('charging', stage.capture());
    api.notify('已保存智驾知识擂台 AI 成绩单到作品档案！');
  });
  host.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      verdictFilter = btn.dataset.filter as 'all' | 'wrong';
      host.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.filter === verdictFilter))
      );
      renderVerdictList();
    });
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (state.status !== 'playing' || lockedOption !== null) return;
    const keyMap: Record<string, number> = {
      '1': 0, '2': 1, '3': 2, '4': 3,
      a: 0, A: 0, b: 1, B: 1, c: 2, C: 2, d: 3, D: 3,
    };
    if (e.key in keyMap) {
      e.preventDefault();
      handleOptionSelect(keyMap[e.key]);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  renderUI();

  return {
    destroy() {
      disposed = true;
      clearLockTimer();
      window.removeEventListener('keydown', onKeyDown);
      stage.destroy();
    },
  };
}
