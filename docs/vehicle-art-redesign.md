# 2D车辆重做

已在 GitHub 分支 `codex/car-model-redesign-20261109` 保存重做前版本 `fba9406`。

采用 Google Noto Emoji（5126星，2026-11-09查询）汽车、SUV、赛车的2D SVG轮廓，统一右向行驶。缩减配色为车漆、深色下裙、浅蓝玻璃、炭灰轮胎和浅银轮毂。新增同风格俯视SVG。保留三款车型、换色和车轮转动；移除原有手绘的伪金属渐变和多层车壳。

来源比较：Microsoft Fluent Emoji 10205星，Google Noto Emoji 5126星，Twitter Twemoji 17812星。Fluent具有较多模糊滤镜，Twemoji较符号化；Noto纯路径轮廓适合当前Canvas与可编辑SVG共用，不引入异步图片加载。

安装并使用的技能：
- `game-art`：sickn33/agentic-awesome-skills，49393星，固定提交 `828257c3037dc7c3c3ec987decc5a603025a0ce5`。
- `svg-skill`：linyaosky/svg-skill，7星，固定提交 `2103b92cb47f588a97a6c38aa6c40571fadbd4f8`。这是低星的专项补充，非高星项目。

检查范围：技能说明及引用文件、随附验证脚本；SVG XML结构、路径和填色、脚本/事件/外链检查、来源哈希；浏览器全车型与全部入口、Canvas/SVG一致性、海报导出、离线文件。只导入静态路径，不运行上游脚本。

来源链接：
- [game-art](https://github.com/sickn33/agentic-awesome-skills/tree/828257c3037dc7c3c3ec987decc5a603025a0ce5/skills/game-development/game-art)：已安装到 `~/.codex/skills/game-art/`；检查后采用统一轮廓、配色与实际游戏尺寸预览原则。
- [svg-skill](https://github.com/linyaosky/svg-skill/tree/2103b92cb47f588a97a6c38aa6c40571fadbd4f8)：已安装到 `~/.codex/skills/svg-skill/`；检查说明、场景示例、引用资料和验证脚本，采用独立SVG、可缩放路径与可访问名称。
- [Noto 2D SVG](https://github.com/googlefonts/noto-emoji/tree/99701e07d3d1fe1bdbcdb14964547f0fd592966f/2D/svg)：素材保留原文件，转换由 `scripts/import-vehicle-art.py` 执行。

原始素材 SHA256：
```text
city     0ed788aa0d922d69a031b7ece7e862e254b9cd07e3c7e6974e0f5ac5694cb549
touring  e717809227d3880bb8446e45caf7b50b80cd71e6c45bb1e9bb5239ed8a8332da
sport    fa3f6228a6c8913e76a147b11aa5c4a2f70e9c581efb9b2624c96312a54d9573
```

验证结果：7项单元测试通过，TypeScript/Vite构建通过。三款侧视与俯视经过浏览器SVG/Canvas像素比对（忽略地面影子及微小抗锯齿差异，差异通道比例最大0.0000082）。实际检查首页、车间、AI、能量、感知工具、报告；390px六页无横向溢出。三条路线、重试、暂停、星级存档回归通过。离线断网完成山顶任务，实际导出2000×2400海报与1920×1200车辆作品，页面运行错误0。预览见 `docs/preview/vehicle-models.png`。

实施清单：
- [x] 安装并读取两项skill，记录检查结果。
- [x] 从固定提交获取原始素材，生成Canvas/SVG共享路径及配色。
- [x] 重做三款俯视车型，替换首页、游戏卡片、工坊、感知、AI、能量、报告和海报。
- [x] 测试换色/车轮/注入防护，视觉检查、断网导出、构建并更新离线HTML。
