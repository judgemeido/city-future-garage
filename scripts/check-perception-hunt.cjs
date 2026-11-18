// Exercise the photo hunt through real pointer/keyboard input, including every goal.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.QA_URL||'http://127.0.0.1:5173/';
const out=`output/playwright/perception-hunt-${base.startsWith('file:')?'offline':'online'}`;
(async()=>{
 const {PERCEPTION_SCENES}=await import('../src/games/perception-scenes.ts');
 const {clickTargetAt}=await import('../src/games/perception-annotations.ts');
 const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||'msedge'});
 try{
  fs.mkdirSync(out,{recursive:true});
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  if(base.startsWith('file:'))await context.setOffline(true);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>document.querySelector('.perception-experience')?.dataset.imageState==='ready');
  const data=()=>page.locator('.perception-experience').evaluate(el=>({...el.dataset}));
  const record=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception);
  const count=()=>page.locator('[data-target].is-found').count();
  const shot=name=>page.screenshot({path:`${out}/${name}.png`,fullPage:true});
  const photoPoint=async(x,y)=>{
   await page.locator('.perception-photo-viewport').scrollIntoViewIfNeeded();
   await page.evaluate(({x,y})=>{
    const viewport=document.querySelector('.perception-photo-viewport'),canvas=document.querySelector('.perception-playfield canvas'),photo=document.querySelector('.perception-scene[aria-pressed=true] img');
    const scale=Math.min(968/photo.naturalWidth,602/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale,b=canvas.getBoundingClientRect(),v=viewport.getBoundingClientRect();
    viewport.scrollLeft+=b.left+(16+(968-w)/2+x*w)/1000*b.width-v.left-v.width/2;
    viewport.scrollTop+=b.top+(40+(602-h)/2+y*h)/660*b.height-v.top-v.height/2;
   },{x,y});
   const point=()=>page.evaluate(({x,y})=>{const b=document.querySelector('.perception-playfield canvas').getBoundingClientRect(),photo=document.querySelector('.perception-scene[aria-pressed=true] img'),scale=Math.min(968/photo.naturalWidth,602/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;return{x:b.x+(16+(968-w)/2+x*w)/1000*b.width,y:b.y+(40+(602-h)/2+y*h)/660*b.height};},{x,y});
   const p=await point();await page.evaluate(y=>window.scrollBy(0,y-innerHeight/2),p.y);return point();
  };
  const clickPhoto=async(x,y)=>{const p=await photoPoint(x,y);await page.mouse.click(p.x,p.y);};
  const findPoint=(scene,target)=>{
   for(let row=1;row<10;row++)for(let col=1;col<10;col++){const x=target.x+target.w*col/10,y=target.y+target.h*row/10;if(clickTargetAt(scene.targets,{x:0,y:0,w:1,h:1},x,y)?.id===target.id)return{x,y};}
   throw new Error(`No real location for ${scene.id}/${target.id}`);
  };
  await page.goto(base+'#perception');await ready();
  assert.equal(await count(),0);assert.equal(await page.locator('.perception-next-level').isDisabled(),true);
  assert.equal(await page.locator('.perception-experiment-settings').evaluate(el=>el.open),false);
  const before=await page.locator('.perception-playfield').boundingBox();assert.ok(before.width>850,'desktop photograph should be larger than the previous 600px view');
  await page.locator('[data-target="vehicle"]').click();assert.equal(await count(),0,'clicking a checklist item cannot find it');
  assert.equal(await page.locator('.perception-target-zoom').isDisabled(),true,'unfound goal cannot reveal its crop');
  await clickPhoto(.9,.1);assert.equal(await count(),0,'sky miss cannot find a goal');
  await page.locator('[data-target="vehicle"]').click();await page.locator('.perception-playfield').focus();await page.keyboard.press('Enter');assert.equal(await count(),0,'list selection cannot teleport keyboard confirmation to a goal');
  const vehicle=PERCEPTION_SCENES[0].targets[0],car=findPoint(PERCEPTION_SCENES[0],vehicle),p=await photoPoint(car.x,car.y);
  await page.mouse.move(p.x,p.y);await page.waitForTimeout(180);assert.equal(await count(),0,'hover cannot find goals');
  await page.mouse.down();await page.mouse.move(p.x+45,p.y-15,{steps:8});await page.mouse.up();assert.equal(await count(),0,'dragging is not a confirmation click');
  await clickPhoto(car.x,car.y);assert.equal(await count(),1);
  await clickPhoto(car.x,car.y);assert.equal(await count(),1,'finding the same instance is idempotent');
  await page.locator('[data-target="pedestrian"]').click();assert.equal(await count(),1);
  await page.locator('[data-photo-zoom="in"]').click();await page.waitForTimeout(120);
  const after=await page.locator('.perception-playfield').boundingBox();assert.ok(Math.abs(after.width/before.width-1.5)<.03);
  const v=await page.locator('.perception-photo-viewport').boundingBox();await page.mouse.move(v.x+v.width/2,v.y+100);await page.mouse.down();await page.mouse.move(v.x+v.width/2-100,v.y+30,{steps:8});await page.mouse.up();assert.equal(await count(),1,'panning a magnified photo cannot mark targets');
  const person=PERCEPTION_SCENES[0].targets.find(t=>t.id==='pedestrian'),ped=findPoint(PERCEPTION_SCENES[0],person);await clickPhoto(ped.x,ped.y);assert.equal(await count(),2,'zoom and pan retain correct hit coordinates');
  await page.locator('[data-photo-zoom="reset"]').click();
  await page.evaluate(()=>window.scrollTo(0,0));await shot('desktop-search');
  await page.locator('.perception-photo-zoom').click();await page.locator('.perception-zoom-image').evaluate(img=>img.decode());
  const signal=PERCEPTION_SCENES[0].targets.find(t=>t.id==='signal'),sig=findPoint(PERCEPTION_SCENES[0],signal),z=await page.locator('.perception-zoom-image').boundingBox();await page.mouse.click(z.x+sig.x*z.width,z.y+sig.y*z.height);
  assert.equal(await count(),3,'actual clicks in the enlarged photo also find targets');
  await page.locator('.perception-zoom-close').click();
  for(const scene of PERCEPTION_SCENES){
   if((await data()).scene!==scene.id){await page.locator(`[data-scene="${scene.id}"]`).click();await ready();}
   assert.equal(await page.locator('.perception-objects>li').count(),scene.targets.length);
   for(const target of scene.targets){
    if(await page.locator(`[data-target="${target.id}"].is-found`).count())continue;
    const pos=findPoint(scene,target);await clickPhoto(pos.x,pos.y);assert.equal(await page.locator(`[data-target="${target.id}"].is-found`).count(),1,`${scene.name}: ${target.name}`);
   }
   assert.equal((await data()).levelComplete,'true');await page.waitForTimeout(150);
   console.log('PASS actual photo clicks find all goals:',scene.name);
   if(scene===PERCEPTION_SCENES[0]){await page.evaluate(()=>window.scrollTo(0,0));await shot('first-level-complete');}
   if(scene!==PERCEPTION_SCENES.at(-1)){assert.equal(await page.locator('.perception-next-level').isEnabled(),true);await page.locator('.perception-next-level').click();await ready();}
  }
  assert.equal((await data()).completedLevels,'6');const finished=await record();assert.equal(finished.completed,true);assert.equal(finished.data.completedLevels.length,6);assert.equal(Object.keys(finished.awards).filter(key=>key.startsWith('target-')).length,4);
  await page.reload();await ready();assert.equal((await data()).completedLevels,'6');
  for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,844],[390,844],[320,720]]){
   await page.setViewportSize({width,height});await page.locator('[data-photo-zoom="reset"]').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: overflow`);
   assert.ok(await page.locator('.perception-playfield canvas').evaluate(c=>{const b=c.getBoundingClientRect();return Math.abs(b.width/b.height-1000/660)<.015;}),'canvas stretched');
   if(width===390||width===320){await page.evaluate(()=>window.scrollTo(0,0));await shot(`narrow-${width}`);}
  }
  await page.locator('.perception-restore').click();assert.equal(await count(),0);assert.equal((await data()).completedLevels,'5');
  await page.reload();await ready();assert.equal(await count(),0);assert.equal((await data()).completedLevels,'5');assert.deepEqual((await record()).awards,finished.awards);
  const migration=await browser.newContext({viewport:{width:1366,height:768}});if(base.startsWith('file:'))await migration.setOffline(true);
  const oldPage=await migration.newPage();await oldPage.addInitScript(seed=>localStorage.setItem('city-future-garage-v1',JSON.stringify(seed)),{version:1,profile:{nickname:'旧工程师',workstation:'09'},progress:{perception:{completed:false,awards:{legacy:{points:15,label:'旧积分'}},data:{sceneCatalog:'hangzhou-landmarks-2026-11-12',sceneId:'hangzhou-qianjiang',discoveredByScene:{'hangzhou-qianjiang':['vehicle','signal']}}}}});
  await oldPage.goto(base+'#perception');await oldPage.waitForFunction(()=>document.querySelector('.perception-experience')?.dataset.imageState==='ready');assert.equal(await oldPage.locator('[data-target].is-found').count(),0,'old list-generated markers cannot complete the new hunt');
  assert.match(await oldPage.locator('[data-profile-name]').textContent(),/旧工程师/);assert.equal(await oldPage.evaluate(()=>JSON.parse(localStorage.getItem('city-future-garage-v1')).progress.perception.awards.legacy.points),15);await oldPage.close();
  assert.deepEqual(errors,[]);console.log('PASS checklist/miss/hover/drag guards, photo zoom and pan, enlarged-photo hits, six levels, reload/replay, six viewport sizes, old progress migration, no runtime errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
