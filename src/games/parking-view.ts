import { drawPremiumTopCar } from '../car-art';
import { label, roundRect } from '../platform';
import { carCenter, carCorners, rectCorners, localPoint, integrateBicycle, nearestContact, BOUNDS, type Pose, type Point, type Frame, type ParkingLevel, type ParkingRun } from './parking-model.ts';
import type { Echo } from './parking-science.ts';
export interface ParkingView { level:ParkingLevel; actual:Pose; observed:Frame; preview:Frame[]; history:Frame[]; run:ParkingRun|null; planning:boolean; selected:number; handles:{end:Point;bend:Point}|null; footprint:boolean; science:number; echo:Echo|null; echoAge:number; compare:boolean; color:string; body:string; reduced:boolean; }
const cyan='#56efe0',amber='#ffca78';
function line(ctx:CanvasRenderingContext2D,points:Point[],color:string,width=2,close=false){if(!points.length)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));if(close)ctx.closePath();ctx.stroke();}
function arrow(ctx:CanvasRenderingContext2D,p:Pose,color:string,size=10){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);line(ctx,[{x:-size,y:-size*.6},{x:0,y:0},{x:-size,y:size*.6}],color,2);ctx.restore();}
export function drawParkingCar(ctx:CanvasRenderingContext2D,p:Pose,color:string,body:string,steer=0,ghost=false){
  const c=carCenter(p);ctx.save();ctx.translate(c.x,c.y);ctx.rotate(p.angle);ctx.globalAlpha=ghost?.35:1;
  if(!ghost){ctx.shadowColor=color+'50';ctx.shadowBlur=12;}roundRect(ctx,-40,-21,80,42,6,ghost?color+'18':'#0a1829',color);ctx.shadowBlur=0;
  ctx.save();ctx.scale(.82,.70);drawPremiumTopCar(ctx,0,0,color,1,body);ctx.restore();
  for(const side of [-1,1]){ctx.save();ctx.translate(30,side*17);ctx.rotate(steer);roundRect(ctx,-8,-3,16,6,2,'#061320',ghost?color:'#edf7fc');ctx.restore();}
  line(ctx,[{x:25,y:-7},{x:33,y:0},{x:25,y:7}],'#f6ffff',2);ctx.restore();
}
export function drawParking(ctx:CanvasRenderingContext2D,v:ParkingView){
  ctx.fillStyle='#0a1627';ctx.fillRect(0,0,1000,560);
  const bg=ctx.createLinearGradient(0,0,1000,560);bg.addColorStop(0,'#132940');bg.addColorStop(1,'#162034');
  roundRect(ctx,BOUNDS.left,BOUNDS.top,BOUNDS.right-BOUNDS.left,BOUNDS.bottom-BOUNDS.top,14,bg as unknown as string,'#3a5367');
  ctx.save();ctx.globalAlpha=.3;for(let x=60;x<970;x+=40)line(ctx,[{x,y:48},{x,y:518}],'#486277',.5);for(let y=80;y<510;y+=40)line(ctx,[{x:28,y},{x:972,y}],'#486277',.5);ctx.restore();
  label(ctx,'P / '+v.level.name+(v.level.challenge?' · 挑战':' · 标准'),30,28,14,cyan,700);
  label(ctx,'俯视教学场地 · 前轮转向模型',748,28,12,'#88a8bc');
  ctx.setLineDash([15,14]);line(ctx,[{x:58,y:260},{x:v.level.theme===2?350:927,y:260}],'#65809766',2);ctx.setLineDash([]);
  arrow(ctx,{x:120,y:190,angle:0},'#b2cbda66',18);label(ctx,'起点',v.level.start.x-28,v.level.start.y-43,13,'#8fb4c8');
  for(const o of v.level.obstacles){
    if(o.kind==='car'){
      roundRect(ctx,o.x-o.w/2-8,o.y-o.h/2-8,o.w+16,o.h+16,5,'#24364b','#65768a');
      ctx.save();ctx.translate(o.x,o.y);if(o.h>o.w)ctx.rotate(Math.PI/2);ctx.scale(Math.max(o.w,o.h)/96,Math.min(o.w,o.h)/58);drawPremiumTopCar(ctx,0,0,'#8091a9',1,'touring');ctx.restore();
    }else{
      roundRect(ctx,o.x-o.w/2,o.y-o.h/2,o.w,o.h,5,o.kind==='pillar'?'#725a4b':'#253e48',o.kind==='pillar'?amber:'#63827d');
      if(o.kind==='pillar'){line(ctx,[{x:o.x-o.w/2+3,y:o.y+o.h/2-3},{x:o.x+o.w/2-3,y:o.y-o.h/2+3}],amber,4);}else for(let x=o.x-o.w/2+12;x<o.x+o.w/2-6;x+=22){ctx.fillStyle='#446861';ctx.beginPath();ctx.arc(x,o.y,6,0,7);ctx.fill();}
    }
  }
  const bay=v.level.bay;ctx.save();ctx.translate(bay.x,bay.y);ctx.rotate(bay.angle||0);
  roundRect(ctx,-bay.w/2,-bay.h/2,bay.w,bay.h,4,'#56efe00a',cyan);
  roundRect(ctx,-9,-7,18,14,2,'#56efe035',cyan);label(ctx,'P',-10,6,18,cyan,700);arrow(ctx,{x:bay.w/2-6,y:0,angle:0},cyan,10);
  for(const x of [-1,1])for(const y of [-1,1])line(ctx,[{x:x*(bay.w/2-14),y:y*bay.h/2},{x:x*bay.w/2,y:y*bay.h/2},{x:x*bay.w/2,y:y*(bay.h/2-14)}],cyan,4);ctx.restore();
  label(ctx,'车头按箭头对齐 · 小框为精停中心',Math.max(40,bay.x-100),Math.min(501,bay.y+86),12,'#8ecccb');
  if(v.history.length){ctx.setLineDash([5,7]);line(ctx,v.history,'#bba6ed66',2);ctx.setLineDash([]);}
  const track=v.planning?v.preview:v.run?.trace||[];
  if(v.footprint)for(let i=0;i<track.length;i+=Math.max(1,Math.floor(track.length/22))){ctx.save();ctx.globalAlpha=.12;const corners=carCorners(track[i]);ctx.fillStyle=cyan;ctx.beginPath();corners.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.restore();}
  for(let i=1;i<track.length;i++){const p=track[i];line(ctx,[track[i-1],p],p.gear===1?cyan:amber,p.segment===v.selected?3.5:2);}
  for(let i=20;i<track.length;i+=35){const p=track[i];arrow(ctx,{...p,angle:p.angle+(p.gear<0?Math.PI:0)},p.gear===1?cyan:amber,8);}
  if(v.preview.length&&v.planning){const end=v.preview.at(-1)!;drawParkingCar(ctx,end,cyan,v.body,end.steer,true);}
  if(v.compare){for(const gear of [1,-1]){const points=[];for(let d=0;d<=65;d+=3)points.push(integrateBicycle(v.observed,gear*d,v.observed.steer||.35,1));line(ctx,points,gear===1?cyan:amber,3);drawParkingCar(ctx,points.at(-1)!,gear===1?cyan:amber,v.body,v.observed.steer||.35,true);}}
  drawParkingCar(ctx,v.actual,v.color,v.body,v.run?.steer||0);
  if(Math.hypot(v.observed.x-v.actual.x,v.observed.y-v.actual.y)>2||Math.abs(v.observed.angle-v.actual.angle)>.03)drawParkingCar(ctx,v.observed,'#c4b5ff',v.body,v.observed.steer,true);
  if(v.science===1){const near=nearestContact(v.observed,v.level);line(ctx,carCorners(v.observed),amber,2,true);line(ctx,[near.carPoint,near.point],amber,2);ctx.fillStyle=amber;ctx.beginPath();ctx.arc(near.carPoint.x,near.carPoint.y,5,0,7);ctx.fill();}
  if(v.echo){const e=v.echo,dir=v.observed.angle+(e.sensor==='rear'?Math.PI:0);ctx.save();ctx.fillStyle='#56efe012';ctx.beginPath();ctx.moveTo(e.origin.x,e.origin.y);ctx.arc(e.origin.x,e.origin.y,240,dir-.28,dir+.28);ctx.closePath();ctx.fill();ctx.restore();
    if(e.hit){ctx.setLineDash([6,5]);line(ctx,[e.origin,e.hit],cyan,2);ctx.setLineDash([]);const duration=Math.max(.4,(e.milliseconds||0)*.06),t=v.reduced?1:Math.min(1,v.echoAge/duration),part=t<.5?t*2:(1-t)*2;const p={x:e.origin.x+(e.hit.x-e.origin.x)*part,y:e.origin.y+(e.hit.y-e.origin.y)*part};ctx.fillStyle='#f7fff9';ctx.beginPath();ctx.arc(p.x,p.y,6,0,7);ctx.fill();label(ctx,'回波慢放',e.origin.x-26,e.origin.y-31,12,cyan);}
  }
  if(v.run?.contact){const p=v.run.contact.point;ctx.strokeStyle='#ff927f';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,16,0,7);ctx.stroke();line(ctx,[{x:p.x-7,y:p.y-7},{x:p.x+7,y:p.y+7}],'#ff927f',3);line(ctx,[{x:p.x-7,y:p.y+7},{x:p.x+7,y:p.y-7}],'#ff927f',3);}
  if(v.planning&&v.handles){for(const [name,p,color] of [['拖弯点',v.handles.bend,amber],['停止点',v.handles.end,cyan]] as const){ctx.fillStyle='#0c1c2d';ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,13,0,7);ctx.fill();ctx.stroke();label(ctx,name,p.x-22,p.y-23,13,color,600);} }
  label(ctx,'实线箭头 前进',34,546,12,cyan);label(ctx,'反向箭头 倒车',169,546,12,amber);label(ctx,'紫色车：当前观察位置',310,546,12,'#b9ace4');
}
