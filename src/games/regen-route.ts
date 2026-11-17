export interface RegenRoute {
  id: string; name: string; cargo: string; goal: string; lesson: string;
  stops: { x: number; name: string }[]; terrain: { x: number; h: number }[];
  tolerance: number; cruise: number; speedLimit: number; timeLimit: number;
}
export const REGEN_ROUTES: RegenRoute[] = [
  { id:'pudding', name:'布丁别晃', cargo:'布丁', goal:'稳稳送到校园小店，找回这次停车的动能。', lesson:'动能怎样变成电能？',
    stops:[{x:96,name:'校园小店'}], terrain:[{x:0,h:0},{x:140,h:0}], tolerance:9, cruise:11, speedLimit:15, timeLimit:60 },
  { id:'hill', name:'下坡能量快递', cargo:'小苗', goal:'观察坡度，控制速度，把小苗送到山脚。', lesson:'匀速下坡为什么也能回收？',
    stops:[{x:218,name:'山脚温室'}], terrain:[{x:0,h:9},{x:30,h:9},{x:100,h:6.2},{x:170,h:0},{x:260,h:0}], tolerance:10, cruise:10, speedLimit:14, timeLimit:90 },
  { id:'city', name:'城市三站接力', cargo:'包裹', goal:'远近三站连续送达，和上一趟比较净耗电。', lesson:'回收更多，一定更省电吗？',
    stops:[{x:100,name:'图书站'},{x:156,name:'社区站'},{x:294,name:'城市驿站'}], terrain:[{x:0,h:4},{x:175,h:4},{x:245,h:0},{x:340,h:0}], tolerance:9, cruise:11, speedLimit:15, timeLimit:140 }
];
export function terrainAt(route: RegenRoute, x: number) {
  for (let i=1;i<route.terrain.length;i++) {
    const a=route.terrain[i-1], b=route.terrain[i];
    if(x < b.x-1e-8) { const slope=(b.h-a.h)/(b.x-a.x); return {height:a.h+(x-a.x)*slope,slope,next:b.x}; }
  }
  return {height:route.terrain.at(-1)!.h,slope:0,next:Infinity};
}
