import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge, answerEvent, challengeStars } from '../src/games/factory-challenge.ts';

test('wrong answer holds the event, retry clears it without restoring a perfect first try', () => {
  const state = createChallenge('city', 0);
  const event = state.events[0];
  const wrong = event.choices.findIndex(c => !c.correct);
  const right = event.choices.findIndex(c => c.correct);
  const failed = answerEvent(state, wrong);
  assert.equal(failed.index, 0);
  assert.equal(failed.mistakes, 1);
  assert.equal(failed.answers.length, 0);
  const cleared = answerEvent(failed, right);
  assert.equal(cleared.index, 1);
  assert.equal(cleared.answers[0].firstTry, false);
  assert.equal(state.index, 0);
});

test('three first-try choices and a completed route earn three stars; incomplete run cannot', () => {
  let state = createChallenge('hill', 1);
  for (let i = 0; i < 3; i++) state = answerEvent(state, state.events[state.index].choices.findIndex(c => c.correct));
  assert.equal(challengeStars(state, 1), 3);
  assert.equal(challengeStars(state, .6), 2);
  assert.equal(challengeStars(createChallenge('hill', 0), 1), 0);
  assert.deepEqual(answerEvent(state, 0), state);
});

test('mistakes lower skill stars and malformed selections cannot advance', () => {
  let state = createChallenge('range', 0);
  for (const value of [-1, 99, NaN, 1.5]) assert.deepEqual(answerEvent(state, value), state);
  for (let i = 0; i < 3; i++) {
    state = answerEvent(state, state.events[state.index].choices.findIndex(c => !c.correct));
    state = answerEvent(state, state.events[state.index].choices.findIndex(c => c.correct));
  }
  assert.equal(challengeStars(state, 1), 1);
  assert.equal(state.mistakes, 3);
});

test('replays vary scenarios and answer positions while every event has one good choice', () => {
  for (const route of ['city', 'hill', 'range']) {
    const a = createChallenge(route, 0), b = createChallenge(route, 1);
    assert.equal(a.events.length, 3);
    assert.notDeepEqual(a.events.map(e => e.title), b.events.map(e => e.title));
    assert.notDeepEqual(a.events.map(e => e.choices.findIndex(c => c.correct)), b.events.map(e => e.choices.findIndex(c => c.correct)));
    for (const event of [...a.events, ...b.events]) assert.equal(event.choices.filter(c => c.correct).length, 1);
  }
});
