// Positions refer to the rear axle. Rendering, geometry and sensing use the same transform.
export interface Point { x:number; y:number }
export interface Pose extends Point { angle:number }
export interface Rect extends Point { w:number; h:number; angle?:number; name?:string; kind?:'car'|'wall'|'pillar' }
export interface Command { gear:1|-1; distance:number; steer:number }
export interface ParkingLevel { id:string; theme:number; challenge:boolean; name:string; question:string; hint:string; start:Pose; bay:Rect; obstacles:Rect[]; reference:Command[]; maxShifts:number; maxDistance:number }
export interface Frame extends Pose { s:number; steer:number; gear:1|-1; segment:number }
export interface Contact { point:Point; carPoint:Point; name:string; corner:string; gap:number }
export interface ParkingRun { pose:Pose; commands:Command[]; segment:number; segmentDistance:number; distance:number; steer:number; gear:1|-1; shifts:number; corrections:number; assisted:boolean; status:'moving'|'collision'|'ended'; contact:Contact|null; trace:Frame[]; tick:number; delay:number; accumulator:number; minGap:number }
export const RULE_VERSION=2, CAR_LENGTH=80, CAR_WIDTH=42, WHEELBASE=48, CENTER_OFFSET=18, MAX_STEER=.65, STEP=1/120, SPEED=100, SCALE=20, MAX_SEGMENTS=6;
export const BOUNDS={left:28,right:972,top:46,bottom:518};
export const normalize=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function localPoint(p:Pose,x:number,y:number):Point {return {x:p.x+x*Math.cos(p.angle)-y*Math.sin(p.angle),y:p.y+x*Math.sin(p.angle)+y*Math.cos(p.angle)};}
export function carCenter(p:Pose):Point{return localPoint(p,CENTER_OFFSET,0);}
export function rectCorners(r:Rect):Point[]{return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>localPoint({...r,angle:r.angle||0},x*r.w/2,y*r.h/2));}
export function carCorners(p:Pose):Point[]{return rectCorners({...carCenter(p),angle:p.angle,w:CAR_LENGTH,h:CAR_WIDTH});}
export function polygonsTouch(a:Point[],b:Point[]):boolean {
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],axis={x:-(q.y-p.y),y:q.x-p.x};
    const aa=a.map(v=>v.x*axis.x+v.y*axis.y),bb=b.map(v=>v.x*axis.x+v.y*axis.y);
    if(Math.max(...aa)<Math.min(...bb)-1e-7||Math.max(...bb)<Math.min(...aa)-1e-7)return false;
  }return true;
}
export function collides(p:Pose,r:Rect):boolean{return polygonsTouch(carCorners(p),rectCorners(r));}
export function closestOnSegment(p:Point,a:Point,b:Point):Point {const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return {x:a.x+dx*t,y:a.y+dy*t};}
export function nearestContact(p:Pose,level:Pick<ParkingLevel,'obstacles'>):Contact {
  const corners=carCorners(p),names=['左后角','左前角','右前角','右后角'];
  let best:Contact={point:{x:0,y:0},carPoint:corners[0],name:'场地边界',corner:names[0],gap:Infinity};
  const consider=(a:Point,b:Point,name:string,index:number,gap=Math.hypot(a.x-b.x,a.y-b.y))=>{if(gap<best.gap)best={point:b,carPoint:a,name,corner:names[index],gap};};
  corners.forEach((c,i)=>{for(const b of [{x:BOUNDS.left,y:c.y},{x:BOUNDS.right,y:c.y},{x:c.x,y:BOUNDS.top},{x:c.x,y:BOUNDS.bottom}])consider(c,b,'场地边界',i);});
  for(const o of level.obstacles){const oc=rectCorners(o),touch=polygonsTouch(corners,oc);
    corners.forEach((c,i)=>oc.forEach((v,j)=>consider(c,closestOnSegment(c,v,oc[(j+1)%4]),o.name||'障碍',i)));
    oc.forEach(v=>corners.forEach((c,i)=>{const q=closestOnSegment(v,c,corners[(i+1)%4]);consider(q,v,o.name||'障碍',i);}));
    if(touch&&best.name===o.name)best.gap=0;
  }return best;
}
export function collision(p:Pose,level:Pick<ParkingLevel,'obstacles'>):boolean{return carCorners(p).some(c=>c.x<=BOUNDS.left||c.x>=BOUNDS.right||c.y<=BOUNDS.top||c.y>=BOUNDS.bottom)||level.obstacles.some(o=>collides(p,o));}
export function parkingQuality(p:Pose,level:Pick<ParkingLevel,'bay'>,speed=0){
  const b=level.bay,a=b.angle||0,center=carCenter(p),toLocal=(q:Point)=>({x:(q.x-b.x)*Math.cos(a)+(q.y-b.y)*Math.sin(a),y:-(q.x-b.x)*Math.sin(a)+(q.y-b.y)*Math.cos(a)}),c=toLocal(center);
  const heading=Math.abs(normalize(p.angle-a)),inside=carCorners(p).every(q=>{const t=toLocal(q);return Math.abs(t.x)<=b.w/2&&Math.abs(t.y)<=b.h/2;});
  const parked=inside&&heading<=10*Math.PI/180&&Math.abs(speed)<.01;
  return {parked,inside,heading,offset:Math.hypot(c.x,c.y),precise:parked&&Math.abs(c.x)<=9&&Math.abs(c.y)<=7&&heading<=5*Math.PI/180};
}
export function isParked(p:Pose,l:Pick<ParkingLevel,'bay'>,speed=0){return parkingQuality(p,l,speed).parked;}
export function integrateBicycle(p:Pose,speed:number,steer:number,dt:number):Pose {
  const d=speed*dt,k=Math.tan(clamp(steer,-MAX_STEER,MAX_STEER))/WHEELBASE,a=p.angle+k*d;
  return Math.abs(k)<1e-10?{x:p.x+d*Math.cos(p.angle),y:p.y+d*Math.sin(p.angle),angle:p.angle}:{x:p.x+(Math.sin(a)-Math.sin(p.angle))/k,y:p.y+(-Math.cos(a)+Math.cos(p.angle))/k,angle:normalize(a)};
}
export function cleanCommand(c:Command):Command {return {gear:c.gear===-1?-1:1,distance:clamp(Number.isFinite(c.distance)?c.distance:80,12,600),steer:clamp(Number.isFinite(c.steer)?c.steer:0,-MAX_STEER,MAX_STEER)};}
export function frameOf(r:ParkingRun):Frame{return {...r.pose,s:r.distance,steer:r.steer,gear:r.gear,segment:r.segment};}
export function createRun(start:Pose,commands:Command[],assisted=false):ParkingRun {
  return {pose:{...start},commands:commands.slice(0,MAX_SEGMENTS).map(cleanCommand),segment:0,segmentDistance:0,distance:0,steer:0,gear:commands[0]?.gear||1,shifts:0,corrections:0,assisted,status:commands.length?'moving':'ended',contact:null,trace:[{...start,s:0,steer:0,gear:commands[0]?.gear||1,segment:0}],tick:0,delay:.18,accumulator:0,minGap:Infinity};
}
export function stepRun(r:ParkingRun,level:Pick<ParkingLevel,'obstacles'>,checkCollision=true){
  if(r.status!=='moving')return;
  const c=r.commands[r.segment];if(!c){r.status='ended';return;}
  // Wheels turn while stopped at segment boundaries. A change of gear always includes a stop.
  if(Math.abs(c.steer-r.steer)>1e-8){r.steer+=clamp(c.steer-r.steer,-1.8*STEP,1.8*STEP);return;}
  if(r.delay>0){r.delay-=STEP;return;}
  const d=Math.min(SPEED*STEP,c.distance-r.segmentDistance),next=integrateBicycle(r.pose,c.gear*d,r.steer,1);
  if(checkCollision&&collision(next,level)){
    let lo=0,hi=d;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(collision(integrateBicycle(r.pose,c.gear*mid,r.steer,1),level))hi=mid;else lo=mid;}
    const hit=integrateBicycle(r.pose,c.gear*hi,r.steer,1);r.contact=nearestContact(hit,level);r.contact.gap=0;
    r.pose=integrateBicycle(r.pose,c.gear*lo,r.steer,1);r.distance+=lo;r.segmentDistance+=lo;r.minGap=0;r.status='collision';r.trace.push(frameOf(r));return;
  }
  r.pose=next;r.distance+=d;r.segmentDistance+=d;r.tick++;
  if(checkCollision)r.minGap=Math.min(r.minGap,nearestContact(r.pose,level).gap);
  if(r.tick%4===0)r.trace.push(frameOf(r));
  if(r.segmentDistance>=c.distance-1e-7){
    r.trace.push(frameOf(r));r.segment++;r.segmentDistance=0;r.delay=.25;
    const nextCommand=r.commands[r.segment];
    if(!nextCommand){r.status='ended';}else{if(nextCommand.gear!==r.gear)r.shifts++;r.gear=nextCommand.gear;}
  }
}
export function advanceRun(r:ParkingRun,level:Pick<ParkingLevel,'obstacles'>,dt:number){r.accumulator+=clamp(dt,0,.1);while(r.accumulator>=STEP&&r.status==='moving'){r.accumulator-=STEP;stepRun(r,level);}if(r.status!=='moving')r.accumulator=0;}
export function continueRun(r:ParkingRun,commands:Command[]):boolean {
  if(r.status==='collision'||!commands.length)return false;
  const next=commands.slice(0,MAX_SEGMENTS).map(cleanCommand);if(r.distance>0&&next[0].gear!==r.gear)r.shifts++;
  r.commands=next;r.segment=0;r.segmentDistance=0;r.gear=next[0].gear;r.delay=.25;r.accumulator=0;r.corrections++;r.status='moving';return true;
}
export function simulate(start:Pose,commands:Command[],level:Pick<ParkingLevel,'obstacles'>={obstacles:[]},checkCollision=false){const r=createRun(start,commands);for(let i=0;i<60000&&r.status==='moving';i++)stepRun(r,level,checkCollision);return r;}
export function starsFor(r:ParkingRun,level:ParkingLevel){const q=parkingQuality(r.pose,level);if(r.assisted||r.status!=='ended'||!q.parked)return 0;return q.precise?(r.shifts<=level.maxShifts&&r.distance<=level.maxDistance&&r.corrections===0?3:2):1;}
