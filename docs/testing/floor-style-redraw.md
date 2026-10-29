# 地板风格全套地图美术接入验证（2026-10-29）

本页记录初次 head `75f142c` 的素材接入验证。#139 复审后负责人要求修改障碍/地刺实际尺寸，最新变化和重新运行结果见[完整模型增量](whole-map-models.md)；下文“未改 sim/碰撞/伤害范围”仅描述初次版本。

基线 main `a400fbabaa171bfb1ce7dc5a0ce75fdad0d9f641`（#138 已合并），分支 `gpt/114-floor-style-redraw`。负责人已授权整批新素材应用；本批等待新 head 的 Claude 交叉复审和负责人真机验收，由负责人合并。未改 main，未启用、触发或重跑远端 CI。#114 不提前关闭。

## 本批行为

- 保留 ground-v7 的四主题十款方砖和原有随机铺法。墙体使用负责人唯一选定的 v19 十二款原图，每主题三款按房间种子、主题、网格坐标稳定选取，顶面与墙身整块成对；不推进共享随机流。
- 新四向门、障碍、机关边框、机关/交互物、主城补给与环境特效全部注册并替换原有使用点。四主题分别使用自己的出口水晶，以及地刺 idle/warn/on 三态；切换房间主题及恢复时同步更新，底座颜色对应地板。
- 墙和门只进行整块等比缩放。源轮廓与模型稍有比例差异时使用统一 cover 裁掉少量外缘（测试覆盖超出目标尺寸不足 10%），不分段或分别沿 X/Y 拉伸；原始 PNG 不改像素。方形机关及交互物通过透明帧留白匹配实际比例，保持底部锚点。机关边框中段重复/截短，不拉长。
- 15 张运行图、128 个命名帧全部有源图、测量和导出记录。旧通用水晶/地刺帧不再注册；灯、苔藓、珊瑚、碎屑和关闭宝箱等预留帧仍可复用，不额外增加游戏对象或机制。
- `src/sim`、碰撞/伤害/时序、掉落、存档结构均未改动。手册和后续同系列生成 prompt 已更新；生成记录保留原始 prompt，参考图字段明确为仓库内复现参考，不冒充历史调用参数。

## 本地检查

| 检查            | 本批结果                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` | 格式、ESLint、TypeScript、65 文件 / 529 单测、Vite/PWA 构建全部通过                                                          |
| 针对性单测      | mapArt + mapArtGeometry 共 13 项通过；覆盖帧与主题路由、整块等比缩放、边缘裁切范围、墙随机稳定且不推进共享 RNG、边框重复跨度 |
| Chromium E2E    | 105 通过、1 条件跳过、0 失败、0 flaky；单 worker、零重试，一次整批完成                                                       |
| 覆盖            | productionGeometry、mapLayers、pwa、smoke、save；桌面和模拟 Pixel 7 横屏                                                     |
| 四主题机关      | 1→2→3→4→1 往返，每层检查 idle/warn/on；出口水晶及地刺主题帧正确，图像 X/Y 缩放一致                                           |
| 离线            | 两种视口完成预缓存、离线重开、新图加载/解码以及更新流程回归                                                                  |
| 存档与种子      | 现有保存/恢复、输入中立和清房回归通过；无玩法随机改动                                                                        |
| 图集            | 15 张 PNG/WebP 解码 RGBA 全部逐像素相同；128 帧无越界；每张 WebP 小于 2 MiB                                                  |

运行命令为 `npm run test:e2e -- --config <本机 Chromium 配置> productionGeometry.spec.ts mapLayers.spec.ts pwa.spec.ts smoke.spec.ts save.spec.ts`。配置复用仓库 Playwright 项目，仅排除不可用的 WebKit，指定本机 Chromium 可执行文件/字体和软件渲染启动参数；workers=1、retries=0。唯一跳过为桌面项目不适用的手机竖屏检查。原始结果的测试标题、项目、状态、耗时与重试次数保存在[机器记录](floor-style-redraw.json)。这不是全仓库所有 E2E 文件的覆盖结论。

## 资源与成本

| 指标                     |  main 基线 |       本批 |        差值 |
| ------------------------ | ---------: | ---------: | ----------: |
| 地图运行 WebP 总字节     | 10,732,070 | 11,942,478 |  +1,210,408 |
| 源纹理解码 RGBA 理论字节 | 75,492,264 | 94,357,984 | +18,865,720 |

最大单张 WebP 为 1,123,724 字节。构建预缓存为 35 项，构建器报告 23,228.34 KiB。已移除 8 张被替代且无当前运行注册/加载引用的 v3/v18 WebP；原稿和历史验证保留，未缩减 Git 历史。本批新增南门、独立水晶与地刺图集，因此下载与纹理内存增加；上述 RGBA 为源图宽×高×4，不是实测进程/GPU 峰值。详细原稿与运行图摘要见 [export-report](../../art-src/maps/export-report.json)。

v19 原件 SHA-256：`e9cbf46c6b37fd01a26805ef2a62b2bc0d0e9e5e55db710b43839915fc24905f`，与负责人上传版本一致。

## 实景

以下均来自本批生产画面测试。主题机关截图的角色可能遮住局部水晶，自动断言另外核对实际帧、底座主题与等比缩放。

| 主题 | 房间 / 墙体随机                            | 侧门锁定                                          | 环境与交互                                     | 水晶 / 地刺开启                                 |
| ---- | ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| 石殿 | [房间](floor-style-redraw/wall-1-room.png) | [侧门](floor-style-redraw/wall-1-side-locked.png) | [环境](floor-style-redraw/unified-zones-1.png) | [机关](floor-style-redraw/themed-temple-on.png) |
| 沉船 | [房间](floor-style-redraw/wall-2-room.png) | [侧门](floor-style-redraw/wall-2-side-locked.png) | [环境](floor-style-redraw/unified-zones-2.png) | [机关](floor-style-redraw/themed-wreck-on.png)  |
| 深渊 | [房间](floor-style-redraw/wall-3-room.png) | [侧门](floor-style-redraw/wall-3-side-locked.png) | [环境](floor-style-redraw/unified-zones-3.png) | [机关](floor-style-redraw/themed-abyss-on.png)  |
| 奶池 | [房间](floor-style-redraw/wall-4-room.png) | [侧门](floor-style-redraw/wall-4-side-locked.png) | [环境](floor-style-redraw/unified-zones-4.png) | [机关](floor-style-redraw/themed-milk-on.png)   |

## 已知限制

本批没有 WebKit、手机真机或 FPS/换房耗时实测；模拟横屏和离线检查不能替代真机验收。运行图仍保留高分辨率原稿尺寸，后续可另导出更小的运行图并单独验证像素风格、帧边界和缓存收益。地板细线移动闪烁、完整房间画布上传成本、StressRun 南墙物理、奖励左上角和桶显示/碰撞差异沿用此前记录，不在本批顺带修改。墙体及门内部保留选定图的深色结构阴影，不能按外缘去黑框规则删掉。
