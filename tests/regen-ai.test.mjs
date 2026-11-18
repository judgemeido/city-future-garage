import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRegenAiState,
  stepRegenAi,
  netConsumptionKwhPer100km,
  energySavingPercent,
  regenAiStars,
} from '../src/games/regen-ai-model.ts';

function runToFinish(state) {
  state.phase = 'running';
  for (let i = 0; i < 60 * 120 && state.phase === 'running'; i++) {
    stepRegenAi(state);
  }
  return state;
}

test('V2X long-horizon AI Eco-Pilot recovers energy cleanly and beats short-sight aggressive ghost', () => {
  const s = runToFinish(createRegenAiState(0, { horizon: 'v2x', regenStyle: 'adaptive', battery: 'normal', control: 'ai' }));
  assert.equal(s.player.finished, true);
  assert.equal(s.player.redViolations, 0);
  assert.ok(s.player.energyRegenJ > 50000, 'AI should recover significant braking energy');
  assert.ok(s.player.frictionHeatJ < s.ghost.frictionHeatJ, 'V2X AI should waste less brake friction heat than short-sight ghost');
  assert.ok(netConsumptionKwhPer100km(s.player) < netConsumptionKwhPer100km(s.ghost));
  assert.ok(energySavingPercent(s) > 0);
  assert.ok(regenAiStars(s) >= 2);
});

test('cold and full batteries physically limit electrical regeneration and increase friction brake heat on downhill', () => {
  const normal = runToFinish(createRegenAiState(1, { horizon: 'v2x', regenStyle: 'adaptive', battery: 'normal', control: 'ai' }));
  const cold = runToFinish(createRegenAiState(1, { horizon: 'v2x', regenStyle: 'adaptive', battery: 'cold', control: 'ai' }));
  const full = runToFinish(createRegenAiState(1, { horizon: 'v2x', regenStyle: 'adaptive', battery: 'full', control: 'ai' }));

  assert.ok(normal.player.energyRegenJ > cold.player.energyRegenJ, 'cold battery accepts less regen energy');
  assert.ok(cold.player.energyRegenJ > full.player.energyRegenJ, 'full battery accepts even less regen energy');
  assert.ok(full.player.frictionHeatJ > normal.player.frictionHeatJ, 'full battery pushes downhill braking into friction heat');
});
