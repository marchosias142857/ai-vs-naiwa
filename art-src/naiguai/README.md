# 最终 Boss 奶怪

- 源图：`source.png`，负责人绘制并提供的奶怪动作表（4 列 × 3 行：8 帧行走、待机、捧腹、弯腰捧腹、待机），用于本游戏的最终 Boss。
- 输出：`public/assets/demo/naiguai-v1.png` 与 `src/data/naiguaiArt.ts`（生成文件，不要手改）。
- 重新生成：`python3 art-src/naiguai/import_naiguai.py art-src/naiguai/source.png --preview <预览目录>`。
- 处理只做裁切、按块取众数缩小到大肥鱼的颗粒密度（身高约 104 个图集像素 = 52 游戏像素）、统一调色板与描边清理，不新增或改画任何动作。
- 受击闪白、眩晕星星与死亡演出由游戏里的特效补足（ADR 0028）。负责人以后补画受击、死亡等动作帧时，按同样格式加进源图并重新运行脚本即可。
