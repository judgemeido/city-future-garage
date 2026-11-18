// Run against Vite, or set QA_URL to the built file:/// HTML for offline verification.
// Uses actual DOM controls and advances browser time; never edits simulation state.
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const out=`output/playwright/regen-${base.startsWith('file:')?'offline':'online'}`;
const failures=[],passed=[],errors=[];
async function check(name,run){try{await run();passed.push(name);console.log('PASS',name);}catch(e){failures.push(name);console.error('FAIL',name,e.stack);}}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||'msedge'});
  const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
  if(base.startsWith('file:'))await context.setOffline(true);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.clock.pauseAt(Date.now()+100);
  const advance=ms=>page.clock.runFor(ms);
  const visit=async(id='regen')=>{const target=`${base}#${id}`;if(page.url()===new URL(target).href)await page.reload();else await page.goto(target);await advance(700);if(id==='regen'){await page.locator('[data-regen-mode="lab"]').click();await advance(300);await page.waitForSelector('.regen-stage canvas');}};
  const data=()=>page.locator('#game-host').evaluate(el=>({...el.dataset}));
  const record=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')));
  const click=s=>page.locator(s).click();
  const shot=async name=>{await page.locator('.regen-mission').click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/${name}.png`,fullPage:true});};
  const until=async(test,max=180)=>{for(let i=0;i<max;i++){if(await test(await data()))return;await advance(500);}throw Error(`Timed out: ${JSON.stringify(await data())}`);};
  const finished=()=>until(s=>s.phase==='complete'||s.phase==='failed');
  const replayEnd=async()=>{await page.locator('[data-replay]').focus();await page.keyboard.press('End');await advance(50);};
  await check('legacy awards and data survive without becoming new manual records',async()=>{
    await page.addInitScript(()=>{if(!sessionStorage.getItem('regen-qa-seed')){
      localStorage.setItem('city-future-garage-v1',JSON.stringify({version:1,profile:{nickname:'回能实验员',workstation:'08'},vehicle:{name:'旧赛车',color:'#d99773',body:'sport'},muted:true,progress:{regen:{completed:true,awards:{'experience-normal':{points:20,label:'常温'},'parking-skill':{points:25,label:'旧停车'}},data:{seen:['normal'],best:{normal:1},legacyMarker:'preserve-me',courierAttempts:[{id:'broken',stars:7,frames:[null]}]}},factory:{completed:true,awards:{save:{points:40,label:'作品'}},data:{kept:true}}}}));sessionStorage.setItem('regen-qa-seed','1');}});
    await visit();await shot('initial-desktop');const s=await record();assert.equal(s.progress.regen.data.legacyMarker,'preserve-me');assert.equal(s.progress.factory.awards.save.points,40);assert.equal(s.vehicle.body,'sport');assert.equal(await page.locator('[data-best="0"]').textContent(),'☆☆☆');
  });
  await check('pointer, slider, keyboard, pause and focus cancellation control real motion',async()=>{
    await click('[data-start]');await advance(2400);assert.ok(Number((await data()).speed)>2);
    await click('[data-control="light"]');await advance(700);assert.ok(Number((await data()).recovered)>0);assert.match(await page.locator('[data-flow-title]').textContent(),/车轮带动电机发电/);await shot('regenerating');
    await click('[data-motor]');assert.equal(await page.locator('[data-motor]').getAttribute('aria-expanded'),'true');assert.match(await page.locator('#regen-motor-explanation').textContent(),/不需要反向旋转/);
    await click('[data-pause]');const before=await data();await advance(2000);assert.equal((await data()).time,before.time);assert.equal((await data()).drawn,before.drawn);
    await click('[data-pause]');const slider=page.locator('[data-handle]'),b=await slider.boundingBox();await page.mouse.move(b.x+8,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width-8,b.y+b.height/2,{steps:12});await page.mouse.up();assert.equal((await data()).action,'hard');
    await slider.focus();await page.keyboard.press('Home');assert.equal((await data()).action,'drive');await slider.blur();await page.keyboard.press('Digit2');assert.equal((await data()).action,'coast');await page.keyboard.down('Space');assert.equal((await data()).action,'hard');await page.keyboard.up('Space');assert.equal((await data()).action,'coast');
    await page.locator('.regen-stage').dispatchEvent('pointercancel');assert.equal((await data()).paused,'true');await click('[data-pause]');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await data()).paused,'true');const frozen=(await data()).time;await advance(700);assert.equal((await data()).time,frozen);
  });
  await check('an independent delivery earns stars; actual replay separates heat and recovery',async()=>{
    await click('[data-restart]');await click('[data-start]');
    // Read the same guidance the player sees, and use the four visible action buttons.
    for(let i=0;i<500;i++){
      const s=await data();if(s.phase!=='running')break;
      const hint=await page.locator('[data-status]').textContent();
      const action=/加大制动/.test(hint)?'hard':/可以轻刹|保持制动/.test(hint)?'light':/试试滑行/.test(hint)?'coast':/选择“行驶”|前方还有/.test(hint)?'drive':null;
      if(action&&action!==s.action)await click(`[data-control="${action}"]`);await advance(150);
    }
    assert.equal((await data()).phase,'complete');assert.equal((await data()).assisted,'false');assert.match(await page.locator('[data-result-stars]').textContent(),/★/);assert.equal(await page.locator('[data-results-link]').isVisible(),true);
    assert.equal(await page.locator('[data-replay-lanes]>div').count(),2);await replayEnd();const copy=await page.locator('[data-comparison-copy]').textContent();assert.match(copy,/仅摩擦制动回收 0.0 kJ/);await shot('manual-result-friction');
    await click('[data-finding]');await click('[data-save]');const s=await record();const attempt=s.progress.regen.data.courierAttempts.at(-1);assert.equal(attempt.success,true);assert.equal(attempt.assisted,false);assert.ok(attempt.stars>=1);assert.ok(attempt.recovered>0);assert.match(s.progress.regen.data.courierFinding,/摩擦制动/);assert.ok(s.progress.regen.data.courierManualBest.normal>0);
    const awards=s.progress.regen.awards;await click('[data-save]');assert.deepEqual((await record()).progress.regen.awards,awards);
    await page.locator('[data-replay]').focus();await page.keyboard.press('Home');assert.match(await page.locator('[data-replay-values="0"]').textContent(),/^0.0 s · 回收 0.0/);
    await click('[data-compare-battery]');await replayEnd();assert.equal(await page.locator('[data-replay-lanes]>div').count(),3);await shot('battery-comparison');await click('[data-finding]');
    await page.reload();await advance(700);await click('[data-regen-mode="lab"]');await advance(300);assert.match(await page.locator('[data-best="0"]').textContent(),/★/);await click('.regen-rules summary');assert.match(await page.locator('[data-finding-saved]').textContent(),/满电/);assert.equal((await record()).progress.regen.awards['parking-skill'].points,25);assert.equal((await record()).progress.regen.data.legacyMarker,'preserve-me');
  });
  await check('three route deliveries, cold/full limits and coach exclusions survive actual UI',async()=>{
    for(const [route,mode] of [[0,'cold'],[0,'full'],[1,'normal'],[2,'normal']]){
      await click(`button[data-route="${route}"]`);await page.locator('[data-battery]').selectOption(mode);await click('[data-assist]');
      if(mode==='full'){await until(s=>Number(s.recovered)>100);assert.match(await page.locator('[data-battery-copy]').textContent(),/接近满电/);}
      if(route===1){await until(s=>Number(s.x)>100&&Number(s.recovered)>1000);await shot('downhill');}
      if(route===2){await until(s=>s.phase==='delivery');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const paused=await data();await advance(2500);assert.equal((await data()).phase,'delivery');assert.equal((await data()).time,paused.time);assert.equal((await data()).drawn,paused.drawn);await click('[data-pause]');}
      await finished();assert.equal((await data()).phase,'complete');assert.equal((await data()).assisted,'true');assert.equal(await page.locator('[data-result-stars]').textContent(),'☆☆☆');assert.ok(Math.abs(Number((await data()).energyError))<.01);
      const a=(await record()).progress.regen.data.courierAttempts.at(-1);assert.equal(a.deliveries.length,route===2?3:1);if(route===1)assert.ok(a.recovered>a.drawn);await click('[data-compare-battery]');await replayEnd();if(route===2)await shot('three-station-result');
    }
    const saved=(await record()).progress.regen,awards=saved.awards;assert.ok(awards['experience-cold']&&awards['experience-full']);assert.ok(awards['energy-view-cold']&&awards['energy-view-full']);assert.equal(saved.data.courierManualBest.cold,0);assert.equal(saved.data.courierManualBest.full,0);
  });
  await check('missed station stops, segment retry stays practice, and navigation clears inputs',async()=>{
    await click('button[data-route="0"]');await click('[data-start]');await finished();assert.equal((await data()).phase,'failed');assert.equal(Number((await data()).speed),0);await click('[data-retry]');assert.equal((await data()).phase,'running');await click('[data-assist]');await finished();assert.equal((await record()).progress.regen.data.courierAttempts.at(-1).practice,true);assert.equal(await page.locator('[data-result-stars]').textContent(),'☆☆☆');
    await click('[data-restart]');await click('[data-start]');await advance(500);await visit('home');assert.match((await record()).progress.regen.data.summary,/未完成/);await visit();assert.equal((await data()).phase,'ready');await advance(1000);assert.equal((await data()).time,'0.000');
  });
  await check('report exports actual energy, legacy points and experiment provenance',async()=>{
    await visit('report');assert.equal(await page.locator('.report-card').count(),8);const card=page.locator('.report-card').filter({hasText:'回能快递员'});assert.match(await card.textContent(),/净耗电|净消耗/);assert.match(await card.textContent(),/发现来自哪次实验/);assert.ok(await card.locator('img').count());const pending=page.waitForEvent('download');await click('[data-action="download-report"]');await(await pending).saveAs(`${out}/report.html`);assert.match(fs.readFileSync(`${out}/report.html`,'utf8'),/回能快递员/);
  });
  await check('desktop and narrow layouts preserve canvas ratio and usable controls',async()=>{
    for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,720]]){
      await page.setViewportSize({width,height});await visit();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);
      const ratio=await page.locator('.regen-stage canvas').evaluate(c=>{const b=c.getBoundingClientRect();return b.width/b.height/(1000/410);});assert.ok(Math.abs(ratio-1)<.01);
      const controls=await page.locator('.regen-handle').boundingBox();if(width>=1366)assert.ok(controls.y+controls.height<height,`controls below viewport ${width}: ${JSON.stringify(controls)}`);
      if(width<=390){const routes=await page.locator('.regen-routes').boundingBox(),battery=await page.locator('.regen-battery-label').boundingBox();assert.ok(battery.y>=routes.y+routes.height,`task selector squeezed at ${width}`);}
      await shot(`layout-${width}`);await click('[data-start]');if(width<=390){const active=await page.locator('.regen-handle').boundingBox();assert.ok(active.y>=0&&active.y+active.height<height,`phone braking controls hidden after starting ${width}`);}await advance(700);await click('[data-control="light"]');assert.equal((await data()).action,'light');await advance(350);await shot(`braking-${width}`);
    }
  });
  await check('reduced motion keeps physics and science; page visibility freezes time',async()=>{
    await page.setViewportSize({width:1366,height:768});await visit();await click('[data-action="motion"]');assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('reduce-motion')),true);await click('[data-assist]');await advance(1000);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});const stopped=await data();await advance(1000);assert.equal((await data()).time,stopped.time);assert.equal((await data()).paused,'true');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await click('[data-pause]');await finished();assert.equal((await data()).phase,'complete');assert.ok(Number((await data()).recovered)>0);assert.equal(await page.locator('[data-replay-play]').textContent(),'播放重放');
  });
  await check('touch input can start, brake and pause at phone width',async()=>{
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});if(base.startsWith('file:'))await mobile.setOffline(true);
    const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.clock.pauseAt(Date.now()+100);await p.goto(`${base}#regen`);await p.clock.runFor(700);await p.locator('[data-regen-mode="lab"]').tap();await p.clock.runFor(300);
    await p.locator('[data-start]').tap();await p.clock.runFor(2000);await p.locator('[data-control="light"]').tap();await p.clock.runFor(500);assert.equal(await p.locator('#game-host').getAttribute('data-action'),'light');assert.ok(Number(await p.locator('#game-host').getAttribute('data-recovered'))>0);
    await p.locator('[data-pause]').tap();assert.equal(await p.locator('#game-host').getAttribute('data-paused'),'true');await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:`${out}/touch-phone.png`,fullPage:true});await mobile.close();
  });
  await check('no browser runtime errors',async()=>assert.deepEqual(errors,[]));
  await browser.close();fs.writeFileSync(`${out}/qa.json`,JSON.stringify({base,date:new Date().toISOString(),passed,failures,errors},null,2));if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
