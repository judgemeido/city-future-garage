const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const folder=`output/playwright/ai-driving-${base.startsWith('file:')?'offline':'online'}`;
(async()=>{
  fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(base.startsWith('file:'))await page.context().setOffline(true);
    await page.clock.install();await page.clock.pauseAt(Date.now()+100);const advance=ms=>page.clock.runFor(ms);
    await page.goto(base+'#ai');await advance(500);
    const root=page.locator('.ai-driving'),phase=()=>root.getAttribute('data-phase'),values=()=>root.evaluate(e=>({...e.dataset}));
    const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.ai.data);
    async function until(check,max=120){for(let i=0;i<max;i++){if(check(await values()))return;await advance(100);}throw Error('Timed out waiting for actual driving state: '+JSON.stringify(await values()));}
    async function pace(n){const slider=page.locator('[data-aid-pace]');await slider.focus();await slider.press('Home');for(let i=25;i<n;i++)await slider.press('ArrowRight');}
    async function steer(direction,check){await page.keyboard.down(direction);await until(check);await page.keyboard.up(direction);}
    async function drive(kind,alreadyStarted=false){
      if(!alreadyStarted){await pace(kind==='slow'?45:75);await page.locator('[data-aid-start]').click();}await page.keyboard.down('w');
      if(kind==='yield')await steer('ArrowDown',s=>Number(s.y)>=382);
      if(kind==='detour'){await until(s=>Number(s.x)>335);await steer('ArrowDown',s=>Number(s.y)>=382);await until(s=>Number(s.x)>746);await steer('ArrowUp',s=>Number(s.y)<=310);}
      if(['wait','yield','stop'].includes(kind)){
        await until(s=>Number(s.x)>=403);await page.keyboard.up('w');await page.keyboard.down(' ');await advance(800);await page.keyboard.up(' ');await page.locator('[data-aid-finish]').click();
      }else{await until(s=>s.phase==='recorded');await page.keyboard.up('w');}
      assert.equal(await phase(),'recorded');
    }
    assert.equal(await root.locator('[data-action]').count(),0,'default gameplay has no action answer buttons');
    await page.screenshot({path:`${folder}/initial.png`,fullPage:true});
    await drive('go');await page.locator('[data-aid-teach]').click();assert.equal((await stored()).drivingDemos[0].action,'go');
    await page.locator('[data-aid-test]').click();await advance(6200);assert.equal(await phase(),'passed');
    await page.locator('[data-aid-next]').click();await page.locator('[data-aid-test]').click();await advance(1500);
    await page.locator('[data-aid-pause]').click();const frozen=await values();await advance(1200);assert.equal((await values()).x,frozen.x);assert.equal((await values()).time,frozen.time);await page.locator('[data-aid-pause]').click();await advance(3000);
    assert.equal(await phase(),'intervention');assert.equal((await values()).prediction,'go');assert.ok(Number((await values()).x)<493);await page.screenshot({path:`${folder}/intervention.png`,fullPage:true});
    await page.locator('[data-aid-correct]').click();await drive('wait',true);await page.locator('[data-aid-teach]').click();await page.locator('[data-aid-test]').click();await advance(5500);
    assert.equal(await phase(),'passed');assert.equal((await values()).prediction,'wait');assert.equal((await values()).hasGhost,'true');await page.screenshot({path:`${folder}/corrected-red.png`,fullPage:true});
    const record=await stored();assert.equal(record.drivingTests.filter(t=>t.lesson==='red').at(-1).passed,true);assert.ok(record.modelSamples.some(s=>s.id==='drive-red-correction'&&s.action==='wait'));
    console.log('PASS real driving samples, incomplete ID3 model, danger interception, pause and actual corrective retraining');
    for(const [i,kind] of [[2,'slow'],[3,'detour'],[4,'yield'],[5,'stop']]){
      await page.locator('.aid-details').first().evaluate(e=>e.open=true);
      await page.locator(`[data-aid-lesson="${i}"]`).click();await drive(kind);await page.locator('[data-aid-teach]').click();await page.locator('[data-aid-test]').click();await advance(11000);
      assert.equal(await phase(),'passed',kind+' '+JSON.stringify(await values()));assert.equal((await values()).prediction,kind);
      await page.screenshot({path:`${folder}/passed-${kind}.png`,fullPage:true});
    }
    assert.equal((await stored()).drivingBadges.length,6);console.log('PASS six hands-on lessons, measured speed, obstacle-clearance paths, yielding and closure stops');
    await page.locator('[data-aid-replay]').click();await advance(1000);assert.equal(await phase(),'replay');await page.locator('[data-aid-reset]').click();assert.equal(await phase(),'ready');
    await page.locator('[data-aid-start]').click();await page.keyboard.down('w');await advance(1000);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blur=await values();await advance(500);assert.equal((await values()).x,blur.x);assert.equal((await values()).paused,'true');await page.keyboard.up('w');await page.locator('[data-aid-reset]').click();
    await page.locator('[data-aid-snapshot]').click();await page.reload();await advance(600);assert.equal((await stored()).drivingBadges.length,6);assert.equal((await stored()).drivingDemos.length,6);assert.match(await page.locator('[data-aid-memory]').textContent(),/6 条/);
    await page.locator('[data-ai-mode="lab"]').click();await advance(300);assert.equal(await page.locator('.ai-action-button').count(),6);assert.match(await page.locator('#ai-sample-count').textContent(),/6/);await page.locator('[data-ai-mode="drive"]').click();await advance(300);assert.equal(await page.locator('.ai-driving').count(),1);
    console.log('PASS replay, cancellation, lost-focus pause, snapshot, save restore and shared original laboratory');
    for(const width of [1920,1366,768,390,320]){await page.setViewportSize({width,height:width<500?844:900});await advance(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);const ratio=await page.locator('[data-aid-stage] canvas').evaluate(c=>{const r=c.getBoundingClientRect();return r.width/r.height;});assert.ok(Math.abs(ratio-1000/520)<.02);await page.screenshot({path:`${folder}/layout-${width}.png`,fullPage:true});}
    // Real browser touch contacts exercise captured multitouch and cancellation.
    await page.locator('[data-aid-mobile-main]').click();
    const gas=await page.locator('[data-aid-hold="gas"]').boundingBox(),down=await page.locator('[data-aid-hold="down"]').boundingBox();
    const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:gas.x+gas.width/2,y:gas.y+gas.height/2},{id:2,x:down.x+down.width/2,y:down.y+down.height/2}]});
    await advance(1000);assert.ok(Number((await values()).x)>150);assert.ok(Number((await values()).y)>365);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await advance(3000);assert.ok(Number((await values()).speed)<5);await cdp.detach();
    await page.locator('[data-aid-reset]').click();await page.emulateMedia({reducedMotion:'reduce'});await advance(100);await page.screenshot({path:`${folder}/mobile-controls.png`,fullPage:true});assert.deepEqual(errors,[]);
    console.log('PASS five viewport sizes, touch pedal cancellation, reduced motion and zero browser errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
