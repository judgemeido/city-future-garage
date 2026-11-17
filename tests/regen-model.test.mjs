import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegen,startRegen,setRegenAction,stepRegen,suggestedAction,energyError,netEnergy,soc,acceptance,makeAttempt,replayRegen,regenStars,referenceEnergy,readAttempts,comparable,CAPACITY,DT } from '../src/games/regen-model.ts';
import { REGEN_ROUTES } from '../src/games/regen-route.ts';
function run(route=0,mode='normal',regen=true){const s=createRegen(route,mode);startRegen(s);let worst=0;
 for(let i=0;i<18000&&!['complete','failed'].includes(s.phase);i++){if(s.phase==='delivery')startRegen(s);if(s.tick%12===0)setRegenAction(s,suggestedAction(s));stepRegen(s,regen);worst=Math.max(worst,Math.abs(energyError(s)));assert.ok(s.recovered>=0&&s.friction>=0&&s.losses>=0&&soc(s)>=0&&soc(s)<=100+1e-9);assert.ok(!(s.power>1e-6&&s.drivePower>1e-6),'the same motor cannot drive and regenerate simultaneously');}
 assert.equal(s.phase,'complete');assert.ok(worst<.01,`energy drift ${worst}`);return s;}
test('all three routes and all battery states have reachable three-star strategies and conserve energy',()=>{
 for(const r of [0,1,2])for(const m of ['normal','cold','full']){const s=run(r,m);assert.equal(s.deliveries.length,REGEN_ROUTES[r].stops.length);assert.equal(regenStars(s),3);assert.ok(netEnergy(s)<=referenceEnergy(r,m));}
});
test('fixed inputs reproduce exactly, while disabling regeneration preserves the parking trajectory',()=>{
 for(const r of [0,1,2]){const s=run(r),a=makeAttempt(s,'original'),on=replayRegen(a),off=replayRegen(a,'normal',false);
 assert.equal(on.phase,'complete');assert.equal(on.x,s.x);assert.equal(on.tick,s.tick);assert.equal(on.recovered,s.recovered);assert.equal(off.x,s.x);assert.equal(off.recovered,0);assert.ok(off.friction>s.friction);assert.ok(Math.abs(energyError(off))<.01);assert.ok(netEnergy(off)>netEnergy(on));}
});
test('cold and full acceptance change energy allocation rather than total braking ability',()=>{
 const a=makeAttempt(run(),'one');const variants=['normal','cold','full'].map(m=>replayRegen(a,m));
 assert.ok(variants[0].recovered>variants[1].recovered);assert.ok(variants[1].recovered>variants[2].recovered);
 variants.forEach(s=>assert.equal(s.x,variants[0].x));
});
test('full battery accepts zero initially and restores limited acceptance after actual energy use',()=>{
 const s=createRegen(0,'full');assert.equal(acceptance(s),0);startRegen(s);for(let i=0;i<500;i++)stepRegen(s);
 assert.ok(s.drawn>0&&soc(s)<100&&acceptance(s)>0);setRegenAction(s,'light');for(let i=0;i<600&&s.phase==='running';i++)stepRegen(s);
 assert.ok(s.recovered>0&&s.recovered<s.drawn);assert.ok(soc(s)<=100);assert.ok(Math.abs(energyError(s))<.01);
});
test('downhill net charging is backed by gravitational work, not created energy',()=>{
 const s=run(1);assert.ok(netEnergy(s)<0);assert.ok(Math.abs(energyError(s))<.01);
});
test('pause and delivery stops freeze simulation, time and energy',()=>{
 const s=createRegen(2);startRegen(s);for(let i=0;i<100;i++)stepRegen(s);s.paused=true;const before=structuredClone(s);for(let i=0;i<100;i++)stepRegen(s);assert.deepEqual(s,before);
 s.paused=false;for(let i=0;i<8000&&s.phase==='running';i++){if(s.tick%12===0)setRegenAction(s,suggestedAction(s));stepRegen(s);}assert.equal(s.phase,'delivery');const stopped=structuredClone(s);stepRegen(s);assert.deepEqual(s,stopped);
});
test('missed stop uses real emergency braking and cannot earn hand-driving stars',()=>{
 const s=createRegen();startRegen(s);for(let i=0;i<10000&&s.phase==='running';i++)stepRegen(s);
 assert.equal(s.phase,'failed');assert.equal(s.v,0);assert.ok(s.emergency);assert.equal(regenStars(s),0);assert.ok(Math.abs(energyError(s))<.01);
 const valid=run();valid.assisted=true;assert.equal(regenStars(valid),0);valid.assisted=false;valid.practice=true;assert.equal(regenStars(valid),0);
});
test('saved controls and trajectories remain bounded and incompatible records are excluded',()=>{
 const a=makeAttempt(run(),'a'),b={...a,id:'b'};assert.equal(comparable(a,b),true);assert.equal(comparable(a,{...b,mode:'cold'}),false);assert.equal(comparable(a,{...b,assisted:true}),false);
 assert.ok(a.frames.length<=a.ticks/12+3);assert.ok(a.inputs.length<a.ticks);assert.deepEqual(readAttempts([{results:{}},null,{...a,route:99},a]),[a]);
 assert.equal(readAttempts(Array.from({length:10},(_,i)=>({...a,id:String(i)}))).length,6);
 for(const corrupt of [{stars:4},{stars:-1},{frames:[null]},{deliveries:[{x:'wrong',precision:1}]},{inputs:[{tick:5,action:'coast'},{tick:2,action:'light'}]},{success:'yes'},{maxSway:Infinity}])assert.deepEqual(readAttempts([{...a,...corrupt}]),[]);
 assert.equal(comparable(a,{...b,overspeed:2}),false);assert.equal(comparable(a,{...b,deliveries:[{x:a.x+3,precision:.5}]}),false);
 const paused=createRegen();startRegen(paused);paused.paused=true;for(let i=0;i<50000;i++)setRegenAction(paused,i%2?'light':'coast');assert.equal(paused.inputs.length,1);
 assert.equal(replayRegen(a).frames[0].t,0);assert.equal(replayRegen(a).frames[0].drawn,0);
});
