export type BrainAction = 'go' | 'slow' | 'stop' | 'detour';
export type ScenarioId = 'clear' | 'redlight' | 'pedestrian' | 'construction' | 'school' | 'ambulance';
export type BrainStyle = 'cautious' | 'balanced' | 'eager';
export type RunMode = 'train' | 'exam';

export interface BrainScenario {
  id: ScenarioId;
  title: string;
  badge: string;
  featureLabel: string;
  correctAction: BrainAction;
  prompt: string;
  scienceTip: string;
  wrongTip: string;
  autonomousPraise: string;
  color: string;
}

export interface ScenarioMemory {
  counts: Record<BrainAction, number>;
  lastAction: BrainAction | null;
}

export type BrainMemory = Record<ScenarioId, ScenarioMemory>;

export interface BrainPrediction {
  action: BrainAction;
  confidence: number;
  probs: Record<BrainAction, number>;
  trainedSamples: number;
  isUncertain: boolean;
  isPolluted: boolean;
  reason: string;
}

export interface RoadEvent {
  uid: number;
  scenarioId: ScenarioId;
  x: number;           // distance ahead of car in world px (car sits at x=210)
  lane: number;        // 0 = top, 1 = middle, 2 = bottom
  targetLane: number;  // safe detour lane when action === 'detour'
  state: 'approaching' | 'decision' | 'executing' | 'resolved';
  weather: 'clear' | 'rain';
  aiPrediction: BrainPrediction;
  chosenAction: BrainAction | null;
  humanIntervened: boolean;
  outcome: 'pending' | 'auto-pass' | 'human-pass' | 'bad-demo' | 'coach-save';
  timer: number;       // pause timer for stop/pedestrian/redlight green switch
  pedProgress: number; // 0..1 pedestrian crossing animation
  ambX: number;        // ambulance relative x for ambulance scenario
  lightGreen: boolean;
}

export interface BrainStats {
  taughtCount: number;
  autoPassCount: number;
  pollutedCount: number;
  examBestScore: number;
  examPassed: boolean;
  unlockedConcepts: string[];
}

export const BRAIN_ACTIONS: readonly BrainAction[] = ['go', 'slow', 'stop', 'detour'];

export const BRAIN_ACTION_META: Record<BrainAction, { label: string; short: string; keyHint: string; color: string; desc: string }> = {
  go: { label: '正常前行', short: '前行', keyHint: '1 / W', color: '#75f1bb', desc: '畅通巡航' },
  slow: { label: '谨慎慢行', short: '慢行', keyHint: '2 / S', color: '#f5bc65', desc: '≤30 km/h' },
  stop: { label: '刹停等待', short: '刹停', keyHint: '3 / 空格', color: '#ff7c95', desc: '停止线前' },
  detour: { label: '变道绕行', short: '变道', keyHint: '4 / A·D', color: '#bc98ff', desc: '避障让行' },
};

export const BRAIN_SCENARIOS: readonly BrainScenario[] = [
  {
    id: 'clear',
    title: '绿灯畅通大道',
    badge: '绿灯 · 畅通',
    featureLabel: '绿灯 + 车道空旷',
    correctAction: 'go',
    prompt: '前方绿灯且道路畅通，该怎么开？',
    scienceTip: '正样本入库！AI 不仅要学避险，也要学「安全时大胆前进」，不然会变成不敢动的路障。',
    wrongTip: '在绿灯空路上急停或乱变道，会导致后车追尾或堵死路口。',
    autonomousPraise: '前方绿灯畅通，我按学到的巡航策略稳步前行！',
    color: '#75f1bb',
  },
  {
    id: 'redlight',
    title: '路口红灯停止线',
    badge: '红灯 · 停止线',
    featureLabel: '红灯亮起 + 停止线',
    correctAction: 'stop',
    prompt: '路口红灯亮起！快示范怎么应对红灯。',
    scienceTip: '规则权重更新！AI 把「信号灯=红 → 刹停」牢牢写入决策网络，等转绿再走。',
    wrongTip: '闯红灯触发安全急刹！AI 会忠实记住错误示范，快清理或纠正这条经验。',
    autonomousPraise: '识别到红灯，我提前平稳刹停，等绿灯再出发！',
    color: '#ff7c95',
  },
  {
    id: 'pedestrian',
    title: '斑马线突发鬼探头',
    badge: '行人 · 横穿',
    featureLabel: '斑马线 + 行人步入',
    correctAction: 'stop',
    prompt: '注意！行人突然步入斑马线，快教 AI 怎么做！',
    scienceTip: '长尾场景（Corner Case）已掌握！面对突发弱势交通参与者，礼让刹停优先级最高。',
    wrongTip: '行人正在过街，不刹停极其危险！安全护航系统已紧急介入。',
    autonomousPraise: '探测到斑马线行人横穿，主动刹停礼让通过！',
    color: '#ff98b4',
  },
  {
    id: 'construction',
    title: '前方施工路锥占道',
    badge: '施工 · 占道',
    featureLabel: '本道施工 + 邻道畅通',
    correctAction: 'detour',
    prompt: '当前车道被施工路锥封住，邻道空旷，怎么绕过去？',
    scienceTip: '路径规划激活！AI 扫描邻道确认安全后，生成平滑 S 型变道曲线绕开障碍。',
    wrongTip: '直冲或干等都过不去施工区，扫描邻道后提前变道绕行才是正解。',
    autonomousPraise: '感知到施工占道且邻道空旷，自主规划变道绕行！',
    color: '#bc98ff',
  },
  {
    id: 'school',
    title: '校园放学限速区',
    badge: '校园 · 限速30',
    featureLabel: '校园标牌 + 放学学生',
    correctAction: 'slow',
    prompt: '进入青禾小学放学路段，路边很多小朋友，怎么通过？',
    scienceTip: '场景语义理解！虽然车道没堵，但「校园+学生」线索告诉 AI 必须提前降速预防风险。',
    wrongTip: '校园路段车速过快或原地停死都不合适，应该控速 30 km/h 以下谨慎慢行。',
    autonomousPraise: '进入校园放学区，主动降速到 25 km/h 礼貌慢行！',
    color: '#f5bc65',
  },
  {
    id: 'ambulance',
    title: '后方急救车鸣笛',
    badge: '急救车 · 接近',
    featureLabel: '警灯闪烁 + 后方高速逼近',
    correctAction: 'detour',
    prompt: '后方急救车鸣笛急近！教 AI 让出生命通道。',
    scienceTip: '社会协作驾驶！AI 不仅看前面，还用后向雷达听懂特勤需求，主动变道让行。',
    wrongTip: '停在原车道或继续占道会挡住急救车，应该立刻变道让出当前车道！',
    autonomousPraise: '后向雷达发现急救车逼近，自动变道让出生命通道！',
    color: '#47eaff',
  },
];

export const SCENARIO_MAP: Record<ScenarioId, BrainScenario> = Object.fromEntries(
  BRAIN_SCENARIOS.map(s => [s.id, s])
) as Record<ScenarioId, BrainScenario>;

export const AI_CONCEPTS = [
  {
    id: 'imitation',
    title: '① 模仿学习（Imitation Learning）',
    tag: '首次示范解锁',
    text: 'AI 不是天生会开车。你每示范一次正确操作，它就把「路况特征 → 驾驶动作」记进神经网络权重里，样本越多越自信。',
  },
  {
    id: 'dagger',
    title: '② 接管纠错 / 影子模式（DAgger）',
    tag: 'AI 首次自主通过解锁',
    text: '真实智驾车队训练时，AI 遇到没把握的难题就由安全员接管；接管数据回传训练后，下次 AI 就能自己稳稳开过去！',
  },
  {
    id: 'gigo',
    title: '③ 垃圾进，垃圾出（Data Quality）',
    tag: '体验数据污染或清洗解锁',
    text: 'AI 自己分不清善恶对错。如果你教它「红灯冲过去」，它真会照做！所以真实智驾团队花大量精力做数据清洗与纠错。',
  },
  {
    id: 'generalize',
    title: '④ 雨夜泛化与闭环（Generalization）',
    tag: '完成全自动毕业路考解锁',
    text: '自动驾驶每毫秒都在跑「感知→思考→规划→执行」。晴天学到的规律，在雨雾干扰的陌生考试路段也能举一反三，才算真学会！',
  },
] as const;

export function createEmptyMemory(): BrainMemory {
  const mem = {} as BrainMemory;
  for (const s of BRAIN_SCENARIOS) {
    mem[s.id] = { counts: { go: 0, slow: 0, stop: 0, detour: 0 }, lastAction: null };
  }
  return mem;
}

export function sanitizeBrainMemory(raw: unknown): BrainMemory {
  const clean = createEmptyMemory();
  if (!raw || typeof raw !== 'object') return clean;
  for (const s of BRAIN_SCENARIOS) {
    const entry = (raw as Record<string, unknown>)[s.id];
    if (!entry || typeof entry !== 'object') continue;
    const counts = (entry as { counts?: Record<string, unknown> }).counts;
    if (counts && typeof counts === 'object') {
      for (const a of BRAIN_ACTIONS) {
        const val = Number(counts[a]);
        clean[s.id].counts[a] = Number.isFinite(val) ? Math.max(0, Math.min(30, Math.round(val))) : 0;
      }
    }
    const last = (entry as { lastAction?: unknown }).lastAction;
    if (typeof last === 'string' && BRAIN_ACTIONS.includes(last as BrainAction)) {
      clean[s.id].lastAction = last as BrainAction;
    }
  }
  return clean;
}

export function teachScenario(memory: BrainMemory, id: ScenarioId, action: BrainAction, weight = 2): void {
  const slot = memory[id];
  slot.counts[action] = Math.min(30, slot.counts[action] + weight);
  slot.lastAction = action;
}

export function forgetScenario(memory: BrainMemory, id: ScenarioId): void {
  memory[id] = { counts: { go: 0, slow: 0, stop: 0, detour: 0 }, lastAction: null };
}

export function predictBrain(
  memory: BrainMemory,
  id: ScenarioId,
  style: BrainStyle = 'balanced',
  weather: 'clear' | 'rain' = 'clear'
): BrainPrediction {
  const slot = memory[id];
  const scenario = SCENARIO_MAP[id];
  const total = BRAIN_ACTIONS.reduce((sum, a) => sum + slot.counts[a], 0);

  // Untrained AI starts clueless: mild bias by style, low confidence (~28-35%)
  if (total === 0) {
    const base: Record<BrainAction, number> = style === 'cautious'
      ? { go: 0.24, slow: 0.34, stop: 0.22, detour: 0.20 }
      : style === 'eager'
        ? { go: 0.42, slow: 0.20, stop: 0.16, detour: 0.22 }
        : { go: 0.34, slow: 0.24, stop: 0.20, detour: 0.22 };
    const topAction = BRAIN_ACTIONS.reduce((best, a) => base[a] > base[best] ? a : best, 'go' as BrainAction);
    return {
      action: topAction,
      confidence: Math.round(base[topAction] * 100),
      probs: base,
      trainedSamples: 0,
      isUncertain: true,
      isPolluted: false,
      reason: '从未见过这类路况，AI 正在盲猜！需要你亲自示范。',
    };
  }

  // Softmax over learned sample counts + mild prior & weather uncertainty
  const prior = weather === 'rain' ? 0.55 : 0.35;
  const styleBonus: Record<BrainAction, number> = {
    go: style === 'eager' ? 0.35 : style === 'cautious' ? -0.15 : 0,
    slow: style === 'cautious' ? 0.35 : 0,
    stop: style === 'cautious' ? 0.25 : 0,
    detour: 0.05,
  };
  const scores: Record<BrainAction, number> = { go: 0, slow: 0, stop: 0, detour: 0 };
  let sumExp = 0;
  for (const a of BRAIN_ACTIONS) {
    const recency = slot.lastAction === a ? 0.55 : 0;
    const raw = (slot.counts[a] + recency + styleBonus[a]) / (weather === 'rain' ? 1.45 : 1.15);
    const e = Math.exp(raw) * (slot.counts[a] > 0 ? 1.15 : prior);
    scores[a] = e;
    sumExp += e;
  }

  const probs: Record<BrainAction, number> = {
    go: scores.go / sumExp,
    slow: scores.slow / sumExp,
    stop: scores.stop / sumExp,
    detour: scores.detour / sumExp,
  };

  let best: BrainAction = 'go';
  for (const a of BRAIN_ACTIONS) {
    if (probs[a] > probs[best]) best = a;
  }
  const confidence = Math.min(98, Math.round(probs[best] * 100));
  const isPolluted = best !== scenario.correctAction;
  const isUncertain = confidence < 62;

  const reason = isPolluted
    ? `受错误示范影响，AI 准备「${BRAIN_ACTION_META[best].short}」（${confidence}%）！`
    : isUncertain
      ? `样本还少，AI 犹豫着想「${BRAIN_ACTION_META[best].short}」（${confidence}%）。`
      : `基于 ${total} 份经验，AI 自信选择「${BRAIN_ACTION_META[best].short}」（${confidence}%）。`;

  return { action: best, confidence, probs, trainedSamples: total, isUncertain, isPolluted, reason };
}

export function brainMastery(memory: BrainMemory) {
  let mastered = 0;
  let polluted = 0;
  let totalSamples = 0;
  for (const s of BRAIN_SCENARIOS) {
    const p = predictBrain(memory, s.id, 'balanced', 'clear');
    totalSamples += p.trainedSamples;
    if (p.trainedSamples > 0 && !p.isPolluted && p.confidence >= 62) mastered++;
    if (p.trainedSamples > 0 && p.isPolluted) polluted++;
  }
  const level = mastered >= 6 ? 3 : mastered >= 4 ? 2 : mastered >= 2 ? 1 : 0;
  const titles = ['Lv.0 萌新大脑', 'Lv.1 实习智驾', 'Lv.2 熟练领航', 'Lv.3 王牌老司机'];
  return { mastered, polluted, totalSamples, level, title: titles[level] };
}

export function examGrade(passedCount: number, totalCount: number) {
  if (totalCount === 0) return { rank: '未参考', title: '等待参加全自动毕业考', color: '#9eb4cd' };
  const ratio = passedCount / totalCount;
  if (ratio >= 1) return { rank: 'S 级', title: '王牌全自动智驾驾照', color: '#75f1bb' };
  if (ratio >= 0.8) return { rank: 'A 级', title: '优秀智能驾驶驾照', color: '#47eaff' };
  if (ratio >= 0.5) return { rank: 'B 级', title: '合格实习智驾驾照', color: '#f5bc65' };
  return { rank: 'C 级', title: '还需回炉继续训练', color: '#ff7c95' };
}
