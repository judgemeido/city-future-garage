// All driving uses real keyboard/pointer controls. Dataset reads are diagnostics only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/',out=`output/playwright/regen-rally-${base.startsWith('file:')?'offline':'online'}`;
const checks=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});if(base.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.clock.pauseAt(Date.now()+100);
 const advance=ms=>page.clock.runFor(ms),data=()=>page.locator('#game-host').evaluate(el=>({...el.dataset}));
 const visit=async()=>{await page.goto(`${base}#regen`);await advance(500);await page.waitForSelector('.rally-stage canvas');};
 const click=s=>page.locator(s).click();
 const shot=async name=>{await page.screenshot({path:`${out}/${name}.png`,scale:'css'});};
 async function check(name,run){try{await run();checks.push({name,passed:true});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.message);}}
 await page.addInitScript(()=>{if(!sessionStorage.getItem('rally-seed')){localStorage.setItem('city-future-garage-v1',JSON.stringify({version:1,profile:{nickname:'快递试玩员',workstation:'09'},vehicle:{name:'我的快递车',color:'#75d1a0',body:'city'},progress:{regen:{completed:true,awards:{legacy:{points:30,label:'旧积分'}},data:{legacyMarker:'retained',courierStars:{'0-normal':3}}}}}));sessionStorage.setItem('rally-seed','1');}});
 await visit();
 await check('first screen exposes playfield, start and all main controls',async()=>{await shot('desktop-intro');assert.equal((await data()).mode,'rally');assert.ok(await page.locator('[data-rally-start]').isVisible());const b=await page.locator('.rally-controls').boundingBox();assert.ok(b.y+b.height<=768,`controls end at ${b.y+b.height}`);});
 await check('keyboard steering, regeneration, boost and pause use real motion',async()=>{
  await click('[data-rally-start]');await advance(3500);const initial=await data();assert.ok(+initial.speed>4);await page.keyboard.press('ArrowLeft');await advance(400);assert.equal((await data()).targetLane,'0');await page.keyboard.press('ArrowRight');await advance(400);assert.equal((await data()).targetLane,'1');
  await page.keyboard.down('Space');await advance(1400);const regen=await data();assert.ok(+regen.recovered>1000);assert.ok(+regen.speed<+initial.speed);await shot('desktop-regenerating');await page.keyboard.up('Space');await page.keyboard.down('Shift');await advance(500);assert.ok(+(await data()).boostSpent>1000);await shot('desktop-boost');await page.keyboard.up('Shift');
  await page.keyboard.press('KeyP');const before=await data();await advance(1500);assert.equal((await data()).time,before.time);assert.equal((await data()).drawn,before.drawn);await click('[data-rally-resume]');await advance(100);assert.equal((await data()).paused,'false');
 });
 await check('held mouse controls release off-button, urgent brake and blur cancel correctly',async()=>{
  const b=await page.locator('[data-rally-hold="regen"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await advance(200);assert.equal((await data()).action,'regen');await page.mouse.move(b.x+b.width+30,b.y-30);await page.mouse.up();await advance(100);assert.equal((await data()).action,'drive');
  await page.keyboard.down('KeyB');await advance(200);assert.equal((await data()).action,'brake');await page.keyboard.up('KeyB');await advance(100);assert.equal((await data()).action,'drive');
  await page.keyboard.down('Space');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await advance(100);assert.equal((await data()).paused,'true');await page.keyboard.up('Space');await click('[data-rally-resume]');await advance(100);assert.equal((await data()).action,'drive');
 });
 async function driveCourse(index){
  await click(`[data-rally-course="${index}"]`);await click('[data-rally-start]');let braking=false,boost=false,seenDeliveries=0;
  for(let i=0;i<700;i++){
   const s=await data();if(s.phase!=='running')break;
   const objective=await page.locator('[data-rally-objective]').textContent(),gate=/· (左|中间|右)车道 · (\d+) m/.exec(objective),desired=gate?['左','中间','右'].indexOf(gate[1]):1,d=gate?+gate[2]:999;
   if(+s.targetLane<desired)await page.keyboard.press('ArrowRight');else if(+s.targetLane>desired)await page.keyboard.press('ArrowLeft');
   const stopping=(+s.speed*+s.speed-64)/(2*(index===1?1.6:2.1));const brake=!!gate&&d<Math.max(30,stopping+16)&&+s.speed>8;
   if(brake!==braking){await page.keyboard[brake?'down':'up']('Space');braking=brake;}
   const wantBoost=!brake&&d>125&&+s.reserve>2000&&+s.deliveries>0;
   if(wantBoost!==boost){await page.keyboard[wantBoost?'down':'up']('Shift');boost=wantBoost;}
   if(+s.deliveries>seenDeliveries){seenDeliveries=+s.deliveries;await shot(`course-${index}-delivery-${seenDeliveries}`);}
   await advance(250);
  }
  await page.keyboard.up('Space');await page.keyboard.up('Shift');await advance(100);const result=await data();assert.equal(result.phase,'complete',JSON.stringify(result));assert.equal(+result.deliveries,index===2?5:4);assert.equal(result.hits,'0');assert.ok(Math.abs(+result.energyError)<.01);assert.ok(await page.locator('[data-rally-result]').isVisible());assert.equal(await page.locator('[data-rally-stars]').textContent(),'★★★');
  assert.ok(await page.locator('[data-rally-ended]').isVisible());await shot(`course-${index}-finish`);await click('[data-rally-show-result]');await advance(700);await page.locator('[data-rally-result]').scrollIntoViewIfNeeded();await shot(`course-${index}-result`);
 }
 for(let i=0;i<3;i++)await check(`course ${i+1} can be completed with all deliveries and three stars`,()=>driveCourse(i));
 await check('replay, next course, saved work and old records coexist',async()=>{
  await click('[data-rally-result-save]');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')));assert.equal(saved.progress.regen.data.legacyMarker,'retained');assert.equal(saved.progress.regen.awards.legacy.points,30);assert.equal(saved.progress.regen.data.courierStars['0-normal'],3);assert.equal(saved.progress.regen.data.rallyLast.phase,'complete');assert.ok(saved.progress.regen.image.startsWith('data:image/'));
  await click('[data-rally-next]');assert.equal((await data()).course,'0');assert.equal((await data()).phase,'ready');await click('[data-rally-start]');await advance(100);await click('[data-rally-restart]');assert.equal((await data()).phase,'running');await click('[data-regen-mode="lab"]');await advance(300);assert.ok(await page.locator('.regen-stage canvas').isVisible());await click('[data-regen-mode="rally"]');await advance(300);assert.equal((await data()).mode,'rally');
 });
 await check('low-temperature and full-battery selection resets the round without awarding progress',async()=>{for(const value of ['cold','full','normal']){await page.locator('[data-rally-battery]').selectOption(value);assert.equal((await data()).battery,value);assert.equal((await data()).phase,'ready');assert.equal((await data()).recovered,'0.0000');}await click('h1');});
 await check('energy book shows actual ledger and remains optional',async()=>{assert.equal(await page.locator('.rally-science').getAttribute('open'),null);await page.locator('.rally-science summary').click();assert.ok(await page.locator('[data-rally-ledger]').isVisible());await page.locator('.rally-science summary').click();});
 await check('mobile and desktop resizing preserves the round and avoids horizontal overflow',async()=>{
  for(const width of [320,390,768,1366,1920]){await page.setViewportSize({width,height:width<600?844:900});await advance(300);await page.evaluate(()=>window.scrollTo(0,0));const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`overflow at ${width}`);assert.ok(await page.locator('.rally-stage canvas').isVisible());await shot(`viewport-${width}`);}
  await page.setViewportSize({width:390,height:844});await click('[data-rally-start]');await advance(2400);await page.locator('[data-rally-hold="regen"]').scrollIntoViewIfNeeded();const b=await page.locator('[data-rally-hold="regen"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await advance(650);await page.mouse.up();assert.ok(+(await data()).recovered>1000);await page.locator('.rally-stage').dispatchEvent('pointercancel');await advance(100);assert.equal((await data()).paused,'true');await shot('mobile-paused');
 });
 await check('genuine touchscreen can steer, hold regen and release without sticking',async()=>{
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});if(base.startsWith('file:'))await mobile.setOffline(true);const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.clock.pauseAt(Date.now()+100);await p.goto(`${base}#regen`);await p.clock.runFor(500);await p.locator('[data-rally-start]').tap();await p.clock.runFor(2400);await p.locator('[data-rally-left]').tap();await p.clock.runFor(400);assert.equal(await p.locator('#game-host').getAttribute('data-target-lane'),'0');await p.locator('[data-rally-right]').tap();
  const b=await p.locator('[data-rally-hold="regen"]').boundingBox(),session=await mobile.newCDPSession(p);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await p.clock.runFor(800);assert.equal(await p.locator('#game-host').getAttribute('data-action'),'regen');assert.ok(+(await p.locator('#game-host').getAttribute('data-recovered'))>1000);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.clock.runFor(100);assert.equal(await p.locator('#game-host').getAttribute('data-action'),'drive');await p.screenshot({path:`${out}/touchscreen.png`,scale:'css'});await mobile.close();
 });
 await check('missing a delivery, hitting a barrier and timing out remain recoverable',async()=>{
  await page.setViewportSize({width:1366,height:768});await click('[data-rally-course="0"]');await click('[data-rally-start]');await click('h1');const barrier=+(await data()).nextBarrierLane;await page.keyboard.press(barrier===0?'ArrowLeft':'ArrowRight');await advance(13000);const s=await data();assert.ok(+s.hits>0);assert.equal(+s.deliveries,0);await page.keyboard.down('KeyB');await advance(90000);await page.keyboard.up('KeyB');assert.equal((await data()).phase,'failed');assert.ok(await page.locator('[data-rally-ended]').isVisible());await click('[data-rally-show-result]');await advance(700);await click('[data-rally-again]');assert.equal((await data()).phase,'running');assert.equal((await data()).hits,'0');
 });
 assert.deepEqual(errors,[]);await browser.close();fs.writeFileSync(`${out}/audit.json`,JSON.stringify({checks,errors},null,2));console.log(`${checks.filter(c=>c.passed).length}/${checks.length} checks passed`);if(checks.some(c=>!c.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
