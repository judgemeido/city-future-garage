// Exercise the training controls and recorded decisions in a real browser.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const folder=`output/playwright/ai-expanded-${base.startsWith('file:')?'offline':'online'}`;
(async()=>{
  fs.mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    if(base.startsWith('file:')) await page.context().setOffline(true);
    await page.clock.install();await page.clock.pauseAt(Date.now()+100);
    const advance=ms=>page.clock.runFor(ms);
    await page.goto(base+'#ai');await advance(500);
    assert.equal(await page.locator('.ai-road-card').count(),12);
    assert.equal(await page.locator('.ai-action-button').count(),6);
    assert.equal(await page.locator('.ai-run-buttons button').count(),4);
    await page.screenshot({path:`${folder}/initial.png`,fullPage:true});
    // Teach a deliberately incomplete model, then find and repair an error.
    await page.locator('.ai-action-button[data-action="go"]').click();await page.locator('#ai-train').click();
    await page.locator('#ai-speed').selectOption('2');await page.locator('#ai-run-c').click();await advance(1200);
    assert.equal(await page.locator('.ai-experience').getAttribute('data-executed-action'),'detour');
    await page.locator('#ai-pause').click();
    const progress=await page.locator('.ai-progress-track').getAttribute('aria-valuenow');
    await advance(1000);assert.equal(await page.locator('.ai-progress-track').getAttribute('aria-valuenow'),progress);
    assert.equal(await page.locator('.ai-experience').getAttribute('data-paused'),'true');
    await page.locator('#ai-stage').screenshot({path:`${folder}/coach-detour.png`});
    await page.locator('#ai-pause').click();await advance(16000);
    assert.equal(await page.locator('.ai-experience').getAttribute('data-running'),'false');
    const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.ai.data);
    let record=await stored();assert.equal(record.testPredictions.length,6);assert.ok(record.testPredictions.some(r=>r.intercepted));
    await page.locator('[data-review="c-0"]').click();
    await page.locator('.ai-action-button[data-action="detour"]').click();
    assert.equal(await page.locator('#ai-run-c').isDisabled(),true);
    await page.locator('#ai-train').click();
    record=await stored();assert.equal(record.modelSamples.find(s=>s.id==='review-c-0').action,'detour');
    console.log('PASS new controls, actual safety interception, pause and review/retrain');
    // Every example is selected through its category and drop-down, then labelled.
    const {EXAMPLES}=await import('../src/games/ai-model.ts');
    for(const example of EXAMPLES) {
      await page.locator(`.ai-road-card[data-category="${example.category}"]`).click();
      assert.equal(await page.locator('#ai-example-select option').count(),3);
      await page.locator('#ai-example-select').selectOption(example.id);
      await page.locator(`.ai-action-button[data-action="${example.expected}"]`).click();
    }
    await page.locator('#ai-train').click();record=await stored();
    assert.equal(record.trainingSamples.length,37);assert.equal(record.modelSamples.length,37);
    assert.equal(new Set(record.modelSamples.map(s=>s.action)).size,6);
    await page.locator('.ai-road-card[data-category="construction"]').click();await advance(100);
    await page.screenshot({path:`${folder}/trained.png`,fullPage:true});
    for(const [district,capture] of [['a','cyclist'],['b','weather'],['c','detour'],['d','emergency']]) {
      await page.locator(`#ai-run-${district}`).click();await advance(1600);
      await page.locator('#ai-stage').screenshot({path:`${folder}/${capture}.png`});
      await advance(14500);
      assert.equal(await page.locator('.ai-experience').getAttribute('data-running'),'false');
    }
    record=await stored();assert.equal(record.testPredictions.length,24);
    assert.deepEqual(new Set(record.completedDistricts),new Set(['a','b','c','d']));
    assert.ok(record.correctPredictions>=20,`expected most taught combinations to generalize, got ${record.correctPredictions}`);
    await page.locator('#ai-snapshot').click();await page.reload();await advance(500);
    record=await stored();assert.equal(record.modelSamples.length,37);assert.equal(record.testPredictions.length,24);
    assert.match(await page.locator('#ai-sample-count').textContent(),/37/);
    console.log('PASS all 36 examples, six actions, four complete districts, records and reload');
    for(const width of [1920,1366,1024,390,320]) {
      await page.setViewportSize({width,height:width<500?844:1000});await advance(150);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
      const ratio=await page.locator('#ai-stage canvas').evaluate(c=>{const r=c.getBoundingClientRect();return r.width/r.height;});
      assert.ok(Math.abs(ratio-1000/520)<.02);
      await page.screenshot({path:`${folder}/layout-${width}.png`,fullPage:true});
    }
    // Legacy saves retain the old choices and points; feature defaults are added.
    const legacyState=await page.evaluate(()=>{
      const state=JSON.parse(localStorage.getItem('city-future-garage-v1'));
      const sample={id:'demo-school-0',category:'school',title:'新芽学校门口',features:{signal:'green',pedestrian:'none',visibility:'clear',road:'school'},expected:'slow',action:'slow',explanation:'校园慢行'};
      state.progress.ai.awards={'demo-school':{points:5,label:'校园示范'},'district-a':{points:20,label:'街区A'}};
      state.progress.ai.data={trainingSamples:[sample],modelSamples:[sample],selectedCard:'demo-school-0',modelRevision:3,completedDistricts:['a'],bestTestScore:12};
      return state;
    });
    await page.addInitScript(state=>localStorage.setItem('city-future-garage-v1',JSON.stringify(state)),legacyState);
    await page.reload();await advance(500);
    assert.match(await page.locator('#ai-sample-count').textContent(),/1/);assert.match(await page.locator('#ai-model-status').textContent(),/3/);
    assert.equal(await page.locator('.ai-action-button[data-action="slow"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-category="emergency"]').click();await page.locator('.ai-action-button[data-action="yield"]').click();
    record=await stored();assert.equal(record.trainingSamples[0].features.hazard,'none');
    const awards=await page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.ai.awards);
    assert.equal(awards['district-a'].points,20);
    await page.emulateMedia({reducedMotion:'reduce'});await advance(100);
    assert.deepEqual(errors,[]);
    console.log('PASS five viewport sizes, reduced motion and legacy save migration; no browser errors');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

