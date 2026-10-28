# #114 / #133：定稿像素墙体、四向门与障碍铺底

2026-10-28。运行实现 `d45feff1e649eca26904bd8fbcc8fe1ab5fe287a`，base main `0ea5e721bf2329276f262a2c4e72643437be5f0a`。src tree `32d34f236225f4cb55b32e2b366673ad1be46eb8`，public tree `75f326c09d32698c44a03a8e67ea228405f1c3a7`。后续提交仅补截图、报告和说明。旧 Claude review 5686698325 只覆盖 f386549，PR 继续 Draft，等待当前 head 复审及负责人游戏实景/真机验收。未改 main、未合并、未启用/触发/重跑远端 CI。

## 最终实现

负责人最终接受 wall-model-v17，并要求提交后展示四向门连接效果。以负责人上传的四块完整墙砖为选定输入，内置 imagegen 去除外部浓黑框、整理平直边缘，再大幅压暗下部并改为清晰像素色块。顶部为大正方形中央凸起小正方形，明显亮于墙身。输入、边缘处理中间图、最终 PNG 和完整两步提示词均在 art-src/maps；不拼接旧素材。源 PNG 原样保存，运行时无损 WebP 解码 RGBA 相同。

源图视觉比例为近似值，渲染器读取同一完整模型的顶/身区域，最近邻校准为 80×80 顶部与 80×96 墙身，严格保证下部高宽比 1.2（顶部另算）。实际占地 8×8 在物理轮廓外，墙身投影高 9.6；同一朝向按 y/x 绘制，横排露出墙身、竖排覆盖前排墙身，凹凸角沿同一网格衔接。当前只支持既有轴对齐轮廓，更多房型及 45° 排列留 #115，斜墙不放门。

仓库中的上下门来源为 art-src/maps/sources/doors-v1.png，保留原模型、40×30 尺寸和原 origin；下侧门上移 3.6 世界单位，使图像顶部与相邻墙顶 `port.y − 9.6` 对齐。左右门采用已确认的新 side-doors-v2、13×38，向外偏移 6。门位完整留空，不在门后填墙块。只调整门的显示位置，没有移动物理 port、传送入口或触发范围。

地板、独立障碍和机关平齐边沿一并接入。奶池地板降低亮度以区分 Boss 奶白提示；水流/海草重复间距 32、地刺 16。模块门不依赖旧 ART.doors，宝箱/出口单独检查物件图集，缺失时保留灰盒。合并后 main 自动部署将以正式模块画面替换 #132 线上灰盒；主城复用石殿材质。

### 障碍脚下露黑加急修复

负责人指出不规则障碍周围像没有地面。地板 alpha 实际已完整，原因是额外绘制了覆盖碰撞矩形的 70% 深色底板，透过模型透明边缘形成矩形黑区。`4bae910` 已移除该底板，保留连续地板和素材自带阴影，最终 d45feff 包含此修正。没有修改图片透明度、模型轮廓、碰撞或可行动面积。

新回归在修复前确实失败：石殿 9,920 个地面样本中 7,986 个被底板改变。最终四主题、桌面和手机横屏均检查单块/横排/竖排障碍的整个底层地板及周边，地面变化数和透明空洞数均为 0，同时确认源模型确有透明区域。

## 实际截图

本目录当前 48 张图片均为最终 v17 浏览器实拍，没有后期补画。正常入口采用 `?scene=Game&seed=42&god=1&floor=N`；手机横屏为浏览器模拟，并非真机。近景由同一生产 DemoSession/RoomArena 夹具拍摄，摄影机倍率 12，整房 4.25，仅用于检查衔接，不修改生产倍率。专门的四向图从 seed 42 开始确定性选择实际存在对应出口的生成房间，Boss 层也如此；旧通用 door 图优先北门，seed 42 的 Boss 仅有侧门。

| 主题 | 上门                                  | 下门                                  | 左门                                | 右门                                |
| ---- | ------------------------------------- | ------------------------------------- | ----------------------------------- | ----------------------------------- |
| 石殿 | [north](wall-art-v2/temple-north.png) | [south](wall-art-v2/temple-south.png) | [west](wall-art-v2/temple-west.png) | [east](wall-art-v2/temple-east.png) |
| 沉船 | [north](wall-art-v2/wreck-north.png)  | [south](wall-art-v2/wreck-south.png)  | [west](wall-art-v2/wreck-west.png)  | [east](wall-art-v2/wreck-east.png)  |
| 深渊 | [north](wall-art-v2/abyss-north.png)  | [south](wall-art-v2/abyss-south.png)  | [west](wall-art-v2/abyss-west.png)  | [east](wall-art-v2/abyss-east.png)  |
| 奶池 | [north](wall-art-v2/milk-north.png)   | [south](wall-art-v2/milk-south.png)   | [west](wall-art-v2/milk-west.png)   | [east](wall-art-v2/milk-east.png)   |

| 主题 | 整房                                | 正常游戏                                        | 障碍近景                                    | 密集横屏                                     |
| ---- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| 石殿 | [room](wall-art-v2/temple-room.png) | [production](wall-art-v2/temple-production.png) | [obstacle](wall-art-v2/temple-obstacle.png) | [dense](wall-art-v2/temple-dense-mobile.png) |
| 沉船 | [room](wall-art-v2/wreck-room.png)  | [production](wall-art-v2/wreck-production.png)  | [obstacle](wall-art-v2/wreck-obstacle.png)  | [dense](wall-art-v2/wreck-dense-mobile.png)  |
| 深渊 | [room](wall-art-v2/abyss-room.png)  | [production](wall-art-v2/abyss-production.png)  | [obstacle](wall-art-v2/abyss-obstacle.png)  | [dense](wall-art-v2/abyss-dense-mobile.png)  |
| 奶池 | [room](wall-art-v2/milk-room.png)   | [production](wall-art-v2/milk-production.png)   | [obstacle](wall-art-v2/milk-obstacle.png)   | [dense](wall-art-v2/milk-dense-mobile.png)   |

同目录还保留各主题 door/corner/side-open/side-locked。截图 SHA-256、Git blob 和字节数见 verification.json，上传后核对远端与本地一致。

## 最终验证及历史边界

- 最终 `npm run check`：格式、ESLint、TypeScript、64 文件 / 522 单测、构建、PWA 通过。
- 最终 Chromium 桌面/手机横屏定向批次：32/32 通过，0 失败、跳过、重试，约 4.8 分钟。覆盖四主题正常入口、9,216 顶部像素方向对照、竖排覆盖、接缝/轮廓/门位、障碍铺底、密集场景、四向门与南门对齐、七图集离线加载及连续更新。逐项结果见 [verification.json](wall-art-v2/verification.json)。
- v12 实现 85ce678 的较宽批次为 70 通过 / 2 条件跳过，见 [verification-before-floor-fix.json](wall-art-v2/verification-before-floor-fix.json)。它另覆盖每端 800 个组合布局、生产几何/危险区恢复、镜头、同版本飞行弹体恢复与更新保全档案；不是最终 v17 的重测。旧截图在提交 0dc175b。
- 障碍修正首批 28 通过 / 4 失败：新增障碍近景误选石殿/沉船没有静态障碍的 combat_0，读取不存在模型的 x。仅该焦点改选现有 combat_1，全部 8 个墙体用例复跑通过；见 [verification-floor-fix.json](wall-art-v2/verification-floor-fix.json)。其中中间截图仅保留摘要，当前同名文件已是最终 v17。该夹具修正也在最终 32/32 批次重验。
- 首个铺底 check 的新增夹具 tuple 展开类型错误已修正；另一次构建进程没有完成记录，随后重新完整 check。更早失败包括 800 房批量超默认 30 秒（仅该用例改 120 秒）、保存前弹体撞墙（改朝房内开火，保留恢复断言）、v4 加载监听器写死旧文件名（改核对 MAP_ART.sources）。v4 为 62 通过 / 2 跳过 / 8 失败，v11 在文档格式检查停止，均不算最终通过。
- [negative-control.json](wall-art-v2/negative-control.json) 在 v12 时只将 ModularRoomArt 替换为未改的 f386549，其他采用当时素材和探针；按预期识别方向/接缝/门位问题。不是完整旧版本性能基准，也未伪称 v17 新跑。
- WebKit/Safari、物理手机、长期内存及换房峰值没有新验收。现有面积、19 房型单连通、79,200 次出生采样沿用 Claude 对 f386549 的独立复核：最终画面修订没有修改房型、sim、AI、武器、锚点、RNG 或碰撞。

## 资源与性能

七张运行时 WebP 共 8,994,528 字节，比初版三张增加 4,331,808 字节；各 <2 MiB，PNG/WebP 解码 RGBA 逐像素相同。旧 v12 WebP 已从 public 删除，来源 PNG 保留为历史。最终预缓存 27 项、20,832,628 字节，对照 f386549 的 23 项、16,497,258 字节，增加 4,335,370 字节。二进制均走文件通道，不经 Base64 工具参数。

烘焙密度从 4 提高为 8，主 CanvasTexture 2624×1856，另有同尺寸离屏墙层及四个 80×176 模块缓存。仍为一个地面 Image 和 16 个障碍槽，无新增每帧逻辑。每个大画布 RGBA 约 18.58 MiB；旧主画布约 4.65 MiB，离屏墙层为本批新增；模块缓存共约 220 KiB，四主题 pattern 最多另约 16.25 MiB，四个新图集解码约 24 MiB。CPU/GPU 可能各留副本，不能把理论像素字节当实测显存。换房仍整幅重绘/上传，需真机检查内存和卡顿。

最终 ABAB 见 [performance.json](wall-art-v2/performance.json)：f386549 原生产构建与最终 v17，同一 seed 42、1920×1080 DPR1、30 怪 +400 弹、每段至少 240 个真实渲染帧、没有其他浏览器测试并行。标准 StressRun 含几何/AI/导航和常规渲染，不含 HazardLayer，也不代表四主题密集机关或手机 FPS。两对 FPS 为 18.71→18.45（−1.34%）和 18.23→18.34（+0.61%），p95 为 106→102 ms 与 103→108 ms；draw call 均 9、对象均 746。差异方向不一致，不据此宣称提速或性能无回退，SwiftShader 结果不能代替真机。

较早 v12 的两对 FPS 为 18.43→18.27（−0.85%）、18.48→18.12（−1.95%），p95 为 104→109 / 98→109 ms，draw call 9、对象 746；原始记录另存 performance-before-lighting.json，不冒充最终数据。

## 仍需负责人验收及后续事项

负责人已确认原稿，实际门墙画面、行走时细素材闪烁、手机密集战斗 FPS/换房卡顿仍待试玩。整个 #133 扩大了前三层房间外墙，保留 #132 已接受的弹跳耗反弹次数、回旋镖折返、光束止墙行为，需留意外墙手感；此轮画面修订没有再次移动物理外墙。更新后结束旧冒险并回菜单，保全天赋点、已购天赋和局外档案，同版本恢复保留。

非阻塞后续：三个房型奖励安全回退仍可能在左上角；桶 18×23 画面与直径 14 身体/hit 帧比例仍按 Claude #119 校准；恢复首帧 stageView 旧矩形 clamp、旧图清理与其他图集导出密度未在本批扩展。当前只做既有 19 房型，#115–#119/#129 不提前启动。
