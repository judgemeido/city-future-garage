# 素材与依赖说明

## 感知场景照片

**2018 Shibuya Crossing.jpg**，作者 **Kakidai**，Wikimedia Commons，**CC BY-SA 4.0**。

- 原页面：https://commons.wikimedia.org/wiki/File:2018_Shibuya_Crossing.jpg
- 许可：https://creativecommons.org/licenses/by-sa/4.0/
- 本项目使用 2500×1604 原始照片；浏览器按比例缩放显示，支持原图和目标放大查看。感知教学叠层和导出截图包含人工标注、视觉滤镜与仿真示意。
- 保留作者署名及许可。传播包含该照片的改编图像时，应遵守 CC BY-SA 4.0 对署名、修改说明和相同方式共享的要求。

新增五张实景照片均来自 Wikimedia Commons，采用 **CC BY-SA 4.0**：

- **hong-kong-traffic.jpg**：[HK YTM 油麻地 Yau Ma Tei 彌敦道 Nathan Road traffic jam March 2021 SS2 01.jpg](https://commons.wikimedia.org/wiki/File:HK_YTM_%E6%B2%B9%E9%BA%BB%E5%9C%B0_Yau_Ma_Tei_%E5%BD%8C%E6%95%A6%E9%81%93_Nathan_Road_traffic_jam_March_2021_SS2_01.jpg)，作者 **Keun PAgosau LVHSOVH**。
- **amsterdam-cycleway.jpg**：[Cycling Amsterdam 04.jpg](https://commons.wikimedia.org/wiki/File:Cycling_Amsterdam_04.jpg)，作者 **Alfredo Borba**。
- **amsterdam-junction.jpg**：[Sunny Street scene in the street Sarphatistraat with cyclists biking; free photo Amsterdam, Fons Heijnsbroek 10-2021.jpg](https://commons.wikimedia.org/wiki/File:Sunny_Street_scene_in_the_street_Sarphatistraat_with_cyclists_biking;_free_photo_Amsterdam,_Fons_Heijnsbroek_10-2021.jpg)，作者 **Fons Heijnsbroek**。
- **amsterdam-tramway.jpg**：[Cyclist hurrying at Vijzelgracht × Prinsengracht in Amsterdam.jpg](https://commons.wikimedia.org/wiki/File:Cyclist_hurrying_at_Vijzelgracht_%C3%97_Prinsengracht_in_Amsterdam.jpg)，作者 **Andrej Shadura**。
- **san-francisco-crosswalk.jpg**：[Crosswalk of Market at Third, San Francisco.jpg](https://commons.wikimedia.org/wiki/File:Crosswalk_of_Market_at_Third,_San_Francisco.jpg)，作者 **Dllu**。

新增照片缩放为 1280 像素宽，保留完整画面。页面缩略图为展示裁切，放大原图不裁切。照片上的目标框、天气与点云为本项目添加的教学叠层；导出图像保留照片署名及许可。照片及其改编图像遵循 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。机器可读来源见 `src/assets/scenes/sources.json`。

照片分别来自东京、香港、阿姆斯特丹和旧金山。归一化框属于人工标注；距离、BEV、探测质量、波形与车辆运动均不是照片实测值。

## 新增四款游戏的实物照片（2026年11月10日）

- **parking-aerial.jpg**：[Aerial view of an empty car parking lot.jpg](https://commons.wikimedia.org/wiki/File:Aerial_view_of_an_empty_car_parking_lot.jpg)，摄影 **Gabriel Picard**，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0)。
- **charging-car.jpg**：[Electric car charging at a station during the day with the charging cable connected to the vehicle.jpg](https://commons.wikimedia.org/wiki/File:Electric_car_charging_at_a_station_during_the_day_with_the_charging_cable_connected_to_the_vehicle.jpg)，摄影 **Shixart1985**，[CC BY 2.0](https://creativecommons.org/licenses/by/2.0)。
- **charging-station.jpg**：[Electric Car Charging Station.jpg](https://commons.wikimedia.org/wiki/File:Electric_Car_Charging_Station.jpg)，摄影 **Mokkie**，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0)。
- **ev-chassis.jpg**：[Tesla Motors Model S base.JPG](https://commons.wikimedia.org/wiki/File:Tesla_Motors_Model_S_base.JPG)，摄影 **Oleg Alexandrov**，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0)。
- **ev-chassis-side.jpg**：[Tesla Model S chassis.jpg](https://commons.wikimedia.org/wiki/File:Tesla_Model_S_chassis.jpg)，摄影 **Christiankral**，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0)。
- **tire-tread.jpg**：[2008-05-01 Tyre.jpg](https://commons.wikimedia.org/wiki/File:2008-05-01_Tyre.jpg)，摄影 **Ildar Sagdejev (Specious)**，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0)。

六张照片来自 Wikimedia Commons，使用 1280 像素宽缩放版本，完整画面等比显示；原图放大去除教学叠层。停车场航拍、充电接口与充电桩、两张实物展出底盘、汽车胎面近照分别支持泊车、充电、维修和抓地力观察。照片不经过 AI 生成或内容替换。

本项目添加归一化观察点、跟手扫描、沿电缆的教学光流，以及包含本人操作画面的合成截图。照片署名、许可和原页面随页面与个人报告保留。照片及包含照片的改编图像遵循各自许可；CC BY-SA 素材的改编图像按相同许可分享。机器来源、原尺寸和处理说明见 `src/assets/lab-photos/sources.json`。

照片只用于观察实物形态和位置；功率、故障读数、距离、转向与双车轨迹为游戏教学模型，不是从照片量测得到。底盘照片仅标出实际可见的壳体、总成、车轮与车架，不把未展示的传感器或控制单元当作已拍摄部件。

## 开源依赖

- Phaser 3.90.0：MIT。https://github.com/phaserjs/phaser
- Vite：MIT。https://github.com/vitejs/vite
- TypeScript：Apache-2.0。https://github.com/microsoft/TypeScript
- vite-plugin-singlefile：MIT。https://github.com/richardtallent/vite-plugin-singlefile

依赖的完整许可证保留于安装后的 `node_modules` 和各官方项目。运行不依赖远程字体、图片或接口。

## 车辆 2D SVG

三款侧视车以 [Google Noto Emoji](https://github.com/googlefonts/noto-emoji) 的汽车、SUV、赛车 SVG 为基础，固定提交 `99701e07d3d1fe1bdbcdb14964547f0fd592966f`，原文件分别为 `2D/svg/emoji_u1f697.svg`、`emoji_u1f699.svg`、`emoji_u1f3ce.svg`。Copyright Google LLC。

修改包括：镜像为向右行驶、统一可选车漆及中性色、增加旋转轮毂、适配 Canvas 和 SVG。三款俯视图及场景为项目内绘制。原始 SVG 与上游许可证保留在 `src/assets/vehicles/noto/`；六款可编辑成品位于 `src/assets/vehicles/ready/`。

上游固定版本 [README 的 License 说明](https://github.com/googlefonts/noto-emoji/blob/99701e07d3d1fe1bdbcdb14964547f0fd592966f/README.md#license) 将大部分图像资源列为 Apache-2.0；同时保留该版本根目录的 OFL `LICENSE` 和上游历史版本的 `LICENSE-APACHE` 文本。来源与检查记录见 `docs/vehicle-art-redesign.md`。
