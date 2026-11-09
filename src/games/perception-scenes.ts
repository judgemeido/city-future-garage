export type TargetId = 'vehicle' | 'pedestrian' | 'cyclist' | 'signal';
export interface SceneTarget {
  id: TargetId; name: string; color: string;
  x: number; y: number; w: number; h: number;
  distance: number; bevX: number; bevY: number;
}
export interface PerceptionScene {
  id: string; name: string; location: string; hint: string; image: string;
  author: string; source: string; license: string; targets: SceneTarget[];
}
const colors = { vehicle: '#75b8ff', pedestrian: '#60efd3', cyclist: '#ffc575', signal: '#d4a9ff' };
const names = { vehicle: '车辆', pedestrian: '行人', cyclist: '骑行者', signal: '交通信号' };
// Boxes use the uncropped photo's normalized coordinates. Distances and BEV positions
// are teaching settings, not measurements. Only targets visible in each photo are listed.
const target = (id: TargetId, box: [number, number, number, number], distance: number, bevX: number, bevY: number, name = names[id]): SceneTarget =>
  ({ id, name, color: colors[id], x: box[0], y: box[1], w: box[2], h: box[3], distance, bevX, bevY });
export const PERCEPTION_SCENES: PerceptionScene[] = [
  {
    id: 'shibuya', name: '繁忙路口', location: '东京 · 涩谷', hint: '观察人车交汇的十字路口',
    image: new URL('../assets/street.jpg', import.meta.url).href,
    author: 'Kakidai', source: 'https://commons.wikimedia.org/wiki/File:2018_Shibuya_Crossing.jpg', license: 'CC BY-SA 4.0',
    targets: [
      target('vehicle', [.408, .811, .041, .040], 26, .27, .29),
      target('pedestrian', [.032, .777, .068, .166], 18, .58, .45),
      target('cyclist', [.752, .831, .038, .096], 12, .75, .65),
      target('signal', [.010, .351, .055, .090], 35, .69, .18)
    ]
  },
  {
    id: 'hong-kong-traffic', name: '公交车流', location: '香港 · 弥敦道', hint: '找出大车旁的摩托骑手',
    image: new URL('../assets/scenes/hong-kong-traffic.jpg', import.meta.url).href,
    author: 'Keun PAgosau LVHSOVH', source: 'https://commons.wikimedia.org/wiki/File:HK_YTM_%E6%B2%B9%E9%BA%BB%E5%9C%B0_Yau_Ma_Tei_%E5%BD%8C%E6%95%A6%E9%81%93_Nathan_Road_traffic_jam_March_2021_SS2_01.jpg', license: 'CC BY-SA 4.0',
    targets: [target('vehicle', [.032, .224, .282, .435], 22, .3, .32, '双层巴士'), target('cyclist', [.524, .484, .36, .443], 9, .72, .7, '摩托骑手')]
  },
  {
    id: 'amsterdam-cycleway', name: '骑行街道', location: '阿姆斯特丹 · 自行车道', hint: '区分骑行、步行与停放车辆',
    image: new URL('../assets/scenes/amsterdam-cycleway.jpg', import.meta.url).href,
    author: 'Alfredo Borba', source: 'https://commons.wikimedia.org/wiki/File:Cycling_Amsterdam_04.jpg', license: 'CC BY-SA 4.0',
    targets: [target('vehicle', [.802, .289, .194, .207], 28, .78, .28), target('pedestrian', [.1, .203, .148, .574], 8, .2, .72), target('cyclist', [.442, .278, .127, .582], 12, .52, .55), target('signal', [.843, .195, .03, .09], 38, .82, .18)]
  },
  {
    id: 'amsterdam-junction', name: '社区交汇', location: '阿姆斯特丹 · Sarphatistraat', hint: '留意近处骑行者与路边标志',
    image: new URL('../assets/scenes/amsterdam-junction.jpg', import.meta.url).href,
    author: 'Fons Heijnsbroek', source: 'https://commons.wikimedia.org/wiki/File:Sunny_Street_scene_in_the_street_Sarphatistraat_with_cyclists_biking;_free_photo_Amsterdam,_Fons_Heijnsbroek_10-2021.jpg', license: 'CC BY-SA 4.0',
    targets: [target('vehicle', [.285, .636, .055, .063], 34, .3, .2), target('pedestrian', [.473, .625, .023, .073], 28, .7, .32), target('cyclist', [.292, .593, .14, .407], 7, .46, .76), target('signal', [.589, .511, .036, .095], 30, .78, .28, '道路标志')]
  },
  {
    id: 'amsterdam-tramway', name: '电车轨道', location: '阿姆斯特丹 · 运河路口', hint: '比较近处与远处的道路目标',
    image: new URL('../assets/scenes/amsterdam-tramway.jpg', import.meta.url).href,
    author: 'Andrej Shadura', source: 'https://commons.wikimedia.org/wiki/File:Cyclist_hurrying_at_Vijzelgracht_%C3%97_Prinsengracht_in_Amsterdam.jpg', license: 'CC BY-SA 4.0',
    targets: [target('vehicle', [.366, .497, .062, .046], 40, .28, .18), target('cyclist', [.001, .42, .53, .58], 6, .3, .78), target('signal', [.465, .375, .026, .071], 28, .66, .3)]
  },
  {
    id: 'san-francisco-crosswalk', name: '俯瞰斑马线', location: '旧金山 · Market Street', hint: '从俯视角度识别人车位置',
    image: new URL('../assets/scenes/san-francisco-crosswalk.jpg', import.meta.url).href,
    author: 'Dllu', source: 'https://commons.wikimedia.org/wiki/File:Crosswalk_of_Market_at_Third,_San_Francisco.jpg', license: 'CC BY-SA 4.0',
    targets: [target('vehicle', [.771, .385, .144, .105], 16, .75, .49), target('pedestrian', [.53, .068, .029, .074], 27, .25, .32), target('cyclist', [.499, .18, .059, .062], 19, .46, .42), target('signal', [.653, .041, .034, .031], 31, .65, .22)]
  }
];
