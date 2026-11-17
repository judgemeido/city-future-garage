export type ScoredCategory = 'vehicle' | 'pedestrian' | 'cyclist' | 'signal';
export type TargetCategory = ScoredCategory | 'road' | 'landmark';
export type TargetId = string;
export interface SceneTarget {
  id: TargetId; category: TargetCategory; name: string; color: string;
  x: number; y: number; w: number; h: number;
  distance: number; bevX: number; bevY: number;
}
export interface PerceptionScene {
  id: string; name: string; location: string; hint: string; image: string;
  author: string; source: string; license: string; targets: SceneTarget[];
}
export const SCORED_CATEGORIES: ScoredCategory[] = ['vehicle', 'pedestrian', 'cyclist', 'signal'];
export const TARGET_CATEGORY_NAMES = { vehicle: '车辆', pedestrian: '行人', cyclist: '骑行者', signal: '交通标志', road: '道路设施', landmark: '城市地标' };
const colors = { vehicle: '#75b8ff', pedestrian: '#60efd3', cyclist: '#ffc575', signal: '#d4a9ff', road: '#ffe780', landmark: '#6ee7b7' };
const names = TARGET_CATEGORY_NAMES;
// Boxes use the uncropped photo's normalized coordinates. Distances and BEV positions
// are teaching settings, not measurements. Only targets visible in each photo are listed.
const target = (category: TargetCategory, box: [number, number, number, number], distance: number, bevX: number, bevY: number, name = names[category]): SceneTarget =>
  ({ id: category, category, name, color: colors[category], x: box[0], y: box[1], w: box[2], h: box[3], distance, bevX, bevY });
function annotateTargets(items: SceneTarget[]) {
  const count: Partial<Record<TargetCategory, number>> = {};
  return items.map(item => {
    const index = count[item.category] = (count[item.category] ?? 0) + 1;
    return { ...item, id: index === 1 ? item.category : `${item.category}-${index}` };
  });
}
export const PERCEPTION_SCENE_CATALOG = 'hangzhou-landmarks-2026-11-12';
export const PERCEPTION_SCENES: PerceptionScene[] = [
  {
    id: "hangzhou-qianjiang", name: "钱江新城", location: "浙江杭州 · 钱江新城万象城周边道路", hint: "在城市天际线下，观察车流、行人与交通信号灯",
    image: new URL('../assets/scenes/hangzhou-qianjiang.jpg', import.meta.url).href,
    author: "EditQ", source: "https://commons.wikimedia.org/wiki/File:%E6%9D%AD%E5%B7%9E%E9%92%B1%E6%B1%9F%E6%96%B0%E5%9F%8E_8.jpg", license: "CC BY-SA 4.0",
    targets: annotateTargets([
      target('vehicle', [0.54, 0.87, 0.066, 0.037], 18, 0.46, 0.54, '白色轿车'),
      target('vehicle', [0.738, 0.867, 0.05, 0.036], 20, 0.66, 0.49, '路口白色汽车'),
      target('vehicle', [0.78, 0.871, 0.031, 0.035], 25, 0.74, 0.39, '右侧白色汽车'),
      target('vehicle', [0.667, 0.863, 0.044, 0.04], 26, 0.59, 0.37, '深色汽车'),
      target('pedestrian', [0.359, 0.877, 0.012, 0.034], 22, 0.3, 0.45, '商场前行人'),
      target('pedestrian', [0.8, 0.858, 0.016, 0.05], 17, 0.8, 0.57, '右侧蓝衣行人'),
      target('signal', [0.181, 0.81, 0.051, 0.026], 28, 0.2, 0.3, '道路交通信号灯'),
      target('landmark', [0.051, 0.564, 0.904, 0.318], 50, 0.5, 0.1, '万象城建筑轮廓'),
      target('landmark', [0.337, 0.374, 0.1, 0.202], 60, 0.36, 0.08, '左侧高层建筑'),
      target('landmark', [0.422, 0.345, 0.092, 0.23], 58, 0.55, 0.08, '中央高层建筑'),
      target('road', [0.384, 0.941, 0.327, 0.025], 8, 0.48, 0.8, '道路车道线'),
      target('road', [0.121, 0.833, 0.089, 0.077], 12, 0.16, 0.66, '左侧人行道')
    ])
  },
  {
    id: "hangzhou-civic", name: "钱江城市阳台", location: "浙江杭州 · 钱江新城城市阳台周边", hint: "观察金色国际会议中心、广场台阶与玻璃护栏",
    image: new URL('../assets/scenes/hangzhou-civic.jpg', import.meta.url).href,
    author: "EditQ", source: "https://commons.wikimedia.org/wiki/File:%E6%9D%AD%E5%B7%9E%E9%92%B1%E6%B1%9F%E6%96%B0%E5%9F%8E_4.jpg", license: "CC BY-SA 4.0",
    targets: annotateTargets([
      target('landmark', [0.465, 0.402, 0.22, 0.23], 55, 0.5, 0.1, '杭州国际会议中心'),
      target('landmark', [0.459, 0.27, 0.065, 0.147], 60, 0.44, 0.06, '弧形高层建筑'),
      target('landmark', [0.216, 0.398, 0.157, 0.207], 48, 0.25, 0.16, '左侧城市建筑'),
      target('road', [0.719, 0.772, 0.275, 0.222], 10, 0.78, 0.71, '广场台阶'),
      target('road', [0.463, 0.769, 0.205, 0.102], 16, 0.51, 0.49, '中央玻璃护栏'),
      target('road', [0.748, 0.734, 0.237, 0.084], 21, 0.79, 0.37, '右侧玻璃护栏'),
      target('road', [0.198, 0.473, 0.193, 0.063], 32, 0.23, 0.27, '左侧高架步道'),
      target('road', [0.033, 0.882, 0.543, 0.097], 6, 0.31, 0.83, '前景金属护栏'),
      target('road', [0.399, 0.71, 0.117, 0.132], 15, 0.42, 0.53, '中央绿化树'),
      target('road', [0.028, 0.532, 0.044, 0.302], 17, 0.13, 0.47, '左侧路灯')
    ])
  },
  {
    id: "hangzhou-leifeng", name: "雷峰夕照", location: "浙江杭州 · 西湖雷峰塔周边景观", hint: "用激光探照镜描出塔檐、塔身与前景古建筑轮廓",
    image: new URL('../assets/scenes/hangzhou-leifeng.jpg', import.meta.url).href,
    author: "Yinweichen", source: "https://commons.wikimedia.org/wiki/File:Leifeng_Pagoda_at_Dusk.jpg", license: "CC BY-SA 4.0",
    targets: annotateTargets([
      target('landmark', [0.582, 0.213, 0.152, 0.454], 50, 0.56, 0.12, '雷峰塔'),
      target('landmark', [0, 0, 0.367, 0.545], 12, 0.17, 0.66, '前景古建筑飞檐'),
      target('landmark', [0.58, 0.375, 0.148, 0.07], 50, 0.56, 0.12, '雷峰塔顶层塔檐'),
      target('landmark', [0.582, 0.482, 0.146, 0.051], 50, 0.56, 0.12, '雷峰塔中层塔檐'),
      target('landmark', [0.649, 0.89, 0.21, 0.099], 35, 0.7, 0.29, '树间建筑屋顶'),
      target('landmark', [0.739, 0.648, 0.171, 0.31], 30, 0.83, 0.36, '右侧林木轮廓')
    ])
  },
  {
    id: "hangzhou-westlake", name: "西湖苏堤", location: "浙江杭州 · 西湖苏堤步行路段", hint: "沿湖畔柳荫路，观察游客、护栏与路边停放的自行车",
    image: new URL('../assets/scenes/hangzhou-westlake.jpg', import.meta.url).href,
    author: "DXR", source: "https://commons.wikimedia.org/wiki/File:Su_Causeway_near_West_Lake,_looking_towards_north_20120529_1.jpg", license: "CC BY-SA 4.0",
    targets: annotateTargets([
      target('pedestrian', [0.69, 0.554, 0.032, 0.159], 12, 0.66, 0.65, '近处蓝衣游客'),
      target('pedestrian', [0.717, 0.55, 0.025, 0.144], 13, 0.73, 0.62, '中间游客'),
      target('pedestrian', [0.763, 0.555, 0.036, 0.155], 11, 0.82, 0.68, '右侧游客'),
      target('pedestrian', [0.399, 0.548, 0.01, 0.043], 38, 0.42, 0.21, '左侧远处游客'),
      target('pedestrian', [0.521, 0.539, 0.009, 0.029], 45, 0.56, 0.12, '远处步行游客'),
      target('vehicle', [0.134, 0.597, 0.031, 0.034], 24, 0.21, 0.4, '湖边停放自行车'),
      target('road', [0.057, 0.658, 0.089, 0.119], 9, 0.14, 0.73, '近侧隔离石桩'),
      target('road', [0.242, 0.639, 0.02, 0.05], 18, 0.27, 0.54, '左侧步道石桩'),
      target('road', [0.963, 0.706, 0.027, 0.072], 8, 0.91, 0.79, '右側隔离石桩'),
      target('road', [0.847, 0.662, 0.044, 0.059], 16, 0.87, 0.56, '湖边护栏'),
      target('landmark', [0.116, 0.156, 0.166, 0.518], 20, 0.24, 0.4, '湖畔柳树'),
      target('landmark', [0.788, 0.537, 0.03, 0.024], 48, 0.81, 0.1, '西湖游船')
    ])
  },
  {
    id: "hangzhou-baima", name: "白马湖广场", location: "浙江杭州 · 滨江白马湖动漫广场", hint: "在开阔广场上，观察游客、展馆与步行通道",
    image: new URL('../assets/scenes/hangzhou-baima.jpg', import.meta.url).href,
    author: "Leiem", source: "https://commons.wikimedia.org/wiki/File:15th_China_International_Cartoon_%26_Animation_Festival.jpg", license: "CC0",
    targets: annotateTargets([
      target('pedestrian', [0.115, 0.65, 0.055, 0.201], 7, 0.2, 0.79, '近处白衣游客'),
      target('pedestrian', [0.916, 0.613, 0.047, 0.18], 9, 0.85, 0.7, '右侧黑衣游客'),
      target('pedestrian', [0.578, 0.628, 0.032, 0.139], 13, 0.53, 0.59, '中央白衣游客'),
      target('pedestrian', [0.606, 0.624, 0.028, 0.143], 14, 0.59, 0.56, '中央红裤游客'),
      target('pedestrian', [0.717, 0.621, 0.039, 0.151], 12, 0.69, 0.61, '中央黑衣游客'),
      target('pedestrian', [0.342, 0.633, 0.026, 0.089], 19, 0.37, 0.43, '广场步行者'),
      target('landmark', [0.004, 0.351, 0.344, 0.281], 45, 0.25, 0.14, '白马湖展馆'),
      target('landmark', [0.349, 0.449, 0.329, 0.185], 40, 0.53, 0.18, '动漫节主会场'),
      target('landmark', [0.353, 0.465, 0.315, 0.031], 40, 0.53, 0.18, '动漫节会场标识'),
      target('road', [0.76, 0.444, 0.027, 0.186], 27, 0.77, 0.31, '广场路灯'),
      target('road', [0.271, 0.748, 0.359, 0.244], 6, 0.46, 0.85, '广场步行通道'),
      target('vehicle', [0.975, 0.632, 0.025, 0.062], 20, 0.93, 0.4, '右侧停放车辆')
    ])
  },
  {
    id: 'hangzhou-nanshan', name: '西湖环湖路', location: '浙江杭州 · 西湖景区南山路', hint: '沿林荫路观察自行车、路边车辆和南山路牌',
    image: new URL('../assets/scenes/hangzhou-nanshan.jpg', import.meta.url).href,
    author: 'Tyg728', source: 'https://commons.wikimedia.org/wiki/File:Nanshan_Rd_20161006.jpg', license: 'CC BY-SA 4.0',
    targets: annotateTargets([
      target('vehicle', [.143, .526, .061, .035], 30, .23, .28, '路边汽车'),
      target('cyclist', [.323, .531, .017, .064], 18, .42, .48, '自行车骑行者'),
      target('signal', [.877, .303, .067, .098], 12, .83, .64, '南山路路牌'),
      target('cyclist', [.229, .540, .030, .072], 11, .30, .70, '近处电动车骑手'),
      target('cyclist', [.374, .541, .014, .045], 23, .49, .40, '黄色衣服骑手'),
      target('cyclist', [.627, .540, .009, .027], 44, .66, .14, '远处骑行者'),
      target('pedestrian', [.970, .504, .012, .072], 9, .91, .74, '右侧人行道行人'),
      target('pedestrian', [.569, .539, .007, .022], 48, .75, .10, '远处步行者1'),
      target('pedestrian', [.576, .541, .007, .023], 48, .77, .10, '远处步行者2'),
      target('vehicle', [.019, .534, .039, .033], 20, .15, .47, '左侧白色汽车'),
      target('vehicle', [.069, .527, .030, .044], 23, .18, .40, '左侧白色面包车'),
      target('vehicle', [.100, .529, .033, .031], 27, .21, .34, '左侧汽车3'),
      target('vehicle', [.002, .507, .051, .032], 25, .10, .37, '树后黑色汽车'),
      target('vehicle', [.169, .530, .041, .025], 32, .24, .26, '左侧深色汽车'),
      target('vehicle', [.208, .525, .034, .025], 35, .27, .22, '远侧汽车6'),
      target('vehicle', [.239, .523, .030, .023], 38, .30, .20, '远侧汽车7'),
      target('vehicle', [.271, .526, .018, .020], 40, .34, .17, '远侧汽车8'),
      target('vehicle', [.296, .533, .014, .014], 44, .36, .14, '远侧汽车9'),
      target('vehicle', [.538, .542, .019, .018], 42, .55, .16, '前方白色汽车'),
      target('vehicle', [.526, .541, .014, .016], 45, .53, .13, '前方深色汽车'),
      target('vehicle', [.480, .542, .015, .017], 46, .50, .12, '远处汽车12'),
      target('vehicle', [.490, .546, .015, .016], 45, .52, .14, '远处汽车13'),
      target('road', [.605, .547, .303, .208], 10, .78, .70, '近侧人行道护栏'),
      target('road', [.000, .556, .360, .066], 20, .17, .43, '远侧人行道护栏'),
      target('road', [.023, .603, .594, .192], 12, .44, .63, '黄色道路中心线')
    ])
  },
];
