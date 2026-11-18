import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyMemory, predictBrain } from '../src/games/ai-brain-model.ts';
import { AI_DECISION_SECONDS, advanceRedLightWait } from '../src/games/ai-driving-flow.ts';

function redLight(overrides = {}) {
  return {
    uid: 1,
    scenarioId: 'redlight',
    x: 540,
    lane: 1,
    targetLane: 0,
    state: 'executing',
    weather: 'clear',
    aiPrediction: predictBrain(createEmptyMemory(), 'redlight', 'balanced', 'clear'),
    chosenAction: 'stop',
    humanIntervened: true,
    outcome: 'human-pass',
    timer: 0,
    pedProgress: 0,
    ambX: -80,
    lightGreen: false,
    ...overrides,
  };
}

test('red light releases an early or normal stop without requiring further road movement', () => {
  for (const x of [940, 540, 490, 330, 310]) {
    const ev = redLight({ x });
    for (let i = 0; i < 10; i++) assert.equal(advanceRedLightWait(ev, 0, 0.1), false);
    assert.equal(ev.lightGreen, false, `x=${x}: must retain the red-light wait`);
    advanceRedLightWait(ev, 0, 0.1);
    if (!ev.lightGreen) advanceRedLightWait(ev, 0, 0.1);
    assert.equal(ev.lightGreen, true, `x=${x}: stopped vehicle must resume`);
    assert.equal(ev.x, x, 'waiting must not move the stop line artificially');
  }
});

test('automatic stopping and safety interception both finish their red-light wait', () => {
  for (const overrides of [
    { humanIntervened: false, outcome: 'auto-pass' },
    { chosenAction: 'go', humanIntervened: false, outcome: 'coach-save' },
    { chosenAction: 'go', humanIntervened: true, outcome: 'bad-demo' },
  ]) {
    const ev = redLight(overrides);
    for (let i = 0; i < 120 && !ev.lightGreen; i++) advanceRedLightWait(ev, 0, 1 / 60);
    assert.equal(ev.lightGreen, true, `${ev.outcome} must release the safe stop`);
    assert.equal(ev.chosenAction, overrides.chosenAction ?? 'stop', 'keep the original prediction or demonstration');
    assert.equal(ev.outcome, overrides.outcome, 'waiting must not rewrite scoring or safety evidence');
  }
});

test('the red-light timer waits for braking to finish and never consumes a pending decision', () => {
  const ev = redLight();
  for (const speed of [68, 30, 1.01]) assert.equal(advanceRedLightWait(ev, speed, 1), false);
  assert.equal(ev.timer, 0);
  assert.equal(advanceRedLightWait(ev, 1, 0.5), false);
  assert.equal(ev.timer, 0.5);
  const decision = redLight({ state: 'decision' });
  assert.equal(advanceRedLightWait(decision, 0, AI_DECISION_SECONDS), false);
  assert.equal(decision.timer, 0);
  assert.equal(decision.lightGreen, false);
  const pedestrian = redLight({ scenarioId: 'pedestrian' });
  assert.equal(advanceRedLightWait(pedestrian, 0, 2), false);
  assert.equal(pedestrian.timer, 0);
});

test('red-light release is a one-time transition and pause consumes no waiting time', () => {
  const ev = redLight();
  assert.equal(advanceRedLightWait(ev, 0, 0.6), false);
  const paused = structuredClone(ev);
  // A paused game does not step its event; resuming must continue the same wait.
  assert.deepEqual(ev, paused);
  assert.equal(advanceRedLightWait(ev, 0, 0.4), false);
  assert.equal(advanceRedLightWait(ev, 0, 0.2), true);
  const timer = ev.timer;
  assert.equal(advanceRedLightWait(ev, 0, 5), false);
  assert.equal(ev.timer, timer);
});

test('braking from every driving style resumes at different frame rates without reaching the old timer gate', () => {
  for (const fps of [30, 60, 144]) {
    for (const initialSpeed of [46, 56, 68]) {
      const ev = redLight({ x: 540, outcome: 'auto-pass', humanIntervened: false });
      const dt = 1 / fps;
      let speed = initialSpeed, elapsed = 0;
      while (!ev.lightGreen && elapsed < 3) {
        speed += -speed * Math.min(1, dt * 6.5);
        ev.x -= speed * 5.2 * dt;
        advanceRedLightWait(ev, speed, dt);
        elapsed += dt;
      }
      assert.equal(ev.lightGreen, true, `${fps} fps / ${initialSpeed} km/h must leave the wait`);
      assert.ok(ev.x > 330, 'regression must cover a car that stops before the former spatial timer gate');
      assert.ok(elapsed >= 1.1 && elapsed < 2.1, 'release follows braking and the normal 1.1-second wait');
    }
  }
});

test('decision time is extended by two seconds and invalid steps cannot release a light', () => {
  assert.equal(AI_DECISION_SECONDS, 3.5 + 2);
  const ev = redLight();
  for (const [speed, dt] of [[NaN, 1], [Infinity, 1], [0, NaN], [0, Infinity], [0, -1], [0, 0]]) {
    assert.equal(advanceRedLightWait(ev, speed, dt), false);
  }
  assert.equal(ev.timer, 0);
  assert.equal(ev.lightGreen, false);
});
