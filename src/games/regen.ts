import { createStage, drawCar, label, roundRect } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import './regen.css';

type Mode = 'normal' | 'cold' | 'full';
interface Round { mode: Mode; x: number; speed: number; initial: number; battery: number; friction: number; losses: number; power: number; stopped: boolean; elapsed: number; assist: boolean }
interface Result { mode: Mode; distance: number; precision: number; battery: number; friction: number; losses: number; assisted: boolean }
const modes: Record<Mode, { name: string; soc: number; temp: number; power: number; description: string }> = {
  normal: { name: '常温电池', soc: 65, temp: 25, power: 20000, description: '电池接收能力充足，一部分能量可以回到电池。' },
  cold: { name: '低温电池', soc: 65, temp: -5, power: 3500, description: '低温时回收受到限制，摩擦制动承担更多任务。' },
  full: { name: '满电电池', soc: 100, temp: 25, power: 0, description: '电池已经满了，这次教学车型不再接收回收能量。' }
};
const MASS = 1300, START_SPEED = 14, GOAL = 63, TOLERANCE = 17;
const energy = (v: number) => .5 * MASS * v * v;
function newRound(mode: Mode): Round { return { mode, x:0, speed:START_SPEED, initial:energy(START_SPEED), battery:0, friction:0, losses:0, power:0, stopped:false, elapsed:0, assist:false }; }
export function mountRegen(host: HTMLElement, api: GameAPI): MountedGame {
  const saved = api.getRecord('regen');
  const results: Partial<Record<Mode, Result>> = (saved.results as Partial<Record<Mode, Result>>) || {};
  const best: Partial<Record<Mode, number>> = (saved.best as Partial<Record<Mode, number>>) || {};
  const seen: Mode[] = Array.isArray(saved.seen) ? saved.seen as Mode[] : [];
  let mode: Mode = 'normal', round = newRound(mode), running = false, brake = false, disposed = false, lastUi = 0;
  let accumulator = 0;
  host.innerHTML = `<div class="experience regen-experience"><section class="playfield regen-playfield"><div class="regen-stage-head"><span class="regen-live"><i></i> ENERGY TRACK</span><span>二维能量实验 · 教学仿真</span></div><div class="regen-stage"></div><div class="regen-live-stats"><div><span>当前车速</span><strong data-speed>0 <small>km/h</small></strong></div><div><span>已回收能量</span><strong data-energy>0 <small>kJ</small></strong></div><div><span>电池状态</span><strong data-soc>65 <small>%</small></strong></div></div><div class="stage-bar"><span data-round-status>按“出发”，在绿色区域停下小车。</span><span class="regen-key">SPACE / 按住刹车</span></div></section><aside class="control-panel regen-controls"><div class="control-group"><span class="chip">04 · 刹车充电秀</span><h2>轻轻一刹，看见能量。</h2><p>看准绿色停车区，按住刹车。停早、停晚，都可以再试一次。</p></div><div class="control-group"><label>换一块电池试试</label><div class="regen-modes">${(Object.keys(modes) as Mode[]).map(m => `<button data-mode="${m}" class="regen-mode ${m === mode ? 'active' : ''}"><span>${m==='normal'?'25°C':m==='cold'?'−5°C':'100%'}</span><b>${modes[m].name}</b><i data-mode-stamp="${m}">${results[m] ? '已体验' : '试试看'}</i></button>`).join('')}</div></div><p class="regen-mode-description" data-mode-description>${modes[mode].description}</p><button class="btn btn-primary btn-full" data-start>出发，试一圈 →</button><button class="regen-brake" data-brake aria-label="按住刹车">按住刹车 <span>也可以按住空格键</span></button><button class="btn btn-full btn-secondary" data-assist>帮我停进停车区</button><div class="regen-result" data-result hidden><strong data-result-title>这次体验完成啦</strong><p data-result-copy></p><button class="btn btn-small btn-full" data-energy-view>看看能量去了哪里</button></div><div class="regen-energy-breakdown" data-breakdown hidden><div><span>回到电池</span><b data-battery-account></b></div><div><span>摩擦制动热</span><b data-friction-account></b></div><div><span>其他损耗</span><b data-loss-account></b></div><p>三部分相加，等于出发时的运动能量。</p></div></aside><div class="science-note"><span class="regen-note-bolt">↯</span><span><strong>一个新发现：</strong>刹车时，电机可以把部分运动能量变成电能。电池能接收多少，会随温度和剩余电量变化。</span></div></div>`;
  const query = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  function save() {
    const records = (Object.keys(modes) as Mode[]).flatMap(m => results[m] ? [
      { label: `${modes[m].name} · 停车位置`, value: `${results[m]!.distance.toFixed(1)} m` },
      { label: `${modes[m].name} · 回到电池`, value: `${(results[m]!.battery/1000).toFixed(1)} kJ` }
    ] : []);
    api.record('regen', { results, best, seen, summary: '我看见了：电池状态不同，刹车时能量的去向也会不同。', report: [
      {label:'实验车辆质量',value:'1300 kg'}, {label:'每轮初始车速',value:'50.4 km/h'}, {label:'每轮初始动能',value:`${(energy(START_SPEED)/1000).toFixed(1)} kJ`}, ...records
    ] });
  }
  function updateUI() {
    query('[data-speed]').innerHTML = `${running ? Math.round(round.speed*3.6) : round.stopped ? 0 : 50} <small>km/h</small>`;
    query('[data-energy]').innerHTML = `${(round.battery/1000).toFixed(1)} <small>kJ</small>`;
    query('[data-soc]').innerHTML = `${modes[mode].soc} <small>%</small>`;
    query<HTMLButtonElement>('[data-brake]').classList.toggle('pressed', brake);
    query<HTMLButtonElement>('[data-start]').textContent = running ? '重新出发 →' : round.stopped ? '再玩一次 →' : '出发，试一圈 →';
    for (const m of Object.keys(modes) as Mode[]) query(`[data-mode-stamp="${m}"]`).textContent = results[m] ? '已体验 ✓' : '试试看';
  }
  function finish() {
    if (round.stopped) return;
    round.stopped = true; running = false; brake = false;
    // The final energy was distributed by the step integrator; nothing is awarded for raw kJ.
    const precision = Math.max(0, 1-Math.abs(round.x-GOAL)/TOLERANCE);
    results[mode] = {mode, distance:round.x, precision, battery:round.battery, friction:round.friction, losses:round.losses, assisted:round.assist};
    best[mode] = Math.max(best[mode] || 0, precision);
    api.award('regen', `experience-${mode}`, 20, `${modes[mode].name}体验`);
    api.award('regen', 'parking-skill', (Object.values(best).reduce((s,v)=>s+(v||0),0)/3)*25, '停车技巧');
    api.complete('regen'); save();
    query('[data-result]').hidden = false; query('[data-breakdown]').hidden = true;
    query('[data-result-title]').textContent = precision>.75 ? '停车漂亮，能量已记录！' : precision>0 ? '停进区域啦，再试试更靠近中心。' : '这圈体验完成，下一圈再调整时机。';
    query('[data-result-copy]').textContent = `停在 ${round.x.toFixed(1)} m，目标中心 ${GOAL} m。回到电池 ${(round.battery/1000).toFixed(1)} kJ。`;
    query('[data-round-status]').textContent = '体验已完成，可以看能量、换电池或再来一圈。';
    updateUI();
    setTimeout(() => { if (!disposed) api.saveImage('regen', stage.capture()); }, 90);
  }
  function step(dt: number) {
    if (!running) return;
    round.elapsed += dt;
    const previousV = round.speed;
    const roadDecel = .18;
    let demandedDecel = brake ? 3.0 : .8;
    if (round.assist) demandedDecel = Math.min(4.5, Math.max(.25, round.speed*round.speed / (2*Math.max(.05,GOAL-round.x))));
    if (round.x >= 108) demandedDecel = 5;
    const nextV = Math.max(0, previousV-(demandedDecel+roadDecel)*dt);
    const dx = .5*(previousV+nextV)*dt;
    const removed = energy(previousV)-energy(nextV);
    const roadLoss = Math.min(removed, MASS*roadDecel*dx);
    const brakeWork = Math.max(0, removed-roadLoss);
    // Mechanical input to regeneration is restricted by battery acceptance and conversion efficiency.
    const efficiency = .76;
    const regenMechanical = Math.min(brakeWork, modes[mode].power*dt/efficiency, MASS*1.3*dx);
    const gained = regenMechanical*efficiency;
    round.x += dx; round.speed = nextV;
    round.battery += gained; round.friction += brakeWork-regenMechanical;
    round.losses += roadLoss+(regenMechanical-gained); round.power = gained/dt;
    if (nextV <= .001) finish();
  }
  const stage = createStage(query('.regen-stage'), { label:'新能源车刹停跑道和能量回收动画', width:1000, height:520,
    update(dt) { if (document.hidden) return; accumulator += dt; while(accumulator>=1/120){step(1/120);accumulator-=1/120;} lastUi += dt; if(lastUi>.1){updateUI();lastUi=0;} },
    draw(ctx, time) {
      const gradient = ctx.createLinearGradient(0,0,0,520); gradient.addColorStop(0,'#e5efda'); gradient.addColorStop(1,'#f6f7e9'); ctx.fillStyle=gradient;ctx.fillRect(0,0,1000,520);
      ctx.fillStyle='#fbfcec';ctx.beginPath();ctx.arc(813,91,40,0,Math.PI*2);ctx.fill();
      for(let i=0;i<10;i++){const bx=i*117-35;const bh=38+(i*29)%72;roundRect(ctx,bx,220-bh,78,bh,4,i%2?'#d9e4c8':'#cdddbb');ctx.fillStyle='#edf2e1';for(let k=0;k<3;k++)for(let j=0;j<2;j++)ctx.fillRect(bx+12+k*19,230-bh+j*22,8,10);}
      ctx.fillStyle='#bed09b';ctx.beginPath();ctx.moveTo(0,246);ctx.quadraticCurveTo(130,213,310,240);ctx.quadraticCurveTo(650,196,1000,245);ctx.lineTo(1000,290);ctx.lineTo(0,290);ctx.closePath();ctx.fill();
      ctx.fillStyle='#dce6c4';ctx.fillRect(0,278,1000,100);ctx.fillStyle='#6e8158';ctx.fillRect(0,303,1000,66);
      const mapX=(x:number)=>92+x*6.55;
      const goalX=mapX(GOAL); ctx.fillStyle='#b4d67c';ctx.fillRect(goalX-90,303,180,66);
      ctx.strokeStyle='#e7f2c9';ctx.lineWidth=3;ctx.setLineDash([13,10]);ctx.beginPath();ctx.moveTo(0,349);ctx.lineTo(1000,349);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#f5f7e7';ctx.fillRect(goalX-4,309,8,27);
      label(ctx,'绿色停车区',goalX-57,285,18,'#567738',600);
      label(ctx,'终点中心 63 m',goalX-61,419,13,'#82936e');
      for(let i=0;i<=120;i+=10){const x=mapX(i);ctx.strokeStyle='#aaba91';ctx.beginPath();ctx.moveTo(x,371);ctx.lineTo(x,378);ctx.stroke();if(i%20===0)label(ctx,`${i} m`,x-13,400,11,'#93a17e');}
      const carX=mapX(round.x), vehicle=api.getVehicle(); drawCar(ctx,carX,305,vehicle.color,.77,round.x*.35,vehicle.body);
      if(brake&&running){ctx.strokeStyle='#eec381';ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(carX-89-i*8,315);ctx.lineTo(carX-75-i*8,318);ctx.stroke();}}
      if(running&&round.power>1){ctx.strokeStyle='#a6be65';ctx.lineWidth=2;ctx.setLineDash([6,8]);ctx.lineDashOffset=-time*36;ctx.beginPath();ctx.moveTo(carX+20,276);ctx.quadraticCurveTo(carX+54,230,carX+3,227);ctx.stroke();ctx.setLineDash([]);for(let i=0;i<4;i++){const phase=(time*.8+i*.25)%1;ctx.fillStyle='#8faa44';ctx.beginPath();ctx.arc(carX+12+36*Math.sin(phase*Math.PI),270-phase*41,3,0,Math.PI*2);ctx.fill();}roundRect(ctx,carX-27,204,57,23,6,'#f6fae8','#c2d595');label(ctx,`${(round.power/1000).toFixed(1)} kW`,carX-20,220,11,'#7a953f',700);}
      roundRect(ctx,28,24,208,59,13,'#fffdf6b8','#d1dfbe');label(ctx,'本轮电池',44,46,11,'#889775');label(ctx,modes[mode].name,44,67,17,'#607742',700);label(ctx,`${modes[mode].temp}°C  /  SOC ${modes[mode].soc}%`,117,67,10,'#8c9c7a');
      label(ctx,'能量账本',34,453,13,'#627a46',700);
      const remaining=energy(round.speed), values=[round.battery,round.friction,round.losses,remaining];const colors=['#9ab951','#d8aa7b','#bcc6a7','#728b56'];let ex=144;
      for(let i=0;i<values.length;i++){const w=values[i]/round.initial*558;if(w>.2){roundRect(ctx,ex,436,w,22,0,colors[i]);ex+=w;}}
      const names=['回到电池','摩擦热','其他损耗','仍在运动'];for(let i=0;i<4;i++){ctx.fillStyle=colors[i];ctx.beginPath();ctx.arc(161+i*140,482,4,0,Math.PI*2);ctx.fill();label(ctx,names[i],173+i*140,486,11,'#879776');}
      roundRect(ctx,759,431,212,67,12,'#fffdf4b8','#dae3c8');label(ctx,'初始运动能量',777,453,11,'#8b9b79');label(ctx,`${(round.initial/1000).toFixed(1)} kJ`,777,481,22,'#607a42',700);
    }
  });
  function start() { round=newRound(mode);running=true;brake=false;accumulator=0;query('[data-result]').hidden=true;query('[data-breakdown]').hidden=true;query('[data-round-status]').textContent='靠近绿色区域时按住刹车，也可以试试辅助停车。';updateUI(); }
  query('[data-start]').addEventListener('click',start);
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.addEventListener('click',()=>{
    mode=button.dataset.mode as Mode;running=false;brake=false;round=newRound(mode);query('[data-result]').hidden=true;query('[data-breakdown]').hidden=true;
    host.querySelectorAll('[data-mode]').forEach(el=>el.classList.toggle('active',(el as HTMLElement).dataset.mode===mode));
    query('[data-mode-description]').textContent=modes[mode].description;query('[data-round-status]').textContent='新电池已装好，按“出发”开始体验。';updateUI();
  });
  const brakeButton=query<HTMLButtonElement>('[data-brake]');
  const release=()=>{brake=false;updateUI();};
  brakeButton.addEventListener('pointerdown',event=>{if(!running)return;brake=true;round.assist=false;brakeButton.setPointerCapture(event.pointerId);event.preventDefault();updateUI();});
  brakeButton.addEventListener('pointerup',release);brakeButton.addEventListener('pointercancel',release);brakeButton.addEventListener('lostpointercapture',release);
  function keyDown(event: KeyboardEvent) { if(event.code==='Space'&&!['INPUT','TEXTAREA','SELECT'].includes((event.target as HTMLElement)?.tagName)){event.preventDefault();if(running){brake=true;round.assist=false;updateUI();}} }
  function keyUp(event: KeyboardEvent){if(event.code==='Space')release();}
  const blur=()=>{release();};
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',blur);
  query('[data-assist]').addEventListener('click',()=>{if(!running)start();round.assist=true;brake=false;api.notify('辅助停车已开启，观察车速和能量的变化。');});
  query('[data-energy-view]').addEventListener('click',()=>{
    query('[data-breakdown]').hidden=false;query('[data-battery-account]').textContent=`${(round.battery/1000).toFixed(1)} kJ`;query('[data-friction-account]').textContent=`${(round.friction/1000).toFixed(1)} kJ`;query('[data-loss-account]').textContent=`${(round.losses/1000).toFixed(1)} kJ`;
    if(!seen.includes(mode))seen.push(mode);api.award('regen',`energy-view-${mode}`,5,`${modes[mode].name}能量探索`);save();
  });
  updateUI();
  return {destroy(){disposed=true;running=false;stage.destroy();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);}};
}
