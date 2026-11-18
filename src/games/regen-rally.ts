import { createStage } from '../platform';
import type { GameAPI, MountedGame } from '../types';
import { BOOST_CAP, RALLY_COURSES, RALLY_DT, createRally, changeRallyLane, stepRally, rallyReserve, rallyKinetic, rallyEnergyError, rallyStars, rallyNotice, type RallyBattery, type RallyState } from './regen-rally-model';
import { drawRally, rallyShell } from './regen-rally-view';
import './regen-rally.css';

export function mountRegenRally(host:HTMLElement,api:GameAPI):MountedGame {
  host.innerHTML=rallyShell();
  const q=<T extends HTMLElement=HTMLElement>(s:string)=>host.querySelector<T>(s)!;
  const record=api.getRecord('regen'),oldBest=record.rallyBest as Record<string,unknown>|undefined;
  const best:Record<string,{stars:number;score:number}>={};
  for(let i=0;i<3;i++){const raw=oldBest?.[String(i)] as {stars?:unknown;score?:unknown}|undefined;best[i]={stars:Math.max(0,Math.min(3,Number(raw?.stars)||0)),score:Math.max(0,Math.min(10000,Number(raw?.score)||0))};}
  let course=0,battery:RallyBattery='normal',seed=Date.now()>>>0,round=createRally(course,seed,battery),accumulator=0,uiAge=0,finished=false,disposed=false;
  const held=new Set<string>();let latchedBrake=false,pointerWorld=false,playedBoost=false;
  let stage:ReturnType<typeof createStage>,small=window.innerWidth<=600;
  function controls(){
    round.action=[...held].some(k=>k.endsWith('brake'))?'brake':latchedBrake||[...held].some(k=>k.endsWith('regen'))?'regen':'drive';
    round.boosting=round.action==='drive'&&[...held].some(k=>k.endsWith('boost'))&&rallyReserve(round)>10;
  }
  function release(){held.clear();latchedBrake=false;pointerWorld=false;playedBoost=false;round.action='drive';round.boosting=false;}
  function report(status?:string){
    const config=RALLY_COURSES[course],stars=rallyStars(round),done=round.phase==='complete';
    api.record('regen',{rallyBest:best,rallyLast:{course,battery,seed,phase:round.phase,score:round.score,stars,deliveries:round.deliveries,perfect:round.perfect,hits:round.hits,bestCombo:round.bestCombo,drawn:round.drawn,recovered:round.recovered,boostSpent:round.boostSpent,time:round.tick*RALLY_DT},
      summary:status||`${config.name}：${done?'已完成':'进行中'}，送达 ${round.deliveries}/${config.gates.length} 站，${round.score} 分，回收 ${(round.recovered/1000).toFixed(1)} kJ。`,
      report:[{label:'我的挑战',value:`霓虹回能快递 · ${config.name} · ${battery==='normal'?'常温':battery==='cold'?'低温':'满电'}电池`},
        {label:'完成情况',value:`${done?'本趟完成':round.phase==='failed'?'本趟超时':'本趟尚未完成'} · 送达 ${round.deliveries}/${config.gates.length} 站 · 完美 ${round.perfect} 次 · 最高连击 ×${round.bestCombo}`},
        {label:'本趟得分与星级',value:`${round.score} 分 · ${'★'.repeat(stars)}${'☆'.repeat(3-stars)} · 擦碰 ${round.hits} 次`},
        {label:'我改了什么',value:'左右换道躲路障，提前轻刹送达，用回收储备进行冲刺'},
        {label:'出现了什么变化',value:`实际用电 ${(round.drawn/1000).toFixed(1)} kJ，回到电池 ${(round.recovered/1000).toFixed(1)} kJ，净耗电 ${((round.drawn-round.recovered)/1000).toFixed(1)} kJ；额外冲刺用电 ${(round.boostSpent/1000).toFixed(1)} kJ`},
        {label:'我懂了什么',value:'刹车能把一部分运动能量送回电池，之后可以再次驱动；回收和冲刺都有损耗，反复加速刹车不会凭空增电。徽章只增加游戏分数。'},
        {label:'模型边界',value:'1300 kg、45 kWh教学车型；封闭游戏场景。电机转换、电池接收、路阻和摩擦均计入能量账本。'}]});
  }
  function pause(){if(round.phase!=='running')return;round.paused=true;release();accumulator=0;updateUI();}
  function resume(){if(round.phase!=='running')return;round.paused=false;release();accumulator=0;updateUI();}
  function reset(nextCourse=course,nextBattery=battery){course=nextCourse;battery=nextBattery;seed=(seed+7919)>>>0;round=createRally(course,seed,battery);release();accumulator=0;finished=false;q('[data-rally-result]').hidden=true;q<HTMLSelectElement>('[data-rally-battery]').value=battery;updateUI();}
  function start(){if(round.phase!=='ready')reset();round.phase='running';release();api.playCue?.('start');report();updateUI();q<HTMLButtonElement>('[data-rally-start]').blur();if(window.innerWidth<=600)q('.rally-stage').scrollIntoView({block:'start',behavior:'instant'});}
  function finish(){if(finished)return;finished=true;release();const stars=rallyStars(round);best[course]={stars:Math.max(best[course].stars,stars),score:Math.max(best[course].score,round.score)};
    api.award('regen',`rally-drive-${course}`,20,'快递挑战体验');api.complete('regen');if(round.deliveries>0)api.award('regen',`rally-delivery-${course}`,10,'快递送达');if(round.recovered>1000)api.award('regen','rally-recovery',10,'动能回收发现');report();
    q('[data-rally-result]').hidden=false;q('[data-rally-result-title]').textContent=round.phase==='failed'?'时间到了，再跑一趟！':stars===3?'王牌快递员，收工！':round.deliveries===0?'终点到了，下一趟试试提前轻刹':'快递收工，来点更漂亮的！';q('[data-rally-stars]').textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
    q('[data-rally-result-numbers]').innerHTML=[['本趟得分',round.score],['送达站点',`${round.deliveries}/${RALLY_COURSES[course].gates.length}`],['最高连击',`×${round.bestCombo}`],['回到电池',`${(round.recovered/1000).toFixed(1)} kJ`]].map(([title,value])=>`<div><span>${title}</span><b>${value}</b></div>`).join('');
    q('[data-rally-result-copy]').textContent=`${round.perfect} 次完美送达，${round.hits} 次路障擦碰。额外冲刺消耗 ${(round.boostSpent/1000).toFixed(1)} kJ；${round.boostSpent>0?'这部分冲刺额度来自你自己的刹车回收。':'下一趟试试先轻刹回收，再按住 Shift 冲刺。'} 送达过半得一星，全部送达再得一星，零擦碰并至少两次完美送达获得第三星。`;
    const captureRound=round;setTimeout(()=>{if(!disposed&&round===captureRound)api.saveImage('regen',stage.capture());},150);updateUI();
  }
  function updateUI(){
    const config=RALLY_COURSES[course],put=(s:string,t:string)=>q(s).textContent=t,reserve=rallyReserve(round),running=round.phase==='running'&&!round.paused;
    put('[data-rally-speed]',String(Math.round(round.v*3.6)));put('[data-rally-score]',String(round.score).padStart(4,'0'));put('[data-rally-combo]',round.combo>1?`连击 ×${round.combo}`:round.combo===1?'送达 +1':'左右换道，稳稳送达');put('[data-rally-deliveries]',`${round.deliveries} / ${config.gates.length}`);
    put('[data-rally-reserve]',`${(reserve/1000).toFixed(1)} kJ`);q('[data-rally-charge]').style.width=`${reserve/BOOST_CAP*100}%`;
    put('[data-rally-boost-copy]',reserve<1000?'轻刹攒能量，按住冲刺':round.boosting?'储备正在用于冲刺':`回能就绪 · Shift / 按住冲刺`);
    put('[data-rally-flow]',round.power>100?`车轮 → 电机 → 电池 · 回收 ${(round.power/1000).toFixed(1)} kW`:round.action==='brake'?'急刹控速 · 摩擦制动补足，安全优先':round.drivePower>100?round.boosting?'回收后的电能 → 电机 → 冲刺':'电池 → 电机 → 车轮':'低速 / 暂停 · 回收会逐渐减弱');
    put('[data-rally-course-copy]',config.copy);put('[data-rally-time]',`${Math.round(Math.min(100,round.x/config.length*100))}% 路程 · 剩余 ${Math.max(0,Math.ceil(config.limit-round.tick*RALLY_DT))} s`);q('[data-rally-progress]').style.width=`${Math.min(100,round.x/config.length*100)}%`;
    const gate=round.events.find(e=>e.kind==='gate'&&!e.resolved),distance=gate?Math.max(0,gate.x-round.x):0;
    put('[data-rally-objective]',gate?`${gate.name} · ${['左','中间','右'][gate.lane]}车道 · ${Math.ceil(distance)} m`:'全部站点经过 · 驶向终点');
    put('[data-rally-target]',gate&&distance<85?round.v>11.2?'现在轻刹！40 km/h 以下送达':round.v>=4&&round.v<=9?'完美速度！对准绿色投递门':'稳住车速，松刹可继续前进':'提前换道 · 看清橙色路障');
    q('.rally-objective').classList.toggle('is-urgent',!!gate&&distance<65&&round.v>11.2);
    q('[data-rally-intro]').hidden=round.phase!=='ready';q('[data-rally-paused]').hidden=!round.paused;q<HTMLButtonElement>('[data-rally-pause]').disabled=round.phase!=='running';put('[data-rally-pause]',round.paused?'▶ 继续':'Ⅱ 暂停');
    q('[data-rally-ended]').hidden=round.phase!=='complete'&&round.phase!=='failed';put('[data-rally-end-title]',round.phase==='failed'?'再给自己一次机会':'快递送到，漂亮收工！');put('[data-rally-end-stars]','★'.repeat(rallyStars(round))+'☆'.repeat(3-rallyStars(round)));put('[data-rally-end-score]',`${round.score} 分 · 送达 ${round.deliveries}/${config.gates.length} · 连击 ×${round.bestCombo}`);
    const showNotice=running&&round.tick*RALLY_DT<round.notice.until;q('[data-rally-callout]').hidden=!showNotice;put('[data-rally-notice]',round.notice.title);put('[data-rally-notice-copy]',round.notice.copy);q('[data-rally-callout]').dataset.tone=round.notice.tone;
    host.querySelectorAll<HTMLButtonElement>('[data-rally-course]').forEach(el=>{el.setAttribute('aria-pressed',String(Number(el.dataset.rallyCourse)===course));});
    for(let i=0;i<3;i++)put(`[data-rally-best="${i}"]`,'★'.repeat(best[i].stars)+'☆'.repeat(3-best[i].stars));
    host.querySelectorAll<HTMLButtonElement>('[data-rally-hold]').forEach(el=>{const active=el.dataset.rallyHold==='boost'?round.boosting:round.action===el.dataset.rallyHold;el.classList.toggle('is-held',active);el.setAttribute('aria-pressed',String(active));});
    q('[data-rally-ledger]').innerHTML=[['实际用电',round.drawn],['回到电池',round.recovered],['额外冲刺用电',round.boostSpent],['还在运动',rallyKinetic(round)],['摩擦与擦碰热',round.friction],['转换与路阻损耗',round.losses]].map(([name,n])=>`<div><span>${name}</span><b>${(Number(n)/1000).toFixed(1)} kJ</b></div>`).join('');
    put('[data-rally-science-copy]',`本趟净耗电 ${((round.drawn-round.recovered)/1000).toFixed(1)} kJ。${battery==='cold'?'低温电池接收功率较低，更多制动能量转为摩擦热。':battery==='full'?'满电先消耗出余量，才逐渐恢复少量回收；刹车能力由摩擦制动补足。':'轻刹优先让电机发电，急刹所需制动力较大，摩擦制动会参与。'}`);
    Object.assign(host.dataset,{mode:'rally',phase:round.phase,paused:String(round.paused),x:round.x.toFixed(4),speed:round.v.toFixed(4),time:(round.tick*RALLY_DT).toFixed(4),lane:round.lane.toFixed(4),targetLane:String(round.targetLane),nextBarrierLane:String(round.events.find(e=>e.kind==='barrier'&&!e.resolved)?.lane??-1),action:round.action,boosting:String(round.boosting),recovered:round.recovered.toFixed(4),drawn:round.drawn.toFixed(4),boostSpent:round.boostSpent.toFixed(4),reserve:reserve.toFixed(4),energyError:rallyEnergyError(round).toFixed(6),deliveries:String(round.deliveries),hits:String(round.hits),course:String(course),battery});
  }
  function makeStage(){const width=small?700:1000,height=small?620:550;stage=createStage(q('.rally-stage'),{width,height,label:'霓虹回能快递：三车道夜城、施工路障、快递徽章与绿色投递门',
    update(dt){if(document.hidden)return;if(round.phase==='running'&&!round.paused){accumulator+=dt;while(accumulator>=RALLY_DT){const deliveries=round.deliveries,hits=round.hits;controls();if(round.boosting&&!playedBoost)api.playCue?.('boost');playedBoost=round.boosting;stepRally(round);if(round.deliveries>deliveries)api.playCue?.('reward');if(round.hits>hits)api.playCue?.('hit');accumulator-=RALLY_DT;if(round.phase!=='running'){finish();accumulator=0;break;}}}uiAge+=dt;if(uiAge>.08){updateUI();uiAge=0;}},
    draw(ctx,time){ctx.fillStyle='#0c0b25';ctx.fillRect(0,0,width,height);ctx.save();ctx.translate((width-1000)/2,height-550);drawRally(ctx,time,round,api);ctx.restore();},
    pointer(kind,x){if(round.phase!=='running'||round.paused)return;if(kind==='down')pointerWorld=true;if(kind==='up'){pointerWorld=false;return;}if(pointerWorld)round.targetLane=Math.max(0,Math.min(2,Math.round((x-width/2)/235+1)));}});}
  makeStage();
  q('[data-rally-start]').addEventListener('click',start);q('[data-rally-pause]').addEventListener('click',()=>round.paused?resume():pause());q('[data-rally-resume]').addEventListener('click',resume);
  q('[data-rally-show-result]').addEventListener('click',()=>q('[data-rally-result]').scrollIntoView({block:'center',behavior:api.reducedMotion()?'instant':'smooth'}));
  q('[data-rally-left]').addEventListener('click',()=>{changeRallyLane(round,-1);updateUI();});q('[data-rally-right]').addEventListener('click',()=>{changeRallyLane(round,1);updateUI();});
  host.querySelectorAll<HTMLButtonElement>('[data-rally-hold]').forEach(button=>{
    const name=button.dataset.rallyHold!;
    button.addEventListener('pointerdown',e=>{if(!running()||e.button!==0)return;button.setPointerCapture(e.pointerId);held.add(`pointer-${name}`);if(name==='boost'&&rallyReserve(round)<1000)rallyNotice(round,'先轻刹，收回一份能量','冲刺额度来自本趟实际回收。');controls();updateUI();e.preventDefault();});
    const end=()=>{held.delete(`pointer-${name}`);controls();updateUI();};button.addEventListener('pointerup',end);button.addEventListener('lostpointercapture',end);button.addEventListener('pointercancel',end);
    button.addEventListener('click',e=>{if(e.detail!==0||!running())return;if(name==='regen'){latchedBrake=!latchedBrake;controls();updateUI();}});
  });
  function running(){return round.phase==='running'&&!round.paused;}
  function keydown(e:KeyboardEvent){const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','SELECT','SUMMARY'].includes(target?.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;
    if(e.code==='KeyP'||e.code==='Escape'){if(round.phase==='running'){e.preventDefault();round.paused?resume():pause();}return;}if(!running())return;
    if(['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)){e.preventDefault();if(!e.repeat)changeRallyLane(round,['ArrowLeft','KeyA'].includes(e.code)?-1:1);}
    const action=['Space','ArrowDown','KeyS'].includes(e.code)?'regen':['ShiftLeft','ShiftRight'].includes(e.code)?'boost':e.code==='KeyB'?'brake':null;
    if(action){e.preventDefault();held.add(`${e.code}-${action}`);controls();}updateUI();}
  function keyup(e:KeyboardEvent){for(const key of [...held])if(key.startsWith(`${e.code}-`)){held.delete(key);e.preventDefault();}controls();updateUI();}
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',pause);
  const visibility=()=>{if(document.hidden)pause();};document.addEventListener('visibilitychange',visibility);
  const resize=()=>{const next=window.innerWidth<=600;if(next!==small){small=next;stage.destroy();makeStage();}};window.addEventListener('resize',resize);
  host.addEventListener('pointercancel',pause);
  host.querySelectorAll<HTMLButtonElement>('[data-rally-course]').forEach(button=>button.addEventListener('click',()=>reset(Number(button.dataset.rallyCourse))));q<HTMLSelectElement>('[data-rally-battery]').addEventListener('change',e=>reset(course,(e.target as HTMLSelectElement).value as RallyBattery));
  q('[data-rally-restart]').addEventListener('click',()=>{reset();start();});q('[data-rally-again]').addEventListener('click',()=>{reset();start();q('.rally-stage').scrollIntoView({block:'start',behavior:'instant'});});q('[data-rally-next]').addEventListener('click',()=>{reset((course+1)%3);q('.rally-stage').scrollIntoView({block:'start',behavior:'instant'});});
  function save(){if(round.tick===0){api.notify('先跑一段，再保存你的快递作品。');return;}report();api.saveImage('regen',stage.capture());api.notify('本趟得分、送达与真实能量记录已保存。');}
  q('[data-rally-save]').addEventListener('click',save);q('[data-rally-result-save]').addEventListener('click',save);updateUI();
  return {destroy(){disposed=true;if(round.phase==='running'&&round.tick>0)report(`尚未完成：${RALLY_COURSES[course].name}，送达 ${round.deliveries} 站，回收 ${(round.recovered/1000).toFixed(1)} kJ。`);release();stage.destroy();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',pause);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);host.removeEventListener('pointercancel',pause);}};
}
