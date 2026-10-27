# 新青蛙图集 v3

#100 采用负责人最终选定的新青蛙设计，降低原生像素数与细节密度，以少量关键帧完成动作。`design.png` 是本轮从零生成的概念总览；`sources/` 是根据该新设计绘制的 16 张动作图与奶怪补充图。没有把旧 v1/v2 贴图或原始奶怪图当重绘参考。来源为本轮内置 ImageGen，提示词见 `prompts.json`，文件摘要见 `source-hashes.json`；不引入第三方素材包。

## 重建

使用 Python 3、Pillow、numpy（与现有美术工具环境一致，无新增 npm 依赖）：

```sh
python art-src/monsters-v3/build.py --preview /tmp/frog-preview
npx prettier --write src/data/monsterArt.ts src/data/naiguaiArt.ts art-src/monsters-v3/build-report.json
npm run check
```

输出为两张 `public/assets/demo/*-v3.png`、两个 TypeScript 注册表和 `build-report.json`。普通怪与 Boss 分别使用一张纹理，纹理 key 和怪物 ID 不变。可选 `--partial` 只预览已经存在的原画，绝不发布残缺注册表。

## 像素与动作

每张源图固定四列六行：待机 4、移动 4、蓄力 2 + 攻击 2、收招 2 + 受击 2、特殊 4、死亡 4；普通怪合计 24 帧。奶怪额外补旋身 4、大笑 4，共 32 帧。普通种类的特殊行可作为表情备用，跳蛙、钻地蛙、舞蛙与奶怪则对应已有 air/buried/spin 状态；不为所有备用动作新增 sim 行为。

导入器按透明行间隔和完整连通区域拆图，防止伸出的四肢被列边界切断；随后统一身体锚点、最近邻降采样、限制单种配色、固定全套帧的尺寸与留白。普通怪常态主体约 18–36 原生像素，奶怪约 60；运行时 scale 为 0.5，不降低游戏画布分辨率。每帧来自独立绘制的姿态，不通过平移静态图补帧。

`manifest.json` 记录常态尺寸、身体锚点比例、每种共用色板及特殊行用途。源图透明 alpha 在导入时变成 0/255；透明像素 RGB 清零。最终 PNG 使用精确索引编码，并断言解码 RGBA 与编码前完全相同。每种怪物所有动作共享 pivot、脚底线和帧尺寸，左右翻面不会移动物理圆。

动作时长由 `seconds` 驱动。待机循环 0.96 秒、移动循环 0.36 秒；蓄力/攻击/收招取已有 sim 状态时长，播到末帧保持。受击只覆盖普通待机、移动或收招，0.16 秒后回到原动作时钟，不遮住危险出招。普通死亡保留 0.45 秒，奶怪保留 3 秒。

验证、资源成本和当前限制见 [v3 验证记录](../../docs/testing/monster-art-v3.md)。旧生成器保留作历史来源，不再生成当前运行资源。
