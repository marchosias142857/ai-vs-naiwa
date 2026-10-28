# #114 / #133：长方体墙体与四主题画面复修

日期：2026-10-28。对照为被负责人否决画面的 `f3865490d928ad1056e0c3ff1f08101ec58ae0c4`；原 Claude review [5686698325](https://github.com/marchosias142857/ai-vs-naiwa/pull/133#pullrequestreview-5686698325) 不覆盖本次改动。PR 保持 Draft，等待新 head 复审和负责人画面、真机验收。未改 main、未合并、未启用/触发/重跑远端 CI。

## 本批结果与边界

墙体使用专门生成的 wall-model-v12，和 blocks-v2 障碍分开。按负责人最新意见去掉大裂纹、明显破损和醒目重复图案，以门的细节密度、材质与描边为参考。负责人已接受此稿并授权接入。原 PNG 是完整相连的新模型，顶部以浅纹区分下部，适度简化噪点并略加强像素感，外轮廓平直、没有浓黑框。没有用旧素材拼接；原图视觉比例是近似值，运行时以最近邻采样组装成 80×80 顶部 +80×96 墙身，严格保证墙身（顶部另算）高/宽为 1.2。实心底色与方形裁剪保证顶部外轮廓整齐，装饰不越界。没有旋转正面图片：8×8 世界单位的墙块沿实际物理轮廓外侧按 y/x 排序，横向显示完整底座，纵向由后画的顶部覆盖此前墙身，转角使用同一模块。

门位完整留空，不在门后垫墙块。上下门保留 doors-v1 原模型、40×30 尺寸与原 origin；左右门接入新生成的 side-doors-v2 开/锁状态，13×38、向轮廓外偏 6，使门柱对齐墙带。未来 45° 墙不设门。当前只有已有 19 房型、普通层 8 房，更多布局留 #115；现有渲染器明确拒绝斜边和偏离 8 单位网格的轮廓。

新增地板、独立障碍、专用墙体组件、侧门共四张原始 PNG 及对应无损 WebP、提示词和可重复导出脚本。地板以镜像重复匹配边缘，奶池地板降低亮度，区分奶白 Boss 提示。机关使用平齐边沿；水流/海草重复间距 32、地刺 16；障碍按完整块排列。单独墙顶摆件已移除，避免破坏正方形外轮廓，门体自带灯具保留。

落实旧复审资源检查项：模块门不依赖旧 ART.doors；宝箱/出口检查物件图集，缺失时保留灰盒。没有更改 AI、武器数值、桶/障碍/角色碰撞、房型、锚点或 RNG。本次房间物理数据与 `f386549` 相同，先前面积与 79,200 次出生采样证据继续适用，不能记成新测量。旧记录见 [modular-map-art.md](modular-map-art.md)。#132/#133 已接受的弹跳耗次数、回旋镖折返、光束止墙行为保留，本次画面修订没有再次移动物理外墙。

## 实际截图

均由浏览器直接保存，没有后期补画。`production` 为正式入口 `?scene=Game&seed=42&god=1&floor=N`、正常摄影机；其余整房/近景使用同一生产 DemoSession、RoomArena 和模板的验收夹具，整房倍率 4.25、近景 12，仅用于检查衔接，未改变生产倍率。手机横屏是浏览器模拟，不是真机。所有截图需与本目录 verification.json 的候选资源摘要对应。

| 主题 | 整房                                | 上下原门                            | 转角                                    | 新侧门开                                 | 新侧门锁                                     | 正常游戏                                        | 密集横屏                                     |
| ---- | ----------------------------------- | ----------------------------------- | --------------------------------------- | ---------------------------------------- | -------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| 石殿 | [room](wall-art-v2/temple-room.png) | [door](wall-art-v2/temple-door.png) | [corner](wall-art-v2/temple-corner.png) | [open](wall-art-v2/temple-side-open.png) | [locked](wall-art-v2/temple-side-locked.png) | [production](wall-art-v2/temple-production.png) | [dense](wall-art-v2/temple-dense-mobile.png) |
| 沉船 | [room](wall-art-v2/wreck-room.png)  | [door](wall-art-v2/wreck-door.png)  | [corner](wall-art-v2/wreck-corner.png)  | [open](wall-art-v2/wreck-side-open.png)  | [locked](wall-art-v2/wreck-side-locked.png)  | [production](wall-art-v2/wreck-production.png)  | [dense](wall-art-v2/wreck-dense-mobile.png)  |
| 深渊 | [room](wall-art-v2/abyss-room.png)  | [door](wall-art-v2/abyss-door.png)  | [corner](wall-art-v2/abyss-corner.png)  | [open](wall-art-v2/abyss-side-open.png)  | [locked](wall-art-v2/abyss-side-locked.png)  | [production](wall-art-v2/abyss-production.png)  | [dense](wall-art-v2/abyss-dense-mobile.png)  |
| 奶池 | [room](wall-art-v2/milk-room.png)   | [door](wall-art-v2/milk-door.png)   | [corner](wall-art-v2/milk-corner.png)   | [open](wall-art-v2/milk-side-open.png)   | [locked](wall-art-v2/milk-side-locked.png)   | [production](wall-art-v2/milk-production.png)   | [dense](wall-art-v2/milk-dense-mobile.png)   |

## 自动检查

结果见 [verification.json](wall-art-v2/verification.json)。`npm run check`：格式、ESLint、TypeScript、64 个文件 / 522 项单测、构建和 PWA 通过。浏览器结果以该 JSON 最终记录为准，涵盖桌面和手机横屏 Chromium：四主题正常入口、800 个组合布局、墙体像素检查、生产几何/危险区恢复、缺素材回退、密集场景、镜头、PWA 离线与更新、同版本战斗续玩。WebKit 未在此环境运行。

每主题对比 9,216 个顶部像素，并检查完整横向墙身、纵向覆盖、镜像地板接缝、门位没有墙块、四向开口，以及真实轮廓和深凹口夹具外侧超过 7,000 个点。纯函数检查整块占地在物理轮廓外、排序稳定、反向多边形一致。[negative-control.json](wall-art-v2/negative-control.json) 只通过 Vite 插件替换回旧 `f386549` 渲染器，其余为当前素材、数据和探针；验证能识别旧渲染器，不是未经修改的旧版本性能或画面基准。

过程失败保留：首次占地探针离边界 0.01，落入既有 0.02 接触容差，改用 0.125 内部探针。第一次浏览器批次 58 通过、2 跳过、2 失败，均为一次连续烘焙 800 房超默认 30 秒；保留全部断言，仅该批量用例预算改 120 秒。中间轮次 59 通过、2 跳过、1 失败：桌面续玩测试在暂停落盘前飞行弹体已撞墙，保存前置断言失败；测试改为从入口朝房间内部真实开火，保留飞行弹体、原局快照一致与倒计时冻结的断言。期间的瘦高、过粗、裂纹过密草稿及门后垫墙方案均被负责人修订，不作为最终截图或当前规格。

## 资源与性能

中间 v4 轮次另有 8 个素材加载测试失败：监听器文件名写死 v2，漏计新版墙体（实际已加载），修订为按 MAP_ART.sources 核对全部 7 图集；其余 62 通过、2 条件跳过。v11 检查在文档 Prettier 阶段停止，未进入代码/浏览器检查；不计为通过。最终 v12 结果单独记录。

七张运行时 WebP 共 9,270,626 字节，比初版三张增加 4,607,906 字节。每张 <2 MiB，PNG/WebP 解码 RGBA 逐像素相同。导出临时文件放在 public 外，避免半写文件进入离线清单。图片通过网页文件选择器原样上传，远端 Git blob SHA / 字节数与本地核对。

为避免墙体的细像素在烘焙中损失，密度由 4 提高为每世界单位 8 像素：一张 2624×1856 CanvasTexture、同尺寸离屏墙层和四个 80×176 模块缓存，仍为 1 个地面 Image +16 个障碍槽位，无新增每帧逻辑。每个大画布 RGBA 像素约 18.58 MiB（此前各约 4.65 MiB），四模块约 220 KiB；CPU 暂存与 GPU 纹理可能各保留一份，不能将画布字节数当作整个进程或显存实测。四主题镜像地板和机关边沿 pattern 缓存最多另约 16.25 MiB（旧密度对应约 4.06 MiB）；四张新增图集解码约 24.0 MiB，旧资源仍预加载。换房仍整幅重绘并上传，画质提升有明确内存与上传成本。

[performance.json](wall-art-v2/performance.json) 为旧 `f386549` 与本候选的 ABAB：1920×1080、DPR 1、seed 42、30 怪 +400 弹、每段 ≥240 渲染帧，无其他浏览器测试并行。两侧运行原生产 StressRun，包含几何/AI/导航及常规渲染；不含 HazardLayer，不代表四主题机关密集场景或手机 FPS。原始 FPS、p95、draw calls、对象数量与预缓存精确字节均保留。800 房组合用例另记录每主题批量耗时；它含桥接调用与连续烘焙，不能等同单次真实换房延迟。

## 仍待负责人/后续确认

- 美术是否达到已确认概念图的方向，由负责人看实际截图与试玩确认；自动化通过不等于美术验收。
- 真机移动时障碍、机关、桶、地雷是否闪烁，密集战斗帧率、提高画布密度后的内存与换房卡顿；WebKit / Safari 需实际设备。
- 安全回退仍取 y/x 首个候选，三个房型奖励可能落在左上角；最近合法候选建议未在本批处理。
- 桶显示 18×23、身体直径 14 及 hit 帧纵横比未改，保留 Claude #119 身体校准。
- 同版本恢复首帧 stageView 的旧矩形 clamp、旧素材清理及其他图集的导出目标密度仍待后续优化。
