import parking from '../assets/lab-photos/parking-aerial.jpg';
import connector from '../assets/lab-photos/charging-car.jpg';
import station from '../assets/lab-photos/charging-station.jpg';
import chassis from '../assets/lab-photos/ev-chassis.jpg';
import frame from '../assets/lab-photos/ev-chassis-side.jpg';
import tire from '../assets/lab-photos/tire-tread.jpg';
import sources from '../assets/lab-photos/sources.json';

export type LabId = 'parking' | 'repair' | 'charging' | 'grip';
export interface PhotoPoint { name: string; x: number; y: number; text: string }
export interface LabPhoto { id: string; image: string; name: string; alt: string; points: PhotoPoint[]; flow?: [number, number][] }
export interface PhotoLesson { photo: number; point: number; prompt: string }
export const PHOTO_SOURCES = sources;
export const LAB_PHOTOS: Record<LabId, LabPhoto[]> = {
  parking: [{ id: 'parking-aerial', image: parking, name: '真实停车场 · 航拍', alt: '有白色车位线、中央通道、绿化隔离带和一辆已停汽车的停车场航拍照片', points: [
    { name: '已停车辆', x: .687, y: .113, text: '看车身与车位线的位置关系，再在左边练习完整入位。' },
    { name: '行车通道', x: .50, y: .255, text: '车位之间有行车通道；转弯时要给整个车身留出空间。' },
    { name: '车位边界', x: .563, y: .606, text: '白线标出停车位置。拖光轨时，同时观察车身包络是否越界。' }
  ] }],
  charging: [
    { id: 'charging-car', image: connector, name: '真实充电接口 · 近照', alt: '一辆蓝色电动汽车侧面的充电口，充电头已插入，黑色电缆向下延伸', points: [
      { name: '车辆接口', x: .575, y: .397, text: '充电头接入车辆接口。左边拖线、松手吸附，练习这个连接动作。' },
      { name: '充电头', x: .48, y: .43, text: '照片展示已经插好的充电头；模型中的光流表示当前实际分配功率。' },
      { name: '充电电缆', x: .349, y: .75, text: '沿电缆找能量通路。照片无法告诉我们功率，数值来自左边的教学模型。' }
    ], flow: [[.338,.97],[.339,.75],[.35,.59],[.40,.49],[.48,.43],[.575,.397]] },
    { id: 'charging-station', image: station, name: '真实充电桩 · 实物', alt: '带显示屏、操作按钮、停靠充电头和粗电缆的充电桩实物照片', points: [
      { name: '桩上显示屏', x: .468, y: .282, text: '实物有显示屏和按钮。左边的供电上限和排班是本游戏的教学设置。' },
      { name: '停靠充电头', x: .451, y: .522, text: '充电头停靠在桩上。拖左边的充电头，再给小车接线。' },
      { name: '连接电缆', x: .569, y: .752, text: '电缆把设备与车辆连起来；共享供电时，每根线上的功率会变化。' }
    ] }
  ],
  repair: [
    { id: 'ev-chassis', image: chassis, name: '电动车底盘 · 实物展出', alt: '展出的特斯拉 Model S 底盘，中央电池包壳体、近处电驱总成和两侧车轮清晰可见', points: [
      { name: '电池包壳体', x: .461, y: .405, text: '中央的大块壳体是电池包所在区域。左边把供电链拆成部件来检测。' },
      { name: '电驱总成', x: .525, y: .687, text: '近处的电驱总成与车轮连接。先比较供电证据，再判断哪一环中断。' },
      { name: '车轮', x: .886, y: .592, text: '车轮没动作只是现象。原因也可能在供电或指令的上游。' }
    ] },
    { id: 'ev-chassis-side', image: frame, name: '车架与车轮 · 实物展出', alt: '白色背景下展出的 Model S 车架与四个车轮，车头一侧的车架结构可见', points: [
      { name: '前部车轮', x: .346, y: .729, text: '观察前部车轮与车架的位置。传感器和控制单元未在这张照片中标出。' },
      { name: '车架', x: .586, y: .484, text: '真实结构比左边示意更复杂。游戏把感知、计算、执行分别画出来便于理解。' },
      { name: '后部车轮', x: .91, y: .425, text: '在左边复测指令链，确认修复后车辆恢复响应。照片本身没有故障读数。' }
    ] }
  ],
  grip: [{ id: 'tire-tread', image: tire, name: '汽车轮胎 · 胎面近照', alt: '汽车轮胎胎面近照，可以看到纵向沟槽、斜向花纹和橡胶花纹块', points: [
    { name: '纵向沟槽', x: .445, y: .57, text: '看清胎面中的沟槽。随后只改路面条件，观察双车的轨迹差异。' },
    { name: '斜向花纹', x: .604, y: .493, text: '花纹与沟槽共同构成胎面。实验中的速度变化由左边模型计算。' },
    { name: '橡胶花纹块', x: .332, y: .656, text: '轮胎通过胎面与路面接触。照片展示形态，抓地数值与轮胎条件来自教学设置。' }
  ] }]
};
export const PHOTO_LESSONS: Record<LabId, PhotoLesson[]> = {
  parking: [{photo:0,point:0,prompt:'先看实物：车身怎样停在白线之间？'},{photo:0,point:1,prompt:'先看实物：倒车转弯需要哪些空间？'},{photo:0,point:2,prompt:'先看实物：车位边界与车身有什么关系？'}],
  charging: [{photo:0,point:0,prompt:'先看实物：充电头接在哪里？'},{photo:1,point:2,prompt:'先看实物：找到桩、充电头和电缆。'},{photo:0,point:2,prompt:'先看实物：沿电缆找到车辆接口。'}],
  repair: [{photo:0,point:0,prompt:'先看实物：找到电池包与电驱总成。'},{photo:1,point:1,prompt:'先看实物，再在示意区理解感知链。'},{photo:1,point:0,prompt:'先看实物：观察车轮，再复测转向链。'}],
  grip: [{photo:0,point:0,prompt:'先看实物：找到胎面的沟槽。'},{photo:0,point:1,prompt:'先看实物，再改变速度做对照。'},{photo:0,point:2,prompt:'先看实物：哪些位置会接触路面？'}]
};
