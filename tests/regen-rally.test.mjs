import test from 'node:test';
import assert from 'node:assert/strict';
import { RALLY_COURSES,RALLY_DT,createRally,stepRally,rallyReserve,rallyEnergyError,rallyStars,rallyTerrain,RALLY_G } from '../src/games/regen-rally-model.ts';
function drive(course=0,battery='normal',seed=9){const s=createRally(course,seed,battery);s.phase='running';let worst=0;
 for(let i=0;i<9000&&s.phase==='running';i++){
  const gate=s.events.find(e=>e.kind==='gate'&&!e.resolved);if(gate){s.targetLane=gate.lane;const gravity=-RALLY_G*rallyTerrain(RALLY_COURSES[course],s.x).slope;const d=gate.x-s.x;const stopping=(s.v*s.v-64)/(2*Math.max(.4,2.35+.14-gravity));s.action=d<Math.max(30,stopping+12)&&s.v>8?'regen':'drive';}else s.action='drive';
  stepRally(s);worst=Math.max(worst,Math.abs(rallyEnergyError(s)));
 }
 assert.equal(s.phase,'complete',`course ${course} ${battery}, ${s.x}m, ${s.tick*RALLY_DT}s`);assert.ok(worst<.01,`energy error ${worst}`);return s;}
test('all courses and battery states can be completed with every delivery and three stars',()=>{
 for(const course of [0,1,2])for(const battery of ['normal','cold','full']){const s=drive(course,battery);assert.equal(s.deliveries,RALLY_COURSES[course].gates.length);assert.equal(s.hits,0);assert.equal(rallyStars(s),3);}
});
test('braking, boosts, slopes and collisions keep one conserved energy ledger',()=>{
 for(const course of [0,1,2]){const s=createRally(course,123);s.phase='running';let worst=0;
  for(let i=0;i<6000&&s.phase==='running';i++){s.targetLane=Math.floor(i/100)%3;s.action=i%480<280?'drive':i%480<420?'regen':'brake';s.boosting=s.action==='drive'&&rallyReserve(s)>1000;stepRally(s);worst=Math.max(worst,Math.abs(rallyEnergyError(s)));assert.ok(s.recovered>=0&&s.friction>=0&&s.losses>=0);assert.ok(s.boostSpent<=s.recovered+1e-5);assert.ok(!(s.power>1&&s.drivePower>1));}
  assert.ok(worst<.01,`course ${course} drift ${worst}`);assert.ok(s.boostSpent>0,'recovered energy can fund a real boost');}
});
test('tokens give score, not electricity; cold and full packs still brake at the same rate',()=>{
 const states=['normal','cold','full'].map(battery=>createRally(0,99,battery));
 for(const s of states){s.phase='running';for(let i=0;i<360;i++)stepRally(s);s.action='regen';for(let i=0;i<140;i++)stepRally(s);}
 assert.equal(states[0].x,states[1].x);assert.equal(states[0].v,states[2].v);assert.ok(states[0].recovered>states[1].recovered);assert.ok(states[1].recovered>states[2].recovered);
 const a=createRally(0,77),b=createRally(0,77);a.phase=b.phase='running';b.events=b.events.filter(e=>e.kind!=='token');
 for(let i=0;i<700;i++){stepRally(a);stepRally(b);}assert.ok(a.tokens>0);assert.equal(a.recovered,b.recovered);assert.equal(a.drawn,b.drawn);assert.ok(a.score>b.score);
});
test('paused inputs freeze simulation and a new seed changes later deliveries',()=>{
 const s=createRally(1,42);s.phase='running';for(let i=0;i<300;i++)stepRally(s);s.paused=true;const before=structuredClone(s);for(let i=0;i<600;i++)stepRally(s);assert.deepEqual(s,before);
 assert.deepEqual(createRally(1,42),createRally(1,42));assert.notDeepEqual(createRally(1,42).events,createRally(1,7919).events);
});
