import { drawPremiumTopCar } from '../car-art';
import { label, roundRect } from '../platform';
import { BOOST_CAP, RALLY_COURSES, RALLY_DT, rallyReserve, type RallyState } from './regen-rally-model';
import type { GameAPI } from '../types';

export function rallyShell(){return `<div class="regen-rally">
  <div class="rally-coursebar"><div class="rally-courses" role="group" aria-label="选择快递路线">${RALLY_COURSES.map((c,i)=>`<button data-rally-course="${i}" aria-pressed="${i===0}"><small>0${i+1}</small><span>${c.name}</span><b data-rally-best="${i}">☆☆☆</b></button>`).join('')}</div><label class="rally-battery">电池状态<select data-rally-battery aria-label="快递车电池状态"><option value="normal">常温 · 回收充足</option><option value="cold">低温 · 回收受限</option><option value="full">满电 · 余量很少</option></select></label></div>
  <div class="rally-game"><div class="rally-stage">
    <div class="rally-hud"><div class="rally-speed"><b data-rally-speed>0</b><span>km/h</span></div><div class="rally-score"><small>本趟得分</small><b data-rally-score>0000</b><span data-rally-combo>准备发车</span></div><div class="rally-deliveries"><small>送达</small><b data-rally-deliveries>0 / 4</b><button data-rally-pause disabled aria-label="暂停快递挑战">Ⅱ 暂停</button></div></div>
    <div class="rally-intro" data-rally-intro><span>REGEN RUN / 回能快递</span><h2>刹得漂亮，<br>冲得更远。</h2><p>躲路障 → 轻刹送达 → 回能冲刺</p><button data-rally-start>开始闪送 <span>↗</span></button><small>自动前进，第一站就在中间车道。</small></div>
    <div class="rally-pause-screen" data-rally-paused hidden><strong>休息一下</strong><p>时间与能量已暂停</p><button data-rally-resume>继续出发 →</button></div>
    <div class="rally-end-screen" data-rally-ended hidden><span>本趟收工</span><strong data-rally-end-title></strong><b data-rally-end-stars></b><p data-rally-end-score></p><button data-rally-show-result>查看我的战绩 ↓</button></div>
    <div class="rally-callout" data-rally-callout aria-live="polite"><b data-rally-notice></b><span data-rally-notice-copy></span></div>
    <div class="rally-objective"><span data-rally-objective>第一站 · 中间车道</span><b data-rally-target>提前轻刹，40 km/h 以下送达</b></div>
  </div>
  <div class="rally-dashboard"><div class="rally-energy"><div><span>回能储备 <small data-rally-reserve>0.0 kJ</small></span><b data-rally-boost-copy>轻刹攒能量，按住冲刺</b></div><div class="rally-charge-track"><i data-rally-charge></i></div><p data-rally-flow>行驶：电池 → 电机 → 车轮</p></div><div class="rally-road-progress"><span data-rally-course-copy></span><div><i data-rally-progress></i></div><small data-rally-time></small></div></div>
  <div class="rally-controls" aria-label="快递车驾驶控制"><div class="rally-steering"><button data-rally-left aria-label="向左换道">←<small>A / ←</small></button><button data-rally-right aria-label="向右换道">→<small>D / →</small></button></div><button class="rally-regen-button" data-rally-hold="regen"><b>轻刹回收</b><small>按住 · 空格 / ↓</small></button><button class="rally-boost-button" data-rally-hold="boost"><b>回能冲刺 ↗</b><small>按住 · Shift</small></button><button class="rally-brake-button" data-rally-hold="brake"><b>急刹</b><small>按住 · B</small></button></div>
  <div class="rally-footer"><p>绿色门：对应车道 + 40 km/h 以下。<strong>14–32 km/h 完美送达，连击奖励更高。</strong></p><button data-rally-restart>重新发车</button><button data-rally-save>保存作品</button></div>
  </div>
  <section class="rally-result" data-rally-result hidden aria-label="快递挑战结算"><div><span>SHIFT COMPLETE / 本趟收工</span><h2 data-rally-result-title></h2><b data-rally-stars></b></div><div class="rally-result-numbers" data-rally-result-numbers></div><p data-rally-result-copy></p><div class="rally-result-actions"><button data-rally-again>再来一趟 · 路况更新 ↗</button><button data-rally-next>下一条路线 →</button><button data-rally-result-save>保存这趟作品</button></div></section>
  <details class="rally-science"><summary>打开能量账本 <span>刹车时，到底回收了多少？</span></summary><div class="rally-ledger" data-rally-ledger></div><p data-rally-science-copy></p><p>快递徽章和连击只增加游戏分数。冲刺必须消耗电池能量，储备条展示本趟回收后尚未用于额外冲刺的额度（最多展示160 kJ）。反复加速、刹车会产生损耗，并不会凭空增加电量。</p><p>固定1300 kg、45 kWh教学车型；回收受电机、电池和低速衰减限制，急刹由摩擦制动补足。道路为封闭游戏场景，投递、限速与冲刺均为游戏规则。</p></details>
</div>`;}

export function drawRally(ctx:CanvasRenderingContext2D,time:number,s:RallyState,api:GameAPI){
  const course=RALLY_COURSES[s.course],now=s.tick*RALLY_DT,reduced=api.reducedMotion(),running=s.phase==='running'&&!s.paused;
  const boost=running&&s.boosting&&s.action==='drive'&&rallyReserve(s)>0,regen=s.power>100&&running;
  const sky=ctx.createLinearGradient(0,0,0,550);sky.addColorStop(0,'#0c0b25');sky.addColorStop(.35,'#202041');sky.addColorStop(1,'#0b1627');ctx.fillStyle=sky;ctx.fillRect(0,0,1000,550);
  ctx.fillStyle='#ded2fd';ctx.beginPath();ctx.arc(818,87,26,0,Math.PI*2);ctx.fill();ctx.fillStyle='#292745';ctx.beginPath();ctx.arc(807,80,24,0,Math.PI*2);ctx.fill();
  const drift=reduced?0:s.x*.045;
  for(let i=-1;i<18;i++){const x=i*65-(drift%65),h=24+((i+22)*47)%88;roundRect(ctx,x,160-h,49,h+24,2,i%2?'#16263b':'#19253c');for(let row=0;row<h/12;row++)for(let col=0;col<3;col++){ctx.fillStyle=(i+row+col)%3===0?'#e396bd60':'#5be0d83b';ctx.fillRect(x+7+col*12,166-h+row*12,4,5);}}
  ctx.fillStyle='#bd9add28';ctx.fillRect(0,158,1000,2);
  const center=(d:number)=>500+Math.sin((s.x+d)/160)*28;
  const project=(d:number,lane=1)=>{const p=1/(1+Math.max(-6,d)/45),half=45+315*p;return {x:center(d)+(lane-1)*half*2/3,y:82+380*p,half,p};};
  ctx.beginPath();const far=project(500),near=project(-6);ctx.moveTo(far.x-far.half,far.y);ctx.lineTo(far.x+far.half,far.y);ctx.lineTo(near.x+near.half,near.y);ctx.lineTo(near.x-near.half,near.y);ctx.closePath();const road=ctx.createLinearGradient(0,120,0,550);road.addColorStop(0,'#202b46');road.addColorStop(1,'#1e2b3d');ctx.fillStyle=road;ctx.fill();
  for(const edge of [-1,1]){ctx.beginPath();for(let d=500;d>=-6;d-=6){const a=project(d);ctx.lineTo(a.x+edge*a.half,a.y);}ctx.strokeStyle=regen?'#72ffc6':boost?'#ba9bff':'#5ec8d091';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();for(let d=500;d>=-6;d-=6){const a=project(d);ctx.lineTo(a.x+edge*(a.half+15*a.p),a.y);}ctx.strokeStyle='#c091ca55';ctx.lineWidth=2;ctx.stroke();}
  for(let world=Math.floor(s.x/14)*14;world<s.x+380;world+=14){const d=world-s.x,a=project(d),b=project(d+6);for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(a.x+side*a.half/3,a.y);ctx.lineTo(b.x+side*b.half/3,b.y);ctx.strokeStyle='#a8cdd650';ctx.lineWidth=Math.max(1,3*a.p);ctx.stroke();}}
  // Street furniture scales and passes with the road, keeping the horizon quiet.
  for(let world=Math.floor(s.x/55)*55;world<s.x+350;world+=55){const d=world-s.x;if(d<-5)continue;const a=project(d);for(const side of [-1,1]){const x=a.x+side*(a.half+34*a.p),h=115*a.p;ctx.strokeStyle='#7595b5';ctx.lineWidth=Math.max(1,3*a.p);ctx.beginPath();ctx.moveTo(x,a.y);ctx.lineTo(x,a.y-h);ctx.lineTo(x-side*22*a.p,a.y-h);ctx.stroke();ctx.fillStyle='#b2ffe360';ctx.beginPath();ctx.ellipse(x-side*22*a.p,a.y-h+3,10*a.p,4*a.p,0,0,Math.PI*2);ctx.fill();}}
  const visible=s.events.filter(e=>!e.resolved&&e.x-s.x>-8&&e.x-s.x<300).reverse();
  for(const event of visible){const a=project(event.x-s.x,event.lane),w=85*a.p;
    if(event.kind==='gate'){
      const laneWidth=a.half*2/3;
      ctx.fillStyle='#65f5ca25';ctx.beginPath();ctx.moveTo(a.x-laneWidth*.43,a.y);ctx.lineTo(a.x+laneWidth*.43,a.y);const b=project(event.x-s.x+22,event.lane);ctx.lineTo(b.x+laneWidth*.35,b.y);ctx.lineTo(b.x-laneWidth*.35,b.y);ctx.closePath();ctx.fill();
      ctx.strokeStyle=course.color;ctx.lineWidth=4*a.p;ctx.beginPath();ctx.moveTo(a.x-w*.62,a.y);ctx.lineTo(a.x-w*.62,a.y-100*a.p);ctx.lineTo(a.x+w*.62,a.y-100*a.p);ctx.lineTo(a.x+w*.62,a.y);ctx.stroke();
      roundRect(ctx,a.x-w*.76,a.y-125*a.p,w*1.52,32*a.p,4*a.p,'#173e43',course.color);
      ctx.textAlign='center';label(ctx,`${event.name} · ≤40`,a.x,a.y-104*a.p,Math.max(10,15*a.p),course.color,700);ctx.textAlign='left';
      for(let j=0;j<5;j++){ctx.fillStyle=j%2?'#75f9cb':'#cffff0';ctx.fillRect(a.x-w*.62+j*w*.25,a.y-3*a.p,w*.15,5*a.p);}
    }else if(event.kind==='barrier'){
      roundRect(ctx,a.x-w*.44,a.y-31*a.p,w*.88,29*a.p,4*a.p,'#9b523d','#ffc58b');ctx.save();ctx.beginPath();ctx.rect(a.x-w*.4,a.y-27*a.p,w*.8,22*a.p);ctx.clip();ctx.strokeStyle='#ffbe79';ctx.lineWidth=8*a.p;for(let j=-2;j<5;j++){ctx.beginPath();ctx.moveTo(a.x-w*.4+j*23*a.p,a.y);ctx.lineTo(a.x-w*.4+(j+1)*23*a.p,a.y-31*a.p);ctx.stroke();}ctx.restore();
      ctx.fillStyle='#ffd38e';ctx.beginPath();ctx.arc(a.x-w*.31,a.y-35*a.p,3*a.p,0,Math.PI*2);ctx.arc(a.x+w*.31,a.y-35*a.p,3*a.p,0,Math.PI*2);ctx.fill();
    }else{
      const bob=reduced?0:Math.sin(time*4+event.id)*2*a.p;ctx.save();ctx.translate(a.x,a.y-13*a.p+bob);ctx.rotate(Math.PI/4);roundRect(ctx,-10*a.p,-10*a.p,20*a.p,20*a.p,3*a.p,'#f4c879','#ffedbb');ctx.restore();ctx.fillStyle='#765222';ctx.fillRect(a.x-3*a.p,a.y-16*a.p+bob,6*a.p,6*a.p);
    }
  }
  const player=project(0,s.lane),vehicle=api.getVehicle();
  ctx.fillStyle='#040b1b80';ctx.beginPath();ctx.ellipse(player.x,player.y+6,33,16,0,0,Math.PI*2);ctx.fill();
  if(boost||regen){const color=boost?'#b694ff':'#79ffd0';ctx.strokeStyle=color;ctx.lineWidth=2;for(let i=0;i<4;i++){const phase=reduced?i*.25:(time*1.8+i*.25)%1;ctx.globalAlpha=1-phase;ctx.beginPath();ctx.ellipse(player.x,player.y+12+phase*22,24+phase*25,8+phase*10,0,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;}
  if(boost&&!reduced){ctx.fillStyle='#aa88ff66';for(let i=0;i<7;i++){const x=player.x-20+i*7;ctx.fillRect(x,player.y+15,2,28+Math.sin(time*20+i)*10);}}
  ctx.save();ctx.translate(player.x,player.y-16);ctx.rotate(-Math.PI/2+(reduced?0:(s.targetLane-s.lane)*.1));if(now<s.invulnerableUntil&&!reduced)ctx.globalAlpha=.55+.45*Math.sin(time*30)**2;drawPremiumTopCar(ctx,0,0,vehicle.color,1.1,vehicle.body);ctx.restore();
  // Sleek cyber courier cargo pod mounted neatly on the rear glass deck.
  roundRect(ctx,player.x-10,player.y-9,20,16,4,'#1b2f47','#75f1bb');ctx.fillStyle='#f5bc65';ctx.fillRect(player.x-6,player.y-5,12,8);ctx.fillStyle='#ffe8b8';ctx.fillRect(player.x-1.5,player.y-5,3,8);
  if(regen){ctx.textAlign='center';label(ctx,`回收 +${(s.power/1000).toFixed(1)} kW`,player.x,player.y-82,18,'#b7ffe1',700);ctx.textAlign='left';}
  if(boost){ctx.textAlign='center';label(ctx,'回能冲刺',player.x,player.y-82,18,'#dfd2ff',700);ctx.textAlign='left';}
  if(s.phase==='ready'){ctx.fillStyle='#08102430';ctx.fillRect(0,0,1000,550);}
  // Always-visible reserve follows the physical ledger; no cosmetic charge is generated.
  if(regen&&rallyReserve(s)>=BOOST_CAP*.99){ctx.textAlign='center';label(ctx,'回能储备已满 · 松开刹车，Shift 冲刺',500,535,14,'#b7ffe1');ctx.textAlign='left';}
}
