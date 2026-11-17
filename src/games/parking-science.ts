import { BOUNDS, SCALE, localPoint, rectCorners, type Point, type Pose, type ParkingLevel } from './parking-model.ts';
export interface Echo { origin:Point; hit:Point|null; distance:number|null; milliseconds:number|null; sensor:'front'|'rear'; object:string; pose:Pose }
export interface Evidence { kind:'echo'|'space'|'control'; levelId:string; text:string; detail:string; sample:unknown; date:string }
export const SOUND_SPEED=343;
export function echoMilliseconds(meters:number):number {return 2*meters/SOUND_SPEED*1000;}
export function measureEcho(pose:Pose,level:ParkingLevel,sensor:'front'|'rear'):Echo {
  const origin=localPoint(pose,sensor==='front'?58:-22,0),angle=pose.angle+(sensor==='rear'?Math.PI:0);let distance=Infinity,hit:Point|null=null,object='';
  const polygons=[...level.obstacles.map(o=>({points:rectCorners(o),name:o.name||'障碍'})),{points:[{x:BOUNDS.left,y:BOUNDS.top},{x:BOUNDS.right,y:BOUNDS.top},{x:BOUNDS.right,y:BOUNDS.bottom},{x:BOUNDS.left,y:BOUNDS.bottom}],name:'场地边界'}];
  // Idealized finite cone: the earliest unoccluded hit among 17 rays. No echo is not a safety guarantee.
  for(let i=-8;i<=8;i++){const a=angle+i*Math.PI/180*2,dir={x:Math.cos(a),y:Math.sin(a)};
    for(const poly of polygons)for(let j=0;j<4;j++){
      const v=poly.points[j],w=poly.points[(j+1)%4],edge={x:w.x-v.x,y:w.y-v.y},den=dir.x*edge.y-dir.y*edge.x;
      if(Math.abs(den)<1e-8)continue;
      const dx=v.x-origin.x,dy=v.y-origin.y,t=(dx*edge.y-dy*edge.x)/den,u=(dx*dir.y-dy*dir.x)/den;
      if(t>=4&&t<=240&&u>=0&&u<=1&&t<distance){distance=t;hit={x:origin.x+t*dir.x,y:origin.y+t*dir.y};object=poly.name;}
    }
  }
  return {origin,hit,distance:hit?distance/SCALE:null,milliseconds:hit?echoMilliseconds(distance/SCALE):null,sensor,object,pose:{...pose}};
}
export function compareEcho(a:Echo,b:Echo):string|null {
  if(a.distance===null||b.distance===null||Math.abs(a.distance-b.distance)<.05)return null;
  const [near,far]=a.distance<b.distance?[a,b]:[b,a];return `同一空气条件下，${near.distance!.toFixed(2)} m 的回波用了 ${near.milliseconds!.toFixed(1)} ms，${far.distance!.toFixed(2)} m 用了 ${far.milliseconds!.toFixed(1)} ms；更远的回声回来得更晚。`;
}
