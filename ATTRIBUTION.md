# 素材与依赖说明

## 感知场景照片（杭州地标，2026年11月12日更新）

钱江新城道路、城市阳台、雷峰夕照、西湖苏堤和白马湖动漫广场使用真实公开许可照片；西湖环湖路沿用南山路实景。白马湖照片是2019年动漫节期间拍摄的滨江白马湖动漫广场，不是其他城市的同名湖泊。

- **hangzhou-qianjiang.jpg**：[杭州钱江新城 8.jpg](https://commons.wikimedia.org/wiki/File:%E6%9D%AD%E5%B7%9E%E9%92%B1%E6%B1%9F%E6%96%B0%E5%9F%8E_8.jpg)，摄影 **EditQ**，CC BY-SA 4.0。
- **hangzhou-civic.jpg**：[杭州钱江新城 4.jpg](https://commons.wikimedia.org/wiki/File:%E6%9D%AD%E5%B7%9E%E9%92%B1%E6%B1%9F%E6%96%B0%E5%9F%8E_4.jpg)，摄影 **EditQ**，CC BY-SA 4.0。
- **hangzhou-leifeng.jpg**：[Leifeng Pagoda at Dusk.jpg](https://commons.wikimedia.org/wiki/File:Leifeng_Pagoda_at_Dusk.jpg)，摄影 **Yinweichen**，CC BY-SA 4.0。
- **hangzhou-westlake.jpg**：[Su Causeway near West Lake, looking towards north 20120529 1.jpg](https://commons.wikimedia.org/wiki/File:Su_Causeway_near_West_Lake,_looking_towards_north_20120529_1.jpg)，摄影 **DXR**，CC BY-SA 4.0。
- **hangzhou-baima.jpg**：[15th China International Cartoon & Animation Festival.jpg](https://commons.wikimedia.org/wiki/File:15th_China_International_Cartoon_%26_Animation_Festival.jpg)，摄影 **Leiem**，CC0。
- **hangzhou-nanshan.jpg**：[Nanshan Rd 20161006.jpg](https://commons.wikimedia.org/wiki/File:Nanshan_Rd_20161006.jpg)，摄影 **Tyg728**，CC BY-SA 4.0。

六张照片均等比缩放至1600像素宽，保留完整画面；放大、点云与框选共用原图坐标。目标只对应实际可见的人、车辆、路牌、设施或地标。地标和道路设施用于观察，四类道路目标仍按车辆、行人、骑行者和交通标志累计积分。

扫描探照镜内的绿色二维边缘点、透视框、扫描光带与毫米波测距是教学叠层，不是从照片重建的真实三维点云；雨雾也会影响激光雷达。作者、许可和来源随实验截图与报告保留。CC BY-SA照片的改编图像遵循相同许可。详细元数据见`src/assets/scenes/sources.json`。

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
