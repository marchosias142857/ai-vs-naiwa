# 地图几何 ADR 草案验证记录

- 日期：2026-10-27
- 范围：#114 的 ADR 0039 与本文；无运行时代码、生产素材、测试或配置变更。
- 基线：main `a8a1c4d4527ad7535d52a247f09be04419d6f572`。
- 分支：`gpt/114-room-geometry-adr`，从上述 main 新建。
- 状态：仅草案的本地工程检查通过；新几何、迁移和美术尚未实施，AI 协调结论已纳入，待负责人批准。

## 首稿实际执行（head d8ad4d7）

本地 Node 22 执行 `npm run check`，退出码 0：Prettier、ESLint、TypeScript、55 个文件 / 430 项单测、Vite 生产构建通过。检查后只补充/修正文档并重新执行两份 Markdown 的格式检查及 `git diff --check`，未修改被测代码或测试。

逐项核对当前 checkpoint/snapshot/saveFields/runStorage、DungeonRun、布局与机关目录、RoomArena、CombatWorld 和 AI 数据：当前跨 build/dataHash 的恢复仍从楼层入口开始；桶在 CombatWorld.los 中挡视线；本文没有把入口迁移描述成跨构建的完整战斗恢复。

`src` tree 为 `4cff6ba52192eed387d11d3716c2cc4c40ff87df`，与 main、#122 及此前已验证的运行时一致。PR 差异仅为新增两份 Markdown；源码、生产资源、测试、依赖和构建配置均未改变。因此没有重复运行 E2E/PWA/性能，也没有生成新游戏截图。该证据只能说明运行时未改，不能证明拟议的新地图实现已验证。

## 明确未执行

- ADR 中的尺寸、80% 可通行目标、200 个布局资源复用、几何/迁移单测及 E2E 都是后续验收要求，不是已有结果。
- 未生成/接入模块化生产素材，未改变实际每层房间数，未开始 #115–#119。
- 未重新进行浏览器离线/PWA 升级、FPS A/B 或对象数量压力测试；构建成功不能替代这些测试。
- WebKit、Safari/iPhone 真机无本轮新结果；Chromium 手机视口也未重跑。

实现阶段按 ADR 0039 的清单补充真实证据，记录具体被测 head、种子、视口/缩放和设备。尤其奶池要有 Boss 砸地四角与冲撞箭头的正式缩放同屏样例，调试组合与真实动作分别标注。只更新 GPT 分支，不合并，不改 main 或 Claude 分支，远端 CI 保持关闭。

## 复审协调修订（2026-10-27）

依据 #123 review 5674655741（评审 head `d8ad4d717e9a221c73695fad7a66daf3e57c21b5`），将 AI 接线规则、接口/分工和 freezeV1/root/legacy_v1 字节快照要求写入 ADR。明确两项不能省略的差异：靠墙柱首次命中可使 Boss 眩晕；落石耗尽跳过该块且不再抽 stagger。出土 surface 仅为测试断言，不新增 AI 查询/选点。

本次仅修改上述两份 Markdown，实际执行两份文档的 Prettier 检查和 `git diff --check`；与评审 head 比较，运行时、素材、测试和配置完全一致，src tree 仍为 `4cff6ba52192eed387d11d3716c2cc4c40ff87df`。首稿 55 文件 / 430 单测及完整 check 是历史结果，本次未重复执行完整 check、E2E/PWA/性能。新增测试要求尚未实现或运行，不计入已通过数量；WebKit/Safari/iPhone 真机无新结果。

GPT 先提交几何接口与自己范围的实现；接口合入 main 后 Claude 从最新 main 建分支负责 AI 接线与相关测试。当前提交仅供负责人批准 ADR，不表示接口已实现、契约已获批准或 #114 已完成。
