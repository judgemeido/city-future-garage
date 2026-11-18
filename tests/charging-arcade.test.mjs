import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChargingArcade,
  connectPlugToSlot,
  allocateArcadePower,
  stepChargingArcade,
  triggerSolarBoost,
  effectiveCapacity,
  chargingArcadeStars,
} from '../src/games/charging-arcade-model.ts';

test('charging arcade conserves grid power across two plugs and switches priority cleanly', () => {
  const s = createChargingArcade(0);
  s.phase = 'running';
  connectPlugToSlot(s, 0);
  connectPlugToSlot(s, 1);
  allocateArcadePower(s);
  const sumBal = s.cars.reduce((acc, c) => acc + c.powerKw, 0);
  assert.ok(sumBal <= effectiveCapacity(s) + 1e-6);
  assert.equal(Math.round(s.cars[0].powerKw), 45);
  assert.equal(Math.round(s.cars[1].powerKw), 45);

  s.strategy = 'priority';
  s.prioritySlot = 0;
  allocateArcadePower(s);
  assert.ok(s.cars[0].powerKw > s.cars[1].powerKw);
  assert.ok(s.cars.reduce((acc, c) => acc + c.powerKw, 0) <= effectiveCapacity(s) + 1e-6);
});

test('charging above 80% triggers trickle slowdown and releasing at 80% scores combo & progress', () => {
  const s = createChargingArcade(0);
  s.phase = 'running';
  connectPlugToSlot(s, 0);
  const car = s.cars[0];
  const fastPower = car.powerKw;
  car.energyKwh = car.capacityKwh * 0.82;
  car.reachedTarget = true;
  allocateArcadePower(s);
  assert.equal(car.inTrickle, true);
  assert.ok(car.powerKw < fastPower * 0.5, 'trickle power should drop substantially after 80%');

  const res = connectPlugToSlot(s, 0);
  assert.equal(res.action, 'released');
  assert.equal(s.served, 1);
  assert.equal(s.combo, 1);
  assert.ok(s.score >= 240);
});

test('solar boost expands grid capacity for 8 seconds and full shift awards stars', () => {
  const s = createChargingArcade(0);
  s.phase = 'running';
  const base = effectiveCapacity(s);
  assert.equal(triggerSolarBoost(s), false);
  s.solarCharge = 100;
  assert.equal(triggerSolarBoost(s), true);
  assert.ok(effectiveCapacity(s) > base);
  stepChargingArcade(s, 1);
  assert.ok(s.boostRemaining < 8 && s.boostRemaining > 6);

  s.served = 4;
  s.missed = 0;
  s.bestCombo = 4;
  assert.equal(chargingArcadeStars(s), 3);
});
