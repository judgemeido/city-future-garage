// Real-photo QA: decode, direct gestures, simulation linkage, modal pause and offline export.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
const ids = ['parking','repair','charging','grip'];
let activeBrowser;
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL||'msedge'});
  activeBrowser=browser;
  const context=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
  if(base.startsWith('file:'))await context.setOffline(true);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  fs.mkdirSync('output/playwright',{recursive:true});
  const visit=async id=>{await page.goto(base+'#'+id);await page.waitForFunction(()=>document.querySelector('#game-host')?.dataset.photoState==='ready');await page.waitForSelector('.lab-stage canvas[data-logical-width]');};
  const data=()=>page.locator('#game-host').evaluate(el=>({...el.dataset}));
  const image=()=>page.locator('[data-photo-canvas]').evaluate(c=>c.toDataURL());
  const click=async(x,y)=>{const b=await page.locator('.lab-stage canvas').boundingBox();await page.mouse.click(b.x+x*b.width/1000,b.y+y*b.height/500);};
  const scanPhoto=async()=>{
    await page.locator('[data-photo-canvas]').scrollIntoViewIfNeeded();
    const b=await page.locator('[data-photo-canvas]').boundingBox();
    await page.mouse.move(b.x+b.width*.35,b.y+b.height*.5);await page.mouse.down();
    await page.mouse.move(b.x+b.width*.58,b.y+b.height*.5,{steps:10});const mid=Number((await data()).photoScan);
    await page.mouse.move(b.x+b.width*.75,b.y+b.height*.5,{steps:10});const end=Number((await data()).photoScan);
    assert.ok(end>mid+.1,'photo scan must move while pointer remains down');await page.mouse.up();
  };
  const sourceIds=new Set();
  for(const id of ids){
    await visit(id);sourceIds.add((await data()).photoId);
    assert.ok((await page.locator('[data-photo-canvas]').getAttribute('aria-label')).length>25);
    const before=await image();await scanPhoto();assert.notEqual(await image(),before);
    await page.locator('button[data-photo-point="2"]').click();assert.equal((await data()).photoPoint,'2');
    await page.locator('[data-photo-zoom]').click();assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
    const dimensions=await page.locator('[data-photo-original]').evaluate(async image=>{await image.decode();return [image.naturalWidth,image.naturalHeight];});
    assert.ok(dimensions[0]>=1280);assert.ok(dimensions[1]>=600);
    await page.screenshot({path:`output/playwright/${id}-real-photo-zoom.png`});
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
    for(const scene of [1,2,0]){
      await page.locator(`[data-scene="${scene}"]`).click();await page.waitForFunction(()=>document.querySelector('#game-host').dataset.photoState==='ready');sourceIds.add((await data()).photoId);
      assert.ok((await page.locator('[data-photo-note]').textContent()).length>15);
    }
    await page.locator('.lab-photo-source summary').click();
    const count=await page.locator('[data-photo-select]').count();
    for(let i=count-1;i>=0;i--){await page.locator(`[data-photo-select="${i}"]`).click();await page.waitForFunction(()=>document.querySelector('#game-host').dataset.photoState==='ready');sourceIds.add((await data()).photoId);assert.match(await page.locator('[data-photo-credit]').textContent(),/CC BY/);}
    await page.locator('.lab-photo-source summary').click();
    // Save a real personal action, then check that the evidence follows its photo.
    if(id==='parking')await click(800,340);
    if(id==='repair')await click(330,270);
    if(id==='charging'){await click(285,412);await click(370,200);}
    if(id==='grip'){await page.locator('[data-variable-slider]').focus();await page.keyboard.press('ArrowRight');}
    await page.locator('[data-save]').click();
    const record=await page.evaluate(id=>JSON.parse(localStorage.getItem('city-future-garage-v1')).progress[id],id);
    assert.ok(record.image.startsWith('data:image/jpeg'));
    assert.match(JSON.stringify(record.data.report),/实物观察与来源/);assert.match(JSON.stringify(record.data.report),/Wikimedia|wikimedia/);
    console.log('PASS photo decode, pointer scan, original zoom, scene switch and attributed save:',id);
  }
  assert.equal(sourceIds.size,6);
  await visit('repair');await click(515,270);await click(515,270);await page.locator('[data-replace]').click();await page.locator('[data-photo-zoom]').click();
  await page.waitForTimeout(1400);assert.equal((await data()).testing,'true');assert.equal((await data()).completed,'false');
  await page.locator('[data-photo-close]').click();await page.waitForFunction(()=>document.querySelector('#game-host').dataset.completed==='true');
  console.log('PASS repair original-photo modal freezes the same in-progress retest');
  await visit('charging');await click(285,412);await click(370,200);await page.waitForTimeout(250);
  assert.ok(Number((await data()).photoActivity)>0);
  const running1=await image();await page.waitForTimeout(180);assert.notEqual(await image(),running1);
  await page.locator('[data-pause]').click();assert.equal((await data()).photoActivity,'0');
  const stopped=await image();await page.waitForTimeout(220);assert.equal(await image(),stopped);
  await page.locator('[data-pause]').click();await page.locator('[data-photo-zoom]').click();assert.equal((await data()).running,'false');
  await page.locator('[data-photo-close]').click();assert.equal((await data()).running,'false');
  console.log('PASS photographed cable light follows actual power and pauses with the model');
  await visit('parking');await page.locator('.lab-extra details').nth(1).locator('summary').click();
  await page.locator('[data-handle]').focus();await page.keyboard.press('ArrowLeft');
  assert.ok(Math.abs(Number((await data()).photoScan)-Number((await data()).handleY)/500)<.002);
  await page.locator('[data-toggle]').click();await page.locator('[data-photo-zoom]').click();assert.equal((await data()).running,'false');await page.keyboard.press('Escape');
  console.log('PASS model gestures move the photo scan and original zoom releases held motion');
  for(const [width,height] of [[1920,1080],[1366,768],[390,844],[320,720]]){
    await page.setViewportSize({width,height});
    for(const id of ids){
      await visit(id);await scanPhoto();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' overflow '+width);
      const surface=await page.locator('[data-photo-canvas]').boundingBox();assert.ok(surface.width>150&&surface.height>=100);
      await page.locator('[data-photo-zoom]').click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'modal overflow');await page.keyboard.press('Escape');
      if(width===1366||width===390)await page.screenshot({path:`output/playwright/${id}-real-photo-${width}.png`,fullPage:true});
    }
  }
  await page.goto(base+'#report');
  for(const id of ids)assert.match(await page.locator('.report-card').filter({hasText:id==='parking'?'自动泊车训练营':id==='repair'?'汽车故障急救站':id==='charging'?'充电站小站长':'雨天抓地力挑战'}).textContent(),/实物观察与来源/);
  const download=page.waitForEvent('download');await page.locator('[data-action="download-report"]').click();const report=await download;await report.saveAs('output/playwright/real-photo-report.html');
  const html=fs.readFileSync('output/playwright/real-photo-report.html','utf8');assert.match(html,/CC BY/);assert.match(html,/照片用于观察形态/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'report source overflow');
  console.log('PASS desktop, narrow layouts and attributed downloadable report');
  // A blocked image must offer retry; navigation must discard stale load callbacks.
  if(!base.startsWith('file:')){
    const failurePage=await context.newPage();let block=true;
    await failurePage.route(/lab-photos\/.*\.jpg(?:\?t=\d+)?$/,route=>block?route.abort():route.continue());
    await failurePage.goto(base+'#parking');await failurePage.waitForFunction(()=>document.querySelector('#game-host')?.dataset.photoState==='error');
    assert.equal(await failurePage.locator('[data-photo-zoom]').isDisabled(),true);block=false;await failurePage.locator('[data-photo-retry]').click();
    await failurePage.waitForFunction(()=>document.querySelector('#game-host').dataset.photoState==='ready');
    await failurePage.goto(base+'#repair');await failurePage.goto(base+'#grip');await failurePage.waitForFunction(()=>document.querySelector('#game-host').dataset.photoState==='ready'&&document.querySelector('#game-host').dataset.photoId==='tire-tread');
    await failurePage.close();console.log('PASS failed real-photo load retries and scene disposal discards stale images');
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('output/playwright/lab-media-qa.json',JSON.stringify({base,sources:[...sourceIds],errors},null,2));
  await browser.close();
})().catch(async error=>{console.error(error);await activeBrowser?.close();process.exitCode=1;});
