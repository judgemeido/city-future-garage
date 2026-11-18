// Gameplay uses actual keyboard, mouse and touchscreen inputs; datasets are read-only diagnostics.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/',out=`output/playwright/grip-race-${base.startsWith('file:')?'offline':'online'}`;
const checks=[],errors=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
 const context=await browser.newContext({viewport:{width:1366,height:768}});if(base.startsWith('file:'))await context.setOffline(true);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.clock.pauseAt(new Date('2026-11-17T10:00:00Z'));
 await page.addInitScript(()=>{if(!sessionStorage.getItem('rain-seed')){localStorage.setItem('city-future-garage-v1',JSON.stringify({version:1,profile:{nickname:'护航试玩员',workstation:'08'},vehicle:{name:'我的护航车',color:'#75d1a0',body:'city'},progress:{grip:{completed:true,awards:{legacy:{points:30,label:'旧积分'}},data:{legacyMarker:'retained',trajectory:[{time:1}],rainBest:{0:{stars:2,score:100}}}}},muted:true}));sessionStorage.setItem('rain-seed','1');}});
 const advance=ms=>page.clock.runFor(ms),data=()=>page.locator('#game-host').evaluate(e=>({...e.dataset})),click=s=>page.locator(s).click();
 const shot=async name=>page.screenshot({path:`${out}/${name}.png`,scale:'css'});
 async function check(name,run){try{await run();checks.push({name,passed:true});console.log('PASS',name);}catch(e){checks.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.message);}}
 await page.goto(`${base}#grip`);await advance(500);await click('[data-grip-mode="race"]');await advance(200);await page.waitForSelector('.rain-stage canvas');
 await check('intro and primary controls fit desktop window',async()=>{assert.equal((await data()).mode,'rain-race');assert.ok(await page.locator('[data-rain-start]').isVisible());const b=await page.locator('.rain-controls').boundingBox();assert.ok(b.y+b.height<=768,`controls end ${b.y+b.height}`);await shot('desktop-intro');});
 await check('steering, braking, straight acceleration and pause are real controls',async()=>{
  await click('[data-rain-start]');await advance(3000);const before=await data();assert.ok(+before.speed>5);await page.keyboard.down('ArrowLeft');await advance(500);await page.keyboard.up('ArrowLeft');assert.ok(+(await data()).targetOffset<-1);await page.keyboard.press('KeyC');await advance(300);assert.equal((await data()).targetOffset,'0.0000');
  await page.keyboard.down('Space');await advance(800);const brake=await data();assert.ok(+brake.speed<+before.speed);await page.keyboard.up('Space');await page.keyboard.down('KeyW');await advance(600);assert.ok(+(await data()).speed>+brake.speed);await page.keyboard.up('KeyW');await shot('desktop-active');
  await page.keyboard.press('KeyP');const paused=await data();await advance(1300);assert.equal((await data()).time,paused.time);assert.equal((await data()).progress,paused.progress);await click('[data-rain-resume]');assert.equal((await data()).paused,'false');
 });
 await check('mouse hold releases off-button, blur and touch cancel freeze the round',async()=>{
  const b=await page.locator('[data-rain-hold="brake"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await advance(200);assert.equal((await data()).braking,'true');await page.mouse.move(b.x+b.width+20,b.y-20);await page.mouse.up();await advance(100);assert.equal((await data()).braking,'false');
  await page.keyboard.down('Space');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('Space');assert.equal((await data()).paused,'true');await click('[data-rain-resume]');assert.equal((await data()).braking,'false');await page.locator('.rain-stage').dispatchEvent('pointercancel');assert.equal((await data()).paused,'true');await click('[data-rain-resume]');
 });
 async function setWheel(target){const b=await page.locator('[data-rain-wheel]').boundingBox();await page.mouse.click(b.x+8+(target/6.2+.5)*(b.width-16),b.y+b.height/2);await page.locator('[data-rain-wheel]').evaluate(e=>e.blur());}
 async function driveCourse(index){
  await click(`[data-rain-course="${index}"]`);await click('[data-rain-start]');let braking=false,lastTarget=99,photographed=false;
  for(let i=0;i<650;i++){
   const s=await data();if(s.phase!=='running')break;
   let desired=+s.nextStarDistance>=0&&+s.nextStarDistance<28?+s.nextStarOffset:0;
   if(+s.nextPuddleDistance>=-8&&+s.nextPuddleDistance<12&&Math.abs(+s.nextPuddleOffset-desired)<1.6)desired=+s.nextPuddleOffset>0?-2.4:2.4;
   if(desired!==lastTarget){await setWheel(desired);lastTarget=desired;}
   const brake=+s.speed>Math.min(6,+s.advice-.65);if(brake!==braking){await page.keyboard[brake?'down':'up']('Space');braking=brake;}
   if(!photographed&&+s.progress>125){await page.locator('.rain-stage').scrollIntoViewIfNeeded();await shot(`course-${index}-corner`);photographed=true;}
   await advance(200);
  }
  await page.keyboard.up('Space');await advance(200);const s=await data();assert.equal(s.phase,'complete',JSON.stringify(s));assert.equal(s.rescues,'0');assert.ok(+s.outsideTime<1.2,JSON.stringify(s));assert.ok(+s.collected>=Math.ceil([7,9,12][index]*.6));assert.ok(+s.perfect>=2);assert.equal(await page.locator('[data-rain-result-stars]').textContent(),'★★★');
  await page.locator('.rain-stage').scrollIntoViewIfNeeded();await shot(`course-${index}-finish`);await click('[data-rain-show-result]');await advance(800);await page.locator('[data-rain-result]').scrollIntoViewIfNeeded();await shot(`course-${index}-result`);
 }
 for(let i=0;i<3;i++)await check(`route ${i+1} reaches three stars without rescue`,()=>driveCourse(i));
 await check('save preserves legacy work; retry and next route reset only current attempt',async()=>{
  await click('[data-rain-result-save]');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')));assert.equal(saved.progress.grip.data.legacyMarker,'retained');assert.equal(saved.progress.grip.awards.legacy.points,30);assert.equal(saved.progress.grip.data.trajectory.length,1);assert.equal(saved.progress.grip.data.rainLast.phase,'complete');assert.ok(saved.progress.grip.image.startsWith('data:image/'));
  for(const c of [0,1,2])assert.equal(saved.progress.grip.data.rainBest[c].stars,3);await click('[data-rain-next]');assert.equal((await data()).course,'0');assert.equal((await data()).phase,'ready');await click('[data-rain-start]');await advance(800);await click('[data-rain-restart]');assert.equal((await data()).phase,'running');assert.ok(+(await data()).progress<1);
  await click('[data-grip-mode="lab"]');await advance(300);assert.ok(await page.locator('.lab-stage canvas').isVisible());await click('[data-grip-mode="race"]');await advance(300);assert.equal((await data()).mode,'rain-race');assert.equal(await page.locator('[data-rain-best="2"]').textContent(),'★★★');
 });
 await check('tire choice and optional evidence panel work',async()=>{let normalMu=0;for(const value of ['rain','standard','worn']){await page.locator('[data-rain-tire]').selectOption(value);assert.equal((await data()).phase,'ready');assert.equal((await data()).tire,value);await click('[data-rain-start]');await advance(300);if(value==='rain')normalMu=+(await data()).mu;else assert.ok(+(await data()).mu<normalMu);}assert.equal(await page.locator('.rally-science').getAttribute('open'),null);await page.locator('.rally-science summary').click();assert.ok(await page.locator('[data-rain-ledger]').isVisible());await page.locator('.rally-science summary').click();await page.locator('[data-rain-tire]').selectOption('rain');});
 await check('coach rescue has a recorded cost and fast wet corner can fail and retry',async()=>{
  await click('[data-rain-course="2"]');await click('[data-rain-start]');await click('h1');await page.keyboard.down('KeyW');await advance(9000);await page.keyboard.up('KeyW');let s=await data();assert.ok(+s.slipTime>0||s.phase==='failed');await page.locator('.rain-stage').scrollIntoViewIfNeeded();await shot('desktop-sliding');
  if(s.phase==='failed'){await click('[data-rain-restart]');await advance(4000);}s=await data();const progress=+s.progress,score=+await page.locator('[data-rain-score]').textContent();await click('[data-rain-rescue]');s=await data();assert.equal(s.rescues,'1');assert.equal(+s.progress,progress);assert.equal(+s.offset,0);assert.equal(+await page.locator('[data-rain-score]').textContent(),Math.max(0,score-100));await click('h1');await page.keyboard.down('KeyW');await advance(18000);await page.keyboard.up('KeyW');assert.equal((await data()).phase,'failed');await click('[data-rain-restart]');assert.equal((await data()).phase,'running');assert.equal((await data()).rescues,'0');
 });
 await check('resize preserves progress and screens avoid overflow',async()=>{
  await advance(1000);await click('[data-rain-pause]');const progress=(await data()).progress;for(const width of [320,390,768,1366,1920]){await page.setViewportSize({width,height:width<600?844:900});await advance(300);await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${width}`);assert.equal((await data()).progress,progress);const ratio=await page.locator('.rain-stage canvas').evaluate(c=>{const b=c.getBoundingClientRect();return b.width/b.height/(Number(c.dataset.logicalWidth)/Number(c.dataset.logicalHeight));});assert.ok(Math.abs(ratio-1)<.025);await shot(`viewport-${width}`);}await page.setViewportSize({width:390,height:844});await click('[data-rain-restart]');await advance(1800);await page.locator('.rain-stage').scrollIntoViewIfNeeded();await shot('mobile-active');
 });
 await check('genuine touchscreen steers and holds brake without sticking',async()=>{
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});if(base.startsWith('file:'))await mobile.setOffline(true);const p=await mobile.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.clock.pauseAt(new Date('2026-11-17T10:00:00Z'));await p.goto(`${base}#grip`);await p.clock.runFor(500);await p.locator('[data-grip-mode="race"]').tap();await p.clock.runFor(200);await p.locator('[data-rain-start]').tap();await p.clock.runFor(2000);
  const session=await mobile.newCDPSession(p);async function hold(selector,ms){await p.locator(selector).scrollIntoViewIfNeeded();const b=await p.locator(selector).boundingBox();await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await p.clock.runFor(ms);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.clock.runFor(100);}
  await hold('[data-rain-hold="left"]',500);assert.ok(+(await p.locator('#game-host').getAttribute('data-target-offset'))<-1);await p.locator('[data-rain-center]').tap();const speed=+(await p.locator('#game-host').getAttribute('data-speed'));await hold('[data-rain-hold="brake"]',800);assert.ok(+(await p.locator('#game-host').getAttribute('data-speed'))<speed);assert.equal(await p.locator('#game-host').getAttribute('data-braking'),'false');await p.screenshot({path:`${out}/touchscreen.png`,scale:'css'});await mobile.close();
 });
 await check('stopped timeout, retry and reduced motion remain usable',async()=>{await page.setViewportSize({width:1366,height:768});await click('[data-rain-course="0"]');await click('[data-rain-start]');await click('h1');await page.keyboard.down('Space');await advance(101000);await page.keyboard.up('Space');assert.equal((await data()).phase,'failed');await click('[data-rain-restart]');assert.equal((await data()).phase,'running');await page.emulateMedia({reducedMotion:'reduce'});await advance(1400);assert.ok(+(await data()).progress>1);await page.emulateMedia({reducedMotion:'no-preference'});});
 await check('no runtime errors',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();fs.writeFileSync(`${out}/audit.json`,JSON.stringify({checks,errors},null,2));}
 console.log(`${checks.filter(c=>c.passed).length}/${checks.length} checks passed`);if(checks.some(c=>!c.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
