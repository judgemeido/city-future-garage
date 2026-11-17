import { createStage } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import { REGEN_ROUTES, terrainAt } from './regen-route';
import { ACTIONS, MODES, MASS, GRAVITY, DT, MODEL_VERSION, createRegen, startRegen, setRegenAction, stepRegen, suggestedAction, kinetic, soc, acceptance, netEnergy, energyError, makeAttempt, replayRegen, referenceEnergy, readAttempts, comparable, type RegenAction, type RegenMode, type RegenState, type RegenAttempt } from './regen-model';
import { regenShell, drawRegen, actionNames, modeIds, kj, starText } from './regen-view';
import './regen.css';

export function mountRegen(host:HTMLElement,api:GameAPI):MountedGame {
  const saved=api.getRecord('regen');let attempts=readAttempts(saved.courierAttempts);
  const bestStars:Record<string,number>={},manualBest:Partial<Record<RegenMode,number>>={};
  const finite=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
  for(const [key,value] of Object.entries((saved.courierStars||{}) as object))if(/^[0-2]-(normal|cold|full)$/.test(key))bestStars[key]=Math.min(3,Math.max(0,Math.floor(finite(value))));
  for(const m of modeIds)manualBest[m]=Math.min(1,Math.max(0,finite((saved.courierManualBest as Record<string,unknown>)?.[m])));
  const seen:RegenMode[]=Array.isArray(saved.seen)?saved.seen.filter((m):m is RegenMode=>modeIds.includes(m)):[];
  let route=0,mode:RegenMode='normal',round=createRegen(route,mode),checkpoint=structuredClone(round);
  let id=0,finishedId=-1,disposed=false,accumulator=0,lastUI=0,deliveryAge=0,temporaryBrake=false,coaching=false,previousAction:RegenAction='coast';
  let replay:{source:RegenAttempt;states:RegenState[];time:number;playing:boolean;kind:'friction'|'battery'}|null=null;
  let finding=typeof saved.courierFinding==='string'?saved.courierFinding.slice(0,600):'',findingSource=typeof saved.courierFindingSource==='string'?saved.courierFindingSource:'';
  let currentAttempt:RegenAttempt|null=null;
  host.innerHTML=regenShell();const q=<T extends HTMLElement=HTMLElement>(selector:string)=>host.querySelector<T>(selector)!;
  function persist(status?:string) {
    const last=attempts.at(-1),report:{label:string;value:string}[]=[];
    if(last)report.push({label:'实际任务 / 电池',value:`${REGEN_ROUTES[last.route].name} / ${MODES[last.mode].name}`},{label:'最近已记录的一趟',value:`${last.success?'全部投递完成':'待重试'}${last.assisted?' · 教练示范':''}${last.practice?' · 片段练习':''}`},{label:'我改了什么',value:'使用行驶、滑行、轻刹、重刹控制投递行程'},{label:'出现了什么变化',value:`驱动及辅助用电 ${kj(last.drawn)} kJ，回到电池 ${kj(last.recovered)} kJ，净耗电 ${kj(last.drawn-last.recovered)} kJ`},{label:'能量分配',value:`摩擦热 ${kj(last.friction)} kJ，其他损耗 ${kj(last.losses)} kJ，剩余动能 ${kj(last.remaining)} kJ`},{label:'停车记录',value:last.deliveries.map((d,i)=>`第${i+1}站 ${d.x.toFixed(2)}m`).join(' / ')||`停在 ${last.x.toFixed(2)}m`},{label:'本趟星级',value:starText(last.stars)});
    if(last){const config=REGEN_ROUTES[last.route],heightDrop=terrainAt(config,0).height-terrainAt(config,last.x).height;report.push({label:'输入能量的来源',value:`电池输出 ${kj(last.drawn)} kJ + 高度下降 ${heightDrop.toFixed(2)} m 提供 ${kj(MASS*GRAVITY*heightDrop)} kJ。对应剩余动能、回到电池、摩擦热与其他损耗。`});}
    if(status)report.unshift({label:'当前体验状态',value:status});
    if(finding)report.push({label:'我懂了什么',value:finding},{label:'发现来自哪次实验',value:findingSource});
    report.push({label:'最佳挑战星级',value:Object.entries(bestStars).map(([key,n])=>`${REGEN_ROUTES[Number(key[0])].name}·${MODES[key.slice(2) as RegenMode].name} ${starText(n)}`).join(' / ')||'尚未取得手动挑战星级'},{label:'模型边界',value:'1300 kg；45 kWh；教学仿真，含驱动、重力、再生制动、摩擦与转换损耗'});
    api.record('regen',{schemaVersion:MODEL_VERSION,courierAttempts:attempts,courierStars:bestStars,courierManualBest:manualBest,seen,courierFinding:finding,courierFindingSource:findingSource,
      summary:status||(last?`${REGEN_ROUTES[last.route].name}：${last.success?'投递完成':'需要调整'}，实际回收 ${kj(last.recovered)} kJ。`:'准备体验动能回收快递。'),report});
  }
  function markExperience(){if(round.x>2){api.award('regen',`experience-${mode}`,20,`${MODES[mode].name}体验`);api.complete('regen');}}
  function reset(nextRoute=route,nextMode=mode){route=nextRoute;mode=nextMode;round=createRegen(route,mode);checkpoint=structuredClone(round);id++;finishedId=-1;currentAttempt=null;replay=null;accumulator=0;temporaryBrake=false;coaching=false;deliveryAge=0;q('[data-result]').hidden=true;q('[data-comparison]').hidden=true;q<HTMLSelectElement>('[data-battery]').value=mode;updateUI();}
  function depart(){if(round.phase==='complete'||round.phase==='failed')reset();const first=round.phase==='ready';startRegen(round);checkpoint=structuredClone(round);temporaryBrake=false;deliveryAge=0;persist('进行中：正在体验动能回收。');updateUI();if(first&&window.innerWidth<=900)q('.regen-stage').scrollIntoView({behavior:'instant',block:'start'});}
  function pause(){if(round.phase!=='running'&&round.phase!=='delivery')return;round.paused=true;temporaryBrake=false;setRegenAction(round,'coast');accumulator=0;updateUI();}
  function act(action:RegenAction){if(round.phase!=='running'||round.paused)return;coaching=false;setRegenAction(round,action);updateUI();}
  function statusText(){
    if(round.phase==='ready')return '点击出发。先看站牌，再用滑行和轻刹靠站；以车底定位点停入绿色区为准。';
    if(round.phase==='complete')return '快递送到啦！下面可以重放同一次操作，看能量怎样回到电池。';
    if(round.phase==='failed')return `${round.emergency}。本次能量已记录，可以重试这一段。`;
    if(round.paused)return '已暂停。时间和能量冻结；继续前手柄已回到滑行。';
    if(round.phase==='delivery')return `第${round.stopIndex}站已送达，点击“继续投递”前往下一站。`;
    if(round.emergency)return round.emergency;
    if(coaching)return `教练示范 · 正在${actionNames[round.action]}，观察同一个电机的能量流向。`;
    if(round.v<.2&&round.x>2){const config=REGEN_ROUTES[route];return Math.abs(round.x-config.stops[round.stopIndex].x)<=config.tolerance?'已进入交付区，保持制动，停稳后自动收货。':'停早了也没关系，选择“行驶”低速靠站。';}
    const next=suggestedAction(round);return next==='hard'?'接近站点，及时加大制动，安全停车优先。':next==='light'?'可以轻刹了：观察动能减少、能量流回电池。':next==='coast'?'试试滑行，利用已有速度靠近站点。':'前方还有一段路，行驶时电池向电机供能。';
  }
  function updateUI(){
    const config=REGEN_ROUTES[route],target=config.stops[Math.min(round.stopIndex,config.stops.length-1)];
    const put=(s:string,t:string)=>q(s).textContent=t;
    put('[data-mission]',config.goal);put('[data-speed]',`${(round.v*3.6).toFixed(0)} km/h`);put('[data-kinetic]',`${kj(kinetic(round.v))} kJ`);put('[data-recovered]',`${kj(round.recovered)} kJ`);put('[data-distance]',round.phase==='complete'?'已送达':`${Math.max(0,target.x-round.x).toFixed(0)} m`);
    put('[data-deliveries]',`投递 ${round.deliveries.length} / ${config.stops.length}`);put('[data-status]',statusText());
    put('[data-start]',round.phase==='delivery'?'继续投递 →':['complete','failed'].includes(round.phase)?'再出发 →':'出发，送快递 →');
    q<HTMLButtonElement>('[data-start]').disabled=round.phase==='running';q<HTMLButtonElement>('[data-pause]').disabled=!['running','delivery'].includes(round.phase);put('[data-pause]',round.paused?'继续驾驶':'暂停');q('[data-retry]').hidden=round.phase!=='failed';q('[data-results-link]').hidden=!currentAttempt;
    q<HTMLInputElement>('[data-handle]').value=String(ACTIONS.indexOf(round.action));q<HTMLInputElement>('[data-handle]').disabled=round.phase!=='running'||round.paused;
    for(const button of host.querySelectorAll<HTMLButtonElement>('[data-control]')){button.setAttribute('aria-pressed',String(button.dataset.control===round.action));button.disabled=round.phase!=='running'||round.paused;}
    put('[data-pace]',`限速 ${(config.speedLimit*3.6).toFixed(0)} km/h · 剩余 ${Math.max(0,Math.ceil(config.timeLimit-round.tick*DT))} s`);q('[data-pace]').classList.toggle('regen-speed-warning',round.v>config.speedLimit);
    host.querySelectorAll<HTMLElement>('[data-route]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.route)===route)));
    for(let r=0;r<3;r++)put(`[data-best="${r}"]`,starText(bestStars[`${r}-${mode}`]||0));
    const regen=round.power>.5,drive=round.drivePower>.5,full=acceptance(round)<MODES[mode].power*.95;
    put('[data-live-state]',round.paused?'暂停，读数冻结':round.phase==='ready'?'等待出发':round.phase!=='running'?'本趟终值':regen?'正在回收':drive?'正在供能':'滑行 / 停车');
    put('[data-flow-title]',regen?'车轮带动电机发电':drive?'电池供电，电机驱动车轮':round.frictionPower>1?'摩擦制动正在帮忙停车':'同一个电机，两种工作方式');
    put('[data-mobile-flow]',regen?'动能回收：车轮 → 电机发电 → 电池':drive?'行驶供能：电池 → 电机驱动 → 车轮':round.frictionPower>1?'摩擦制动：运动能量 → 刹车盘摩擦 → 热':'滑行不主动回收，轻刹时观察电机发电');
    host.querySelectorAll<HTMLElement>('[data-flow-arrow]').forEach(el=>el.textContent=regen?'→':drive?'←':'·');
    put('[data-wheel-copy]',regen?'车轮经传动系统带动电机':drive?'电机带动车轮转动':'小车运动时具有动能');put('[data-motor-copy]',regen?'发电模式 · 点我':drive?'驱动模式 · 点我':'点我看转化原理');put('[data-battery-copy]',regen?mode==='cold'?'低温限制接收':full?'接近满电，少量接收':'电能存为化学能':full?'接近满电，接收受限':drive?'为下一段提供能量':'等待接收或供能');
    put('[data-flow-copy]',regen?'运动中的小车带动电机发电，部分能量回到电池。发电产生的制动力帮助控速。':drive?'电池能量经电机转为机械能；回收到电池里的能量也能用于下一次出发。':round.brake>.1?(full?'电池接收能力受限；摩擦制动仍能安全停车。':'接近停止时回收变弱，摩擦制动补足。'):'本教学车型的滑行档不主动回收。车轮仍在转，不代表一定在充电。');
    put('[data-heat-copy]',`运动能量 → 刹车盘摩擦 → 热 ${kj(round.frictionPower)} kW`);put('[data-power]',`${kj(round.power)} kW`);put('[data-soc]',`${soc(round).toFixed(3)}%`);
    const gravity=MASS*GRAVITY*(terrainAt(config,0).height-terrainAt(config,round.x).height),total=round.drawn+gravity,values=[kinetic(round.v),round.recovered,round.friction,round.losses];
    put('[data-source-energy]',`输入 ${kj(total)} kJ`);q('[data-ledger]').innerHTML=values.map((v,i)=>`<i class="${['kinetic','recovered','heat','loss'][i]}" style="width:${total>0?Math.max(0,v/total*100):0}%"></i>`).join('');
    ['kinetic','recovered','heat','loss'].forEach((key,i)=>put(`[data-account-${key}]`,`${kj(values[i])} kJ`));
    put('[data-height]',route===0?`输入来自电池 ${kj(round.drawn)} kJ；输出四项相加守恒。`:`电池输入 ${kj(round.drawn)} kJ + 高度下降提供 ${kj(gravity)} kJ。匀速下坡也可回收，动能不必一直减少。`);
    put('[data-finding-saved]',finding?`我的发现：${finding}`:'完成一次实际对照，就能把自己的能量发现带走。');
    put('[data-rules]',`本任务：初始电量 ${MODES[mode].soc}% · ${MODES[mode].temp}°C，限速 ${(config.speedLimit*3.6).toFixed(0)} km/h，时限 ${config.timeLimit} s；平稳阈值 0.28 rad，节能目标净耗电 ≤ ${kj(referenceEnergy(route,mode))} kJ。均为教学参数。`);
    Object.assign(host.dataset,{phase:round.phase,running:String(round.phase==='running'&&!round.paused),paused:String(round.paused),x:round.x.toFixed(4),speed:round.v.toFixed(4),time:(round.tick*DT).toFixed(3),action:round.action,recovered:round.recovered.toFixed(4),drawn:round.drawn.toFixed(4),friction:round.friction.toFixed(4),losses:round.losses.toFixed(4),energyError:energyError(round).toFixed(6),assisted:String(round.assisted),deliveries:String(round.deliveries.length),mode,route:String(route)});
  }
  function finish(){
    if(finishedId===id)return;finishedId=id;markExperience();currentAttempt=makeAttempt(round,`${Date.now()}-${id}`);attempts=[...attempts,currentAttempt].slice(-6);
    if(currentAttempt.stars>0){bestStars[`${route}-${mode}`]=Math.max(bestStars[`${route}-${mode}`]||0,currentAttempt.stars);if(route===0){manualBest[mode]=Math.max(manualBest[mode]||0,round.deliveries[0]?.precision||0);api.award('regen','parking-skill',modeIds.reduce((n,m)=>n+(manualBest[m]||0),0)/3*25,'手动停车技巧');}}
    persist();q('[data-result]').hidden=false;q('[data-result-title]').textContent=round.phase==='complete'?`${REGEN_ROUTES[route].cargo}送到啦！`:'这次能量已记录，再调整一次';q('[data-result-stars]').textContent=starText(currentAttempt.stars);
    q('[data-result-copy]').textContent=`${round.assisted?'教练示范 · ':round.practice?'片段练习 · ':''}${round.deliveries.length} 个站点送达，回到电池 ${kj(round.recovered)} kJ。${currentAttempt.stars===0?'体验积分保留，独立安全完成后可取得挑战星。':`送达 ✓ · ${round.maxSway<=.28?'货物平稳 ✓':'货物晃动较大'} · ${netEnergy(round)<=referenceEnergy(route,mode)?'净耗电达标 ✓':'可以再优化净耗电'}`}`;
    q('[data-receipt]').innerHTML=[['驱动及辅助用电',round.drawn],['回到电池',round.recovered],['整趟净耗电',netEnergy(round)]].map(([label,value])=>`<div><span>${label}</span><b>${kj(Number(value))} <small>kJ</small></b></div>`).join('');
    const prior=attempts.slice(0,-1).reverse().find(a=>comparable(a,currentAttempt!));
    q('[data-strategy-comparison]').textContent=prior?`与相同任务、相同电池初态的上一趟相比：净耗电${netEnergy(round)<prior.drawn-prior.recovered?'减少':'增加'} ${kj(Math.abs(netEnergy(round)-(prior.drawn-prior.recovered)))} kJ。各站停车位置相差不超过 1 m；两趟终点 ${prior.x.toFixed(1)} / ${round.x.toFixed(1)} m。`:'再独立安全完成相同任务、同电池条件，各站停车位置相差不超过 1 m 时，可比较整趟净耗电。回收量更多不一定更省电。';
    updateUI();const captureId=id;setTimeout(()=>{if(!disposed&&id===captureId&&finishedId===id)api.saveImage('regen',stage.capture());},120);if(route===0)showComparison('friction');
  }
  function showComparison(kind:'friction'|'battery'){
    const source=currentAttempt;if(!source)return;const states=kind==='friction'?[replayRegen(source,source.mode,true),replayRegen(source,source.mode,false)]:modeIds.map(m=>replayRegen(source,m,true));
    const firstRecovery=states[0].frames.find(f=>f.recovered>100)?.t||0;
    replay={source,states,time:Math.max(0,firstRecovery-.5),playing:!api.reducedMotion(),kind};q('[data-comparison]').hidden=false;q('[data-comparison-title]').textContent=kind==='friction'?'相同路线、相同操作，能量去向不同':'相同路线与操作，只改变起始电池条件';
    const config=REGEN_ROUTES[source.route],end=config.stops.at(-1)!.x+20;
    q('[data-replay-lanes]').innerHTML=states.map((_,i)=>`<div class="regen-replay-lane"><div><strong>${kind==='friction'?(i===0?'再生制动参与':'仅摩擦制动'):MODES[modeIds[i]].name}</strong><span data-replay-values="${i}"></span></div><div class="regen-replay-road"><span data-ghost="${i}">▰</span>${config.stops.map(stop=>`<i style="left:${stop.x/end*96}%" title="${stop.name}"></i>`).join('')}</div><div class="regen-replay-energy" data-replay-energy="${i}"></div></div>`).join('');
    const on=states[0],off=states[1];q('[data-comparison-copy]').textContent=kind==='friction'?`本次${source.assisted?'示范':'操作'}回收 ${kj(on.recovered)} kJ；仅摩擦制动回收 ${kj(off.recovered)} kJ。两车最终停在 ${on.x.toFixed(2)} / ${off.x.toFixed(2)} m。能量经电机回到电池，另有转换损耗；并不是全部摩擦热都能回收。`:`常温 / 低温 / 满电出发分别回收 ${states.map(s=>kj(s.recovered)).join(' / ')} kJ。满电先消耗出余量后，也可能恢复少量回收。制动需求相同，摩擦制动补足不同的部分。`;
    if(!seen.includes(source.mode))seen.push(source.mode);api.award('regen',`energy-view-${source.mode}`,5,`${MODES[source.mode].name}能量探索`);persist();renderReplay();
  }
  function renderReplay(){
    if(!replay)return;const duration=replay.source.ticks*DT;q<HTMLInputElement>('[data-replay]').value=String(Math.round(replay.time/duration*1000));q('[data-replay-play]').textContent=replay.playing?'暂停重放':'播放重放';
    replay.states.forEach((s,i)=>{const f=s.frames.find(f=>f.t>=replay!.time)||s.frames.at(-1);if(!f)return;q(`[data-replay-values="${i}"]`).textContent=`${f.t.toFixed(1)} s · 回收 ${kj(f.recovered)} kJ · 摩擦热 ${kj(f.friction)} kJ`;q(`[data-ghost="${i}"]`).style.left=`${Math.min(96,f.x/(REGEN_ROUTES[s.route].stops.at(-1)!.x+20)*96)}%`;
      const total=f.drawn+MASS*GRAVITY*(terrainAt(REGEN_ROUTES[s.route],0).height-f.height),values=[kinetic(f.v),f.recovered,f.friction,f.losses];q(`[data-replay-energy="${i}"]`).innerHTML=values.map((v,j)=>`<i class="${['kinetic','recovered','heat','loss'][j]}" style="width:${total>0?Math.max(0,v/total*100):0}%"></i>`).join('');});
  }
  const stage=createStage(q('.regen-stage'),{width:1000,height:410,label:'回能快递员：车辆、货物、站点和实时能量流',
    update(dt){if(document.hidden)return;if(replay?.playing){replay.time=Math.min(replay.source.ticks*DT,replay.time+dt*2);if(replay.time>=replay.source.ticks*DT)replay.playing=false;renderReplay();}
      if(round.phase==='delivery'&&coaching&&!round.paused){deliveryAge+=dt;if(deliveryAge>1.2)depart();}
      if(round.phase==='running'&&!round.paused){accumulator+=dt;while(accumulator>=DT){if(coaching&&round.tick%12===0)setRegenAction(round,suggestedAction(round));stepRegen(round);accumulator-=DT;const phase=round.phase as RegenState['phase'];if(phase==='delivery'){markExperience();deliveryAge=0;persist('进行中：已送达一站，等待继续投递。');accumulator=0;break;}if(phase==='complete'||phase==='failed'){finish();accumulator=0;break;}}}
      lastUI+=dt;if(lastUI>.09){updateUI();lastUI=0;}},draw(ctx,time){drawRegen(ctx,time,round,api);}});
  q('[data-start]').addEventListener('click',depart);q('[data-pause]').addEventListener('click',()=>{if(round.paused){round.paused=false;accumulator=0;updateUI();}else pause();});
  q('[data-results-link]').addEventListener('click',()=>q('[data-result]').scrollIntoView({behavior:api.reducedMotion()?'instant':'smooth',block:'start'}));
  host.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button=>button.addEventListener('click',()=>{temporaryBrake=false;act(button.dataset.control as RegenAction);}));
  q<HTMLInputElement>('[data-handle]').addEventListener('input',e=>act(ACTIONS[Number((e.target as HTMLInputElement).value)]));
  host.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(button=>button.addEventListener('click',()=>reset(Number(button.dataset.route))));q<HTMLSelectElement>('[data-battery]').addEventListener('change',e=>reset(route,(e.target as HTMLSelectElement).value as RegenMode));
  q('[data-restart]').addEventListener('click',()=>reset());q('[data-again]').addEventListener('click',()=>{reset();depart();});q('[data-next-task]').addEventListener('click',()=>reset((route+1)%3));
  q('[data-retry]').addEventListener('click',()=>{round=structuredClone(checkpoint);round.practice=true;round.assisted=false;round.phase='running';round.paused=false;id++;finishedId=-1;accumulator=0;replay=null;currentAttempt=null;temporaryBrake=false;coaching=false;q('[data-result]').hidden=true;q('[data-comparison]').hidden=true;persist('进行中：重试当前路段，保留前段能量账本。');updateUI();});
  q('[data-assist]').addEventListener('click',()=>{if(round.phase!=='running'){if(round.phase!=='delivery')reset();depart();}round.assisted=true;coaching=true;round.paused=false;api.notify('教练使用相同模型示范；本趟保留体验，不计手动星级。');updateUI();});
  q('[data-motor]').addEventListener('click',()=>{const detail=q('#regen-motor-explanation');detail.hidden=!detail.hidden;q('[data-motor]').setAttribute('aria-expanded',String(!detail.hidden));});
  q('[data-compare]').addEventListener('click',()=>showComparison('friction'));q('[data-compare-battery]').addEventListener('click',()=>showComparison('battery'));
  q('[data-replay-play]').addEventListener('click',()=>{if(!replay)return;if(replay.time>=replay.source.ticks*DT)replay.time=0;replay.playing=!replay.playing;renderReplay();});q<HTMLInputElement>('[data-replay]').addEventListener('input',e=>{if(!replay)return;replay.playing=false;replay.time=Number((e.target as HTMLInputElement).value)/1000*replay.source.ticks*DT;renderReplay();});
  q('[data-finding]').addEventListener('click',()=>{if(!replay)return;finding=q('[data-comparison-copy]').textContent||'';findingSource=`${REGEN_ROUTES[replay.source.route].name} · ${replay.source.id} · ${replay.kind==='friction'?'回收与摩擦对照':'三种电池对照'}`;persist();updateUI();api.notify('这次实际能量发现已写进作品报告。');});
  q('[data-save]').addEventListener('click',()=>{if(round.tick===0&&!currentAttempt){api.notify('先出发体验，再保存自己的作品。');return;}persist(round.phase==='running'||round.phase==='delivery'?`进行中：${REGEN_ROUTES[route].name}，当前回收 ${kj(round.recovered)} kJ，尚未完成本趟。`:undefined);api.saveImage('regen',stage.capture());api.notify('实际画面与能量记录已保存到我的作品。');});
  function keydown(e:KeyboardEvent){const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT','A','SUMMARY'].includes(target?.tagName)||round.phase!=='running'||round.paused)return;if(target?.tagName==='BUTTON'&&!host.contains(target))return;if(['Digit1','Digit2','Digit3','Digit4'].includes(e.code)){e.preventDefault();act(ACTIONS[Number(e.code.at(-1))-1]);}if(e.code==='Space'&&!e.repeat&&target?.tagName!=='BUTTON'){e.preventDefault();previousAction=round.action;temporaryBrake=true;act('hard');}}
  function keyup(e:KeyboardEvent){if(e.code==='Space'&&temporaryBrake){e.preventDefault();temporaryBrake=false;act(previousAction);}}
  const visibility=()=>{if(document.hidden){pause();if(replay)replay.playing=false;}},blur=()=>{pause();if(replay)replay.playing=false;};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);host.addEventListener('pointercancel',pause);updateUI();
  return {destroy(){disposed=true;if(round.phase==='running'||round.phase==='delivery')persist(`未完成：${REGEN_ROUTES[route].name}，离开时回收 ${kj(round.recovered)} kJ。`);round.paused=true;stage.destroy();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);host.removeEventListener('pointercancel',pause);}};
}
