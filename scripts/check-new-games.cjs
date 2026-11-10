// Real pointer/keyboard journeys for the four new games. Reuse the repository's Playwright QA convention.
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const ids=['parking','repair','charging','grip'];
const failures=[];
async function check(name,run){try{await run();console.log('PASS',name);}catch(error){failures.push(name);console.error('FAIL',name,error.stack);}}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||'msedge'});
  const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
  if(base.startsWith('file:'))await context.setOffline(true);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync('output/playwright',{recursive:true});
  const visit=async id=>{const target=new URL(base+'#'+id).href;if(page.url()===target)await page.reload();else await page.goto(target);if(ids.includes(id))await page.waitForSelector('.lab-stage canvas[data-logical-width]');await page.waitForTimeout(120);};
  const data=()=>page.locator('#game-host').evaluate(el=>({...el.dataset}));
  const record=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')));
  const point=async(x,y)=>{const b=await page.locator('.lab-stage canvas').boundingBox();return{x:b.x+x*b.width/1000,y:b.y+y*b.height/500};};
  const move=async(x,y)=>{const p=await point(x,y);await page.mouse.move(p.x,p.y);};
  const click=async(x,y)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(x,y,tx,ty)=>{await move(x,y);await page.mouse.down();const p=await point(tx,ty);await page.mouse.move(p.x,p.y,{steps:18});await page.mouse.up();};
  const finished=async()=>page.waitForFunction(()=>document.querySelector('#game-host').dataset.finished==='true',{},{timeout:22000});
  const shot=async name=>page.screenshot({path:`output/playwright/${name}.png`,fullPage:true});
  await check('old save upgrades to eight games without losing nickname, vehicle or points',async()=>{
    await page.addInitScript(seed=>{if(!sessionStorage.getItem('qa-seeded')){localStorage.setItem('city-future-garage-v1',JSON.stringify(seed));sessionStorage.setItem('qa-seeded','1');}}, {version:1,profile:{nickname:'旧存档工程师',workstation:'09'},vehicle:{name:'旧赛车',color:'#d99773',body:'sport'},progress:{factory:{awards:{save:{points:40,label:'作品'}},completed:true,data:{best:{city:3}}}},muted:true});
    await visit('home');
assert.equal(await page.locator('[data-game-card]').count(),8);assert.match(await page.locator('.score-pill').first().textContent(),/40.*800/);assert.match(await page.locator('[data-profile-name]').textContent(),/旧存档/);
    await visit('parking');await click(800,340);await page.locator('[data-save]').click();const s=await record();assert.equal(s.vehicle.body,'sport');assert.equal(s.progress.factory.awards.save.points,40);assert.equal(Object.keys(s.progress).length,8);
  });
  await check('parking light rail follows dragging, hold and space release stop movement immediately',async()=>{
    await visit('parking');await drag(480,300,480,280);assert.ok(Math.abs(Number((await data()).handleY)-280)<2);assert.equal((await data()).routeValid,'true');
    const b=await page.locator('[data-hold]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(450);assert.ok(Number((await data()).distance)>10);await page.mouse.up();const paused=Number((await data()).distance);await page.waitForTimeout(160);assert.equal(Number((await data()).distance),paused);
    await page.locator('[data-hold]').blur();await page.locator('body').click({position:{x:Math.min(1100,1200),y:20}});await page.keyboard.down('Space');await page.waitForTimeout(200);await page.keyboard.up('Space');assert.ok(Number((await data()).distance)>paused);
    const stopped=Number((await data()).distance);await page.waitForTimeout(120);assert.equal(Number((await data()).distance),stopped);
    await page.locator('[data-toggle]').click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await data()).running,'false');
    await page.locator('[data-toggle]').click();await finished();assert.equal((await data()).collisions,undefined);assert.match(await page.locator('[data-result]').textContent(),/完整停入/);await page.locator('[data-save]').click();await shot('parking-completed');
    const score1=(await record()).progress.parking.awards;await page.locator('[data-save]').click();assert.deepEqual((await record()).progress.parking.awards,score1);
    for(const scene of [1,2]){await page.locator(`[data-scene="${scene}"]`).click();assert.equal((await data()).routeValid,'true');await page.locator('[data-toggle]').click();await finished();}
    assert.equal((await record()).progress.parking.completed,true);
  });
  await check('parking rejects conflicting routes and cancellation preserves the previous rail',async()=>{
    await visit('parking');await drag(480,300,480,95);assert.equal((await data()).routeValid,'false');await page.locator('[data-hold]').click();assert.equal((await data()).distance,'0.00');
    await page.locator('[data-reset]').click();await move(480,300);await page.mouse.down();await move(480,240);await page.locator('.lab-stage canvas').dispatchEvent('pointercancel');await page.mouse.up();assert.equal((await data()).handleY,'300');
  });
  await check('repair scanner follows input, wrong replacement fails, all three actual repairs pass',async()=>{
    await visit('repair');await drag(120,260,710,270);assert.equal((await data()).evidence,'3');assert.ok(Math.abs(Number((await data()).scannerX)-710)<2);await shot('repair-scanned');
    await click(705,270);await page.locator('[data-replace]').click();await page.waitForFunction(()=>document.querySelector('#game-host').dataset.testing==='false');assert.equal((await data()).completed,'false');assert.match(await page.locator('[data-status]').textContent(),/没有解决/);
    await click(515,270);await page.locator('[data-replace]').click();await page.waitForFunction(()=>document.querySelector('#game-host').dataset.completed==='true');await page.locator('[data-finding="0"]').click();await page.locator('[data-save]').click();await shot('repair-completed');
    for(const scene of [1,2]){await page.locator(`[data-scene="${scene}"]`).click();await drag(120,160,800,150);assert.equal((await data()).evidence,'3');await click(scene===1?230:775,150);await page.locator('[data-replace]').click();await page.waitForFunction(()=>document.querySelector('#game-host').dataset.completed==='true');}
    await page.locator('[data-reset]').click();assert.equal((await data()).evidence,'0');assert.equal((await data()).completed,'false');assert.equal((await data()).fault,'control');
  });
  await check('charging cable follows, snaps, retracts, pauses energy, and all scenes have playable schedules',async()=>{
    const cars=async()=>JSON.parse((await data()).cars);
    for(const scene of [0,1,2]){
      await visit('charging');if(scene)await page.locator(`[data-scene="${scene}"]`).click();
      if(scene===0){await drag(285,412,920,462);assert.equal((await data()).connections,'0');assert.equal((await data()).delivered,'0.0000');}
      const positions=scene===0?[370,760]:[265,550,830];
      const attach=async(plug,index)=>{await click(plug===0?285:580,412);await click(positions[index],200);};
      if(scene===2){await attach(0,2);await page.locator('[data-strategy="priority"]').click();await attach(1,0);}else{await drag(285,412,positions[0]-78,256);assert.equal((await data()).connections,'1');await page.locator('[data-pause]').click();const paused=(await data()).delivered;await page.waitForTimeout(200);assert.equal((await data()).delivered,paused);await attach(1,1);}
      if(scene===1){await click(265,200);await page.locator('[data-strategy="priority"]').click();const c=await cars();assert.equal(c[0].power,30);assert.equal(c[1].power,6);await shot('charging-power-flow');}
      if(scene===0){await click(positions[0]-78,256);assert.equal((await data()).connections,'1');await attach(0,0);}
      if(!await page.locator('.lab-extra details').nth(1).evaluate(el=>el.open))await page.locator('.lab-extra details').nth(1).locator('summary').click();await page.locator('[data-speed="3"]').click();
      for(let i=0;i<70&&(await data()).finished!=='true';i++){
        const cs=await cars();for(let plug=0;plug<2;plug++)if(!cs.some(c=>c.connected===plug)){const next=cs.findIndex(c=>c.reachedAt===null&&c.connected===null);if(next>=0){await attach(plug,next);break;}}
        await page.waitForTimeout(150);
      }
      await finished();const cs=await cars();assert.ok(cs.every(c=>c.reachedAt!==null),`scene ${scene}: ${JSON.stringify(cs)}`);assert.ok(cs.every(c=>Math.abs(c.energy-c.target)<1e-8));await page.locator('[data-save]').click();if(scene===1&&await page.locator('[data-finding="0"]').count())await page.locator('[data-finding="0"]').click();
    }
    assert.equal((await record()).progress.charging.completed,true);
  });
  await check('rain variable follows slider, holds pause, real replay synchronizes cars, all scenes finish',async()=>{
    await visit('grip');const slider=page.locator('[data-variable-slider]');await slider.focus();await page.keyboard.press('End');assert.equal((await data()).value,'100');
    const b=await page.locator('[data-hold]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(350);await page.mouse.up();const paused=(await data()).time;assert.ok(Number(paused)>.1);await page.waitForTimeout(180);assert.equal((await data()).time,paused);await shot('grip-running');
    await slider.focus();await page.keyboard.press('ArrowLeft');assert.equal((await data()).time,'0.000');assert.equal((await data()).hasHistory,'true');await page.locator('[data-toggle]').click();await finished();await drag(840,458,330,458);assert.ok(Number((await data()).replayTime)>2&&Number((await data()).replayTime)<4);const t=(await data()).time;await page.waitForTimeout(150);assert.equal((await data()).time,t);await shot('grip-replay');await page.locator('[data-finding="0"]').click();await page.locator('[data-save]').click();
    for(const scene of [1,2]){await page.locator(`[data-scene="${scene}"]`).click();await page.locator('[data-toggle]').click();await finished();}
    const s=await record();assert.equal(s.progress.grip.completed,true);assert.ok(s.progress.grip.data.trajectory.length>100);
  });
  await check('eight-page report includes actual states, inline pictures, downloadable HTML and PNG',async()=>{
    await visit('report');assert.equal(await page.locator('.report-card').count(),8);assert.ok(await page.locator('.report-card img').count()>=4);assert.match(await page.locator('.report-hero').textContent(),/800/);assert.match(await page.locator('.report-card').filter({hasText:'汽车的超级眼睛'}).textContent(),/还没体验/);
    const download=page.waitForEvent('download');await page.locator('[data-action="download-report"]').click();const file=await download;const path='output/playwright/report.html';await file.saveAs(path);const html=fs.readFileSync(path,'utf8');assert.equal((html.match(/class="report-card"/g)||[]).length,8);assert.match(html,/我改了什么/);
    const pngDownload=page.waitForEvent('download');await page.locator('[data-action="vehicle-png"]').click();const png=await pngDownload;await png.saveAs('output/playwright/vehicle-report.png');assert.ok(fs.statSync('output/playwright/vehicle-report.png').size>10000);await shot('eight-game-report');
  });
  await check('all eight games keep correct canvas aspect and visible controls at desktop and narrow sizes',async()=>{
    for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,720]]){
      await page.setViewportSize({width,height});
      for(const id of ['home','perception','factory','ai','regen',...ids,'report']){
        await visit(id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${id} ${width}: overflow`);
        for(const canvas of await page.locator('canvas[data-logical-width]').all()){const ratio=await canvas.evaluate(c=>{const b=c.getBoundingClientRect();return b.width/b.height/(Number(c.dataset.logicalWidth)/Number(c.dataset.logicalHeight));});assert.ok(Math.abs(ratio-1)<.025,`${id} ${width}: stretched`);}
        if(ids.includes(id)&&width>=1366){const b=await page.locator('.lab-toolbar').boundingBox();assert.ok(b.y+b.height<height,`${id} ${width}: controls below window (${b.y+b.height})`);}
      }
    }
    await page.setViewportSize({width:390,height:844});await visit('repair');await drag(120,260,710,270);assert.equal((await data()).evidence,'3');assert.ok(Math.abs(Number((await data()).scannerX)-710)<3);await shot('repair-narrow');await visit('grip');await shot('grip-narrow');
  });
  await check('reduced motion retains operations and navigation releases held inputs',async()=>{
    await page.setViewportSize({width:1366,height:768});await visit('parking');await page.locator('[data-action="motion"]').click();assert.ok(await page.locator('html').evaluate(el=>el.classList.contains('reduce-motion')));await page.locator('[data-toggle]').click();await page.waitForTimeout(180);await visit('grip');assert.equal((await data()).time,'0.000');await page.waitForTimeout(200);assert.equal((await data()).time,'0.000');await visit('parking');assert.equal((await data()).running,'false');
  });
  await check('no runtime errors across inputs, retries, navigation and resize',async()=>assert.deepEqual(errors,[]));
  await browser.close();fs.writeFileSync('output/playwright/new-games-qa.json',JSON.stringify({base,date:'2026-11-10',failures,errors},null,2));
  if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
