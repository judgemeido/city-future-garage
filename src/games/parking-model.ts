export interface Point { x:number; y:number }
export interface Pose extends Point { angle:number }
export interface Rect extends Point { w:number; h:number }
export interface ParkingScene { name:string; start:Pose; bay:Rect; obstacles:Rect[]; reverse:boolean; parallel:boolean; handle:Point }
export const CAR_LENGTH=88, CAR_WIDTH=52, WHEELBASE=45, MAX_STEER=.72;
export const PARKING_SCENES: ParkingScene[] = [
  {name:'宽敞直入',start:{x:160,y:340,angle:0},bay:{x:800,y:340,w:144,h:88},obstacles:[{x:470,y:160,w:100,h:70},{x:480,y:425,w:95,h:55}],reverse:false,parallel:false,handle:{x:480,y:300}},
  {name:'倒车入库',start:{x:830,y:350,angle:0},bay:{x:350,y:210,w:144,h:88},obstacles:[{x:620,y:120,w:100,h:60},{x:600,y:420,w:100,h:58}],reverse:true,parallel:false,handle:{x:590,y:270}},
  {name:'路边侧方',start:{x:170,y:210,angle:0},bay:{x:650,y:350,w:146,h:88},obstacles:[{x:470,y:350,w:110,h:60},{x:850,y:350,w:95,h:60}],reverse:false,parallel:true,handle:{x:785,y:276}}
];
export interface RouteSample extends Pose { s:number; gear:1|-1; curvature:number }
export interface ParkingRoute { samples:RouteSample[]; length:number; valid:boolean; reason:string; conflict:Point|null; maxCurvature:number }
const normalize=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
export function carCorners(pose:Pose):Point[] { const c=Math.cos(pose.angle),s=Math.sin(pose.angle);return [[-44,-26],[44,-26],[44,26],[-44,26]].map(([x,y])=>({x:pose.x+x*c-y*s,y:pose.y+x*s+y*c})); }
export function collides(pose:Pose,rect:Rect):boolean {
  const a=carCorners(pose),b=[{x:rect.x-rect.w/2,y:rect.y-rect.h/2},{x:rect.x+rect.w/2,y:rect.y-rect.h/2},{x:rect.x+rect.w/2,y:rect.y+rect.h/2},{x:rect.x-rect.w/2,y:rect.y+rect.h/2}];
  const axes=[{x:1,y:0},{x:0,y:1},{x:Math.cos(pose.angle),y:Math.sin(pose.angle)},{x:-Math.sin(pose.angle),y:Math.cos(pose.angle)}];
  return axes.every(axis=>{const pa=a.map(p=>p.x*axis.x+p.y*axis.y),pb=b.map(p=>p.x*axis.x+p.y*axis.y);return Math.max(...pa)>Math.min(...pb)&&Math.max(...pb)>Math.min(...pa);});
}
export function collision(pose:Pose,scene:ParkingScene):boolean {return carCorners(pose).some(p=>p.x<45||p.x>965||p.y<80||p.y>475)||scene.obstacles.some(o=>collides(pose,o));}
export function isParked(pose:Pose,scene:ParkingScene,speed=0):boolean {return Math.abs(speed)<.01&&Math.abs(normalize(pose.angle))<.12&&carCorners(pose).every(p=>Math.abs(p.x-scene.bay.x)<=scene.bay.w/2&&Math.abs(p.y-scene.bay.y)<=scene.bay.h/2);}
export function integrateBicycle(pose:Pose,speed:number,steer:number,dt:number):Pose {
  const delta=Math.max(-MAX_STEER,Math.min(MAX_STEER,steer));const yaw=speed*Math.tan(delta)/WHEELBASE;
  return {x:pose.x+speed*Math.cos(pose.angle+yaw*dt/2)*dt,y:pose.y+speed*Math.sin(pose.angle+yaw*dt/2)*dt,angle:normalize(pose.angle+yaw*dt)};
}
export function planRoute(scene:ParkingScene,handle:Point):ParkingRoute {
  const samples:RouteSample[]=[];let length=0,maxCurvature=0;
  function segment(a:Point,b:Point,gear:1|-1,midY:number) {
    const dx=b.x-a.x,dy=b.y-a.y,amplitude=midY-(a.y+b.y)/2;
    const count=Math.ceil(Math.hypot(dx,dy)/2);
    for(let i=0;i<=count;i++){
      const t=i/count,sy=3*t*t-2*t*t*t;
      const y=a.y+dy*sy+amplitude*Math.sin(Math.PI*t)**2;
      const first=dy*(6*t-6*t*t)+amplitude*Math.PI*Math.sin(2*Math.PI*t);
      const second=dy*(6-12*t)+amplitude*2*Math.PI*Math.PI*Math.cos(2*Math.PI*t);
      const curvature=dx*second/(dx*dx+first*first)**1.5;
      const pose={x:a.x+dx*t,y,angle:normalize(Math.atan2(first,dx)+(gear<0?Math.PI:0))};
      const prev=samples.at(-1);if(prev)length+=Math.hypot(pose.x-prev.x,pose.y-prev.y);
      maxCurvature=Math.max(maxCurvature,Math.abs(curvature));samples.push({...pose,s:length,gear,curvature:curvature*gear});
    }
  }
  if(scene.parallel){segment(scene.start,{x:920,y:210},1,210);segment({x:920,y:210},scene.bay,-1,handle.y);}
  else segment(scene.start,scene.bay,scene.reverse?-1:1,handle.y);
  const hit=samples.find(p=>collision(p,scene));
  const tight=samples.find(p=>Math.abs(p.curvature)>Math.tan(MAX_STEER)/WHEELBASE);
  return {samples,length,valid:!hit&&!tight,reason:hit?'车身包络会碰到障碍或场地边缘，请把光轨拖远一点。':tight?'转弯太急，小车的转向能力不够，请把光轨拉平一点。':'路线可行，按住泊车试一试。',conflict:hit||tight||null,maxCurvature};
}
export function routePose(route:ParkingRoute,distance:number):RouteSample {
  const ss=route.samples;let lo=0,hi=ss.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(ss[mid].s<distance)lo=mid+1;else hi=mid;}
  const b=ss[lo],a=ss[Math.max(0,lo-1)],t=b.s===a.s?1:Math.max(0,Math.min(1,(distance-a.s)/(b.s-a.s)));
  return {...b,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:normalize(a.angle+normalize(b.angle-a.angle)*t)};
}
export function nearestObstacle(pose:Pose,scene:ParkingScene):number {return Math.min(...scene.obstacles.map(o=>Math.max(0,Math.hypot(pose.x-o.x,pose.y-o.y)-Math.hypot(o.w,o.h)/2-CAR_LENGTH/2)));}
