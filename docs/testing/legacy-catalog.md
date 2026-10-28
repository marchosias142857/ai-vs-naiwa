# #114 legacy_v1 冻结目录与选择对照

基线：main `0507bed534852429f73b8e05ff2ab4885dfaf735`（负责人已合并 #127）。分支：`gpt/114-freeze-legacy`。本次执行日期：2026-10-28；原始自动化时间戳使用 UTC。

## 范围

本步落实 ADR 0039 的旧目录冻结与 `freezeV1`。当前四主题 14 个 plan、9 组内墙、Boss 四柱、矩形 bounds、门规则、桶/地雷的几何半径、门中心/入口及已有交互锚点复制为明确字面量，递归冻结；不引用可变 `ROOM_THEMES`/`ROOM_LAYOUTS`。四主题各保留一个空房 ID 和一个四柱 ID，加 14 个 combat ID，共 22 个稳定 ID；普通楼层的 Boss 形式和奶池 combat 形式只是旧适配器的完整映射，并未新增可抽取的房间。

`freezeV1(seed, floor, rooms)` 只接受经过旧格式验证、按 room.id 排列的房间列表，返回独立的整层 ID 清单，不改输入、不消耗当前战斗随机流。`legacyV1Template` 精确查 ID，未知值返回 null。此函数不是新存档解析器；未知版本、错误主题、缺字段等拒绝逻辑须由后续 v3 解析器完成，不能把损坏新档当旧档迁移。

本次不导入生产入口；现有选图、存档字段/键/dataHash、AI、数值、WORLD_STEP 都不改。目录/存档接入、RoomDirector 出生锚点、多形状物理、正式美术、80% 净空与 200 组合验收仍待后续。#115–#119 未启动。

## 字节基准

`tests/fixtures/legacyV1/catalog.bytes.txt` 是固定属性/数组顺序的紧凑 UTF-8 JSON 加末尾 LF；包括 plans、全部布局、Boss、门/锚点与几何半径。SHA-256：`679eac9267505459b51cb0ae5a520684e18d3b08d15ef23226a575cda350708f`。

单测直接比较 `Buffer.from(JSON.stringify(LEGACY_V1) + '\n', 'utf8')` 与文件字节，不使用 `toMatchSnapshot`，`vitest -u` 不会更新它。修改此基准属于显式兼容性变更，须复审，不能随扩库自动再生成。最终提交的基准为本次首份冻结候选，仍待 Claude 复审。

## 单测与生产构建

本次 Node 22.23.4 完整 `npm run check`：**60 文件 / 488 单测通过**，Prettier、ESLint、类型与 Vite/PWA 构建通过。新增 6 项覆盖字节锁定、与旧数据/规则等价、无共享引用及深冻结、精确 ID 查找、输入/进度不变、独立数组、非法 seed/floor/索引拒绝，并临时重排/扩充真实可变 plans 验证旧 ID/几何保持不变（finally 恢复测试数据）。

使用相同依赖在独立 main worktree 重新构建，与候选比较 **27 个输出文件**：没有新增/删除；唯一差异为 `sw.js.map` 的临时构建源路径 `sources` 字段。游戏 JS/CSS、图像、HTML、SW 执行代码及预缓存清单逐字节相同。新增冻结模块尚未进入生产依赖图；因此不重复 #127 的整套浏览器、离线与性能验收。PWA 构建清单为 20 entries / 11541.04 KiB，这不是新执行的离线浏览器测试。

## 真实 DemoSession 对照

`tests/e2e/legacyCatalog.spec.ts` 构建独立 fixture，实际运行 DemoSession、RoomArena、CombatWorld 与 Arcade；只用占位纹理。房间 ID 由 fixture 直接枚举，**不声称测试了实际走门或新地图画面**。每个种子依次遍历普通层各 8 房和 Boss 层 2 房，共 26 房。

- 种子：0、42、12345、4294967295；桌面 Chromium 和 Pixel 7 横屏视口。
- 每房调用未改动的 `DemoSession.rebuildRoom`，读取其实际 plan，然后核对冻结 ID、真实静态碰撞体位置/宽高与 sim 机关位置/尺寸/半径/方向/初始 delay。预期选图不在测试另一侧再复制随机公式。
- 检查 `freezeV1` 调用前后 session.save 完全相同；初始化、每次重建、四向 teleport、checkpoint/save、真实 chooseUpgrade 换层、完整新会话恢复与入口新会话恢复均断言 `root.snapshot === seed`。
- 每层检查四向真实 teleport 的玩家位置和中心点；完整重建后与原 SessionSnapshot 深比较，入口恢复后检查 entry。存档通过现行内存 SessionSnapshot 传递，不通过 localStorage，也不证明 v2→v3 迁移完成。
- 新测试使用既有 30 秒单项超时、workers=1、retries=0。环境复用现有 Chromium 二进制及 SwiftShader 启动参数，未新增项目依赖。自定义外部配置只选两种 Chromium project；fixture 自己建立临时 HTTP 服务，省略无关的全局 preview 服务。

最终版本 **8/8 通过，0 失败、0 跳过、0 重试**；共 208 次房间对照、32 次完整会话恢复及 32 次入口恢复。最终代码提交为 `5e2772af4d30e3e919475f8de37733ea369d5602`，运行在提交前工作树，报告逐文件 SHA-256 固定实际代码来源。逐项结果与运行源码摘要见 [report.json](legacy-catalog/report.json)。早期版本（尚未记录 trapRadii，fixture 以 7 作预期）曾 8/8 通过；随后为补齐冻结碰撞尺寸而更新数据和 fixture，最终结果另记，不用早期运行代替最终验证。

## 限制与下一步

浏览器用例只证明当前旧目录到固定 ID 的映射与 root 前提，不是生产按 ID 建房或真实存储升级验收。普通/Boss 出生仍走原 RoomDirector，无新增固定出生点。未运行全套 E2E、WebKit/Safari/iPhone 真机、FPS/堆分配或地图画面验收；#127 的历史结果仍保留在其原报告中。

下一步在这份冻结数据复审合并后，按 ADR 0039 实施目录清单持久化与严格版本解析，加入原格式已校验的真实 v2 fixture、存储失败保留旧键、entry/sim.run 一致性及 dataHash 覆盖；之后再接新轮廓与美术。提交前网页已只读确认 CI 为手动 Disabled；不启用、触发或重跑，不自行合并。
