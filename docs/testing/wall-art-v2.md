# #114 / #133：长方体墙体与四主题画面复修

日期：2026-10-28。对照为被负责人否决画面的 `f3865490d928ad1056e0c3ff1f08101ec58ae0c4`；原 Claude review [5686698325](https://github.com/marchosias142857/ai-vs-naiwa/pull/133#pullrequestreview-5686698325) 不覆盖本次改动。PR 保持 Draft，等待新 head 复审和负责人画面、真机验收。未改 main、未合并、未启用/触发/重跑远端 CI。

## 本批结果与边界

负责人要求采用长方体底座加顶部装饰。本次沿实际轮廓外侧放置 8×8 模块，墙顶向上投影 6，按 y/x 绘制：横向并排保留底座，纵向由后一个顶部盖住前一个底座。凹凸角与四向门复用同一素材，不旋转整张正面。门框背后保留墙体，视觉洞口半宽 12，避免四向门 PNG 的透明边角露出黑缝；这不是对门触发半宽 18 或碰撞的修改。

新增四主题安静地板与独立长方体障碍的两张原始 PNG、对应无损 WebP、完整提示词和可重复导出脚本。地板镜像重复使边缘像素匹配；四主题分别使用石材、木板、玄武岩、石灰岩。已有苔藓、珊瑚、灯具仅烘焙在边缘。机关平齐边沿不作为障碍；水流、海草材质重复间距增至 32，地刺仍为 16。障碍按完整块填满原尺寸，消除半块端点。

顺带落实旧复审的资源检查项：模块门不再依赖旧 ART.doors；宝箱/出口分别检查物件图集，缺失时保留灰盒。没有更改 AI、武器数值、桶/障碍/角色碰撞、房型、锚点或 RNG。仍是现有 19 个房型，普通层 8 房；更多房型和 45° 排列留 #115。新增单测明确拒绝当前网格之外的轮廓。

本次只改表现层，上一轮独立面积证据继续适用，不能算重新测量：计入未破桶与玩家半径 6，前三主题合法中心连通面积均不低于 legacy_v1，奶池/Boss 为 100%，19 房型单连通。完整原始面积与 79,200 次出生采样见[历史记录](modular-map-art.md)。外墙位置与 `f386549` 相同，因此没有这次画面复修新引入的武器碰墙距离变化；#132/#133 已接受的弹跳耗次数、回旋镖折返、光束止墙行为仍保留。

## 实际截图

均为浏览器直接保存，没有后期补画。`production` 是正式游戏入口 `?scene=Game&seed=42&god=1&floor=N` 的正常摄影机；`room/door/corner` 是同一生产 DemoSession、RoomArena 和模板的验收夹具，整房摄影机倍率 4.25、近景 12，只为检查衔接，没有改变生产倍率。密集场景含真实角色、弹体、机关及危险提示，手机横屏是浏览器模拟而非真机。

| 主题 | 整房                                | 门洞                                | 转角                                    | 正常游戏入口                                    | 密集横屏                                            |
| ---- | ----------------------------------- | ----------------------------------- | --------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| 石殿 | [room](wall-art-v2/temple-room.png) | [door](wall-art-v2/temple-door.png) | [corner](wall-art-v2/temple-corner.png) | [production](wall-art-v2/temple-production.png) | [dense-mobile](wall-art-v2/temple-dense-mobile.png) |
| 沉船 | [room](wall-art-v2/wreck-room.png)  | [door](wall-art-v2/wreck-door.png)  | [corner](wall-art-v2/wreck-corner.png)  | [production](wall-art-v2/wreck-production.png)  | [dense-mobile](wall-art-v2/wreck-dense-mobile.png)  |
| 深渊 | [room](wall-art-v2/abyss-room.png)  | [door](wall-art-v2/abyss-door.png)  | [corner](wall-art-v2/abyss-corner.png)  | [production](wall-art-v2/abyss-production.png)  | [dense-mobile](wall-art-v2/abyss-dense-mobile.png)  |
| 奶池 | [room](wall-art-v2/milk-room.png)   | [door](wall-art-v2/milk-door.png)   | [corner](wall-art-v2/milk-corner.png)   | [production](wall-art-v2/milk-production.png)   | [dense-mobile](wall-art-v2/milk-dense-mobile.png)   |

## 自动检查

结果数据见 [verification.json](wall-art-v2/verification.json)。完整检查涵盖格式、ESLint、TypeScript、64 个文件 / 521 项单测、构建和 PWA。浏览器检查包含两个 Chromium 项目（桌面与手机横屏）：四主题正常入口、800 个组合布局、墙体像素检查、生产几何/危险区恢复、缺素材回退、密集场景、镜头、PWA 离线及更新、同版本战斗续玩。WebKit 仍因现有环境不可用而未运行。

墙体检查比较每主题 2,304 个顶部像素；检查横向底座、纵向覆盖、镜像地板接缝、门框底部覆盖、四向开口，以及真实轮廓与深凹口夹具外侧超过 7,000 个点。纯函数检查整块占地在物理轮廓外、顺序稳定、反转多边形仍一致。`negative-control.json` 仅将渲染器替换回未经修改的旧 `f386549`，验证新像素检查能识别旧表现，工作树源文件未替换。

过程中的失败如实保留：首次墙块占地测试采样离边界 0.01，落在既有接触容差 0.02 内；改为距离 0.125 的内部探针。首次完整浏览器轮次为 58 通过、2 跳过、2 失败，两项均是每测试连续烘焙 800 房超过默认 30 秒；保留全部断言并将该批量测试单独设为 120 秒，重新执行。近景还发现侧门透明角露底，随后缩小视觉清空范围并补门框覆盖断言；本目录截图来自修复后版本。

## 资源与性能

5 张运行时 WebP 共 7,378,730 字节；较旧 3 图集增加 2,716,010 字节。每张 <2 MiB，PNG 与 WebP 解码 RGBA 逐像素相同；导出临时文件放在 public 之外，防止半写文件进入离线清单。新增 PNG/WebP 使用网页文件选择器原样上传，远端 Git blob SHA 和字节数需与本地一致。

仍只有一张 1312×928 CanvasTexture、16 个障碍槽位；新离屏墙层占约 4.65 MiB CPU 像素内存，微型模块缓存约 28 KiB。两张新源图解码合计约 12 MiB，旧资源仍预加载；不能把传输字节数当作显存用量。每次换房重绘并上传整张画布，新增素材与地板重复仍可能带来采样闪烁和换房卡顿。

[performance.json](wall-art-v2/performance.json) 使用原生产 StressRun 在旧 `f386549` 与候选之间做 ABAB：1920×1080、DPR 1、seed 42、30 怪 + 400 弹、每段至少 240 渲染帧，不并行运行浏览器测试。两侧都有模块美术，保持原有固定压力场景。它不含 HazardLayer，也不是四主题全部机关与真机 FPS；原始帧率、p95、draw calls、对象数量和预缓存精确字节均保留。

## 仍待确认

- 画面是否达到已接受 v2 参考图的方向，由负责人看本次实际截图和试玩确认；不把自动化通过写成画面已验收。
- 真机移动时障碍、机关、桶、地雷是否闪烁，密集战斗帧率和换房上传卡顿；WebKit / Safari 仍需实际设备验证。
- 旧复审已指出奖励安全回退取 y/x 首个候选，三个房型可能落在左上角；本批未改锚点，最近合法候选建议仍待后续处理。
- 桶显示 18×23、身体直径 14 及 hit 帧纵横比仍沿用；没有修改 Claude #119 校准的身体。
- 同版本恢复首帧 stageView 的旧矩形 clamp、旧素材清理、导出目标密度仍待后续优化，本批不声称已解决。
