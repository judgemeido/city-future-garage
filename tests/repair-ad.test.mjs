import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AD_FAULT_CASES,
  AD_NODES,
  createRepairAdState,
  probeAdNode,
  applyRepairFix,
  repairAdStars,
} from '../src/games/repair-ad-model.ts';

test('every AD fault case exposes a distinct root-cause fault reading and unique repair fix', () => {
  for (let i = 0; i < AD_FAULT_CASES.length; i++) {
    const c = AD_FAULT_CASES[i];
    const s = createRepairAdState(i);
    const faultReading = probeAdNode(s, c.faultNode);
    assert.equal(faultReading.status, 'fault');

    // Wrong fix increments wrongAttempts and does not repair
    const wrongFix = AD_FAULT_CASES[(i + 1) % AD_FAULT_CASES.length].correctFix;
    const bad = applyRepairFix(s, wrongFix);
    assert.equal(bad.ok, false);
    assert.equal(s.repaired, false);
    assert.equal(s.wrongAttempts, 1);

    // Correct fix repairs and updates fault node to ok
    const good = applyRepairFix(s, c.correctFix);
    assert.equal(good.ok, true);
    assert.equal(s.repaired, true);
    assert.equal(probeAdNode(s, c.faultNode).status, 'ok');
    assert.equal(repairAdStars(s), 2);
  }
});

test('first-try evidence-backed repair earns three stars across all 4 AD fault cases', () => {
  for (let i = 0; i < AD_FAULT_CASES.length; i++) {
    const s = createRepairAdState(i);
    for (const n of AD_NODES) probeAdNode(s, n.id);
    applyRepairFix(s, AD_FAULT_CASES[i].correctFix);
    assert.equal(repairAdStars(s), 3);
  }
});
