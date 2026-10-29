# #140 增量：独立内部设计、32 种外壳、补角与 Boss 四柱

2026-10-29，回应 Claude review **5699192715**；增量起点 `ad07b77f642e5a4c5a971d63feeb69ce010b2af1`，base main `2bc0e1a189185c65b6d5d1244156fe78e9742415`。保持 Draft，待 Claude 审新 head 和负责人看图/试玩；不改 main、不合并、不触发远端 CI，不启动 #116–#119/#129。

## 本轮实现

- **32 种外壳**：八个轮廓家族各四种，普通房外包围统一368×272。计数先去除平移、旋转/镜像及宽高缩放，不能用加宽补数；四风格各有这32种外壳。
- **四风格分别设计内部**：石殿的祭坛/回廊、沉船的隔舱/船脊、深渊的礁岛/侧绕、奶池的块状掩体/开阔区分别有16个编排骨架，八种空间方案改变掩体数量、朝向、分组和危险区配置。内部去重排除外壳、ID、主题、机关种类/朝向/时序，平移/旋转/镜像归一化后每风格128种，合计512种互异。再吸附到32单位网格消除微小位移，仍各128种。独立单测与生成器双重检查，完整实体几何也实际有529种。
- **特殊房也独立布置**：四风格的起点/武器/终点/Boss分别设计；前三种仍为128/144/128单位小正方形，终点地面文字及废弃文本键删除。Boss均为288方形、四根24×24完整 `pillar`，四风格柱位不同，保留原撞柱反制和 AI 数值。主城只保留实际调用的石殿版本，合计529项。
- **转角修复**：以补角前的原始墙序列判断，连续至少三块才是45°段；两个斜邻块的直角按凹凸闭合，凸角在房外补格，凹角复用内侧连接格。真正斜段及135°接点不补第二层，不向地面增加阻挡。恢复矩形周长+四角=128格测试，并覆盖连续斜段、凹角及反向轮廓。
- **完整模型和通路**：障碍整数个完整方块、地刺16整数格、外框全部计入；可见组间至少8单位，实体障碍间及其到墙体留22单位通道余量。保留半径14的入口净空和中央交互/奖励区域，允许其它路线绕掩体。桶的安全锚点检查按实际0.65竖直原点计算上方外形。
- **运行数据**：共享轮廓表+紧凑布局记录，加载时只展开/冻结，入房不执行搜索。无新项目依赖，已批准地图图集和墙体原稿字节不变。构建显式清空旧产物，避免旧哈希脚本进入预缓存。

[ADR 0042](../adr/0042-style-room-catalog.md) · [编排源数据](../../scripts/room-catalog-plans.mjs) · [计数](style-room-catalog-revision/counts.json)

## 预览和画面

[529 项可筛选目录](style-room-catalog-revision/catalog.html) · [32 外壳总览](style-room-catalog-revision/shells.svg) · [展开数据](style-room-catalog-revision/expanded.json) · [生产实景索引](style-room-catalog-revision/README.md)

轮廓总览和目录是精确坐标示意，真实阶梯墙块、素材和遮挡见 Phaser 实景。目录的529项、逐风格133/132项、组合筛选和零结果搜索已在浏览器验证，[筛选结果](style-room-catalog-revision/gallery.json)。48张PNG与外壳SVG均通过GitHub文件选择器上传，远端SHA/字节核对一致，[截图记录](style-room-catalog-revision/image-files.json)与[图表记录](style-room-catalog-revision/diagram-upload.json)。五份生成输出重跑后逐字节一致，[重现记录](style-room-catalog-revision/reproducibility.json)。

数量和连通测试不等于趣味性验收；负责人仍需试玩各风格的绕行、暴露射界、掩护和危险区节奏。

## 本地验证

Node24.22.1、原项目锁文件。完整 `npm run check`：**68 文件、1,050 单测**，格式、ESLint、TypeScript及Vite/PWA构建通过。本轮针对性双端浏览器回归 **13文件、194项：190通过、4条原设备条件跳过、0失败、0重试**；包含48图生产目录、四风格真实Boss撞柱、800布局/端美术矩阵、实际选房/连接门、保存恢复、离线更新与档案保全、镜头和大厅流程。[逐项结果](style-room-catalog-revision/e2e.json) · [完整check日志](style-room-catalog-revision/check.txt)。这是本轮针对性回归，不冒充上一轮34文件全套。

1单位网格对**529个模板、3,605个模板/半径组合、529种独立实体几何**完成检查；普通房半径3–9、功能房玩家6、Boss6及14，含未破桶。所有合法中心单连通。战斗/Boss最低地形比例 **95.062%**、玩家中心相对空房最低 **88.925%**；最低绝对地形 **77,760**、玩家可达中心 **67,324**，均超过旧空矩形 **47,872 / 42,640**。全部模板的完整墙顶/墙身、Arcade填充、机关外框、入口、出生和交互/奖励锚点另做全量验证。

[完整细网格记录](style-room-catalog-revision/clearance.json) · [汇总](style-room-catalog-revision/clearance-summary.json)

主JS由1,977,109降至**1,843,884字节**，减少133,225字节，距离2MiB上限仍有253,268字节；运行图集字节不变。[资源记录](style-room-catalog-revision/resources.json)

超出预缓存单文件2MiB的负向构建探针（2,097,153字节）已确认被现有 Workbox 集成直接拒绝，构建失败而非漏缓存继续成功。没有提高缓存限额或引入自写 Service Worker。[探针记录](style-room-catalog-revision/precache-budget.json)

浏览器环境：Chromium153.0.8010.0、SwiftShader，桌面和Pixel7横屏模拟；使用原WebGL/AUTO后端及全分辨率。测试环境的 `--disable-accelerated-2d-canvas` 沿用上一轮已定位的画布读回规避，未加入产品。WebKit/Safari、物理手机、FPS和显存未在本轮测量。

## 本轮发现并修正的问题

1. 初版特定退台入口被中央掩体挡住：生成器加入与实际入口一致的半径14保留区，并提供有限侧移/内收方案；不放宽入口断言。
2. 细网格发现较大身体在掩体和凹角间的孤立合法点，部分粗网格没有发现。增加实体间和实体至墙的通行余量至22单位；全目录再次做1单位网格检查，未跳过孤立点或放宽单连通要求。
3. 真实截图从24张增至48张，首轮桌面在90秒时超时，横屏通过；对该用例设置180秒预算，保留48个房间和原断言。四风格实际Boss撞柱用例首轮均通过，最终目录的桌面/横屏16项全部通过。
4. 预览服务器绑定全部接口时环境拒绝 `uv_interface_addresses`，在测试开始前退出。改为只绑定127.0.0.1；这些启动失败不计为运行用例，测试结果另录。
5. 超限负向探针证明 Workbox 自身已有构建失败保护，删除一份冗余的自写预算插件，保留实际拒绝证据；没有改变限制。

## 仍需负责人验证的边界

两张常驻绘制画布的理论RGBA仍比main多28.19MiB，未测GPU副本和真机峰值；本轮没有把数据压缩宣传成画布显存优化。边界池仍96槽，几何阶梯查询成本需真机压力测试。本轮保证完整模型、净空、面积和连通；战斗趣味性、门墙色差、移动网格闪烁及换房体验仍由负责人试玩确认。

复现：

```sh
node scripts/generate-room-catalog.mjs
node scripts/preview-room-catalog.mjs
npm run check
for catalog_style in temple wreck abyss milk; do
  ROOM_CELL_SIZE=1 ROOM_FILTER="/$catalog_style/" ROOM_REPORT="/tmp/catalog-$catalog_style.json" npx vitest run tests/unit/sim/catalogClearance.test.ts
done
CATALOG_SCREENSHOTS=docs/testing/style-room-catalog-revision npm run test:e2e -- tests/e2e/designedCatalog.spec.ts
```

本轮细网格按 `ROOM_FILTER=/temple/` 等风格分别运行，合并结果需确认529个唯一ID及3,605条记录；不能用只测某种风格代替全量。
