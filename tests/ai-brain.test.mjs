import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAIN_SCENARIOS,
  brainMastery,
  createEmptyMemory,
  examGrade,
  forgetScenario,
  predictBrain,
  sanitizeBrainMemory,
  teachScenario,
} from '../src/games/ai-brain-model.ts';

test('untrained AI brain has zero mastery and uncertain predictions', () => {
  const memory = createEmptyMemory();
  const mastery = brainMastery(memory);
  assert.equal(mastery.mastered, 0);
  assert.equal(mastery.level, 0);
  for (const s of BRAIN_SCENARIOS) {
    const pred = predictBrain(memory, s.id, 'balanced', 'clear');
    assert.equal(pred.trainedSamples, 0);
    assert.equal(pred.isUncertain, true);
    assert.equal(pred.isPolluted, false);
  }
});

test('human demonstration teaches the AI and increases confidence above threshold', () => {
  const memory = createEmptyMemory();
  teachScenario(memory, 'redlight', 'stop', 2);
  const pred = predictBrain(memory, 'redlight', 'balanced', 'clear');
  assert.equal(pred.action, 'stop');
  assert.ok(pred.confidence >= 62, `expected confidence >= 62, got ${pred.confidence}`);
  assert.equal(pred.isPolluted, false);
  assert.equal(pred.isUncertain, false);
  assert.equal(brainMastery(memory).mastered, 1);
});

test('wrong demonstration pollutes the AI brain (GIGO) and forgetting cleans it', () => {
  const memory = createEmptyMemory();
  teachScenario(memory, 'redlight', 'go', 2);
  const polluted = predictBrain(memory, 'redlight', 'balanced', 'clear');
  assert.equal(polluted.action, 'go');
  assert.equal(polluted.isPolluted, true);
  assert.equal(brainMastery(memory).polluted, 1);

  forgetScenario(memory, 'redlight');
  const cleaned = predictBrain(memory, 'redlight', 'balanced', 'clear');
  assert.equal(cleaned.trainedSamples, 0);
  assert.equal(cleaned.isPolluted, false);
  assert.equal(brainMastery(memory).polluted, 0);
});

test('rain lowers confidence slightly while preserving correct generalization', () => {
  const memory = createEmptyMemory();
  teachScenario(memory, 'construction', 'detour', 2);
  const clearPred = predictBrain(memory, 'construction', 'balanced', 'clear');
  const rainPred = predictBrain(memory, 'construction', 'balanced', 'rain');
  assert.equal(clearPred.action, 'detour');
  assert.equal(rainPred.action, 'detour');
  assert.ok(rainPred.confidence <= clearPred.confidence);
});

test('memory sanitizer drops corrupt data and exam grading scales properly', () => {
  const raw = { redlight: { counts: { stop: 999, go: -5, slow: NaN, detour: 1 }, lastAction: 'stop' } };
  const clean = sanitizeBrainMemory(raw);
  assert.equal(clean.redlight.counts.stop, 30);
  assert.equal(clean.redlight.counts.go, 0);
  assert.equal(clean.redlight.counts.slow, 0);
  assert.equal(clean.redlight.counts.detour, 1);
  assert.equal(examGrade(6, 6).rank, 'S 级');
  assert.equal(examGrade(5, 6).rank, 'A 级');
  assert.equal(examGrade(3, 6).rank, 'B 级');
  assert.equal(examGrade(1, 6).rank, 'C 级');
});
