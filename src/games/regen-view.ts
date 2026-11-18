import { nightBackdrop } from '../theme';
import { drawCar, label, roundRect } from '../platform';
import type { GameAPI } from '../types';
import { ACTIONS, MODES, type RegenAction, type RegenState } from './regen-model';
import { REGEN_ROUTES, terrainAt } from './regen-route';
export const actionNames:Record<RegenAction,string>={drive:'行驶',coast:'滑行',light:'轻刹',hard:'重刹'};
export const modeIds=Object.keys(MODES) as (keyof typeof MODES)[];
export const kj=(n:number)=>(n/1000).toFixed(1);
export const starText=(n:number)=>'★'.repeat(n)+'☆'.repeat(3-n);
export function regenShell(){return `<div class="regen-lab">
  <div class="regen-taskbar"><div class="regen-routes" role="group" aria-label="快递任务">${REGEN_ROUTES.map((r,i)=>`<button data-route="${i}" aria-pressed="${i===0}"><span>0${i+1}</span>${r.name}<small data-best="${i}">☆☆☆</small></button>`).join('')}</div><label class="regen-battery-label">起始电池<select data-battery aria-label="选择起始电池">${modeIds.map(m=>`<option value="${m}">${MODES[m].name} · ${MODES[m].temp}°C</option>`).join('')}</select></label></div>
  <div class="regen-mission"><span>动能回收挑战</span><p data-mission></p></div>
  <div class="regen-workbench"><section class="regen-drive"><div class="regen-stage"></div>
    <div class="regen-metrics"><div><span>当前速度</span><b data-speed></b></div><div><span>运动中的能量</span><b data-kinetic></b></div><div><span>已回到电池</span><b data-recovered></b></div><div><span>下一站</span><b data-distance></b></div></div>
    <div class="regen-driving-controls"><div class="regen-start-row"><button class="btn btn-primary" data-start>出发，送快递 →</button><button class="btn" data-pause disabled>暂停</button><span data-deliveries></span></div><div class="regen-pace" data-pace></div><div class="regen-mobile-flow" data-mobile-flow></div>
      <div class="regen-handle" role="group" aria-label="驾驶手柄">${ACTIONS.map((a,i)=>`<button data-control="${a}" aria-pressed="${a==='coast'}"><small>${i+1}</small><strong>${actionNames[a]}</strong><span>${['电池供能','利用已有速度','优先回收','及时停住'][i]}</span></button>`).join('')}</div>
      <input data-handle type="range" min="0" max="3" step="1" value="1" aria-label="拖动驾驶手柄：行驶、滑行、轻刹、重刹">
      <p class="regen-status" data-status role="status"></p><button class="btn btn-primary regen-results-link" data-results-link hidden>查看本趟能量对照 ↓</button><div class="regen-minor-actions"><button data-assist>看教练示范</button><button data-restart>重开本趟</button><button data-retry hidden>重试这一段</button><button data-save>保存作品</button><span>1–4 切档 · 空格临时重刹</span></div>
    </div></section>
    <aside class="regen-science" aria-label="能量透视舱"><div class="regen-science-head"><span>能量透视舱</span><small data-live-state></small></div><h2 data-flow-title></h2>
      <div class="regen-machine"><div class="regen-part"><div class="regen-wheel" aria-hidden="true"></div><strong>车轮</strong><small data-wheel-copy></small></div><span class="regen-arrow" data-flow-arrow>·</span><button class="regen-part regen-motor" data-motor aria-expanded="false" aria-controls="regen-motor-explanation"><div aria-hidden="true">M</div><strong>同一个电机</strong><small data-motor-copy></small></button><span class="regen-arrow" data-flow-arrow>·</span><div class="regen-part"><div class="regen-battery-art" aria-hidden="true"><i></i><i></i><i></i></div><strong>电池</strong><small data-battery-copy></small></div></div>
      <p class="regen-motor-explanation" id="regen-motor-explanation" hidden>行驶时，电池经功率电子装置给电机供电，电机带动车轮。再生制动时，车轮经传动系统带动电机发电，电能经功率电子装置进入电池，以化学能储存。改变的是能量流向，车轮和电机不需要反向旋转。</p>
      <p class="regen-flow-explanation" data-flow-copy></p><div class="regen-friction" data-heat-copy></div>
      <div class="regen-power"><div><span>回收功率</span><b data-power></b></div><div><span>电池电量</span><b data-soc></b></div></div>
      <div class="regen-ledger-title"><strong>这趟能量去了哪里</strong><span data-source-energy></span></div><div class="regen-ledger" data-ledger aria-label="能量分配"></div>
      <div class="regen-ledger-keys">${[['kinetic','还在运动'],['recovered','回到电池'],['heat','摩擦热'],['loss','其他损耗']].map(([k,n])=>`<span><i class="${k}"></i>${n}<b data-account-${k}></b></span>`).join('')}</div><p class="regen-height" data-height></p>
      <details class="regen-knowledge"><summary>为什么不能全部收回来？</summary><p>电机与电池有功率上限，转换也有损耗。重刹、低温或接近满电时，摩擦制动会补足需求。低速时回收逐渐减弱。需要及时停车时，放心使用重刹。</p><p>本教学车型“滑行”不主动回收。kW表示回收快慢，kJ表示累计能量；真实车型的松电门行为可能不同。</p><p>动能 = ½ × 质量 × 速度²。教学车辆固定1300 kg，45 kWh电池。一次停车对电池百分比的改变很小。</p></details>
    </aside></div>
  <section class="regen-result" data-result hidden aria-label="本趟投递结果"><div class="regen-result-head"><div><span class="regen-overline">这次停车，留下了一份能量</span><h2 data-result-title></h2></div><b class="regen-stars" data-result-stars></b></div><p data-result-copy></p><div class="regen-receipt" data-receipt></div><p data-strategy-comparison></p>
    <div class="regen-result-actions"><button class="btn btn-primary" data-compare>同一次操作：回收 / 摩擦对照</button><button class="btn" data-compare-battery>换电池重放我的操作</button><button class="btn" data-again>相同条件再来一趟</button><button class="btn" data-next-task>下一项任务 →</button></div>
    <div class="regen-comparison" data-comparison hidden><div class="regen-comparison-head"><strong data-comparison-title></strong><button class="btn btn-small" data-replay-play>播放重放</button></div><input data-replay type="range" min="0" max="1000" value="0" aria-label="同步重放时间"><div class="regen-replay-legend">${[['kinetic','还在运动'],['recovered','回到电池'],['heat','摩擦热'],['loss','其他损耗']].map(([key,name])=>`<span><i class="${key}"></i>${name}</span>`).join('')}</div><div class="regen-replay-lanes" data-replay-lanes></div><p data-comparison-copy></p><button class="btn btn-small" data-finding>记录这次能量发现</button></div>
  </section><details class="regen-rules"><summary>挑战星级与我的发现</summary><p data-rules></p><p>三关都可直接进入。送达星：独立安全送达；平稳星：货物晃动不超过阈值；节能星：同任务、同电池初态下净耗电达标。回收量不直接换技巧分，教练示范与片段重试保留体验收益。</p><p data-finding-saved></p></details>
</div>`;}

export function drawRegen(ctx:CanvasRenderingContext2D,time:number,s:RegenState,api:GameAPI){
  const config=REGEN_ROUTES[s.route],camera=Math.max(0,s.x-47),scale=5.6,map=(x:number)=>100+(x-camera)*scale,ground=(x:number)=>292-terrainAt(config,x).height*7;
  nightBackdrop(ctx,1000,410,true);ctx.fillStyle='#af96ed22';ctx.beginPath();ctx.arc(852,62,32,0,Math.PI*2);ctx.fill();
  for(let i=0;i<12;i++){const x=i*99-(camera*.4)%99,h=30+(i*31)%66;roundRect(ctx,x,192-h,72,h+70,3,i%2?'#1a3047':'#152940');ctx.fillStyle='#56aabc55';for(let n=0;n<3;n++)ctx.fillRect(x+10+n*17,206-h,6,9);}
  ctx.beginPath();ctx.moveTo(0,ground(camera-18));for(let px=0;px<=1000;px+=10)ctx.lineTo(px,ground(camera+(px-100)/scale));ctx.lineTo(1000,410);ctx.lineTo(0,410);ctx.closePath();ctx.fillStyle='#223b48';ctx.fill();
  ctx.strokeStyle='#74c3c76b';ctx.lineWidth=2;ctx.beginPath();for(let px=0;px<=1000;px+=10){const y=ground(camera+(px-100)/scale);if(px===0)ctx.moveTo(px,y);else ctx.lineTo(px,y);}ctx.stroke();
  for(let x=Math.floor(camera/10)*10;x<camera+170;x+=10){ctx.fillStyle='#91bacb61';ctx.fillRect(map(x),ground(x)+29,23,3);}
  config.stops.forEach((stop,i)=>{const x=map(stop.x),y=ground(stop.x);if(x<-100||x>1100)return;const done=i<s.stopIndex;ctx.fillStyle=done?'#75f1bb28':'#75f1bb45';ctx.fillRect(map(stop.x-config.tolerance),y,2*config.tolerance*scale,45);ctx.fillStyle='#a1f6cd';ctx.fillRect(x-2,y+3,4,31);roundRect(ctx,x-44,y-111,98,31,5,done?'#224e42':'#193b42','#79bcad');label(ctx,`${done?'✓ ':''}${stop.name}`,x-34,y-90,15,'#d6f9e9');ctx.fillStyle='#75b9ad';ctx.fillRect(x+2,y-80,3,80);
    if(done){roundRect(ctx,x+48,y-50,24,29,7,'#cfb1e9');ctx.fillStyle='#dce3ed';ctx.beginPath();ctx.arc(x+60,y-60,12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#cfb1e9';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+52,y-39);ctx.lineTo(x+35,y-58+(api.reducedMotion()?0:Math.sin(time*5)*4));ctx.stroke();}});
  const carX=map(s.x),carY=ground(s.x)-23,slope=terrainAt(config,s.x).slope;
  ctx.save();ctx.translate(carX,carY);ctx.rotate(Math.atan(-slope*7/scale));const vehicle=api.getVehicle();drawCar(ctx,0,0,vehicle.color,.68,s.x/.31,vehicle.body);
  ctx.save();ctx.translate(-10,-33);ctx.rotate(api.reducedMotion()?0:s.cargo);
  if(s.route===0){roundRect(ctx,-22,-35,43,34,6,'#ae95ca50','#b9ace0');roundRect(ctx,-14,-24,28,22,6,'#f3c478');roundRect(ctx,-12,-26,24,8,4,'#ad775b');ctx.fillStyle='#6d473e';ctx.fillRect(-7,-15,3,3);ctx.fillRect(5,-15,3,3);}
  else if(s.route===1){roundRect(ctx,-15,-17,30,18,4,'#ac8065');ctx.strokeStyle='#8ef0b1';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-17);ctx.quadraticCurveTo(4,-30,0,-45);ctx.stroke();ctx.fillStyle='#8ef0b1';ctx.beginPath();ctx.ellipse(-8,-31,11,5,.4,0,Math.PI*2);ctx.ellipse(9,-40,10,5,-.5,0,Math.PI*2);ctx.fill();}
  else for(let i=0;i<3-s.deliveries.length;i++){roundRect(ctx,-31+i*22,-24,20,24,3,i%2?'#bc98df':'#e0b780');ctx.fillStyle='#eed9b5';ctx.fillRect(-24+i*22,-24,5,24);}
  ctx.restore();roundRect(ctx,38,-50,26,20,7,'#a8d9e3');ctx.fillStyle='#1d394b';ctx.fillRect(43,-43,4,4);ctx.fillRect(55,-43,4,4);
  if(Math.abs(s.cargo)>.18){ctx.strokeStyle='#a8d9e3';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(39,-33);ctx.lineTo(28,-43);ctx.stroke();}
  const regen=s.power>1,drive=s.drivePower>1,moving=s.phase==='running'&&!s.paused;
  if(regen||drive){roundRect(ctx,-48,-15,94,18,4,'#112e35cf','#7ee5b5');roundRect(ctx,-12,-11,28,10,2,'#6ebfaa');ctx.strokeStyle='#9cf4c8';ctx.lineWidth=2;ctx.setLineDash([4,6]);ctx.lineDashOffset=api.reducedMotion()||!moving?0:(regen?-1:1)*time*30;ctx.beginPath();ctx.moveTo(-38,-3);ctx.lineTo(24,-3);ctx.stroke();ctx.setLineDash([]);label(ctx,regen?'电机发电 → 电池':'电池 → 电机驱动',-73,-103,14,'#b6f8d9');}
  if(s.frictionPower>50){ctx.strokeStyle='#f4bb77';ctx.lineWidth=3;ctx.beginPath();ctx.arc(42,8,16,Math.PI,Math.PI*1.9);ctx.stroke();}
  ctx.fillStyle='#f6e4a1';ctx.beginPath();ctx.moveTo(-5,43);ctx.lineTo(5,43);ctx.lineTo(0,35);ctx.closePath();ctx.fill();ctx.restore();
  roundRect(ctx,22,19,270,52,9,'#101d30e8','#355369');label(ctx,`0${s.route+1} · ${config.name}`,36,42,17,'#e6f2fc',600);label(ctx,`${MODES[s.mode].name} · ${s.assisted?'教练示范':s.practice?'片段练习':'亲手投递'}`,36,61,12,'#a6c3d5');
  label(ctx,`货物${Math.abs(s.cargo)>.18?'在晃动，试着提前调整':'稳稳的'} · 已投递 ${s.deliveries.length}/${config.stops.length}`,27,382,15,'#b4d9cc');
  if(s.route>0)label(ctx,`高度 ${terrainAt(config,s.x).height.toFixed(1)} m · 坡度图为教学示意`,590,382,13,'#b4cadb');
}
