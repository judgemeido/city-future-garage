import { escapeHTML, label, roundRect } from '../platform';
import { LAB_PHOTOS, PHOTO_LESSONS, PHOTO_SOURCES, type LabId } from './lab-photo-content';

export interface PhotoSignal { position: number; text: string; activity?: number; focus?: number }
export function mountLabMedia(host: HTMLElement, id: LabId) {
  const panel = host.querySelector<HTMLElement>('[data-lab-media]')!;
  const photos = LAB_PHOTOS[id];
  panel.innerHTML = `<div class="lab-photo-heading"><b data-photo-title></b><button class="btn btn-small" data-photo-zoom>放大原图 ↗</button></div><div class="lab-photo-surface"><canvas data-photo-canvas aria-label="真实照片：拖动扫描线观察实物" role="img"></canvas><div class="lab-photo-load" data-photo-load aria-live="polite">正在载入实物照片…<button class="btn btn-small" data-photo-retry hidden>重新加载</button></div></div><div class="lab-photo-reading"><div class="lab-photo-points" role="group" aria-label="实物观察点">${[0,1,2].map(i=>`<button data-photo-point="${i}"></button>`).join('')}</div><p data-photo-note></p><p class="lab-photo-live" data-photo-live>拖照片扫描 · 点标注看细节</p></div><details class="lab-photo-source"><summary>实物照片与来源</summary><div class="lab-photo-tabs" role="group" aria-label="选择实物照片">${photos.map((p,i)=>`<button class="btn btn-small" data-photo-select="${i}">${escapeHTML(p.name)}</button>`).join('')}</div><p data-photo-credit></p><p>照片展示实物；扫描、光流、故障读数、实验条件和轨迹为教学叠层与模型。原图可放大查看。</p></details><dialog class="lab-photo-dialog" aria-label="实物原图放大"><div class="lab-photo-dialog-bar"><b data-zoom-title></b><button class="btn" data-photo-close>关闭原图 ✕</button></div><img data-photo-original alt=""><p data-zoom-credit></p></dialog>`;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const canvas = q<HTMLCanvasElement>('[data-photo-canvas]');
  const ctx = canvas.getContext('2d')!;
  const surface = q('.lab-photo-surface');
  const dialog = q<HTMLDialogElement>('dialog');
  let photoIndex = 0, point = 0, sceneIndex = 0, scan = .5;
  let loaded: HTMLImageElement | null = null, pending: HTMLImageElement | null = null;
  let generation = 0, disposed = false, activePointer: number | null = null;
  let signal: PhotoSignal = { position: .5, text: '拖照片扫描 · 点标注看细节', activity: 0 };
  let width = 400, height = 240, density = 1;
  const source = () => PHOTO_SOURCES.find(s=>s.id===photos[photoIndex].id)!;
  const photoRect = () => {
    if (!loaded) return {x:0,y:0,w:width,h:height};
    const scale = Math.min(width / loaded.naturalWidth, height / loaded.naturalHeight);
    const w = loaded.naturalWidth * scale, h = loaded.naturalHeight * scale;
    return { x: (width-w)/2, y: (height-h)/2, w, h };
  };
  function draw(time = performance.now()/1000) {
    ctx.setTransform(density,0,0,density,0,0);
    ctx.fillStyle = '#112a36'; ctx.fillRect(0,0,width,height);
    if (!loaded) return;
    const p = photoRect(), photo = photos[photoIndex];
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(loaded,p.x,p.y,p.w,p.h);
    ctx.save(); ctx.beginPath(); ctx.rect(p.x,p.y,p.w,p.h); ctx.clip();
    const x = p.x + scan*p.w;
    ctx.fillStyle = '#8ff8e924'; ctx.fillRect(x-7,p.y,14,p.h);
    ctx.strokeStyle = '#a7fff0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x,p.y); ctx.lineTo(x,p.y+p.h); ctx.stroke();
    photo.points.forEach((item,i)=>{
      const px=p.x+item.x*p.w, py=p.y+item.y*p.h;
      ctx.strokeStyle = i===point?'#ffdb87':'#b7fff1'; ctx.fillStyle='#133442df'; ctx.lineWidth=i===point?3:1.5;
      ctx.beginPath();ctx.arc(px,py,i===point?12:9,0,Math.PI*2);ctx.fill();ctx.stroke();
      label(ctx,String(i+1),px-3.5,py+4,11,i===point?'#ffdb87':'#b7fff1',700);
    });
    // This path follows the photographed cable; its light indicates model power.
    if (photo.flow && (signal.activity||0)>0) {
      const path=photo.flow.map(([fx,fy])=>({x:p.x+fx*p.w,y:p.y+fy*p.h}));
      ctx.strokeStyle='#8cffe9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);path.slice(1).forEach(t=>ctx.lineTo(t.x,t.y));ctx.stroke();
      const reduced=document.documentElement.classList.contains('reduce-motion');
      for(let i=0;i<3;i++){
        const progress=reduced?(i+1)/4:(time*(.3+(signal.activity||0)) + i/3)%1;
        const f=progress*(path.length-1),j=Math.min(path.length-2,Math.floor(f)),t=f-j;
        ctx.fillStyle='#fff3b5';ctx.beginPath();ctx.arc(path[j].x+(path[j+1].x-path[j].x)*t,path[j].y+(path[j+1].y-path[j].y)*t,3,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
    roundRect(ctx,p.x+6,p.y+6,94,21,6,'#133442e8');label(ctx,'实物照片 · 教学叠层',p.x+12,p.y+20,9,'#e5f5e9');
  }
  function resize() {
    const b=surface.getBoundingClientRect();width=Math.max(1,b.width);height=Math.max(1,b.height);density=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);draw();
  }
  const observer=new ResizeObserver(resize);observer.observe(surface);
  function choosePoint(index:number) {
    point=index;
    panel.querySelectorAll<HTMLElement>('[data-photo-point]').forEach((button,i)=>{button.classList.toggle('active',i===point);button.setAttribute('aria-pressed',String(i===point));button.textContent=`${i+1} ${photos[photoIndex].points[i].name}`;});
    q('[data-photo-note]').textContent=photos[photoIndex].points[point].text;
    host.dataset.photoPoint=String(point);draw();
  }
  function loadPhoto(index:number) {
    release();photoIndex=index;loaded=null;scan=.5;const version=++generation;
    if (pending) {pending.onload=pending.onerror=null;pending=null;}
    host.dataset.photoState='loading';host.dataset.photoId=photos[index].id;
    canvas.setAttribute('aria-label',photos[index].alt+'；拖动扫描线或点击观察点');
    q('[data-photo-title]').textContent=photos[index].name;
    q('[data-photo-load]').hidden=false;q('[data-photo-load]').firstChild!.textContent='正在载入实物照片…';q('[data-photo-retry]').hidden=true;
    q<HTMLButtonElement>('[data-photo-zoom]').disabled=true;
    const s=source();
    q('[data-photo-credit]').innerHTML=`摄影：${escapeHTML(s.author)} · <a href="${escapeHTML(s.licenseUrl)}" target="_blank" rel="noopener">${escapeHTML(s.license)}</a> · <a href="${escapeHTML(s.source)}" target="_blank" rel="noopener">Wikimedia Commons 原页面 ↗</a>`;
    panel.querySelectorAll<HTMLElement>('[data-photo-select]').forEach((button,i)=>{button.classList.toggle('active',index===i);button.setAttribute('aria-pressed',String(index===i));});
    choosePoint(Math.min(point,photos[index].points.length-1));
    const image=new Image();pending=image;
    image.onload=()=>{if(disposed||version!==generation)return;loaded=image;pending=null;host.dataset.photoState='ready';q('[data-photo-load]').hidden=true;q<HTMLButtonElement>('[data-photo-zoom]').disabled=false;draw();};
    image.onerror=()=>{if(disposed||version!==generation)return;pending=null;host.dataset.photoState='error';q('[data-photo-load]').firstChild!.textContent='实物照片未加载成功。';q('[data-photo-retry]').hidden=false;draw();};
    image.src=photos[index].image;draw();
  }
  function release() {
    if(activePointer!==null&&canvas.hasPointerCapture(activePointer))canvas.releasePointerCapture(activePointer);
    activePointer=null;
  }
  function scanAt(event:PointerEvent) {
    const b=canvas.getBoundingClientRect(),p=photoRect();
    const x=event.clientX-b.left,y=event.clientY-b.top;
    scan=Math.max(0,Math.min(1,(x-p.x)/p.w));
    const nearest=photos[photoIndex].points.findIndex(t=>Math.hypot(x-(p.x+t.x*p.w),y-(p.y+t.y*p.h))<20);
    if(nearest>=0)choosePoint(nearest);
    host.dataset.photoScan=scan.toFixed(3);draw();
  }
  canvas.addEventListener('pointerdown',event=>{if(!loaded||event.button!==0||activePointer!==null)return;activePointer=event.pointerId;canvas.setPointerCapture(event.pointerId);event.preventDefault();scanAt(event);});
  canvas.addEventListener('pointermove',event=>{if(activePointer===event.pointerId)scanAt(event);});
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  window.addEventListener('blur',release);
  panel.querySelectorAll<HTMLElement>('[data-photo-point]').forEach(button=>button.addEventListener('click',()=>{choosePoint(Number(button.dataset.photoPoint));scan=photos[photoIndex].points[point].x;host.dataset.photoScan=scan.toFixed(3);draw();}));
  panel.querySelectorAll<HTMLElement>('[data-photo-select]').forEach(button=>button.addEventListener('click',()=>loadPhoto(Number(button.dataset.photoSelect))));
  q('[data-photo-retry]').addEventListener('click',()=>loadPhoto(photoIndex));
  q('[data-photo-zoom]').addEventListener('click',()=>{
    if(!loaded)return;
    // Stop latched/held simulations before putting a modal above the controls.
    window.dispatchEvent(new Event('blur'));
    const original=q<HTMLImageElement>('[data-photo-original]');original.src=photos[photoIndex].image;original.alt=photos[photoIndex].alt;
    q('[data-zoom-title]').textContent=photos[photoIndex].name+' · 完整照片';
    const s=source();q('[data-zoom-credit]').innerHTML=`摄影：${escapeHTML(s.author)} · ${escapeHTML(s.license)} · <a href="${escapeHTML(s.source)}" target="_blank" rel="noopener">原页面 ↗</a> · 原图无教学叠层`;
    dialog.showModal();q('[data-photo-close]').focus();
  });
  q('[data-photo-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  let frame=0;
  function animate(time:number){if(disposed)return;if(loaded&&(signal.activity||0)>0&&!document.hidden&&!document.documentElement.classList.contains('reduce-motion'))draw(time/1000);frame=requestAnimationFrame(animate);}
  frame=requestAnimationFrame(animate);
  function scene(index:number) {
    const lesson=PHOTO_LESSONS[id][index];
    if(sceneIndex!==index||host.dataset.photoId===undefined){sceneIndex=index;point=lesson.point;loadPhoto(lesson.photo);}
    choosePoint(lesson.point);q('[data-photo-live]').textContent=lesson.prompt;
  }
  loadPhoto(0);choosePoint(PHOTO_LESSONS[id][0].point);
  return {
    scene,
    isOpen: () => dialog.open,
    signal(next:PhotoSignal) {
      const changed=next.position!==signal.position||next.text!==signal.text||next.activity!==signal.activity||next.focus!==signal.focus;
      signal=next;if(!changed)return;
      q('[data-photo-live]').textContent=next.text;
      if(activePointer===null){scan=Math.max(0,Math.min(1,next.position));if(next.focus!==undefined&&next.focus!==point)choosePoint(next.focus);}
      host.dataset.photoScan=scan.toFixed(3);host.dataset.photoActivity=String(next.activity||0);draw();
    },
    evidence() {
      const s=source();return {label:'实物观察与来源',value:`${photos[photoIndex].name} · ${photos[photoIndex].points[point].name}；摄影 ${s.author} / ${s.license}；${s.source}。照片用于观察形态，读数和结果来自教学模型。`};
    },
    capture(fallback:string) {
      const model=host.querySelector<HTMLCanvasElement>('.lab-stage canvas');if(!model)return fallback;
      const output=document.createElement('canvas');output.width=1200;output.height=560;const c=output.getContext('2d')!;
      c.fillStyle='#17313e';c.fillRect(0,0,1200,560);c.imageSmoothingQuality='high';
      label(c,'我的操作记录 · 教学模型',22,36,18,'#d6f5e7',600);label(c,photos[photoIndex].name+' · 实物观察',758,36,16,'#d6f5e7',600);
      c.drawImage(model,20,62,720,360);
      if(loaded){const p=photoRect(),scale=Math.min(424/p.w,360/p.h),w=p.w*scale,h=p.h*scale;c.drawImage(canvas,p.x*density,p.y*density,p.w*density,p.h*density,756+(424-w)/2,62+(360-h)/2,w,h);}else label(c,'实物照片未加载，本次只保存教学模型',763,245,14,'#d6f5e7');
      const s=source();
      label(c,`观察点：${photos[photoIndex].points[point].name} · 摄影 ${s.author} / ${s.license}`,22,455,14,'#d6e8db');
      label(c,'照片展示实物；人工标注、光流、读数、条件和轨迹均为教学示意。',22,481,13,'#b2c9c1');
      c.font='11px "Microsoft YaHei",sans-serif';c.fillStyle='#9cbab3';
      const url=s.source;
      for(let start=0,line=0;start<url.length;line++){
        let end=start+1;while(end<url.length&&c.measureText(url.slice(start,end+1)).width<1150)end++;
        c.fillText(url.slice(start,end),22,506+line*16);start=end;
      }
      return output.toDataURL('image/jpeg',.82);
    },
    destroy(){disposed=true;generation++;release();observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('blur',release);if(pending)pending.onload=pending.onerror=null;if(dialog.open)dialog.close();}
  };
}
