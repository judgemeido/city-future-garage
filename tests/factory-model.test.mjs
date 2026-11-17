import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicle, fingerprint, configurationStats, simulateRoad, operatingPoint, BATTERIES, INVERTERS, MOTORS, REDUCERS, WHEELS, ROADS, SETUPS } from '../src/games/factory-model.ts';

const base = normalizeVehicle({ name: '测试车', battery: 40, motor: 90, body: 'city' });
test('legacy vehicles acquire valid new parts and keep their chosen vehicle identity', () => {
  const legacy = normalizeVehicle({ name: '旧车', color: '#abcdef', battery: 60, motor: 140, body: 'sport' });
  assert.equal(legacy.name, '旧车'); assert.equal(legacy.body, 'sport'); assert.equal(legacy.battery, 60);
  assert.equal(legacy.inverter, 100); assert.equal(legacy.reducer, 9); assert.equal(legacy.wheels, 'grip');
  const corrupted = normalizeVehicle({ inverter: -2, reducer: NaN, wheels: 'unknown' });
  assert.deepEqual([corrupted.inverter, corrupted.reducer, corrupted.wheels], [100, 9, 'grip']);
  for (const update of [{ inverter: 45 }, { reducer: 12 }, { wheels: 'eco' }]) assert.notEqual(fingerprint(base), fingerprint({ ...base, ...update }));
});
test('all power-chain combinations obey battery/inverter budgets, energy and speed limits', () => {
  for (const battery of BATTERIES) for (const inverter of INVERTERS) for (const motor of MOTORS) {
    for (const road of ROADS) {
      const v = { ...base, battery: battery.value, inverter: inverter.value, motor: motor.value };
      const run = simulateRoad(v, road);
      assert.ok(run.peakPower <= battery.power + 1e-8, 'battery output limit');
      assert.ok(run.peakPower - .7 <= inverter.value + 1e-8, 'DC inverter input limit');
      assert.ok(run.energy >= 0 && run.remaining >= 0 && run.ratio >= 0 && run.ratio <= 1);
      assert.ok(Math.abs(run.energy + run.remaining - battery.value * .65) < 1e-8);
      assert.ok(run.maxSpeed <= Math.min(road.speed, configurationStats(v).speedCeiling) + 1e-8);
      assert.ok(run.trace.every((p, index, all) => index === 0 || p.time >= all[index - 1].time && p.energy >= all[index - 1].energy && p.distance >= all[index - 1].distance));
    }
  }
});
test('reduction ratio trades speed for torque and rescues a torque-limited hill climb', () => {
  const cruise = { ...base, motor: 60, reducer: 7 }, climb = { ...cruise, reducer: 12 };
  assert.ok(configurationStats(climb).wheelTorque > configurationStats(cruise).wheelTorque);
  assert.ok(configurationStats(climb).speedCeiling < configurationStats(cruise).speedCeiling);
  assert.ok(simulateRoad(cruise, ROADS[1]).ratio < .5);
  assert.equal(simulateRoad(climb, ROADS[1]).ratio, 1);
  for (const reducer of REDUCERS) for (const wheels of WHEELS) {
    const v = { ...base, reducer: reducer.value, wheels: wheels.value }, p = operatingPoint(v, 40);
    assert.ok(Math.abs(p.motorRPM / p.wheelRPM - reducer.value) < 1e-10);
    assert.ok(configurationStats(v).wheelTorque <= reducer.torque);
  }
});
test('wheel rolling resistance changes measured energy and every reference setup completes its task', () => {
  const low = simulateRoad({ ...base, wheels: 'eco' }, ROADS[2]);
  const high = simulateRoad({ ...base, wheels: 'trail' }, ROADS[2]);
  assert.equal(low.ratio, 1); assert.ok(high.ratio < low.ratio);
  assert.ok(low.energy / low.distance < high.energy / high.distance);
  for (const setup of SETUPS) assert.equal(simulateRoad({ ...base, ...setup.parts }, ROADS.find(r => r.id === setup.id)).ratio, 1, setup.title);
  assert.deepEqual(simulateRoad(base, ROADS[0]), simulateRoad(base, ROADS[0]));
});
