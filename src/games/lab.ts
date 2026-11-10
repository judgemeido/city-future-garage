import { escapeHTML, label, roundRect } from '../platform';
import { icon } from '../visuals';
import type { GameAPI, GameId } from '../types';
import './lab.css';

export const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
export interface Knowledge { title: string; text: string; source: string; url: string }
export function labShell(host: HTMLElement, config: { color: string; tag: string; scenes: string[]; goals: string[]; toolbar: string; tools: string; cards: Knowledge[] }) {
  host.innerHTML = `<div class="lab" style="--lab-color:${config.color}"><div class="lab-topline"><div class="lab-scenes" role="group" aria-label="选择场景">${config.scenes.map((name,i) => `<button data-scene="${i}" class="${i===0?'active':''}">${i+1} · ${name}</button>`).join('')}</div><p class="lab-goal" data-goal>${config.goals[0]}</p></div><section class="lab-world"><div class="lab-stage-header"><b>${config.tag}</b><span>操作触发特效 · 教学示意</span></div><div class="lab-stage"></div><div class="lab-toolbar">${config.toolbar}<button class="btn btn-small" data-reset>重开本关</button><button class="btn btn-small" data-save>保存作品</button></div><p class="lab-status" data-status aria-live="polite"></p></section><div class="lab-result" data-result hidden></div><div class="lab-extra"><details><summary>为什么会这样 · 三张知识卡</summary><div class="lab-knowledge">${config.cards.map(card=>`<article>${icon('bolt',35)}<h3>${escapeHTML(card.title)}</h3><p>${escapeHTML(card.text)}</p><p><a href="${card.url}" target="_blank" rel="noopener">${escapeHTML(card.source)} ↗</a></p></article>`).join('')}</div></details><details><summary>进阶工具与星级规则</summary>${config.tools}<p class="lab-instructions">积分：首次操作10分，三个场景各20分，有效发现20分，保存作品10分。完成核心体验可获得体验章；挑战星级单独记录。</p></details></div></div>`;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  return { q, scene(index: number) { q('[data-goal]').textContent = config.goals[index]; host.querySelectorAll<HTMLElement>('[data-scene]').forEach(el => el.classList.toggle('active', Number(el.dataset.scene) === index)); }, status(text: string) { q('[data-status]').textContent = text; } };
}

export interface LabResult { scene: number; name: string; success: boolean; stars: number; changed: string; observed: string; learned: string; facts: { label: string; value: string }[]; comparison?: string; conditions: Record<string, number | string>; outcome: Record<string, number | string | boolean> }
export class LabJournal {
  attempts: LabResult[];
  best: Record<string, number>;
  finding: string;
  private findingKey: string;
  private dirty = false;
  constructor(private id: GameId, private api: GameAPI, private host: HTMLElement) {
    const saved = api.getRecord(id);
    this.attempts = Array.isArray(saved.attempts) ? saved.attempts as LabResult[] : [];
    this.best = (saved.best as Record<string, number>) || {};
    this.finding = typeof saved.finding === 'string' ? saved.finding : '';
    this.findingKey = typeof saved.findingKey === 'string' ? saved.findingKey : '';
  }
  private resultKey(result: LabResult) { return JSON.stringify([result.scene,result.conditions,result.outcome]); }
  action() { this.dirty = true; this.api.award(this.id, 'core-action', 10, '亲手操作'); }
  finish(result: LabResult) {
    this.action(); this.attempts.push(structuredClone(result)); this.attempts = this.attempts.slice(-12);
    this.best[result.scene] = Math.max(this.best[result.scene] || 0, result.stars);
    if (result.success) { this.api.award(this.id, `scene-${result.scene}`, 20, `${result.name}体验`); this.api.complete(this.id); }
    this.record(); this.show(result);
  }
  record(result = this.attempts.at(-1)) {
    this.api.record(this.id, { attempts: this.attempts, best: this.best, finding: this.finding, findingKey:this.findingKey,
      summary: result ? `${result.changed}。${result.observed}。` : '我已开始亲手操作，还在探索中。',
      report: result ? [{ label:'我改了什么', value:result.changed }, { label:'出现了什么变化', value:result.observed }, { label:'我懂了什么', value:this.findingKey===this.resultKey(result)?this.finding:result.learned }, {label:'本次场景 / 状态',value:`${result.name} · ${result.success?'完成':result.observed.startsWith('进行中')?'进行中':'待重试'}`}, { label:'最佳挑战星级', value:Object.entries(this.best).map(([scene,stars])=>`第${Number(scene)+1}关 ${'★'.repeat(stars)}${'☆'.repeat(3-stars)}`).join(' / ') }, ...result.facts] : [{label:'体验状态',value:'进行中'}] });
  }
  show(result: LabResult) {
    const panel = this.host.querySelector<HTMLElement>('[data-result]')!; panel.hidden = false;
    panel.innerHTML = `<h3>${result.success?'本次体验已记录':'这次还需要调整'} · ${'★'.repeat(result.stars)}${'☆'.repeat(3-result.stars)}</h3><p>${escapeHTML(result.observed)}</p>${result.facts.map(f=>`<div class="lab-record-line"><span>${escapeHTML(f.label)}</span><b>${escapeHTML(f.value)}</b></div>`).join('')}<p>${escapeHTML(result.learned)}</p>${result.comparison?`<p>我的真实比较：${escapeHTML(result.comparison)}</p><div class="lab-finding"><button class="btn btn-small" data-finding="0">记录发现：${escapeHTML(result.comparison)}</button><button class="btn btn-small" data-finding="1">记录发现：${escapeHTML(result.learned)}</button><input aria-label="补充我的发现" maxlength="80" placeholder="也可以补充一句自己的发现"><button class="btn btn-small" data-finding="custom">保存这句话</button></div>`:'<p>再改变条件做一次实验，就能记录自己的比较发现。</p>'}`;
    panel.querySelectorAll<HTMLElement>('[data-finding]').forEach(button=>button.addEventListener('click',()=>{
      const text = button.dataset.finding === 'custom' ? panel.querySelector<HTMLInputElement>('input')!.value.trim() : button.dataset.finding === '0' ? result.comparison! : result.learned;
      if (!text) return;
      this.finding = text; this.findingKey=this.resultKey(result); this.api.award(this.id,'finding',20,'记录真实发现'); this.record(result); this.api.notify('你的发现已写进作品报告');
    }));
  }
  save(image: string, current?: LabResult) {
    if (!this.dirty && !this.attempts.length) { this.api.notify('先亲手操作，再保存自己的作品'); return; }
    this.record(current); this.api.saveImage(this.id,image); this.api.award(this.id,'save',10,'保存作品'); this.api.notify('本次画面和体验记录已保存');
  }
}

// Pointer hold, keyboard hold and toggle all stop on blur, cancellation or page exit.
export function bindHold(button: HTMLButtonElement, toggle: HTMLButtonElement, change: (running: boolean) => void) {
  let pointer = false, key = false, latched = false;
  const sync = () => { const running=pointer||key||latched; button.classList.toggle('pressed',running); toggle.textContent=latched?'暂停运行':'开始 / 暂停'; change(running); };
  const stop = () => { pointer=key=latched=false; sync(); };
  button.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer=true;button.setPointerCapture(event.pointerId);event.preventDefault();sync();});
  const up=()=>{pointer=false;sync();};
  button.addEventListener('pointerup',up);button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',up);
  button.addEventListener('pointermove',event=>{const b=button.getBoundingClientRect();if(pointer&&(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom))up();});
  toggle.addEventListener('click',()=>{latched=!latched;sync();});
  const down=(event:KeyboardEvent)=>{if(event.code==='Space'&&!event.repeat&&(event.target===button||!['INPUT','TEXTAREA','SELECT','BUTTON','A','SUMMARY'].includes((event.target as HTMLElement)?.tagName))){event.preventDefault();key=true;sync();}};
  const keyup=(event:KeyboardEvent)=>{if(event.code==='Space'){event.preventDefault();key=false;sync();}};
  const visibility=()=>{if(document.hidden)stop();};
  window.addEventListener('keydown',down);window.addEventListener('keyup',keyup);window.addEventListener('blur',stop);document.addEventListener('visibilitychange',visibility);
  return {stop,destroy(){stop();window.removeEventListener('keydown',down);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',visibility);}};
}

export class LabFX {
  private rings: {x:number;y:number;age:number;color:string}[]=[];
  constructor(private reduced: () => boolean) {}
  pulse(x:number,y:number,color:string) {this.rings.push({x,y,color,age:0});this.rings=this.rings.slice(-8);}
  step(dt:number) {this.rings.forEach(r=>r.age+=dt);this.rings=this.rings.filter(r=>r.age<.7);}
  draw(ctx:CanvasRenderingContext2D) {for(const r of this.rings){ctx.save();ctx.globalAlpha=1-r.age/.7;ctx.strokeStyle=r.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(r.x,r.y,this.reduced()?23:10+r.age*70,0,Math.PI*2);ctx.stroke();ctx.restore();}}
}
export function labBackground(ctx:CanvasRenderingContext2D,color:string,title:string) {
  const g=ctx.createLinearGradient(0,0,1000,500);g.addColorStop(0,'#152936');g.addColorStop(1,'#243e4c');ctx.fillStyle=g;ctx.fillRect(0,0,1000,500);
  ctx.strokeStyle='#9ececf0c';ctx.lineWidth=1;for(let x=0;x<=1000;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,500);ctx.stroke();}for(let y=0;y<=500;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();}
  label(ctx,title,28,36,14,color,600);
}
export function glowLine(ctx:CanvasRenderingContext2D,points:{x:number;y:number}[],color:string,width=3) {
  if(points.length<2)return;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=12;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
}
export function badge(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,color:string) {roundRect(ctx,x,y,Math.max(72,text.length*12+20),28,8,'#162c3be6',color);label(ctx,text,x+10,y+19,12,color);}
