import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, BASE, CATEGORIES, DISTRICTS, EXAMPLES, TESTS, teachingAction, buildTree, predict, sanitizeSamples, needsCoach, districtTests, actionPose } from '../src/games/ai-model.ts';

test('all road categories have three distinct examples and each test district has six events',()=>{
  assert.equal(CATEGORIES.length,12);assert.equal(EXAMPLES.length,36);assert.equal(TESTS.length,24);
  for(const category of CATEGORIES) assert.equal(EXAMPLES.filter(e=>e.category===category.id).length,3);
  assert.equal(new Set([...EXAMPLES,...TESTS].map(e=>e.id)).size,60);
  for(const district of DISTRICTS) assert.equal(districtTests(district.id).length,6);
  assert.deepEqual(new Set(EXAMPLES.map(e=>e.expected)),new Set(ACTIONS));
});

test('combined hazards preserve waiting, closure and priority rules',()=>{
  assert.equal(teachingAction({...BASE,signal:'red',priority:'emergency'}),'wait');
  assert.equal(teachingAction({...BASE,pedestrian:'crossing',hazard:'parked',lane:'open'}),'wait');
  assert.equal(teachingAction({...BASE,hazard:'works',lane:'closed'}),'stop');
  assert.equal(teachingAction({...BASE,hazard:'blocked',lane:'open',priority:'emergency'}),'stop');
  assert.equal(teachingAction({...BASE,hazard:'works',lane:'open',priority:'cyclist'}),'yield');
  assert.equal(teachingAction({...BASE,hazard:'parked',lane:'open',road:'wet'}),'detour');
});

test('decision tree learns all six demonstrated actions and preserves wrong labels for later review',()=>{
  const samples=EXAMPLES.map(e=>({...e,action:e.expected})),tree=buildTree(samples);
  for(const example of EXAMPLES) assert.equal(predict(tree,example.features,samples).action,example.expected,example.id);
  const wrong=[{...EXAMPLES[0],action:'go'}],uninformed=buildTree(wrong);
  const closed=TESTS.find(e=>e.category==='blocked');
  const prediction=predict(uninformed,closed.features,wrong);
  assert.equal(prediction.action,'go');assert.ok(prediction.unfamiliar.some(text=>text.includes('道路封闭')));
  assert.equal(needsCoach(closed.expected,prediction.action),true);
});

test('old samples migrate to new feature defaults without changing the user choice',()=>{
  const legacy={id:'demo-clear-0',category:'clear',title:'阳光街',features:{signal:'green',pedestrian:'none',visibility:'clear',road:'normal'},expected:'go',action:'wait'};
  const migrated=sanitizeSamples([legacy,null,{...legacy,id:'bad',features:{...legacy.features,signal:'blue'}}]);
  assert.equal(migrated.length,1);assert.equal(migrated[0].action,'wait');assert.deepEqual(migrated[0].features,BASE);
  const all=sanitizeSamples(EXAMPLES.map(e=>({...e,action:e.expected})));
  assert.equal(all.length,36,'the former 30-sample limit must not discard the added examples');
});

test('safety coach intercepts unsafe movement while preserving conservative waiting',()=>{
  for(const expected of ['wait','stop','yield','detour']) assert.equal(needsCoach(expected,'go'),true);
  assert.equal(needsCoach('wait','stop'),false);assert.equal(needsCoach('stop','wait'),false);
  assert.equal(needsCoach('yield','wait'),false);assert.equal(needsCoach('detour','stop'),false);
  for(const action of ACTIONS) assert.equal(needsCoach(action,action),false);
});

test('detour clears the obstacle, yield clears the lane, and parking stops before it',()=>{
  const detour=actionPose('detour',3.2);assert.ok(detour.x>600&&detour.x<730);assert.equal(detour.y,307);
  assert.equal(actionPose('yield',3).y,302);assert.equal(actionPose('yield',3).moving,false);
  for(const action of ['wait','stop']) {assert.equal(actionPose(action,5).x,495);assert.equal(actionPose(action,5).moving,false);}
  for(const action of ACTIONS) for(const time of [0,.5,1,2,3,5,10]) {
    const pose=actionPose(action,time);assert.ok(pose.x>=155&&pose.x<=905&&pose.y>=235&&pose.y<=307);
  }
});
