import { carCenter, simulate, type Command, type ParkingLevel, type Rect } from './parking-model.ts';
const arc=(gear:1|-1,radius:number,angle:number):Command=>({gear,distance:radius*Math.abs(angle),steer:Math.atan(48/radius)*Math.sign(angle)});
const straight=(gear:1|-1,distance:number):Command=>({gear,distance,steer:0});
const car=(x:number,y:number,w:number,h:number,name:string):Rect=>({x,y,w,h,name,kind:'car'});
function make(theme:number,challenge:boolean):ParkingLevel {
  const starts=[{x:240,y:190,angle:0},{x:200,y:190,angle:0},{x:220,y:210,angle:0}];
  const refs:Command[][]=[ [straight(1,430),arc(-1,110,Math.PI/2),straight(-1,90)], [straight(1,480),arc(-1,160,.95),arc(-1,160,-.95)], [straight(1,180),arc(1,110,.8),arc(-1,90,-(Math.PI/2-.8)),straight(1,200)] ];
  const reference=refs[theme],start=starts[theme],end=simulate(start,reference).pose;
  const obstacles:Rect[][]=[
    [car(450,375,48,98,'左侧停放车辆'),car(665,375,48,98,'右侧停放车辆'),{x:310,y:440,w:220,h:40,kind:'wall',name:'花坛'},...(challenge?[{x:700,y:260,w:24,h:28,kind:'pillar' as const,name:'通道立柱'}]:[])],
    [car(challenge?350:310,carCenter(end).y,86,44,'后方停放车辆'),car(challenge?600:625,carCenter(end).y,86,44,'前方停放车辆'),{x:510,y:458,w:680,h:34,kind:'wall',name:'路缘花坛'}],
    [car(challenge?364:340,400,74,100,'左侧停放车辆'),car(challenge?548:565,400,74,100,'右侧停放车辆'),{x:626,y:218,w:120,h:194,kind:'wall',name:'巷道尽头'},...(challenge?[{x:400,y:98,w:42,h:32,kind:'pillar' as const,name:'转角立柱'}]:[])]
  ];
  return {id:`${['garage','parallel','alley'][theme]}-${challenge?'tight':'standard'}`,theme,challenge,name:['商场倒库','街边侧方','窄位挪车'][theme],question:['汽车怎样知道障碍有多远？','路线能过，整辆车也能过吗？','路线怎样变成转向动作？'][theme],hint:['先前进到车位右前方，再向右打轮倒车；车头朝上后回正倒入。','先驶过车位，向右打轮倒入，再向左打轮回正。留意前车与自己的右前角。','先前进并向右转，再倒车向左打轮调整车头，最后前进入位。'][theme],start,bay:{...carCenter(end),w:challenge?100:112,h:challenge?58:70,angle:end.angle},obstacles:obstacles[theme],reference,maxShifts:theme===2?2:1,maxDistance:reference.reduce((s,c)=>s+c.distance,0)*(challenge?1.08:1.2)};
}
export const PARKING_LEVELS=[0,1,2].flatMap(theme=>[make(theme,false),make(theme,true)]);
