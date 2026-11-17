export type PartId='battery'|'drive'|'motor'|'sensor'|'control'|'steer';
export interface RepairPart {id:PartId;name:string;x:number;y:number;reading:string;faultReading:string}
export const REPAIR_PARTS:RepairPart[]=[
  {id:'battery',name:'电池',x:330,y:270,reading:'输出 48 V',faultReading:'输出 0 V'},
  {id:'drive',name:'电驱部件',x:515,y:270,reading:'供电链 连通',faultReading:'供电链 断开'},
  {id:'motor',name:'电机',x:705,y:270,reading:'动力输出 正常',faultReading:'动力输出 中断'},
  {id:'sensor',name:'传感器',x:230,y:150,reading:'测距 2.0 m',faultReading:'信号 无回波'},
  {id:'control',name:'控制单元',x:500,y:150,reading:'指令 有效',faultReading:'指令 校验失败'},
  {id:'steer',name:'转向执行器',x:775,y:150,reading:'转向 响应',faultReading:'转向 无响应'}
];
export const REPAIR_SCENES=[{name:'动力供电',parts:['battery','drive','motor'] as PartId[],faults:['drive','battery'] as PartId[],symptom:'车轮没有动力，哪一环断开了？'},{name:'传感器信号',parts:['sensor','control','steer'] as PartId[],faults:['sensor','control'] as PartId[],symptom:'汽车看不清障碍，先扫一遍感知链。'},{name:'转向执行',parts:['sensor','control','steer'] as PartId[],faults:['steer','control'] as PartId[],symptom:'小车不能转向，看看指令走到了哪里。'}];
export interface Evidence {id:PartId;reading:string;order:number;beforeRepair:boolean}
export interface RepairState {scene:number;fault:PartId;repaired:boolean;evidence:Evidence[];replacements:PartId[];tests:{passed:boolean;message:string}[];cost:number;completed:boolean}
export function createRepair(scene:number,round=0):RepairState {const config=REPAIR_SCENES[scene];return {scene,fault:config.faults[round%config.faults.length],repaired:false,evidence:[],replacements:[],tests:[],cost:0,completed:false};}
export function readPart(state:RepairState,id:PartId):string {
  const p=REPAIR_PARTS.find(p=>p.id===id)!;
  if(state.repaired)return p.reading;
  if(id===state.fault)return p.faultReading;
  const chain=REPAIR_SCENES[state.scene].parts,broken=chain.indexOf(state.fault),index=chain.indexOf(id);
  if(index>broken)return state.scene===0?'上游供电 未到达':'上游指令 未到达';
  return p.reading;
}
// Only a narrow band actually crossing a part creates evidence.
export function scanRepair(state:RepairState,x:number,y:number):Evidence[] {
  const found:Evidence[]=[];
  for(const p of REPAIR_PARTS){if(!REPAIR_SCENES[state.scene].parts.includes(p.id)||Math.abs(x-p.x)>32||Math.abs(y-p.y)>90||state.evidence.some(e=>e.id===p.id&&e.beforeRepair===!state.repaired))continue;
    const e={id:p.id,reading:readPart(state,p.id),order:state.evidence.length+1,beforeRepair:!state.repaired};state.evidence.push(e);found.push(e);}
  return found;
}
export function replacePart(state:RepairState,id:PartId):boolean {if(state.completed||!REPAIR_SCENES[state.scene].parts.includes(id))return false;state.replacements.push(id);state.cost+=10;if(id===state.fault)state.repaired=true;return id===state.fault;}
export function retestRepair(state:RepairState) {const result={passed:state.repaired,message:state.repaired?'信号走完链路，车辆恢复响应':'链路仍有断点，车辆尚未恢复'};state.tests.push(result);state.completed=result.passed;return result;}
export function repairStars(state:RepairState):number {if(!state.completed)return 0;const proof=state.evidence.some(e=>e.id===state.fault&&e.beforeRepair);return proof&&state.replacements.length===1?3:proof?2:1;}
