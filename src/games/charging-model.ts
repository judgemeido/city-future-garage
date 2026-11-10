export interface ChargeCar { id:string; name:string; capacity:number; energy:number; initial:number; target:number; accept:number; deadline:number; connected:number|null; power:number; reachedAt:number|null }
export interface ChargingState { scene:number; time:number; capacity:number; cars:ChargeCar[]; strategy:'balanced'|'priority'; priority:string; delivered:number; adjustments:number; ended:boolean; expired:boolean }
const car=(id:string,name:string,energy:number,target:number,accept:number,deadline:number):ChargeCar=>({id,name,capacity:40,energy,initial:energy,target,accept,deadline,connected:null,power:0,reachedAt:null});
export const CHARGING_NAMES=['两车补电','共享供电','急需补电'];
export function createCharging(scene:number):ChargingState {
  const cars=scene===0?[car('a','校园快递车',8,10,30,18),car('b','城市接送车',12,14,24,22)]:scene===1?[car('a','校园快递车',8,10,30,20),car('b','城市接送车',12,14,24,24),car('c','山野旅行车',16,18,18,30)]:[car('a','校园快递车',8,10,30,24),car('b','城市接送车',12,14,24,28),car('c','急需补电车',4,5.5,30,12)];
  return {scene,time:0,capacity:scene===0?54:36,cars,strategy:'balanced',priority:scene===2?'c':'a',delivered:0,adjustments:0,ended:false,expired:false};
}
export function connect(state:ChargingState,plug:number,id:string|null):boolean {
  if(state.ended||plug<0||plug>1||!Number.isInteger(plug))return false;
  const target=state.cars.find(c=>c.id===id);
  if(id!==null&&(!target||target.reachedAt!==null||(target.connected!==null&&target.connected!==plug)))return false;
  for(const c of state.cars)if(c.connected===plug)c.connected=null;
  if(target)target.connected=plug;
  state.adjustments++; allocate(state);return true;
}
export function allocate(state:ChargingState) {
  state.cars.forEach(c=>c.power=0);if(state.ended)return;
  const active=state.cars.filter(c=>c.connected!==null&&c.energy<c.target-1e-9);
  let budget=state.capacity;
  if(state.strategy==='priority'){
    const order=[...active].sort((a,b)=>Number(b.id===state.priority)-Number(a.id===state.priority)||a.deadline-b.deadline);
    for(const c of order){c.power=Math.min(c.accept,budget);budget-=c.power;}
  }else{
    let remaining=[...active];while(remaining.length&&budget>1e-9){const share=budget/remaining.length;const capped=remaining.filter(c=>c.accept<=share);if(!capped.length){remaining.forEach(c=>c.power=share);break;}for(const c of capped){c.power=c.accept;budget-=c.accept;}remaining=remaining.filter(c=>!capped.includes(c));}
  }
}
// dt is in simulated minutes; actual energy is kW × minutes / 60.
export function stepCharging(state:ChargingState,dt:number) {
  if(state.ended||!Number.isFinite(dt)||dt<=0)return;
  allocate(state);const start=state.time;
  for(const c of state.cars){
    if(c.power<=0)continue;
    const needed=c.target-c.energy;
    const duration=Math.min(dt,Math.max(0,c.deadline-start));
    const added=Math.min(needed,c.power*duration/60);c.energy+=added;state.delivered+=added;
    if(c.energy>=c.target-1e-9){c.energy=c.target;c.reachedAt=start+needed*60/c.power;c.connected=null;}
  }
  state.time+=dt;
  state.expired=state.cars.some(c=>c.reachedAt===null&&state.time>=c.deadline);
  state.ended=state.expired||state.cars.every(c=>c.reachedAt!==null);allocate(state);
}
