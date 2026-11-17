// Parking v2: real UI actions, verified level inputs, science, retry, persistence and screenshots.
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5175/';
(async()=>{
  const {PARKING_LEVELS}=await import('../src/games/parking-levels.ts');
  const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||'msedge'});
  const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
  if(base.startsWith('file:'))await context.setOffline(true);
  const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync('output/playwright',{recursive:true});
  const data=()=>page.locator('#game-host').evaluate(el=>({...el.dataset}));
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')));
  const fill=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab');};
  const add=async c=>{await page.locator(`[data-add="${c.gear}"]`).click();await fill('[data-length-number]',(c.distance/20).toFixed(4));await fill('[data-steer-number]',(c.steer*180/Math.PI).toFixed(4));};
  const done=async()=>{try{await page.waitForFunction(()=>document.querySelector('#game-host').dataset.phase==='result',null,{timeout:25000});}catch(e){console.log('TIMEOUT STATE',await data(),errors);await page.screenshot({path:'output/playwright/parking-v2-timeout.png',fullPage:true});throw e;}};
  const shot=async n=>{await page.locator('body').click({position:{x:8,y:8}});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/parking-v2-${n}.png`,fullPage:true});};
  const point=async(x,y)=>{const b=await page.locator('.lab-stage canvas').boundingBox();return{x:b.x+x*b.width/1000,y:b.y+y*b.height/560};};
  const drag=async(x,y,tx,ty,cancel=false)=>{const a=await point(x,y),b=await point(tx,ty);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});if(cancel)await page.locator('.lab-stage canvas').dispatchEvent('pointercancel');await page.mouse.up();};
  const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name);};
  try {
    await page.addInitScript(()=>{if(!sessionStorage.getItem('parking-v2-qa')){localStorage.setItem('city-future-garage-v1',JSON.stringify({version:1,profile:{nickname:'科普测试员',workstation:'09'},vehicle:{name:'测试车',color:'#77d7b4',body:'city'},progress:{parking:{completed:true,awards:{'core-action':{points:10,label:'亲手操作'}},data:{best:{0:3},attempts:[{scene:0,stars:3}]}}}}));sessionStorage.setItem('parking-v2-qa','1');}});
    await page.goto(base+'#parking');await page.waitForSelector('.lab-stage canvas');await page.waitForFunction(()=>document.querySelector('#game-host').dataset.photoState==='ready');
    await check('empty start and legacy score separation',async()=>{assert.equal((await data()).segmentCount,'0');assert.equal(await page.locator('[data-execute]').isDisabled(),true);assert.equal(await page.locator('[data-best="0"]').textContent(),'☆☆☆');await shot('start');});
    await check('drag, pointer cancel, keyboard and numeric planning work',async()=>{
      await page.locator('[data-add="1"]').click();const original=(await data()).commandPlan;
      await drag(340,190,430,218,true);assert.equal((await data()).commandPlan,original);
      await drag(340,190,420,210);assert.notEqual((await data()).commandPlan,original);
      await page.locator('[data-point="bend"]').focus();await page.keyboard.press('ArrowUp');assert.ok(JSON.parse((await data()).commandPlan)[0].steer!==0);
      await fill('[data-length-number]',5);await fill('[data-steer-number]',0);assert.equal(JSON.parse((await data()).commandPlan)[0].distance,100);
    });
    await check('echo comparison, geometry observation and control experiment preserve evidence',async()=>{
      const slider=page.locator('[data-observation]');await slider.focus();await page.keyboard.press('Home');await page.locator('[data-measure="rear"]').click();
      await slider.focus();await page.keyboard.press('ArrowRight');for(let i=0;i<30;i++)await page.keyboard.press('ArrowRight');await page.locator('[data-measure="rear"]').click();
      assert.equal(await page.locator('[data-evidence]').isDisabled(),false);await page.locator('[data-evidence]').click();assert.equal((await state()).progress.parking.data.parkingV2.evidence[0].kind,'echo');
      await page.locator('[data-science="1"]').click();await page.locator('[data-footprint]').check();await page.locator('[data-mark-space]').click();await page.locator('[data-evidence]').click();
      await page.locator('[data-science="2"]').click();await page.locator('[data-compare-control]').click();assert.match(await page.locator('[data-discovery]').textContent(),/方向相反/);await page.locator('[data-evidence]').click();
      assert.equal((await state()).progress.parking.data.parkingV2.evidence.length,3);await shot('science');
    });
    await check('six layouts can be completed through the visible editor',async()=>{
      for(const l of PARKING_LEVELS){await page.locator(`[data-scene="${l.theme}"]`).click();await page.locator(`[data-mode="${l.challenge?'tight':'standard'}"]`).click();for(const c of l.reference)await add(c);
        if(l.id==='garage-standard'){await shot('plan');await page.locator('[data-execute]').click();await page.waitForTimeout(650);await page.locator('[data-execute]').click();const paused=(await data()).distance;await page.waitForTimeout(200);assert.equal((await data()).distance,paused);await page.locator('[data-execute]').click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await data()).phase,'paused');await page.locator('[data-execute]').click();}
        else await page.locator('[data-execute]').click();await done();assert.equal((await data()).stars,'3',l.id);assert.equal((await data()).collisions,'0',l.id);assert.match(await page.locator('[data-result]').textContent(),/完整入位/);console.log('  solved',l.id);if(!l.challenge)await shot(l.id);
      }
    });
    await check('partial parking can be corrected without resetting distance or earning three stars',async()=>{
      const l=PARKING_LEVELS[0];await page.locator('[data-scene="0"]').click();await page.locator('[data-mode="standard"]').click();for(const c of l.reference.slice(0,2))await add(c);await page.locator('[data-execute]').click();await done();const before=Number((await data()).distance);assert.equal((await data()).stars,'0');await page.locator('[data-correct]').click();await add(l.reference[2]);await page.locator('[data-execute]').click();await done();assert.equal((await data()).stars,'2');assert.ok(Number((await data()).distance)>before+89);assert.equal((await state()).progress.parking.data.parkingV2.best[l.id],3);await shot('correction');
    });
    await check('collision identifies the actual contact and keeps a retryable plan',async()=>{
      await page.locator('[data-reset]').click();await add({gear:1,distance:600,steer:0});await add({gear:1,distance:200,steer:0});await page.locator('[data-execute]').click();await done();assert.equal((await data()).collisions,'1');assert.equal((await data()).stars,'0');assert.equal(await page.locator('[data-correct]').isDisabled(),true);await shot('collision');const plan=(await data()).commandPlan;await page.locator('[data-retry]').click();assert.equal((await data()).commandPlan,plan);assert.equal((await data()).distance,'0.00');
    });
    await check('demonstration never inherits autonomous stars; modal pauses; saves are idempotent',async()=>{
      await page.locator('.parking-extras>details').nth(1).locator(':scope > summary').click();await page.locator('[data-demo]').click();await page.locator('[data-execute]').click();await page.locator('.parking-extras>details').first().locator(':scope > summary').click();await page.locator('[data-photo-zoom]').click();assert.equal((await data()).phase,'paused');await page.keyboard.press('Escape');await page.locator('[data-execute]').click();await done();assert.equal((await data()).stars,'0');assert.equal((await data()).assisted,'true');await page.locator('[data-save]').click();const awards=(await state()).progress.parking.awards;await page.locator('[data-save]').click();assert.deepEqual((await state()).progress.parking.awards,awards);assert.equal((await state()).progress.parking.data.best[0],3);assert.ok((await state()).progress.parking.data.parkingV2.attempts.length<=6);
    });
    await check('unfinished saves describe the current draft, not a previous win',async()=>{await page.locator('[data-reset]').click();await page.locator('[data-add="-1"]').click();await page.locator('[data-save]').click();assert.match((await state()).progress.parking.data.summary,/进行中/);assert.equal((await data()).assisted,'false');});
    await check('320–1920px layouts, touch-sized alternatives, navigation and reduced motion',async()=>{
      for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,720]]){await page.setViewportSize({width,height});await page.goto(base+'#parking');await page.reload();await page.waitForSelector('.lab-stage canvas');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} overflow`);await page.locator('[data-add="1"]').click();await fill('[data-length-number]',4);await fill('[data-steer-number]',12);assert.equal(JSON.parse((await data()).commandPlan)[0].distance,80);await page.locator('[data-science="2"]').click();await page.locator('[data-compare-control]').click();await shot(String(width));}
      await page.setViewportSize({width:1366,height:900});await page.locator('[data-action="motion"]').click();await page.locator('[data-execute]').click();await page.goto(base+'#grip');await page.waitForSelector('[data-hold]');await page.goto(base+'#parking');await page.waitForSelector('[data-execute]');assert.equal((await data()).phase,'planning');
      await page.goto(base+'#report');assert.match(await page.locator('.report-card').filter({hasText:'泊车领航员'}).textContent(),/实物观察与来源/);const download=page.waitForEvent('download');await page.locator('[data-action="download-report"]').click();await (await download).saveAs('output/playwright/parking-v2-report.html');
    });
    assert.deepEqual(errors,[]);fs.writeFileSync('output/playwright/parking-v2-qa.json',JSON.stringify({base,results,errors},null,2));console.log('PASS no runtime errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
