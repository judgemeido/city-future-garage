export interface GripConditions {wet:number;speed:number;tire:number}
export interface GripCar {x:number;y:number;angle:number;speed:number;offroad:boolean;finished:boolean;outsideCount:number;distance:number}
export interface GripFrame {time:number;a:GripCar;b:GripCar}
export interface GripState {scene:number;value:number;conditions:{a:GripConditions;b:GripConditions};a:GripCar;b:GripCar;time:number;frames:GripFrame[];ended:boolean}
export const GRIP_SCENES=[{name:'干湿弯道',variable:'路面湿润',min:0,max:100,default:75,unit:'%'},{name:'速度比较',variable:'实验车速度',min:20,max:60,default:45,unit:'km/h'},{name:'轮胎比较',variable:'轮胎抓地条件',min:35,max:100,default:50,unit:'%'}];
export function gripConditions(scene:number,value:number):{a:GripConditions;b:GripConditions} {
  const a={wet:scene===0?0:.7,speed:30,tire:1},b={...a};
  if(scene===0)b.wet=value/100;else if(scene===1)b.speed=value;else b.tire=value/100;
  return {a,b};
}
const newCar=(speed:number):GripCar=>({x:0,y:0,angle:0,speed:speed/3.6,offroad:false,finished:false,outsideCount:0,distance:0});
export function createGrip(scene:number,value=GRIP_SCENES[scene].default):GripState {const conditions=gripConditions(scene,value),a=newCar(conditions.a.speed),b=newCar(conditions.b.speed);return {scene,value,conditions,a,b,time:0,frames:[{time:0,a:{...a},b:{...b}}],ended:false};}
// Both cars receive this fixed steering programme. The teaching road is its low-speed trace.
export function steeringAt(time:number):number {return time<1.8-1e-9?0:time<6.3-1e-9?.14:time<10.8-1e-9?-.14:0;}
export function friction(conditions:GripConditions):number {return (.95-.80*conditions.wet)*conditions.tire;}
export function stepGripCar(car:GripCar,c:GripConditions,dt:number,time:number) {
  if(car.finished)return;
  const requested=car.speed*Math.tan(steeringAt(time))/2.6;
  const maxYaw=friction(c)*9.81/Math.max(.1,car.speed);
  const yaw=Math.max(-maxYaw,Math.min(maxYaw,requested));
  car.x+=car.speed*Math.cos(car.angle+yaw*dt/2)*dt;car.y+=car.speed*Math.sin(car.angle+yaw*dt/2)*dt;car.angle+=yaw*dt;car.distance+=car.speed*dt;
  if(time+dt>=13-1e-8)car.finished=true;
}
export function referenceRoad():{x:number;y:number}[] {const car=newCar(30),points=[{x:0,y:0}];for(let i=0;i<13*120;i++){stepGripCar(car,{wet:0,speed:30,tire:1},1/120,i/120);if(i%5===0)points.push({x:car.x,y:car.y});}points.push({x:car.x,y:car.y});return points;}
export const GRIP_ROAD=referenceRoad();
function roadDistance(car:GripCar):number {return Math.min(...GRIP_ROAD.map(p=>Math.hypot(car.x-p.x,car.y-p.y)));}
export function stepGrip(state:GripState,dt:number) {
  if(state.ended||dt<=0)return;
  const step=Math.min(dt,13-state.time);stepGripCar(state.a,state.conditions.a,step,state.time);stepGripCar(state.b,state.conditions.b,step,state.time);state.time+=step;
  for(const car of [state.a,state.b]){const outside=roadDistance(car)>5.5;if(outside&&!car.offroad)car.outsideCount++;car.offroad=outside;}
  state.frames.push({time:state.time,a:{...state.a},b:{...state.b}});state.ended=state.time>=13-1e-8;
}
export function replayGrip(state:GripState,fraction:number):GripFrame {const index=Math.max(0,Math.min(state.frames.length-1,Math.round(fraction*(state.frames.length-1))));return state.frames[index];}
export function gripDifference(state:GripState):number {return Math.hypot(state.a.x-state.b.x,state.a.y-state.b.y);}
