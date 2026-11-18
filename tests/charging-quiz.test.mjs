import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_BANK } from '../src/games/charging-quiz-bank.ts';
import {
  QUIZ_QUESTION_COUNT,
  QUIZ_TIME_LIMIT,
  createQuizSession,
  drawQuizQuestions,
  gradeQuizWithAI,
  scoreSingleQuestion,
  startQuizSession,
  submitQuizAnswer,
  tickQuizTimer,
} from '../src/games/charging-quiz-model.ts';

test('quiz bank has exactly 100 unique questions (50 easy + 50 hard) with valid options', () => {
  assert.equal(QUIZ_BANK.length, 100);
  const easy = QUIZ_BANK.filter(q => q.difficulty === 'easy');
  const hard = QUIZ_BANK.filter(q => q.difficulty === 'hard');
  assert.equal(easy.length, 50);
  assert.equal(hard.length, 50);

  const ids = new Set(QUIZ_BANK.map(q => q.id));
  const prompts = new Set(QUIZ_BANK.map(q => q.prompt));
  assert.equal(ids.size, 100);
  assert.equal(prompts.size, 100);

  for (const q of QUIZ_BANK) {
    assert.equal(q.options.length, 4);
    assert.ok(q.answerIndex >= 0 && q.answerIndex <= 3);
    assert.ok(q.explanation.length >= 12);
  }
});

test('normal mode draws 5 easy + 5 hard unique questions; hard mode draws 10 unique hard questions', () => {
  const normalQs = drawQuizQuestions('normal');
  assert.equal(normalQs.length, QUIZ_QUESTION_COUNT);
  assert.equal(new Set(normalQs.map(q => q.id)).size, 10);
  assert.equal(normalQs.filter(q => q.difficulty === 'easy').length, 5);
  assert.equal(normalQs.filter(q => q.difficulty === 'hard').length, 5);

  const hardQs = drawQuizQuestions('hard');
  assert.equal(hardQs.length, QUIZ_QUESTION_COUNT);
  assert.equal(new Set(hardQs.map(q => q.id)).size, 10);
  assert.equal(hardQs.filter(q => q.difficulty === 'easy').length, 0);
  assert.equal(hardQs.filter(q => q.difficulty === 'hard').length, 10);
});

test('25-second per-question timer enforces timeout and AI grading weights difficulty and remaining time', () => {
  assert.equal(QUIZ_TIME_LIMIT, 25);

  const fastHard = scoreSingleQuestion('hard', true, 22);
  const slowHard = scoreSingleQuestion('hard', true, 4);
  const fastEasy = scoreSingleQuestion('easy', true, 22);
  const wrongHard = scoreSingleQuestion('hard', false, 24);

  assert.ok(fastHard.score > slowHard.score, 'more remaining time earns higher AI score');
  assert.ok(fastHard.score > fastEasy.score, 'hard question earns higher AI score than easy at same remaining time');
  assert.equal(wrongHard.score, 0, 'wrong answers always earn 0');

  // Full 10-question session with 8 correct, 1 wrong, 1 timeout
  const session = startQuizSession(createQuizSession('normal'));
  assert.equal(session.status, 'playing');
  assert.equal(session.timeLeft, 25);

  // Q1: fast correct (3s elapsed -> 22s left)
  for (let i = 0; i < 30; i++) tickQuizTimer(session, 0.1);
  submitQuizAnswer(session, session.questions[0].answerIndex);

  // Q2: timeout after 25s
  let timedOut = false;
  for (let i = 0; i < 260 && !timedOut; i++) {
    if (tickQuizTimer(session, 0.1).timedOut) timedOut = true;
  }
  assert.equal(timedOut, true);
  assert.equal(session.currentIdx, 2);

  // Q3: wrong answer
  const wrongIdx = (session.questions[2].answerIndex + 1) % 4;
  submitQuizAnswer(session, wrongIdx);

  // Q4..Q10: correct answers with varied remaining times
  while (session.status === 'playing') {
    tickQuizTimer(session, 0.2);
    submitQuizAnswer(session, session.questions[session.currentIdx].answerIndex);
  }

  assert.equal(session.status, 'grading');
  assert.equal(session.submissions.length, 10);

  const report = gradeQuizWithAI(session);
  assert.equal(session.status, 'finished');
  assert.equal(report.maxTotalScore, 1250);
  assert.equal(report.correctCount, 8);
  assert.equal(report.timeoutCount, 1);
  assert.equal(report.verdicts.length, 10);
  assert.equal(report.verdicts[1].timedOut, true);
  assert.equal(report.verdicts[1].score, 0);
  assert.equal(report.verdicts[2].correct, false);
  assert.equal(report.verdicts[2].score, 0);
  assert.ok(report.totalScore > 0 && report.totalScore < report.maxTotalScore);
  assert.ok(report.aiComment.includes('AI 评审官'));
});
