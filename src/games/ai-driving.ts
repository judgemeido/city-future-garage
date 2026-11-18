import { createStage, escapeHTML } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import {
  AI_CONCEPTS,
  BRAIN_ACTION_META,
  BRAIN_ACTIONS,
  BRAIN_SCENARIOS,
  SCENARIO_MAP,
  brainMastery,
  createEmptyMemory,
  examGrade,
  forgetScenario,
  predictBrain,
  sanitizeBrainMemory,
  teachScenario,
  type BrainAction,
  type BrainMemory,
  type BrainStyle,
  type RoadEvent,
  type RunMode,
  type ScenarioId,
} from './ai-brain-model';
import { CAR_X, LANE_Y, drawBrainWorld, type FloatingPop } from './ai-brain-view';
import { AI_DECISION_SECONDS, advanceRedLightWait } from './ai-driving-flow';
import './ai-brain.css';

function renderNeuralSVG(activeScenario: ScenarioId | null, probs: Record<BrainAction, number>, topAction: BrainAction | null): string {
  const inputs: { id: ScenarioId; label: string; y: number }[] = [
    { id: 'clear', label: '绿灯畅通', y: 20 },
    { id: 'redlight', label: '路口红灯', y: 46 },
    { id: 'pedestrian', label: '行人横穿', y: 72 },
    { id: 'construction', label: '施工占道', y: 98 },
    { id: 'school', label: '校园限速', y: 124 },
    { id: 'ambulance', label: '急救接近', y: 150 },
  ];
  const outputs: { id: BrainAction; label: string; y: number; color: string }[] = [
    { id: 'go', label: '前行', y: 32, color: '#75f1bb' },
    { id: 'slow', label: '慢行', y: 68, color: '#f5bc65' },
    { id: 'stop', label: '刹停', y: 104, color: '#ff7c95' },
    { id: 'detour', label: '变道', y: 140, color: '#bc98ff' },
  ];

  const lines: string[] = [];
  for (const inp of inputs) {
    const isInpActive = activeScenario === inp.id;
    for (const out of outputs) {
      const weight = isInpActive ? probs[out.id] : 0.12;
      const stroke = isInpActive ? out.color : '#2a415d';
      const opacity = isInpActive ? Math.max(0.18, Math.min(0.95, weight * 1.15)) : 0.28;
      const width = isInpActive ? (1 + weight * 3.2).toFixed(1) : '0.8';
      lines.push(`<line x1="78" y1="${inp.y}" x2="218" y2="${out.y}" stroke="${stroke}" stroke-opacity="${opacity.toFixed(2)}" stroke-width="${width}" />`);
    }
  }

  const inputNodes = inputs.map(inp => {
    const on = activeScenario === inp.id;
    const col = on ? SCENARIO_MAP[inp.id].color : '#3e5874';
    return `<g>
      <rect x="4" y="${inp.y - 10}" width="66" height="20" rx="5" fill="${on ? '#162b46' : '#0d192b'}" stroke="${col}" stroke-width="${on ? 1.5 : 1}" />
      <text x="37" y="${inp.y + 4}" text-anchor="middle" font-size="9" fill="${on ? '#f0f8ff' : '#8ea8c2'}" font-weight="${on ? '700' : '500'}">${inp.label}</text>
      <circle cx="78" cy="${inp.y}" r="${on ? 4.5 : 3}" fill="${on ? col : '#435e7a'}" />
    </g>`;
  }).join('');

  const outputNodes = outputs.map(out => {
    const pct = Math.round(probs[out.id] * 100);
    const isTop = topAction === out.id;
    return `<g>
      <circle cx="218" cy="${out.y}" r="${isTop ? 5.5 : 3.5}" fill="${isTop ? out.color : '#3c5570'}" />
      <rect x="228" y="${out.y - 11}" width="64" height="22" rx="6" fill="${isTop ? '#1b2b45' : '#0d192b'}" stroke="${isTop ? out.color : '#2f4660'}" stroke-width="${isTop ? 1.6 : 1}" />
      <text x="260" y="${out.y + 4}" text-anchor="middle" font-size="10" fill="${isTop ? out.color : '#94aec8'}" font-weight="${isTop ? '700' : '500'}">${out.label} ${pct}%</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 296 170" role="img" aria-label="AI 实时决策神经网络图">
    <text x="37" y="9" text-anchor="middle" font-size="8" fill="#6f8ca8">感知特征输入</text>
    <text x="148" y="9" text-anchor="middle" font-size="8" fill="#8b7bb8">经验权重网络</text>
    <text x="260" y="9" text-anchor="middle" font-size="8" fill="#6f8ca8">决策输出</text>
    ${lines.join('')}
    ${inputNodes}
    ${outputNodes}
  </svg>`;
}

export function mountAIDriving(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('ai');
  let memory: BrainMemory = sanitizeBrainMemory(saved.brainMemory);
  let style: BrainStyle = (['cautious', 'balanced', 'eager'] as BrainStyle[]).includes(saved.brainStyle as BrainStyle)
    ? (saved.brainStyle as BrainStyle)
    : 'balanced';
  let taughtCount = Number(saved.brainTaughtCount) || 0;
  let autoPassCount = Number(saved.brainAutoPassCount) || 0;
  let examBestPassed = Number(saved.brainExamBestPassed) || 0;
  const unlocked = new Set<string>(Array.isArray(saved.brainConcepts) ? (saved.brainConcepts as string[]) : []);

  let running = false;
  let paused = false;
  let mode: RunMode = 'train';
  let roadOffset = 0;
  let carLane = 1;
  let carY: number = LANE_Y[1];
  let targetCarY: number = LANE_Y[1];
  let carTilt = 0;
  let speedKmh = 0;
  let combo = 0;
  let score = 0;
  let bulletTime = false;
  let bulletTimer = 0;
  let dataPulse = 0;
  let eventCooldown = 0.8;
  let eventUid = 1;
  let activeEvent: RoadEvent | null = null;
  let examQueue: ScenarioId[] = [];
  let examIndex = 0;
  let examPassed = 0;
  let examCoachSaves = 0;
  let examFinished = false;
  let trainRoundIndex = 0;
  let bubble = '准备好发车了吗？我还是萌新大脑，等你教我！';
  let bubbleTone: 'info' | 'good' | 'warn' = 'info';
  let coachMessage = '点击「🚀 发车训练」，AI 小车会自动上路。遇到没学过的路况会进入慢动作，你只需一键示范，它立刻记住！';
  let coachTone: 'info' | 'good' | 'warn' = 'info';
  let pops: FloatingPop[] = [];
  let disposed = false;
  let uiAccum = 0;

  const root = document.createElement('section');
  root.className = 'aib-root';
  root.innerHTML = `
    <div class="aib-header">
      <div class="aib-header-copy">
        <span class="aib-eyebrow">AI AUTOPILOT ACADEMY · 智驾大脑养成战</span>
        <h2>边跑边教，把萌新 AI 养成王牌老司机</h2>
        <p>遇到难题触发慢动作接管示范，AI 实时写入神经网络权重；学完后放开双手，送它去雨夜全自动毕业路考！</p>
      </div>
      <div class="aib-header-stats">
        <div class="aib-level-pill">
          <span>当前大脑等级</span>
          <strong data-aib-level>Lv.0 萌新大脑</strong>
        </div>
        <div class="aib-header-btns">
          <button class="btn aib-btn-train" data-aib-start-train>🚀 发车训练</button>
          <button class="btn aib-btn-exam" data-aib-start-exam>🏆 放手毕业考</button>
        </div>
      </div>
    </div>

    <div class="aib-grid">
      <div class="aib-main">
        <div class="aib-stage-card">
          <div class="aib-stage" data-aib-stage>
            <div class="aib-stage-overlay" data-aib-overlay>
              <span data-aib-ov-kicker>INTERACTIVE AI TRAINING</span>
              <h3 data-aib-ov-title>准备启程 · 你的 AI 大脑正在等待第一课</h3>
              <p data-aib-ov-body>AI 一开始什么交规都不懂。发车后遇到红灯、行人、施工、校园或急救车时，慢动作会给你留出时间：按下下方 4 个动作键示范一次，下次它就能自己稳稳开过去！</p>
              <div class="aib-overlay-actions">
                <button class="btn aib-btn-train" data-aib-ov-train>🚀 发车！边跑边教</button>
                <button class="btn aib-btn-exam" data-aib-ov-exam>🏆 直接参加全自动路考</button>
              </div>
            </div>
          </div>

          <div class="aib-decision-status" data-aib-decision-status hidden>
            <span>⚡ 点动作键示范</span>
            <strong data-aib-decision-count role="timer" aria-label="示范剩余时间"></strong>
          </div>
          <div class="aib-action-dock" role="group" aria-label="教练接管示范动作">
            ${BRAIN_ACTIONS.map(a => {
              const m = BRAIN_ACTION_META[a];
              return `<button class="aib-action-btn" data-aib-act="${a}" style="--act-color:${m.color}">
                <strong>${m.label}</strong>
                <span>${m.desc}</span>
                <kbd>${m.keyHint}</kbd>
              </button>`;
            }).join('')}
          </div>

          <div class="aib-toolbar-row">
            <span data-aib-tip>快捷键：1/W 前行 · 2/S 慢行 · 3/空格 刹停 · 4/A·D 变道 · P 暂停</span>
            <div>
              <button class="btn" data-aib-pause disabled>暂停</button>
              <button class="btn" data-aib-reset-brain>清空大脑重学</button>
              <button class="btn" data-aib-snapshot>保存驾照快照</button>
            </div>
          </div>
        </div>

        <div class="aib-coach-banner" data-aib-banner data-tone="info" role="status" aria-live="polite">
          <span class="aib-coach-icon" data-aib-banner-icon>🧠</span>
          <div data-aib-coach-text></div>
        </div>
      </div>

      <aside class="aib-brain-panel" aria-label="实时 AI 决策大脑">
        <div class="aib-panel-head">
          <h3>🧠 实时 AI 神经网络大脑</h3>
          <span data-aib-mastery>已掌握 0 / 6 路况</span>
        </div>

        <div class="aib-style-bar">
          <span>AI 驾驶性格（超参数调节）</span>
          <div class="aib-style-btns" role="group" aria-label="AI 驾驶风格">
            <button data-aib-style="cautious" aria-pressed="${style === 'cautious'}">🐢 稳健保守</button>
            <button data-aib-style="balanced" aria-pressed="${style === 'balanced'}">⚖️ 标准均衡</button>
            <button data-aib-style="eager" aria-pressed="${style === 'eager'}">⚡ 高效积极</button>
          </div>
        </div>

        <div class="aib-net-box">
          <div data-aib-svg></div>
          <div class="aib-probs" data-aib-probs></div>
        </div>

        <div class="aib-panel-head">
          <h3>📚 经验记忆库（支持数据清洗）</h3>
          <span data-aib-samples>0 份样本</span>
        </div>
        <div class="aib-memory-list" data-aib-memory></div>
      </aside>
    </div>

    <div class="aib-concepts" data-aib-concepts aria-label="AI 核心科普知识点"></div>
  `;
  host.append(root);

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  function cruiseSpeed(): number {
    return style === 'cautious' ? 46 : style === 'eager' ? 68 : 56;
  }

  function addPop(text: string, color: string, x = CAR_X + 20, y = carY - 30) {
    pops.push({ text, color, x, y, age: 0 });
    if (pops.length > 6) pops = pops.slice(-6);
  }

  function unlockConcept(id: string) {
    if (unlocked.has(id)) return;
    unlocked.add(id);
    const item = AI_CONCEPTS.find(c => c.id === id);
    if (item) api.notify(`解锁 AI 科普：${item.title}`);
  }

  function persist() {
    const m = brainMastery(memory);
    const grade = examGrade(examBestPassed, BRAIN_SCENARIOS.length);
    api.record('ai', {
      brainMemory: memory,
      brainStyle: style,
      brainTaughtCount: taughtCount,
      brainAutoPassCount: autoPassCount,
      brainExamBestPassed: examBestPassed,
      brainConcepts: [...unlocked],
      summary: `我的 AI 小司机已掌握 ${m.mastered}/6 类路况（${m.title}），完成 ${taughtCount} 次人类示范与 ${autoPassCount} 次自主通过，毕业路考最高 ${examBestPassed}/6。`,
      report: [
        { label: 'AI 大脑等级', value: `${m.title}（掌握 ${m.mastered}/6 类路况）` },
        { label: '示范训练与自主过关', value: `人类示范 ${taughtCount} 次 · AI 自主过关 ${autoPassCount} 次` },
        { label: '全自动毕业路考', value: examBestPassed ? `${grade.rank} · 最高 ${examBestPassed}/6 关自主通过` : '尚未参加毕业路考' },
        { label: 'AI 驾驶性格', value: style === 'cautious' ? '稳健保守' : style === 'eager' ? '高效积极' : '标准均衡' },
        { label: '已解锁 AI 科普', value: `${unlocked.size}/4 个核心原理（模仿学习 / DAgger / 数据清洗 / 泛化）` },
        { label: '学习机制说明', value: '在线模仿学习 + 概率权重决策网络 + 人类接管纠错闭环（教学仿真）' },
      ],
    });
  }

  function pickNextTrainScenario(): ScenarioId {
    const polluted = BRAIN_SCENARIOS.filter(s => {
      const p = predictBrain(memory, s.id, style, 'clear');
      return p.trainedSamples > 0 && p.isPolluted;
    });
    if (polluted.length) return polluted[trainRoundIndex++ % polluted.length].id;

    const unmastered = BRAIN_SCENARIOS.filter(s => {
      const p = predictBrain(memory, s.id, style, 'clear');
      return p.isUncertain || p.trainedSamples === 0;
    });
    if (unmastered.length) {
      // Interleave 1 mastered scenario every 3 events so players immediately enjoy watching AI drive autonomously!
      const mastered = BRAIN_SCENARIOS.filter(s => !unmastered.includes(s));
      if (mastered.length && trainRoundIndex % 3 === 2) {
        return mastered[Math.floor(trainRoundIndex++ / 3) % mastered.length].id;
      }
      return unmastered[trainRoundIndex++ % unmastered.length].id;
    }
    return BRAIN_SCENARIOS[trainRoundIndex++ % BRAIN_SCENARIOS.length].id;
  }

  function spawnEvent(scenarioId: ScenarioId, weather: 'clear' | 'rain') {
    const lane = scenarioId === 'construction' || scenarioId === 'ambulance' ? carLane : 1;
    const targetLane = lane === 1 ? (eventUid % 2 === 0 ? 0 : 2) : 1;
    const pred = predictBrain(memory, scenarioId, style, weather);
    activeEvent = {
      uid: eventUid++,
      scenarioId,
      x: scenarioId === 'ambulance' ? 760 : 940,
      lane,
      targetLane,
      state: 'approaching',
      weather,
      aiPrediction: pred,
      chosenAction: null,
      humanIntervened: false,
      outcome: 'pending',
      timer: 0,
      pedProgress: 0,
      ambX: -80,
      lightGreen: false,
    };
  }

  function applyDecision(ev: RoadEvent, action: BrainAction, byHuman: boolean) {
    if (ev.state !== 'decision' && ev.state !== 'approaching') return;
    const scenario = SCENARIO_MAP[ev.scenarioId];
    ev.chosenAction = action;
    ev.humanIntervened = byHuman;
    ev.state = 'executing';
    bulletTime = false;
    bulletTimer = 0;

    if (byHuman) {
      teachScenario(memory, ev.scenarioId, action, 2);
      taughtCount++;
      dataPulse = 1;
      unlockConcept('imitation');
      api.award('ai', 'model-created', 20, '亲手训练 AI 大脑');
    }

    const isCorrect = action === scenario.correctAction;
    if (isCorrect) {
      ev.outcome = byHuman ? 'human-pass' : 'auto-pass';
      if (action === 'detour') {
        carLane = ev.targetLane;
        targetCarY = LANE_Y[carLane];
      }
      if (byHuman) {
        combo++;
        const pts = 120 + Math.min(80, combo * 15);
        score += pts;
        bubble = `记住了！遇到${scenario.badge}就「${BRAIN_ACTION_META[action].short}」！`;
        bubbleTone = 'good';
        coachMessage = `✅ 示范成功！${scenario.scienceTip}`;
        coachTone = 'good';
        addPop(`+${pts} 示范入库！`, '#75f1bb');
        api.playCue?.('reward');
        api.award('ai', `driving-${ev.scenarioId}`, 10, `教会 AI：${scenario.title}`);
      } else {
        autoPassCount++;
        combo++;
        const pts = 180 + Math.min(120, combo * 20);
        score += pts;
        if (mode === 'exam') examPassed++;
        unlockConcept('dagger');
        bubble = scenario.autonomousPraise;
        bubbleTone = 'good';
        coachMessage = `🤖 AI 自主完美通过「${scenario.title}」（置信度 ${ev.aiPrediction.confidence}%）！你的训练真的生效了！`;
        coachTone = 'good';
        addPop(`🤖 AI 自主过关 +${pts}`, '#47eaff');
        api.playCue?.('boost');
        api.award('ai', `driving-${ev.scenarioId}`, 10, `AI 自主通过：${scenario.title}`);
      }
      const m = brainMastery(memory);
      if (m.mastered >= 3) api.complete('ai');
    } else {
      // Unsafe or wrong action -> Safety Coach intercepts!
      combo = 0;
      ev.outcome = byHuman ? 'bad-demo' : 'coach-save';
      if (mode === 'exam') examCoachSaves++;
      unlockConcept('gigo');
      // Safety coach forces safe action to protect the car
      if (scenario.correctAction === 'detour') {
        carLane = ev.targetLane;
        targetCarY = LANE_Y[carLane];
      }
      bubble = byHuman
        ? `你教我「${BRAIN_ACTION_META[action].short}」…我记下了，但安全系统紧急刹住了！`
        : ev.aiPrediction.isPolluted
          ? `你上次教我「${BRAIN_ACTION_META[action].short}」，安全员帮我拦住了！`
          : `我没学过这类路况，瞎猜「${BRAIN_ACTION_META[action].short}」差点出事！`;
      bubbleTone = 'warn';
      coachMessage = byHuman
        ? `⚠️ 数据污染实验（Garbage In, Garbage Out）：你示范了「${BRAIN_ACTION_META[action].label}」，AI 已忠实记录！${scenario.wrongTip} 可点右侧「🧹 遗忘」清洗数据。`
        : `🛡️ 安全护航接管！AI 原始判断「${BRAIN_ACTION_META[action].label}」不安全。${scenario.wrongTip}`;
      coachTone = 'warn';
      addPop(byHuman ? '⚠️ 错误样本已写入大脑' : '🛡️ 安全护航接管', '#ff7c95');
      api.playCue?.('hit');
    }

    persist();
    updateUI();
  }

  function startRun(nextMode: RunMode) {
    mode = nextMode;
    running = true;
    paused = false;
    examFinished = false;
    activeEvent = null;
    bulletTime = false;
    bulletTimer = 0;
    pops = [];
    carLane = 1;
    carY = LANE_Y[1];
    targetCarY = LANE_Y[1];
    speedKmh = cruiseSpeed();
    eventCooldown = 0.65;

    if (mode === 'exam') {
      examQueue = ['clear', 'redlight', 'construction', 'school', 'pedestrian', 'ambulance'];
      examIndex = 0;
      examPassed = 0;
      examCoachSaves = 0;
      combo = 0;
      score = 0;
      bubble = '全自动毕业路考开始！请放开双手看我表现！';
      bubbleTone = 'info';
      coachMessage = '🏆 毕业路考进行中（Hands-Off）：禁用手动控制，后 3 关将开启雨夜低能见度，检验 AI 的真实泛化能力！';
      coachTone = 'info';
    } else {
      bubble = '教练，我出发啦！遇到不懂的路况我会慢下来问你！';
      bubbleTone = 'info';
      coachMessage = '🎓 训练模式已启动：遇到未掌握的路况会自动进入慢动作，点下方 4 个动作键（或按 1/2/3/4）教 AI！';
      coachTone = 'info';
    }
    api.playCue?.('start');
    updateUI();
  }

  function finishExam() {
    running = false;
    examFinished = true;
    activeEvent = null;
    bulletTime = false;
    speedKmh = 0;
    examBestPassed = Math.max(examBestPassed, examPassed);
    unlockConcept('generalize');
    if (examPassed >= 4) api.complete('ai');
    if (examPassed >= 5) api.award('ai', 'exam-ace', 20, '全自动雨夜路考通关');
    const grade = examGrade(examPassed, examQueue.length);
    coachMessage = `🏆 路考完成！评级：${grade.rank}（${grade.title}）—— 自主通过 ${examPassed}/${examQueue.length} 关，安全护航介入 ${examCoachSaves} 次。`;
    coachTone = examPassed >= 5 ? 'good' : 'info';
    api.playCue?.(examPassed >= 4 ? 'reward' : 'hit');
    persist();
    updateUI();
  }

  function syncRunState() {
    root.dataset.running = String(running);
    root.dataset.paused = String(paused);
    root.dataset.mode = mode;
    root.dataset.bullet = String(bulletTime);
    root.dataset.decisionRemaining = String(bulletTime ? Math.max(0, AI_DECISION_SECONDS - bulletTimer) : 0);
    root.dataset.scenario = activeEvent?.scenarioId ?? '';
    root.dataset.eventState = activeEvent?.state ?? 'idle';
    root.dataset.eventUid = String(activeEvent?.uid ?? 0);
    root.dataset.eventX = String(activeEvent?.x ?? 0);
    root.dataset.lightGreen = String(activeEvent?.lightGreen ?? false);
    root.dataset.speed = String(speedKmh);
    root.dataset.examIndex = String(examIndex);
    $('[data-aib-decision-status]').hidden = !bulletTime;
    $('[data-aib-decision-count]').textContent = `剩余 ${Math.max(0, AI_DECISION_SECONDS - bulletTimer).toFixed(1)} 秒`;
  }

  function updateUI() {
    if (disposed) return;
    const mastery = brainMastery(memory);
    syncRunState();

    $('[data-aib-level]').textContent = mastery.title;
    $('[data-aib-mastery]').textContent = `已掌握 ${mastery.mastered} / ${BRAIN_SCENARIOS.length} 路况`;
    $('[data-aib-samples]').textContent = `${mastery.totalSamples} 份样本`;
    $('[data-aib-coach-text]').textContent = coachMessage;
    $('[data-aib-banner]').dataset.tone = coachTone;
    $('[data-aib-banner-icon]').textContent = coachTone === 'good' ? '✨' : coachTone === 'warn' ? '⚠️' : '🧠';

    // Overlay visibility
    const overlay = $('[data-aib-overlay]');
    overlay.hidden = running;
    if (!running) {
      if (examFinished) {
        const grade = examGrade(examPassed, examQueue.length);
        $('[data-aib-ov-kicker]').textContent = 'AUTOPILOT EXAM RESULT · 毕业路考成绩单';
        $('[data-aib-ov-title]').textContent = `${grade.rank} · ${grade.title}（${examPassed} / ${examQueue.length}）`;
        $('[data-aib-ov-body]').textContent = examPassed === examQueue.length
          ? '太强了！你的 AI 大脑在晴天和雨夜 6 大路况里全部自主通过，零安全接管，真正学会了举一反三！'
          : `你的 AI 自主通过了 ${examPassed} 关，安全护航帮它化解了 ${examCoachSaves} 次危机。看看右侧大脑记忆库，把红色污染或低置信度路况重新教一遍再来考！`;
        $('[data-aib-ov-train]').textContent = '🎓 回到训练营继续教 AI';
        $('[data-aib-ov-exam]').textContent = '🏆 再考一次全自动路考';
      } else {
        $('[data-aib-ov-kicker]').textContent = 'INTERACTIVE AI TRAINING · 智驾大脑养成战';
        $('[data-aib-ov-title]').textContent = mastery.mastered > 0
          ? `欢迎回来！你的 AI 已是「${mastery.title}」`
          : '准备启程 · 你的 AI 大脑正在等待第一课';
        $('[data-aib-ov-body]').textContent = mastery.mastered >= 4
          ? '你的 AI 已经掌握了大部分交规！可以继续训练打磨连击，或者直接送它去「放手毕业路考」，挑战雨夜全自动通关！'
          : 'AI 一开始什么交规都不懂。发车后遇到红灯、行人、施工、校园或急救车时，慢动作会给你留出时间：按下下方 4 个动作键示范一次，下次它就能自己稳稳开过去！';
        $('[data-aib-ov-train]').textContent = '🚀 发车！边跑边教';
        $('[data-aib-ov-exam]').textContent = '🏆 放手毕业路考';
      }
    }

    // Action buttons state: enabled during training when an event is active (or anytime in train for preview)
    const canAct = running && !paused && mode === 'train' && !!activeEvent && (activeEvent.state === 'decision' || activeEvent.state === 'approaching');
    root.querySelectorAll<HTMLButtonElement>('[data-aib-act]').forEach(btn => {
      btn.disabled = !canAct;
    });

    const pauseBtn = $<HTMLButtonElement>('[data-aib-pause]');
    pauseBtn.disabled = !running;
    pauseBtn.textContent = paused ? '继续行驶' : '暂停';

    root.querySelectorAll<HTMLButtonElement>('[data-aib-style]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.aibStyle === style));
    });

    // Live Neural Network SVG + Probability bars
    const curScenario = activeEvent ? activeEvent.scenarioId : null;
    const curWeather = activeEvent ? activeEvent.weather : 'clear';
    const curPred = curScenario
      ? predictBrain(memory, curScenario, style, curWeather)
      : { action: 'go' as BrainAction, confidence: 25, probs: { go: 0.25, slow: 0.25, stop: 0.25, detour: 0.25 } };

    $('[data-aib-svg]').innerHTML = renderNeuralSVG(curScenario, curPred.probs, curScenario ? curPred.action : null);
    $('[data-aib-probs]').innerHTML = BRAIN_ACTIONS.map(a => {
      const pct = Math.round(curPred.probs[a] * 100);
      const m = BRAIN_ACTION_META[a];
      return `<div class="aib-prob-row">
        <span>${m.label}</span>
        <div class="aib-prob-track"><div class="aib-prob-fill" style="width:${pct}%;background:${m.color}"></div></div>
        <b>${pct}%</b>
      </div>`;
    }).join('');

    // Scenario Memory Bank
    $('[data-aib-memory]').innerHTML = BRAIN_SCENARIOS.map(s => {
      const p = predictBrain(memory, s.id, style, 'clear');
      const cls = p.trainedSamples === 0 ? '' : p.isPolluted ? 'is-polluted' : p.confidence >= 62 ? 'is-mastered' : '';
      const statusText = p.trainedSamples === 0
        ? '未学习 · 会盲猜'
        : p.isPolluted
          ? `⚠️ 误学为「${BRAIN_ACTION_META[p.action].short}」(${p.confidence}%)`
          : `✓ 学会「${BRAIN_ACTION_META[p.action].short}」(${p.confidence}%) · ${p.trainedSamples}样本`;
      return `<div class="aib-mem-item ${cls}">
        <div class="aib-mem-info">
          <strong>${escapeHTML(s.title)}</strong>
          <span>${statusText}</span>
        </div>
        ${p.trainedSamples > 0 ? `<button class="aib-mem-clean" data-aib-forget="${s.id}" title="清洗该路况的记忆数据">🧹 遗忘</button>` : ''}
      </div>`;
    }).join('');

    // 4 AI Science Concept Cards
    $('[data-aib-concepts]').innerHTML = AI_CONCEPTS.map(c => {
      const isOpen = unlocked.has(c.id);
      return `<article class="aib-concept-card ${isOpen ? 'is-unlocked' : ''}">
        <div class="aib-concept-top">
          <strong>${c.title}</strong>
          <span class="aib-concept-badge">${isOpen ? '✓ 已体验' : c.tag}</span>
        </div>
        <p>${c.text}</p>
      </article>`;
    }).join('');
  }

  function handleHumanAction(action: BrainAction) {
    if (!running || paused || mode !== 'train' || !activeEvent) return;
    if (activeEvent.state !== 'decision' && activeEvent.state !== 'approaching') return;
    const btn = root.querySelector<HTMLButtonElement>(`[data-aib-act="${action}"]`);
    if (btn) {
      btn.classList.add('is-flash');
      setTimeout(() => btn.classList.remove('is-flash'), 180);
    }
    applyDecision(activeEvent, action, true);
  }

  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const actBtn = target.closest<HTMLButtonElement>('[data-aib-act]');
    if (actBtn && !actBtn.disabled) {
      handleHumanAction(actBtn.dataset.aibAct as BrainAction);
      return;
    }
    if (target.closest('[data-aib-start-train], [data-aib-ov-train]')) { startRun('train'); return; }
    if (target.closest('[data-aib-start-exam], [data-aib-ov-exam]')) { startRun('exam'); return; }
    if (target.closest('[data-aib-pause]')) {
      if (!running) return;
      paused = !paused;
      updateUI();
      return;
    }
    if (target.closest('[data-aib-reset-brain]')) {
      memory = createEmptyMemory();
      combo = 0;
      score = 0;
      bubble = '大脑已重置为 Lv.0 萌新！重新带我学开车吧！';
      bubbleTone = 'info';
      coachMessage = '🧹 已清空所有训练样本！现在你可以从零体验 AI 如何一步步从萌新成长为老司机。';
      coachTone = 'info';
      persist();
      updateUI();
      api.notify('AI 大脑记忆已清空');
      return;
    }
    if (target.closest('[data-aib-snapshot]')) {
      persist();
      api.saveImage('ai', stage.capture());
      api.notify('AI 司机驾照快照已保存到「我的作品」');
      return;
    }
    const styleBtn = target.closest<HTMLButtonElement>('[data-aib-style]');
    if (styleBtn) {
      style = styleBtn.dataset.aibStyle as BrainStyle;
      coachMessage = style === 'cautious'
        ? '🐢 切换为「稳健保守」风格：巡航车速更低，遇到陌生路况倾向慢行与刹停。'
        : style === 'eager'
          ? '⚡ 切换为「高效积极」风格：巡航更快，未训练时更容易冒险前行！'
          : '⚖️ 切换为「标准均衡」风格：在通行效率与安全礼让之间取得平衡。';
      coachTone = 'info';
      persist();
      updateUI();
      return;
    }
    const forgetBtn = target.closest<HTMLButtonElement>('[data-aib-forget]');
    if (forgetBtn) {
      const id = forgetBtn.dataset.aibForget as ScenarioId;
      forgetScenario(memory, id);
      unlockConcept('gigo');
      coachMessage = `🧹 数据清洗完成！AI 已遗忘「${SCENARIO_MAP[id].title}」的旧经验，下次遇到会重新触发慢动作等你示范！`;
      coachTone = 'info';
      persist();
      updateUI();
      api.notify(`已清洗「${SCENARIO_MAP[id].title}」记忆`);
    }
  });

  function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest('input,select,textarea,button,a')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'p' && running && !e.repeat) {
      e.preventDefault();
      paused = !paused;
      updateUI();
      return;
    }
    if (!running || paused || mode !== 'train') return;
    if (k === '1' || k === 'w' || e.key === 'ArrowRight') { e.preventDefault(); handleHumanAction('go'); }
    else if (k === '2' || k === 's') { e.preventDefault(); handleHumanAction('slow'); }
    else if (k === '3' || e.code === 'Space') { e.preventDefault(); handleHumanAction('stop'); }
    else if (k === '4' || k === 'a' || k === 'd' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); handleHumanAction('detour'); }
  }
  function onVisibility() {
    if (document.hidden && running && !paused) { paused = true; updateUI(); }
  }
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);

  const stage = createStage($('[data-aib-stage]'), {
    width: 1000,
    height: 520,
    label: 'AI 智驾大脑养成战：三车道夜城实时感知、决策规划与人类接管示范',
    update(dt) {
      if (disposed || !running || paused) return;
      if (dataPulse > 0) dataPulse = Math.max(0, dataPulse - dt * 1.4);
      for (const pop of pops) pop.age += dt;
      pops = pops.filter(p => p.age < 1.3);

      // Smooth lane steering & tilt
      const dy = targetCarY - carY;
      carY += dy * Math.min(1, dt * 8.5);
      carTilt = Math.max(-0.22, Math.min(0.22, dy * 0.0045));

      // Bullet-time dilation when waiting for coach demonstration
      const simDt = bulletTime ? dt * 0.1 : dt;
      if (bulletTime) {
        bulletTimer += dt;
        if (bulletTimer >= AI_DECISION_SECONDS && activeEvent && activeEvent.state === 'decision') {
          // Time expired -> AI executes its own uncertain guess
          applyDecision(activeEvent, activeEvent.aiPrediction.action, false);
        }
      }

      // Target vehicle speed based on current event execution
      let targetSpeed = cruiseSpeed();
      if (activeEvent) {
        const scenario = SCENARIO_MAP[activeEvent.scenarioId];
        const effectiveAction = activeEvent.outcome === 'bad-demo' || activeEvent.outcome === 'coach-save'
          ? scenario.correctAction
          : (activeEvent.chosenAction ?? activeEvent.aiPrediction.action);

        if (activeEvent.state === 'executing') {
          if (effectiveAction === 'stop') {
            if (activeEvent.scenarioId === 'redlight' && !activeEvent.lightGreen) targetSpeed = 0;
            else if (activeEvent.scenarioId === 'pedestrian' && activeEvent.pedProgress < 0.88) targetSpeed = 0;
          } else if (effectiveAction === 'slow') {
            targetSpeed = 24;
          } else if (effectiveAction === 'go') {
            targetSpeed = cruiseSpeed() + 8;
          }
        }
      }
      speedKmh += (targetSpeed - speedKmh) * Math.min(1, dt * (targetSpeed < speedKmh ? 6.5 : 3.2));
      const worldPxPerSec = speedKmh * 5.2;
      roadOffset += worldPxPerSec * simDt;

      if (!activeEvent) {
        eventCooldown -= dt;
        if (eventCooldown <= 0) {
          if (mode === 'exam') {
            if (examIndex >= examQueue.length) {
              finishExam();
              return;
            }
            const nextId = examQueue[examIndex];
            const rain = examIndex >= 3 ? 'rain' : 'clear';
            spawnEvent(nextId, rain);
            updateUI();
          } else {
            const nextId = pickNextTrainScenario();
            spawnEvent(nextId, 'clear');
            updateUI();
          }
        }
      } else {
        const ev = activeEvent;
        if (ev.scenarioId === 'ambulance') {
          // Ambulance approaches from behind
          if (ev.state === 'approaching') {
            ev.ambX += 130 * simDt;
            if (ev.ambX >= 68) {
              ev.state = 'decision';
              ev.aiPrediction = predictBrain(memory, ev.scenarioId, style, ev.weather);
              if (mode === 'train' && (ev.aiPrediction.isUncertain || ev.aiPrediction.trainedSamples === 0)) {
                bulletTime = true;
                bulletTimer = 0;
                bubble = `教练！后方急救车鸣笛靠近，我没学过怎么办？`;
                bubbleTone = 'info';
                coachMessage = `⚡ ${SCENARIO_MAP[ev.scenarioId].prompt}`;
                coachTone = 'info';
                updateUI();
              } else {
                applyDecision(ev, ev.aiPrediction.action, false);
              }
            }
          } else if (ev.state === 'decision') {
            ev.ambX = Math.min(125, ev.ambX + 40 * simDt);
          } else if (ev.state === 'executing') {
            ev.ambX += 420 * dt;
            if (ev.ambX > 1060) {
              ev.state = 'resolved';
            }
          }
        } else {
          // Forward road event scrolling toward player car
          ev.x -= worldPxPerSec * simDt;
          if (ev.scenarioId === 'pedestrian' && ev.x < 560) {
            ev.pedProgress = Math.min(1, ev.pedProgress + (ev.state === 'executing' ? 0.55 : 0.22) * simDt);
          }

          if (ev.state === 'approaching' && ev.x <= 540) {
            ev.state = 'decision';
            ev.aiPrediction = predictBrain(memory, ev.scenarioId, style, ev.weather);
            if (mode === 'train' && (ev.aiPrediction.isUncertain || ev.aiPrediction.trainedSamples === 0)) {
              bulletTime = true;
              bulletTimer = 0;
              bubble = `教练！前方「${SCENARIO_MAP[ev.scenarioId].badge}」，教我怎么做！`;
              bubbleTone = 'info';
              coachMessage = `⚡ ${SCENARIO_MAP[ev.scenarioId].prompt}`;
              coachTone = 'info';
              updateUI();
            } else {
              applyDecision(ev, ev.aiPrediction.action, false);
            }
          } else if (ev.state === 'executing') {
            if (ev.scenarioId === 'redlight' && !ev.lightGreen && ev.x <= CAR_X + 115) {
              ev.x = Math.max(ev.x, CAR_X + 95);
            }
            if (advanceRedLightWait(ev, speedKmh, dt)) {
              bubble = '绿灯亮了，平稳起步！';
              bubbleTone = 'good';
            }
            if (ev.scenarioId === 'pedestrian' && ev.pedProgress < 0.88 && ev.x <= CAR_X + 125) {
              ev.x = Math.max(ev.x, CAR_X + 108);
            }
            // A demonstration can stop well before the crossing; pedestrians
            // keep walking even when the road has stopped scrolling.
            if (ev.scenarioId === 'pedestrian' && ev.pedProgress < 0.88) {
              ev.pedProgress = Math.min(1, ev.pedProgress + 0.65 * dt);
            }
            if (ev.x < -150) {
              ev.state = 'resolved';
            }
          }
        }

        if (ev.state === 'resolved') {
          activeEvent = null;
          eventCooldown = mode === 'exam' ? 0.55 : 0.75;
          if (mode === 'exam') {
            examIndex++;
            if (examIndex >= examQueue.length) {
              finishExam();
              return;
            }
          }
          updateUI();
        }
      }

      uiAccum += dt;
      if (uiAccum > 0.2) {
        uiAccum = 0;
        syncRunState();
      }
    },
    draw(ctx, time) {
      drawBrainWorld(ctx, {
        running,
        paused,
        mode,
        style,
        roadOffset,
        carY,
        carTilt,
        speedKmh,
        color: api.getVehicle().color,
        body: api.getVehicle().body,
        time,
        reduced: api.reducedMotion(),
        bulletTime,
        bulletRemaining: bulletTime ? Math.max(0, 1 - bulletTimer / AI_DECISION_SECONDS) : 0,
        bulletSeconds: bulletTime ? Math.max(0, AI_DECISION_SECONDS - bulletTimer) : 0,
        event: activeEvent,
        combo,
        score,
        examIndex,
        examTotal: examQueue.length || 6,
        examPassed,
        examFinished,
        bubble,
        bubbleTone,
        pops,
        dataPulse,
        weather: activeEvent?.weather ?? (mode === 'exam' && examIndex >= 3 ? 'rain' : 'clear'),
      });
    },
  });

  updateUI();
  return {
    destroy() {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      stage.destroy();
      root.remove();
    },
  };
}
