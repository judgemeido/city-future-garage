import { cleanCommand, integrateBicycle, normalize, clamp, WHEELBASE, MAX_STEER, simulate, type Command, type Pose, type Point } from './parking-model.ts';
export function commandStart(start:Pose,commands:Command[],index:number):Pose {return simulate(start,commands.slice(0,index)).pose;}
export function commandEnd(start:Pose,c:Command):Pose{return integrateBicycle(start,c.gear*c.distance,c.steer,1);}
export function commandMid(start:Pose,c:Command):Pose{return integrateBicycle(start,c.gear*c.distance/2,c.steer,1);}
export function dragCommand(start:Pose,c:Command,target:Point,kind:'end'|'bend'):Command {
  const dx=target.x-start.x,dy=target.y-start.y,x=dx*Math.cos(start.angle)+dy*Math.sin(start.angle),y=-dx*Math.sin(start.angle)+dy*Math.cos(start.angle);
  const k=2*y/(x*x+y*y||1),steer=clamp(Math.atan(WHEELBASE*k),-MAX_STEER,MAX_STEER);
  if(kind==='bend')return cleanCommand({...c,steer});
  const actualK=Math.tan(steer)/WHEELBASE,turn=clamp(normalize(2*Math.atan2(y*c.gear,x*c.gear)),-2.8,2.8);
  const distance=Math.abs(actualK)<.00001?Math.max(12,x*c.gear):Math.abs(turn/actualK);
  return cleanCommand({...c,distance,steer});
}
