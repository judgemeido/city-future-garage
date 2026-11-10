import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_IDS, MAX_SCORE } from '../src/game-catalog.ts';
import { initialState, loadState, persist, totalScore } from '../src/store.ts';
import { PARKING_SCENES, planRoute, routePose, isParked, collision, collides, integrateBicycle, MAX_STEER, WHEELBASE } from '../src/games/parking-model.ts';
import { createCharging, connect, allocate, stepCharging } from '../src/games/charging-model.ts';
import { createRepair, scanRepair, readPart, replacePart, retestRepair, repairStars, REPAIR_PARTS, REPAIR_SCENES } from '../src/games/repair-model.ts';
import { createGrip, stepGrip, replayGrip, gripDifference, GRIP_SCENES } from '../src/games/grip-model.ts';

test('eight games share a calculated 800-point limit and independent progress entries', () => {
  const state=initialState(); assert.equal(GAME_IDS.length,8); assert.equal(MAX_SCORE,800);
  for(const id of GAME_IDS) state.progress[id].awards.core={points:100,label:'core'};
  assert.equal(totalScore(state),800);state.progress.parking.awards.core.points=0;
  assert.equal(state.progress.repair.awards.core.points,100);
});
test('old four-game storage retains profile, vehicle, awards and images when upgrading', () => {
  const old={version:1,profile:{nickname:'旧工位',workstation:'07'},vehicle:{name:'旧车辆',color:'#abcdef',body:'sport'},progress:{factory:{awards:{saved:{points:25,label:'保存'}},completed:true,data:{best:{city:3}},image:'data:image/jpeg;base64,abc'}}};
  globalThis.localStorage={getItem:()=>JSON.stringify(old)};const upgraded=loadState();
  assert.equal(upgraded.profile.nickname,'旧工位');assert.equal(upgraded.vehicle.body,'sport');
  assert.equal(upgraded.progress.factory.completed,true);assert.equal(totalScore(upgraded),25);
  assert.equal(upgraded.progress.factory.image,old.progress.factory.image);
  for(const id of ['parking','repair','charging','grip'])assert.deepEqual(upgraded.progress[id],{awards:{},completed:false,data:{}});
});
test('quota fallback preserves structured work and leaves in-memory screenshot export intact', () => {
  const state=initialState();state.progress.grip.image='data:image/jpeg;base64,huge';state.progress.grip.data={report:[{label:'轨迹',value:'真实实验'}]};
  let saved;globalThis.localStorage={setItem:(key,value)=>{if(JSON.parse(value).progress.grip.image)throw new Error('Quota');saved=JSON.parse(value);}};
  assert.equal(persist(state),false);assert.ok(state.progress.grip.image);assert.equal(saved.progress.grip.data.report[0].value,'真实实验');
});
test('all three reference parking routes obey curvature, geometry and actual parking completion', () => {
  for(const scene of PARKING_SCENES){const route=planRoute(scene,scene.handle);assert.equal(route.valid,true,scene.name+' '+route.reason);
    assert.ok(route.maxCurvature<=Math.tan(MAX_STEER)/WHEELBASE);
    for(const sample of route.samples)assert.equal(collision(sample,scene),false);
    assert.equal(isParked(routePose(route,route.length),scene),true);
    assert.equal(isParked(routePose(route,0),scene),false);
    for(let i=1;i<route.samples.length;i++){const a=route.samples[i-1],b=route.samples[i];if(b.s-a.s<1e-9)continue;const dot=(b.x-a.x)*Math.cos(b.angle)+(b.y-a.y)*Math.sin(b.angle);assert.ok(dot*b.gear>0);}
  }
});
test('route dragging recomputes feasibility and collision checks include rotated car corners', () => {
  const scene=PARKING_SCENES[0],normal=planRoute(scene,scene.handle),bad=planRoute(scene,{...scene.handle,y:95});
  assert.notEqual(normal.samples[100].y,bad.samples[100].y);assert.equal(bad.valid,false);assert.ok(bad.conflict);assert.match(bad.reason,/障碍|转向/);
  assert.equal(collides({x:0,y:0,angle:Math.PI/4},{x:42,y:22,w:15,h:15}),true);
  assert.equal(isParked({x:scene.bay.x+65,y:scene.bay.y,angle:0},scene),false);
  assert.equal(isParked({x:scene.bay.x,y:scene.bay.y,angle:.5},scene),false);
});
test('bicycle steering has opposite yaw in reverse, cannot move while stopped, and never shifts sideways', () => {
  const pose={x:100,y:100,angle:0};const forward=integrateBicycle(pose,50,.3,.01),reverse=integrateBicycle(pose,-50,.3,.01);
  assert.ok(forward.angle>0);assert.ok(reverse.angle<0);assert.ok(forward.x>pose.x);assert.ok(reverse.x<pose.x);
  assert.deepEqual(integrateBicycle(pose,0,.6,1),pose);
  assert.deepEqual(integrateBicycle(pose,50,0,.01),{x:100.5,y:100,angle:0});
});
test('charging conserves supply, respects vehicle acceptance, and disconnecting stops energy gain', () => {
  const state=createCharging(1);connect(state,0,'a');connect(state,1,'b');allocate(state);
  assert.equal(state.cars[0].power,18);assert.equal(state.cars[1].power,18);
  state.strategy='priority';state.priority='a';allocate(state);assert.equal(state.cars[0].power,30);assert.equal(state.cars[1].power,6);
  const before=state.delivered;stepCharging(state,1);assert.ok(Math.abs(state.delivered-before-.6)<1e-10);
  assert.ok(state.cars.every(c=>c.power<=c.accept));const initial=state.cars[0].energy;connect(state,0,null);stepCharging(state,1);assert.equal(state.cars[0].energy,initial);assert.equal(state.cars[2].energy,state.cars[2].initial);
  const paused=structuredClone(state);stepCharging(state,0);assert.deepEqual(state,paused);
});
test('all charging scenarios have feasible two-plug schedules; targets stop exactly and release plugs', () => {
  for(let scene=0;scene<3;scene++){
    const state=createCharging(scene);state.strategy='priority';
    for(let frame=0;frame<60*35&&!state.ended;frame++){
      for(let plug=0;plug<2;plug++)if(!state.cars.some(c=>c.connected===plug)){
        const next=state.cars.filter(c=>c.reachedAt===null&&c.connected===null).sort((a,b)=>a.deadline-b.deadline)[0];if(next)connect(state,plug,next.id);
      }
      state.priority=state.cars.filter(c=>c.reachedAt===null).sort((a,b)=>a.deadline-b.deadline)[0]?.id||'a';
      stepCharging(state,1/60);assert.ok(state.cars.reduce((s,c)=>s+c.power,0)<=state.capacity+1e-9);
    }
    assert.equal(state.expired,false,`scene ${scene}`);assert.equal(state.ended,true);
    for(const c of state.cars){assert.equal(c.energy,c.target);assert.ok(c.reachedAt<=c.deadline);assert.equal(c.connected,null);}
    assert.ok(Math.abs(state.delivered-state.cars.reduce((sum,c)=>sum+c.energy-c.initial,0))<1e-9);
  }
});
test('scanning only crossed nodes produces evidence, wrong replacements cannot pass retest', () => {
  const state=createRepair(0);assert.deepEqual(scanRepair(state,100,100),[]);assert.equal(state.evidence.length,0);
  const fault=REPAIR_PARTS.find(p=>p.id===state.fault);scanRepair(state,fault.x,fault.y);scanRepair(state,fault.x,fault.y);assert.equal(state.evidence.length,1);
  assert.match(readPart(state,'motor'),/上游/);assert.equal(replacePart(state,'motor'),false);assert.equal(retestRepair(state).passed,false);assert.equal(state.completed,false);assert.equal(repairStars(state),0);
  assert.equal(replacePart(state,state.fault),true);assert.equal(state.completed,false);assert.equal(retestRepair(state).passed,true);assert.equal(repairStars(state),2);
});
test('every repair scenario and replay fault has distinguishing evidence and a one-part solution', () => {
  for(let scene=0;scene<3;scene++)for(let round=0;round<2;round++){
    const state=createRepair(scene,round);for(const id of REPAIR_SCENES[scene].parts){const p=REPAIR_PARTS.find(p=>p.id===id);scanRepair(state,p.x,p.y);}
    assert.equal(state.evidence.length,3);assert.equal(retestRepair(state).passed,false);replacePart(state,state.fault);assert.equal(retestRepair(state).passed,true);assert.equal(repairStars(state),3);assert.equal(state.cost,10);
    const fresh=createRepair(scene,round);assert.equal(fresh.evidence.length,0);assert.equal(fresh.replacements.length,0);
  }
});
function runGrip(scene,value){const state=createGrip(scene,value);for(let i=0;i<1560;i++)stepGrip(state,1/120);return state;}
test('grip experiments change one condition, create actual trajectory differences, and offer a feasible baseline', () => {
  for(let scene=0;scene<3;scene++){
    const state=runGrip(scene,GRIP_SCENES[scene].default),a=state.conditions.a,b=state.conditions.b;
    assert.equal(Object.keys(a).filter(k=>a[k]!==b[k]).length,1);assert.equal(state.ended,true);assert.equal(state.a.finished,true);assert.equal(state.b.finished,true);assert.ok(gripDifference(state)>.5);assert.equal(state.a.outsideCount,0,`baseline scene ${scene}`);
  }
  const dry=runGrip(0,0);assert.equal(gripDifference(dry),0);assert.equal(dry.b.outsideCount,0);
  const slow=runGrip(1,30);assert.equal(gripDifference(slow),0);assert.equal(slow.b.outsideCount,0);
});
test('replay reads actual frozen frames and replaying cannot change experiment conditions or score outcomes', () => {
  const state=runGrip(0,75),before=structuredClone(state);assert.equal(replayGrip(state,0).time,0);assert.equal(replayGrip(state,1).time,state.time);
  assert.ok(replayGrip(state,.5).time>6&&replayGrip(state,.5).time<7);assert.deepEqual(state,before);
  stepGrip(state,.5);assert.deepEqual(state,before);
});
