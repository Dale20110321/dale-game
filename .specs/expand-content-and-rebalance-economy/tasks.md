# Tasks

change-id: `expand-content-and-rebalance-economy`

> 执行纪律：严格按编号串行推进，每完成一项立刻勾选 [x]，禁止并行/交叉。
> 每完成一项 Task 跑一次 `node tools/test-all.mjs`，出现**新增**失败必须当场修复再继续。

---

## Task 1: 修复大额金币丢档 Bug（最高优先级，独立可验证）

- [ ] Task 1.1: 在 `src/core/storage.js` 新增稳健数值解析器 `safeNum`，用 `Number()` + `Number.isFinite` 替换 `intOr` 的 `parseInt` 路径
  - [ ] Task 1.1.1: `safeNum` 能正确解析指数记数法原文（`"1e+21"` → `1e21`）
  - [ ] Task 1.1.2: `safeNum` 对 `"Infinity"` / `"-Infinity"` / `"NaN"` / `""` / `"abc"` 一律返回 0
  - [ ] Task 1.1.3: 保留 `intOr` 作为别名或全部替换调用点，二者不得并存造成口径漂移
- [ ] Task 1.2: 在 `src/config/constants.js` 定义 `GOLD_MAX`（1e15）与 `safeGold(v)` 夹紧函数
- [ ] Task 1.3: 在 `src/game/progress.js` 的 `addGold` 入口处套用 `safeGold`（防非有限值进入存档）
- [ ] Task 1.4: 在 `src/ui/panels.js` 与 `src/ui/shop.js` 的扣款处套用 `safeGold`，保证扣款后余额不会为负
- [ ] Task 1.5: 在 `storage.save()` 写金币前做 `Math.round`，确保落盘原文是十进制整数字符串
- [ ] Task 1.6: 新增 `audit-save` 用例锁定三条路径：`"1e+21"` 往返不变、`Infinity`/`NaN` 重载不归零、落盘原文不含 `e`/`Infinity`/`NaN`
- [ ] Task 1.7: 在 `main.js` 首屏探测 `isStorageAvailable()`，为 false 时弹出存档失败警告 toast
- [ ] Task 1.8: 在 `src/ui/settings.js` 或存档面板暴露实时存储可用状态

## Task 2: 经济参数重平衡

- [ ] Task 2.1: 在 `src/config/constants.js` 新增 `TIER_COST` 档位倍率表（普通 1 / 稀有 2.2 / 史诗 5 / 传说 11 / 神话 25）
- [ ] Task 2.2: 新增 `upCostOf(veh, lv)`：返回 `upCost(lv) × TIER_COST[veh.tier]` 并向上取整到 10 的整数倍
- [ ] Task 2.3: 断言普通档车辆满级四项恒为 28,240 金币（基准曲线不得被破坏）
- [ ] Task 2.4: 在 `src/ui/shop.js` 改用 `upCostOf`，并在升级预览中显示"该档倍率 ×N"
- [ ] Task 2.5: 在 `src/config/levels.js` 的 `makeLevel` 中把通关固定奖励改为随进度递增 `240 + 660×gN`
- [ ] Task 2.6: 在 `src/config/levels.js` 的 `makeLevel` 中把赛道金币数改为 `24 + 48×gN`
- [ ] Task 2.7: 在 `src/game/game.js` 把通关固定奖励的硬编码 200 改为读取 `L.goldBase`
- [ ] Task 2.8: 在 `src/game/world.js` 把赛道金币的单枚价值改为随全局进度递增（30 → 60 区间）
- [ ] Task 2.9: 在 `src/config/constants.js` 新增排位赛金币公式（胜利 = 500 + rating×0.25，失败 = 150）
- [ ] Task 2.10: 在 `src/game/race.js` 排位赛结算中接入金币发放
- [ ] Task 2.11: 新增经济体检用例：前 36 关按 60% 收集率的金币 ≥ 28,240；末关产出 > 首关产出
- [ ] Task 2.12: 在 `src/config/constants.js` 新增 `ULTRA_BASE_K`（= 4）与 `ULTRA_MODE_K`（6 种 mode 的强度系数，取值 0.8~1.4）
- [ ] Task 2.13: 新增 `ultraCostOf(veh)`：按「档位满级升级费 × ULTRA_BASE_K × mode 系数」取整到 1 万
- [ ] Task 2.14: 新增断言：五档最终形态价格严格递增，且神话档 ≥ 传说档 × 1.5
- [ ] Task 2.15: 让 `topSpeedOf()` 计入驱动扭矩的翘头限幅（传入同一上限），使表盘满量程 = 实测可达极速
  - [ ] Task 2.15.1: 把 `wheelieTau = mTot·g·WHEELBASE/2·WHEELIE_K` 提取为 `config/constants.js` 的共享常量
  - [ ] Task 2.15.2: `physics/bike.js` 与 `constants.js` 引用同一常量，杜绝两处各算一份
- [ ] Task 2.16: 抬高翘头限幅系数 `WHEELIE_K`（先用实测找出既能防翻、又不至于把高速车限死取不到的值）
- [ ] Task 2.17: 新增体检用例：全部 26 款车满级「实测极速 / 表盘满量程」≥ 90%

## Task 2b: 究极终局车（350 km/h · 摔不坏）

- [ ] Task 2b.1: 把 `NUM_CAP_V` 与 `TOP_SPEED_CAP` 从 6000 提升到 12000（350 km/h = 9722 px/s）
- [ ] Task 2b.2: 在 `physics/bike.js` 新增第 7 种特殊模式 `absolut`
  - [ ] Task 2b.2.1: `absolut` 免解锁、**永久生效**（注意：免的只是"摔不坏"这项特性，
     四项升级仍走正常购买流程并照常扣费）
  - [ ] Task 2b.2.2: `absolut` 授予摔车免疫（并入 `isCrashImmune`）
  - [ ] Task 2b.2.3: `absolut` 把 `MAXV` 钉到 350 km/h 对应的 px/s，并把扭矩转速域拉到极高
  - [ ] Task 2b.2.4: `absolut` 同步降低空气阻力，使 9722 px/s 成为**可持续**的平衡点（而非冲一下就掉速）
  - [ ] Task 2b.2.5: `absolut` 绕过翘头限幅，否则 9722 px/s 所需的扭矩会被限幅直接掐死
- [ ] Task 2b.3: 新增体检用例：`absolut` 下 20 秒稳定速度 ≥ 340 km/h，且 `NUM_CAP_V` 兜底计数为 0
- [ ] Task 2b.4: 新增体检用例：`absolut` 下主动翻滚 200 帧，`run.crashed` 始终为 false
- [ ] Task 2b.5: 验证高速下的相机跟随、速度线、地形采样不出现跳帧或越界

## ✅ 当前进度（2026-10-02 收尾快照）

**已完成**（勾选表示已实现并验证）：
- Task 1（金币丢档 Bug）：1.1 / 1.2 / 1.3 / 1.5 完成；**1.4 / 1.6 / 1.7 / 1.8 未做**
- Task 2.5 / 2.6 / 2.7 / 2.8（金币产出随进度递增）完成
- Task 2.9 / 2.10（排位赛金币）完成
- Task 2.12 / 2.13 **部分**（`ULTRA_BASE_K`/`ULTRA_MODE_K`/`ultraCostOf()` 未做，
  当前是每辆车手填 `ultra.cost`）
- Task 2.15 / 2.16（表盘诚实性 + 翘头限幅共享常量）完成
- Task 2b + 6.12（究极终局车「奇点号」）完成
- Task 3（36 套场景）完成
- Task 4（432 关 / 36 支线 / 变体重排 / 终点收尾缓冲）完成
- Task 5（存档迁移 v3→v4）完成
- Task 7（升级车间移动端全屏可滚动）完成
- Task 8（立即购买并使用按钮）完成

**未做**（下一个 Agent 接手）：
- [ ] Task 1.4 扣款处套 `safeGold`（`ui/panels.js`、`ui/shop.js`）
- [ ] Task 1.6 金币三条路径的 audit-save 用例
- [ ] Task 1.7 首屏存储失败警告
- [ ] Task 1.8 设置/存档面板暴露存储状态
- [ ] Task 2.1 / 2.2 `TIER_COST` 档位倍率表（当前是每辆车 `costK` 字段，功能等价但未统一）
- [ ] Task 2.3 / 2.4 / 2.11 / 2.14 / 2.17 对应断言
- [ ] Task 2.12 / 2.13 `ultraCostOf()` 公式化（去掉手填 `ultra.cost`）
- [ ] Task 6.2~6.11：**车型 8 → 26（还差 18 辆）** ← 最大的一块
- [ ] Task 8.4 audit-a11y 触摸目标断言
- [ ] Task 9 回归与交付（README 数字同步、dist 重新打包）

**新增需求（本次会话追加）**：
- [ ] Task 10: GitHub Pages URL 路由（**结论：Pages 不支持 history 模式，需用 hash 路由**）
      详细方案与验收口径见同目录 `README.md` 第 6 节。**本次未实现。**

> **交付顺序调整（2026-10-01 用户确认）**：Task 2b + Task 6.12（究极终局车）
> 提前单独交付供体验，其余 Task 在体验反馈后继续。

## Task 3: 场景扩容 12 → 36

- [ ] Task 3.1: 在 `src/config/themes.js` 新增 12 套主题（备用批次 1），字段结构与现有主题完全一致
- [ ] Task 3.2: 新增第 2 批 12 套主题
- [ ] Task 3.3: 校验 36 套主题的名称互不相同、重力 ≥3 种、抓地 ≥4 种
- [ ] Task 3.4: 新增 audit 断言锁定主题数量为 36 且字段完备

## Task 4: 关卡编排 6 关/场景 → 12 关/场景

- [ ] Task 4.1: `LEVELS_PER_BRANCH` 改为 12、`N_BRANCHES` 改为 36
- [ ] Task 4.2: `BRANCHES` 数组扩到 36 条，每条绑定 `theme: 0~35` 且一一对应
- [ ] Task 4.3: 调整变体穿插规则到 12 关规模（6 个特殊位轮转 6 种变体）
- [ ] Task 4.4: 调整特殊变体的关卡内文案/HUD 展示以适配更长关卡
- [ ] Task 4.5: 测量 432 关模块加载耗时，确保 < 800ms；超标则优化 `fitSlope` 的采样策略
- [ ] Task 4.6: 新增断言：关卡总数 432、难度沿全局进度单调、变体分布差 ≤2

## Task 5: 存档迁移到 432 关

- [ ] Task 5.1: `CUR_VER` 提升至 4
- [ ] Task 5.2: 迁移逻辑把旧星级数组按索引原样落入新数组并补齐到 432
- [ ] Task 5.3: `isLegacy20` 判定改为兼容 72 关与 432 关两种结构
- [ ] Task 5.4: `store.unlocked` / `selLevel` 的夹取上界改为 `LEVELS.length - 1`（现有代码已是动态取值，需回归验证）
- [ ] Task 5.5: 新增 audit-save 用例：版本 3 的 72 项星级数组加载后补齐为 432 且原星级位置不变

## Task 6: 车型扩容 7 → 26

- [ ] Task 6.1: 为现有 7 款车补 `tier` 字段并按 5 档重新分配
  - [ ] Task 6.1.1: 山地车 / 竞速车 / 越野车 → 普通档
  - [ ] Task 6.1.2: 电磁脉冲车 / 影行者 → 稀有档
  - [ ] Task 6.1.3: 磁力堡垒 → 史诗档；光子摩托 → 神话档
- [ ] Task 6.2: 新增普通档车型补足到 5 款
- [ ] Task 6.3: 新增稀有档车型补足到 6 款
- [ ] Task 6.4: 新增史诗档车型补足到 6 款
- [ ] Task 6.5: 新增传说档车型 5 款
- [ ] Task 6.6: 新增神话档车型补足到 3 款
- [ ] Task 6.7: 按 5 档价格阶梯设定 26 款车的 `price`（究极终局车价格另设最高档）
- [ ] Task 6.8: 为 22 款车型配置 `ultra.mode`，使 6 种 mode 各出现 3~4 次
  - [ ] Task 6.8.1: 普通档 2 辆配置（stable / surge），山地车保持无 ultra
  - [ ] Task 6.8.2: 稀有档 6 辆配置，6 种 mode 各 1 辆
  - [ ] Task 6.8.3: 史诗档 6 辆配置，6 种 mode 各 1 辆
  - [ ] Task 6.8.4: 传说档 5 辆配置
  - [ ] Task 6.8.5: 神话档 3 辆配置
- [ ] Task 6.9: 把 22 个 `ultra.cost` 改为由 `ultraCostOf(v)` 计算而非手填
- [ ] Task 6.9.1: 在 `src/ui/panels.js` 的 `ultraBlock` 与 `buyUltra` 改用 `ultraCostOf`
- [ ] Task 6.9.2: 在 `src/ui/shop.js` 的特殊模式提示行改用 `ultraCostOf`
- [ ] Task 6.9.3: 删除 `src/config/vehicles.js` 中手填的 `ultra.cost` 字面量
- [ ] Task 6.10: 每辆新车补齐 `art` 形态规格与 `phys` 物理参数，保证 mass/inertia 两两不同且 `air × inertia ≈ 1`
- [ ] Task 6.11: 新增断言：26 款车 id 唯一、mass/inertia 两两不同、air 自洽、高档车极速显著更高
- [ ] Task 6.12: 新增第 26 款「究极终局车」
  - [ ] Task 6.12.1: 归属神话档末尾，`price` 严格大于其余 25 款中的任意一款
  - [ ] Task 6.12.1.1: 升级费倍率（`costK`）同样设为最高，四项升满费用远高于其它车但仍需正常购买
  - [ ] Task 6.12.2: `phys` 七项参数全项目最优（mass/inertia 取唯一值，`air × inertia ≈ 1`）
  - [ ] Task 6.12.3: 绑定 `ultra.mode = "absolut"`（永久摔不坏，无需解锁）
  - [ ] Task 6.12.4: 补齐 `art` 形态规格，视觉上与其它车明显可辨
- [ ] Task 6.13: 新增断言：究极终局车的满级极速 / 抓地 / 扭矩 / 抗摔 / 油箱五项均不小于其余 25 款

## Task 7: 升级车间移动端全屏可滚动

- [ ] Task 7.1: 把 `#shop` 的定位基准从 `position: absolute` 改为 `position: fixed`，以视口为基准
- [ ] Task 7.2: 为 `#shop` 增加 `overflow-y: auto` 与安全区内边距，使内容高于视口时可滚动
- [ ] Task 7.3: 把 `justify-content: center` 改为顶部对齐 + 自动外边距（消除 flex 居中溢出后顶部不可达）
- [ ] Task 7.4: 把 `.upItm` 的固定宽度改为 `min(360px, 100%)`，消除横屏矮屏横向溢出
- [ ] Task 7.5: 在四档断点下分别核对升级车间不产生横向滚动条
- [ ] Task 7.6: 新增 audit 用例锁定：矮视口（360×480）下升级车间可滚动且首尾元素可达

## Task 8: 车库「立即购买并使用」按钮

- [ ] Task 8.1: 在 `src/ui/panels.js` 的车库卡片中为未拥有的车辆渲染显式购买按钮
- [ ] Task 8.2: 在 `src/ui/panels.js` 扩展 `buyOrSelectVeh`，支持由按钮直接触发并给出金币不足提示（含差额）
- [ ] Task 8.3: 在 `styles/main.css` 为该按钮设定 min-height 44px / min-width 120px，并适配四档断点
- [ ] Task 8.4: 在 `tools/audit-a11y.mjs` 新增触摸目标断言，覆盖该按钮在移动端断点下的尺寸

## Task 9: 回归与交付

- [ ] Task 9.1: 运行 `node tools/test-all.mjs`，确认无新增失败
- [ ] Task 9.2: 处理因关卡数从 72 变 432 而失效的既有断言（逐条核对，不允许直接改阈值）
- [ ] Task 9.3: 人工过一遍车库 / 升级车间 / 关卡地图 / 结算页的 432 关展示
- [ ] Task 9.4: 用 `bike_trial` 体验包走一遍全部 26 款车与 23 个特殊模式
- [ ] Task 9.5: 在手机尺寸（含横屏矮屏）实测升级车间不需全屏即可看全
- [ ] Task 9.6: 重新打包 `dist/game.bundle.js`
- [ ] Task 9.7: 更新 `README.md` 中的关卡数 / 场景数 / 车型数与经济数值

---

# Task Dependencies

- Task 1 独立，优先执行（修 Bug 不依赖其它任务）
- [Task 2] depends on [Task 1]（费用改动会碰同一批存档字段）
- [Task 2.15] 是 Task 2b 的前置：表盘不诚实时，钉一个 350 km/h 的满量程只会放大同一个 bug
- [Task 3] 无依赖，可与 Task 2 并行准备，但**本流程内串行执行**
- [Task 4] depends on [Task 3]（支线需要绑定 36 套主题）
- [Task 5] depends on [Task 4]（迁移要知道新关卡总数）
- [Task 7] 独立，可在 Task 2~6 期间提前完成
- [Task 8] depends on [Task 6]（按钮渲染依赖 26 款车的卡片结构）
- [Task 2b] depends on [Task 2.15]（必须先让表盘满量程诚实，再钉 350 km/h）
- [Task 6] depends on [Task 2, Task 2b]（终局车需要 `absolut` 与新的数值上界）
- [Task 9] depends on [Task 1, Task 2, Task 2b, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8]