# #115 全目录与实景

[完整验证说明](../style-room-catalog.md) · [532 项可筛选布局预览](catalog.html) · [逐房净空/面积数据](clearance.json)

四风格分别有 128 个战斗候选；每风格另有固定起点、武器、终点、Boss 和主城外壳。布局预览是几何示意；以下 PNG 来自实际 Phaser 素材、物理和场景接入，不是生成概念图。复现：运行 `tests/e2e/designedCatalog.spec.ts`，并设置 `CATALOG_SCREENSHOTS=docs/testing/style-room-catalog`。

| 风格 | 45° 回廊                      | 北侧退台                           | 固定起点               | 武器房                 | 出口                  | Boss                  |
| ---- | ----------------------------- | ---------------------------------- | ---------------------- | ---------------------- | --------------------- | --------------------- |
| 石殿 | [图](temple-cloister_0_0.png) | [图](temple-north_terrace_0_0.png) | [图](temple-start.png) | [图](temple-chest.png) | [图](temple-exit.png) | [图](temple-boss.png) |
| 沉船 | [图](wreck-cloister_0_0.png)  | [图](wreck-north_terrace_0_0.png)  | [图](wreck-start.png)  | [图](wreck-chest.png)  | [图](wreck-exit.png)  | [图](wreck-boss.png)  |
| 深渊 | [图](abyss-cloister_0_0.png)  | [图](abyss-north_terrace_0_0.png)  | [图](abyss-start.png)  | [图](abyss-chest.png)  | [图](abyss-exit.png)  | [图](abyss-boss.png)  |
| 奶池 | [图](milk-cloister_0_0.png)   | [图](milk-north_terrace_0_0.png)   | [图](milk-start.png)   | [图](milk-chest.png)   | [图](milk-exit.png)   | [图](milk-boss.png)   |
