import { QUIZ_BANK, type QuizDifficulty, type QuizQuestion } from './charging-quiz-bank.ts';

export type QuizMode = 'normal' | 'hard';

export const QUIZ_QUESTION_COUNT = 10;
export const QUIZ_TIME_LIMIT = 25; // seconds per question

export const QUIZ_SCORING = {
  easy: { base: 60, speedMax: 40, max: 100 },
  hard: { base: 85, speedMax: 65, max: 150 },
} as const;

export interface QuizSubmission {
  questionId: string;
  selectedIndex: number | null;
  timeLeft: number;
  timeUsed: number;
  timedOut: boolean;
}

export interface QuizQuestionVerdict {
  index: number;
  question: QuizQuestion;
  selectedIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  timeLeft: number;
  timeUsed: number;
  baseScore: number;
  speedBonus: number;
  score: number;
  maxScore: number;
  aiNote: string;
}

export interface QuizAiDimension {
  label: string;
  value: number; // 0..100
  detail: string;
}

export interface QuizAiReport {
  mode: QuizMode;
  totalScore: number;
  maxTotalScore: number;
  normalizedScore: number; // 0..100
  stars: number; // 0..3
  rankCode: 'S+' | 'S' | 'A' | 'B' | 'C';
  rankTitle: string;
  correctCount: number;
  easyCorrect: number;
  easyTotal: number;
  hardCorrect: number;
  hardTotal: number;
  timeoutCount: number;
  totalSpeedBonus: number;
  avgTimeUsed: number;
  avgTimeLeft: number;
  strongCategory: string;
  weakCategory: string | null;
  dimensions: QuizAiDimension[];
  aiComment: string;
  verdicts: QuizQuestionVerdict[];
}

export interface QuizSessionState {
  mode: QuizMode;
  status: 'ready' | 'playing' | 'grading' | 'finished';
  questions: QuizQuestion[];
  currentIdx: number;
  timeLeft: number;
  submissions: QuizSubmission[];
  report: QuizAiReport | null;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleQuestionOptions(q: QuizQuestion, rng: () => number): QuizQuestion {
  const indexed = q.options.map((text, idx) => ({ text, isCorrect: idx === q.answerIndex }));
  const mixed = shuffle(indexed, rng);
  const newAnswer = mixed.findIndex(item => item.isCorrect) as 0 | 1 | 2 | 3;
  return {
    ...q,
    options: [mixed[0].text, mixed[1].text, mixed[2].text, mixed[3].text],
    answerIndex: newAnswer,
  };
}

/**
 * Draw 10 unique questions from the 100-question bank:
 * - normal: 5 easy + 5 hard
 * - hard:   10 hard
 */
export function drawQuizQuestions(mode: QuizMode, rng: () => number = Math.random): QuizQuestion[] {
  const easyPool = QUIZ_BANK.filter(q => q.difficulty === 'easy');
  const hardPool = QUIZ_BANK.filter(q => q.difficulty === 'hard');

  let picked: QuizQuestion[];
  if (mode === 'normal') {
    const easyPicked = shuffle(easyPool, rng).slice(0, 5);
    const hardPicked = shuffle(hardPool, rng).slice(0, 5);
    picked = shuffle([...easyPicked, ...hardPicked], rng);
  } else {
    picked = shuffle(hardPool, rng).slice(0, QUIZ_QUESTION_COUNT);
  }
  return picked.map(q => shuffleQuestionOptions(q, rng));
}

export function createQuizSession(mode: QuizMode, rng: () => number = Math.random): QuizSessionState {
  return {
    mode,
    status: 'ready',
    questions: drawQuizQuestions(mode, rng),
    currentIdx: 0,
    timeLeft: QUIZ_TIME_LIMIT,
    submissions: [],
    report: null,
  };
}

export function startQuizSession(state: QuizSessionState): QuizSessionState {
  state.status = 'playing';
  state.currentIdx = 0;
  state.timeLeft = QUIZ_TIME_LIMIT;
  state.submissions = [];
  state.report = null;
  return state;
}

export function scoreSingleQuestion(difficulty: QuizDifficulty, correct: boolean, timeLeft: number) {
  const rule = QUIZ_SCORING[difficulty];
  if (!correct) {
    return { baseScore: 0, speedBonus: 0, score: 0, maxScore: rule.max };
  }
  const safeLeft = clamp(timeLeft, 0, QUIZ_TIME_LIMIT);
  const speedBonus = Math.round((safeLeft / QUIZ_TIME_LIMIT) * rule.speedMax);
  return {
    baseScore: rule.base,
    speedBonus,
    score: rule.base + speedBonus,
    maxScore: rule.max,
  };
}

function advanceAfterSubmission(state: QuizSessionState) {
  if (state.currentIdx + 1 >= state.questions.length) {
    state.status = 'grading';
    state.timeLeft = 0;
  } else {
    state.currentIdx += 1;
    state.timeLeft = QUIZ_TIME_LIMIT;
  }
}

export function submitQuizAnswer(state: QuizSessionState, selectedIndex: number): QuizSubmission | null {
  if (state.status !== 'playing') return null;
  const q = state.questions[state.currentIdx];
  if (!q) return null;
  const safeLeft = Number(clamp(state.timeLeft, 0, QUIZ_TIME_LIMIT).toFixed(1));
  const sub: QuizSubmission = {
    questionId: q.id,
    selectedIndex: clamp(Math.floor(selectedIndex), 0, 3),
    timeLeft: safeLeft,
    timeUsed: Number((QUIZ_TIME_LIMIT - safeLeft).toFixed(1)),
    timedOut: false,
  };
  state.submissions.push(sub);
  advanceAfterSubmission(state);
  return sub;
}

export function tickQuizTimer(state: QuizSessionState, dt: number): { timedOut: boolean } {
  if (state.status !== 'playing') return { timedOut: false };
  const step = Math.max(0, Math.min(0.25, dt));
  state.timeLeft = Math.max(0, state.timeLeft - step);
  if (state.timeLeft <= 0) {
    const q = state.questions[state.currentIdx];
    if (q) {
      state.submissions.push({
        questionId: q.id,
        selectedIndex: null,
        timeLeft: 0,
        timeUsed: QUIZ_TIME_LIMIT,
        timedOut: true,
      });
    }
    advanceAfterSubmission(state);
    return { timedOut: true };
  }
  return { timedOut: false };
}

/**
 * Simulated AI Smart Grading Engine:
 * Evaluates all 10 submissions after completion, weights difficulty (easy vs hard)
 * and remaining time (out of 25s), builds 4-axis competency metrics & tailored commentary.
 */
export function gradeQuizWithAI(state: QuizSessionState): QuizAiReport {
  const verdicts: QuizQuestionVerdict[] = state.questions.map((q, idx) => {
    const sub = state.submissions[idx] ?? {
      questionId: q.id,
      selectedIndex: null,
      timeLeft: 0,
      timeUsed: QUIZ_TIME_LIMIT,
      timedOut: true,
    };
    const correct = !sub.timedOut && sub.selectedIndex === q.answerIndex;
    const { baseScore, speedBonus, score, maxScore } = scoreSingleQuestion(q.difficulty, correct, sub.timeLeft);

    let aiNote: string;
    if (sub.timedOut) {
      aiNote = '⏱️ 超过 25 秒未作答，AI 判定超时计 0 分。';
    } else if (!correct) {
      aiNote = q.difficulty === 'hard'
        ? '❌ 困难题失分：概念辨析有误，建议精读下方技术解析。'
        : '❌ 简单题失分：基础知识点偏差，复盘即可快速掌握。';
    } else if (sub.timeLeft >= 18) {
      aiNote = `⚡ 毫秒级神速秒答（剩 ${sub.timeLeft.toFixed(1)}s），斩获高额速度加权 +${speedBonus} 分！`;
    } else if (sub.timeLeft >= 10) {
      aiNote = `✅ 沉稳准确（剩 ${sub.timeLeft.toFixed(1)}s），获得速度加权 +${speedBonus} 分。`;
    } else {
      aiNote = `✅ 压哨答对（剩 ${sub.timeLeft.toFixed(1)}s），速度加权 +${speedBonus} 分，可继续提升反应速度。`;
    }

    return {
      index: idx,
      question: q,
      selectedIndex: sub.selectedIndex,
      correct,
      timedOut: sub.timedOut,
      timeLeft: sub.timeLeft,
      timeUsed: sub.timeUsed,
      baseScore,
      speedBonus,
      score,
      maxScore,
      aiNote,
    };
  });

  const totalScore = verdicts.reduce((acc, v) => acc + v.score, 0);
  const maxTotalScore = verdicts.reduce((acc, v) => acc + v.maxScore, 0);
  const normalizedScore = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
  const correctCount = verdicts.filter(v => v.correct).length;
  const easyVerdicts = verdicts.filter(v => v.question.difficulty === 'easy');
  const hardVerdicts = verdicts.filter(v => v.question.difficulty === 'hard');
  const easyCorrect = easyVerdicts.filter(v => v.correct).length;
  const hardCorrect = hardVerdicts.filter(v => v.correct).length;
  const timeoutCount = verdicts.filter(v => v.timedOut).length;
  const totalSpeedBonus = verdicts.reduce((acc, v) => acc + v.speedBonus, 0);
  const avgTimeUsed = Number((verdicts.reduce((acc, v) => acc + v.timeUsed, 0) / verdicts.length).toFixed(1));
  const avgTimeLeft = Number((verdicts.reduce((acc, v) => acc + v.timeLeft, 0) / verdicts.length).toFixed(1));

  // Category strengths & weaknesses
  const catStats = new Map<string, { ok: number; total: number }>();
  for (const v of verdicts) {
    const cur = catStats.get(v.question.category) ?? { ok: 0, total: 0 };
    cur.total += 1;
    if (v.correct) cur.ok += 1;
    catStats.set(v.question.category, cur);
  }
  const catList = [...catStats.entries()].map(([name, s]) => ({
    name,
    ok: s.ok,
    total: s.total,
    rate: s.ok / s.total,
  }));
  catList.sort((a, b) => b.rate - a.rate || b.ok - a.ok);
  const strongCategory = catList[0]?.name ?? '智驾基础';
  const weakEntry = [...catList].reverse().find(c => c.rate < 1) ?? null;
  const weakCategory = weakEntry ? weakEntry.name : null;

  // 4 AI Competency Dimensions
  const accuracyPct = Math.round((correctCount / verdicts.length) * 100);
  const hardPct = hardVerdicts.length > 0 ? Math.round((hardCorrect / hardVerdicts.length) * 100) : accuracyPct;
  const correctVerdicts = verdicts.filter(v => v.correct);
  const speedPct = correctVerdicts.length > 0
    ? Math.round((correctVerdicts.reduce((acc, v) => acc + v.timeLeft / QUIZ_TIME_LIMIT, 0) / correctVerdicts.length) * 100)
    : 0;
  const breadthPct = Math.round((catList.filter(c => c.ok > 0).length / Math.max(1, catList.length)) * 100);

  const dimensions: QuizAiDimension[] = [
    { label: '答题准确度', value: accuracyPct, detail: `${correctCount} / ${verdicts.length} 题答对` },
    { label: '困难题攻坚', value: hardPct, detail: `困难题 ${hardCorrect} / ${hardVerdicts.length}` },
    { label: '限时反应力', value: speedPct, detail: `速度加权 +${totalSpeedBonus} 分` },
    { label: '智驾知识广度', value: breadthPct, detail: `覆盖 ${catList.filter(c => c.ok > 0).length}/${catList.length} 类主题` },
  ];

  // Rank & Stars
  let rankCode: QuizAiReport['rankCode'] = 'C';
  let rankTitle = '智驾见习生';
  if (normalizedScore >= 90) { rankCode = 'S+'; rankTitle = '中国智驾领航院士'; }
  else if (normalizedScore >= 80) { rankCode = 'S'; rankTitle = '车路云首席总师'; }
  else if (normalizedScore >= 68) { rankCode = 'A'; rankTitle = '高阶智驾架构师'; }
  else if (normalizedScore >= 50) { rankCode = 'B'; rankTitle = '智能网联工程师'; }

  const stars = normalizedScore >= 80 ? 3 : normalizedScore >= 58 ? 2 : normalizedScore >= 30 ? 1 : 0;

  // Tailored AI Grading Commentary
  const modeLabel = state.mode === 'hard' ? '困难模式（10道全困难）' : '普通模式（5简+5难）';
  const speedComment = correctCount < 4 && avgTimeLeft >= 18
    ? `平均每题仅用时 ${avgTimeUsed.toFixed(1)} 秒，作答偏快导致失误较多，建议先审清题干关键点、稳住正确率再冲击速度加权分！`
    : speedPct >= 72 && correctCount >= 4
      ? `平均每题剩余 ${avgTimeLeft.toFixed(1)} 秒，决策果断高效，额外斩获 ${totalSpeedBonus} 分时间加权！`
      : speedPct >= 45 && correctCount >= 4
        ? `平均每题用时 ${avgTimeUsed.toFixed(1)} 秒，节奏稳健，收获 ${totalSpeedBonus} 分时间加权。`
        : timeoutCount > 0
          ? `本轮出现 ${timeoutCount} 次 25 秒超时未作答，建议先抓住题干关键词果断锁定答案。`
          : `审题偏谨慎，平均剩余 ${avgTimeLeft.toFixed(1)} 秒，在保证准确的前提下提升反应速度可显著拉高 AI 综合评分。`;

  const weakComment = weakCategory
    ? `薄弱环节集中在「${weakCategory}」，建议重点复盘下方错题的 AI 权威解析；`
    : '本轮实现全板块零失误通关，对中国智驾政策、感知算法与超充生态掌握非常扎实！';

  const modeSuggest = state.mode === 'normal' && normalizedScore >= 78
    ? '你已具备冲击「困难模式（10道全困难）」的实力，强烈推荐开启更高难挑战！'
    : state.mode === 'hard' && normalizedScore >= 80
      ? '在全困难题库下依然交出高分答卷，展现了过硬的中国智驾工程素养！'
      : '点击下方「再抽 10 题挑战」可从 100 题库重新随机抽题，继续刷新最高分。';

  const aiComment = `AI 评审官已完成「${modeLabel}」全量智能判卷：综合得分 ${totalScore}/${maxTotalScore}（折合 ${normalizedScore} 分 · ${rankTitle}），答对 ${correctCount}/10 题，在「${strongCategory}」板块表现突出。${speedComment} ${weakComment}${modeSuggest}`;

  const report: QuizAiReport = {
    mode: state.mode,
    totalScore,
    maxTotalScore,
    normalizedScore,
    stars,
    rankCode,
    rankTitle,
    correctCount,
    easyCorrect,
    easyTotal: easyVerdicts.length,
    hardCorrect,
    hardTotal: hardVerdicts.length,
    timeoutCount,
    totalSpeedBonus,
    avgTimeUsed,
    avgTimeLeft,
    strongCategory,
    weakCategory,
    dimensions,
    aiComment,
    verdicts,
  };

  state.report = report;
  state.status = 'finished';
  return report;
}
