import test from 'node:test';
import assert from 'node:assert/strict';
import { PARKING_LEVELS } from '../src/games/parking-levels.ts';
import { createRun, stepRun, advanceRun, continueRun, simulate, starsFor, integrateBicycle, carCenter, carCorners, collision, collides, parkingQuality, MAX_STEER, WHEELBASE, BOUNDS } from '../src/games/parking-model.ts';
import { dragCommand, commandEnd } from '../src/games/parking-planner.ts';
import { measureEcho, echoMilliseconds, compareEcho } from '../src/games/parking-science.ts';
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('six distinct layouts have a collision-free three-star solution, empty plans do not park',()=>{
  assert.equal(new Set(PARKING_LEVELS.map(l=>l.id)).size,6);
  for(const l of PARKING_LEVELS){const r=simulate(l.start,l.reference,l,true);
    assert.equal(r.status,'ended',l.id);assert.equal(starsFor(r,l),3,l.id);assert.ok(r.trace.every(p=>!collision(p,l)),l.id);
    assert.equal(parkingQuality(l.start,l).parked,false);assert.equal(starsFor(createRun(l.start,[]),l),0);
    close(carCenter(r.pose).x,l.bay.x);close(carCenter(r.pose).y,l.bay.y);
  }
  assert.ok(Math.abs(PARKING_LEVELS[0].bay.angle)>1.5,'garage is genuinely perpendicular');
});
test('gesture endpoints yield bounded executable curves and do not snap to a target bay',()=>{
  const start={x:500,y:200,angle:0},c={gear:-1,distance:150,steer:.3};
  const end=commandEnd(start,c),fit=dragCommand(start,c,end,'end'),actual=commandEnd(start,fit);
  close(actual.x,end.x);close(actual.y,end.y);close(fit.steer,c.steer);
  const tight=dragCommand(start,c,{x:490,y:220},'bend');assert.ok(Math.abs(tight.steer)<=MAX_STEER);
  const l=PARKING_LEVELS[0],changed=structuredClone(l.reference);changed[0].distance-=50;
  const bad=simulate(l.start,changed,l,true);assert.equal(starsFor(bad,l),0);assert.ok(parkingQuality(bad.pose,l).offset>40);
});
test('preview and execution share deterministic integration at different frame rates',()=>{
  const l=PARKING_LEVELS[4],preview=simulate(l.start,l.reference);
  for(const fps of [20,30,60,144]){const r=createRun(l.start,l.reference);for(let i=0;i<fps*60&&r.status==='moving';i++)advanceRun(r,l,1/fps);
    assert.equal(r.status,'ended');close(r.pose.x,preview.pose.x);close(r.pose.y,preview.pose.y);close(r.pose.angle,preview.pose.angle);close(r.distance,preview.distance);assert.equal(r.shifts,2);
  }
});
test('front steering changes yaw in opposite directions in reverse and respects physical radius',()=>{
  const p={x:300,y:250,angle:0},a=integrateBicycle(p,80,.4,1),b=integrateBicycle(p,-80,.4,1);
  assert.ok(a.angle>0&&b.angle<0);close(a.angle,-b.angle);close(a.angle,80*Math.tan(.4)/WHEELBASE);
  assert.deepEqual(integrateBicycle(p,0,.4,1),p);assert.deepEqual(integrateBicycle(p,20,0,1),{x:320,y:250,angle:0});
  close(integrateBicycle(p,20,3,1).angle,integrateBicycle(p,20,MAX_STEER,1).angle);
});
test('car body can hit an obstacle even though the rear-axle centerline is clear; thin pillars stop motion',()=>{
  const start={x:200,y:200,angle:0},level={obstacles:[{x:300,y:220,w:.2,h:4,name:'细柱'}]},cmd=[{gear:1,distance:250,steer:0}];
  const r=simulate(start,cmd,level,true);assert.equal(r.status,'collision');assert.equal(r.contact.name,'细柱');assert.equal(r.contact.corner,'右前角');assert.ok(r.pose.x<250);assert.equal(collision(r.pose,level),false);
  const snapshot=structuredClone(r);stepRun(r,level);assert.deepEqual(r,snapshot);assert.equal(continueRun(r,cmd),false);
  const edge=simulate({x:900,y:200,angle:0},cmd,{obstacles:[]},true);assert.equal(edge.status,'collision');assert.ok(carCorners(edge.pose).every(p=>p.x<BOUNDS.right));
});
test('parking checks all four corners and the bay orientation, precision does not reward outside parking',()=>{
  const l=PARKING_LEVELS[0],end=simulate(l.start,l.reference).pose;assert.equal(parkingQuality(end,l).precise,true);
  assert.equal(parkingQuality({...end,x:end.x+40},l).parked,false);
  assert.equal(parkingQuality({...end,angle:0},l).parked,false);
  assert.equal(parkingQuality(end,l,1).parked,false);
  const p={x:300,y:200,angle:Math.PI/4};assert.equal(collides(p,{x:335,y:235,w:10,h:10}),true);
});
test('stops before gear changes, splitting straight sections does not add shifts, corrections keep travelled distance',()=>{
  const l=PARKING_LEVELS[0],part=l.reference.slice(0,2),r=simulate(l.start,part,l,true),before=r.distance;
  assert.equal(r.status,'ended');assert.equal(continueRun(r,[l.reference[2]]),true);assert.equal(r.corrections,1);
  while(r.status==='moving')stepRun(r,l);assert.ok(r.distance>before);close(r.distance,l.reference.reduce((s,c)=>s+c.distance,0));assert.equal(starsFor(r,l),2);
  const split=simulate({x:200,y:200,angle:0},[{gear:1,distance:30,steer:0},{gear:1,distance:40,steer:0},{gear:-1,distance:20,steer:0}]);assert.equal(split.shifts,1);close(split.distance,90);
  const paused=createRun(l.start,l.reference),p={...paused.pose};stepRun(paused,l);assert.deepEqual(paused.pose,p,'initial settling occurs at rest');
});
test('assisted execution cannot get autonomous stars, precision and efficiency are graded independently',()=>{
  const l=PARKING_LEVELS[0],r=simulate(l.start,l.reference,l,true);assert.equal(starsFor(r,l),3);r.assisted=true;assert.equal(starsFor(r,l),0);r.assisted=false;r.shifts+=2;assert.equal(starsFor(r,l),2);
  r.pose.x+=10;assert.equal(parkingQuality(r.pose,l).parked,true);assert.equal(starsFor(r,l),1);
});
test('ultrasonic echo uses round-trip time, finite view and no-return semantics',()=>{
  close(echoMilliseconds(2),2*echoMilliseconds(1));
  const l={obstacles:[{x:400,y:200,w:20,h:100,name:'测试墙'}]},p={x:200,y:200,angle:0};
  const a=measureEcho(p,l,'front'),b=measureEcho({...p,x:240},l,'front');close(a.distance,6.6);close(b.distance,4.6);close(a.milliseconds,2*6.6/343*1000);assert.match(compareEcho(a,b),/更远的回声/);
  const no=measureEcho({x:200,y:200,angle:0},{obstacles:[]},'front');assert.equal(no.distance,null);assert.equal(no.hit,null);assert.equal(compareEcho(a,no),null);
  const blocked=measureEcho(p,{obstacles:[...l.obstacles,{x:330,y:200,w:10,h:80,name:'近墙'}]},'front');assert.equal(blocked.object,'近墙');assert.ok(blocked.distance<a.distance);
});
