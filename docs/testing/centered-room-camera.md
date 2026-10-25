# 边缘居中镜头验收（2026-10-25）

基于 main `c1b75f6`（#96 已合并）。负责人要求人物移动到房间边界时仍在画面中央，房间外用纯黑背景填充。对应 ADR 0034。

## 改动与范围

- 主城和正式地牢移除房间边界限位及平滑跟随偏移，每帧按玩家身体中心直接计算镜头滚动，保留最终渲染像素对齐。
- 删除墙砖背景 TileSprite，改为世界相机 `#000000` 清屏；地面、边墙与门的贴图保持原尺寸和位置。少一个背景显示对象，无新纹理或逐帧分配。
- 原有渲染分辨率、桌面/手机倍率、覆盖式 HUD、方向提示与操作布局保留。sim、碰撞、随机、存档、输入、角色与武器资源未改；灰盒和压力场景不使用此镜头，保持原样。

## 实测

`roomCamera.spec.ts`：桌面与 Pixel 7 横屏，2 workers、0 retries，8 通过、2 条件跳过、0 失败。新增四角行走测试使用真实键盘移动输入，持续推到碰撞边界并等位置稳定，不直接写玩家坐标；每个渲染帧抽样居中误差。原有门口、切房、横屏尺寸、鼠标瞄准及主城切换触控测试继续保留，并加强居中断言。

| 场景                 | 最大居中误差（渲染像素） | 四个墙角停止位置                         | 房间外抽样                           |
| -------------------- | ------------------------ | ---------------------------------------- | ------------------------------------ |
| 桌面 1280×720        | 0.481711 以下            | (110,53)、(370,53)、(110,217)、(370,217) | 四张截图的 5×5 像素块均为 RGB(0,0,0) |
| Pixel 7 横屏 863×360 | 0.5                      | 同上                                     | 四张截图的 5×5 像素块均为 RGB(0,0,0) |

截图由真实生产构建生成，黑色检查读取 PNG 像素；抽样坐标及逐角数据见 [centered-room-camera.json](centered-room-camera.json)。截图显示人物在画面中心，实体墙沿在人物外侧，房间外显示纯黑；HUD 和触控仍覆盖在画布上。

`npm run check` 全通过（49 个测试文件、359 项单测及格式、ESLint、类型、构建）。随后同样以 2 workers、0 retries 顺序运行相关 e2e：`hub`、`input`、`aim`、`mobileFire`、`uiLayout`、`resumeProduction`、`debug`、`face`，33 通过、9 条件跳过、0 失败。加上镜头套件，合计 **41 通过、11 条件跳过、0 失败**；条件跳过来自桌面/手机适用范围，未修改原跳过条件。

本轮为定向回归，未重跑完整 e2e、PWA 离线套件或 WebKit。复现命令：

```sh
npm run check
npm run test:e2e -- tests/e2e/roomCamera.spec.ts --project=desktop --project=mobile-landscape --workers=2 --retries=0
npm run test:e2e -- tests/e2e/hub.spec.ts tests/e2e/input.spec.ts tests/e2e/aim.spec.ts tests/e2e/mobileFire.spec.ts tests/e2e/uiLayout.spec.ts tests/e2e/resumeProduction.spec.ts tests/e2e/debug.spec.ts tests/e2e/face.spec.ts --project=desktop --project=mobile-landscape --workers=2 --retries=0
```

环境为 Node 24.22.1、项目锁定依赖、独立 Chromium 153.0.8010.0 软件渲染运行器；仓库 Node 配置、依赖与锁文件未改。本地环境缺中文字体，截图中文字可能显示方框，游戏字体配置未变。此次验证不代表 iPhone 真机或 Safari 性能达标；没有启用或触发远端 CI。

## 手动复核

1. `?scene=Game&seed=42&god=1`：沿对角线走到四个墙角，检查移动中和抵墙后人物均居中，房间外露出纯黑。
2. 接近门口、穿门、暂停退出后继续冒险：检查镜头直接定位到人物，门和方向标记可读。
3. 从标题页回到主城，走向边墙与地牢门；手机双指移动加射击，调整横屏窗口，确认 UI 固定在画布上。

靠近墙角时黑色可能占据较大画面面积，这是本次指定的表现；没有因此缩小地图碰撞范围或放大角色。
