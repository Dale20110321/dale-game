# Tasks

## Task 1: 修复结算定时器串档（单局世代号）
- [x] SubTask 1.1: 在 `src/core/store.js` 的 `store.run` 增加 `gen: 0`（单局世代号）
- [x] SubTask 1.2: 在 `src/game/game.js` 的 `resetRunState()` 中递增 `run.gen`
- [x] SubTask 1.3: 三处延迟结算统一改用导出的 `runGuard(fn)` 守卫工厂（无限模式 1.6s / 通关 800ms / 对手先到 900ms）
- [x] SubTask 1.4: `tools/autotest.mjs` 新增 4 条断言（世代作废 / 同局正常执行 / 三处静态检查 / 通关后重开不跳关）

## Task 2: 让车架升级产生真实效果（并清除死状态）
- [x] SubTask 2.1: `src/physics/bike.js` 两处倒立摔车判据接入 `crashMargin`（派生 `crashTol` / `invMargin`；Lv0 与旧值一致）
- [x] SubTask 2.2: `src/config/constants.js` 为 `crashMargin` 补注释（0 级≈4 / 满级≈14）
- [x] SubTask 2.3: 删除死状态 `bike.stunned`（store / bike / game 共 4 处）
- [x] SubTask 2.4: `tools/autotest.mjs` 新增"高车架更抗倒立摔车"与"stunned 已清除"断言

## Task 3: 修复车间打开时计时被白吃
- [x] SubTask 3.1: `src/game/game.js` 的 `update()` 拆分：`state !== "play"` 只走时钟；`play && shopOpen` 直接 return（冻结时钟）
- [x] SubTask 3.2: `tools/autotest.mjs` 新增"车间打开时时钟冻结 / 关闭后恢复"断言

## Task 4: 修正"掉出地图"判定基准
- [x] SubTask 4.1: `src/game/world.js` 的 `measureMinY` → `measureBottomY`（取采样最大值）
- [x] SubTask 4.2: 同步 `src/core/store.js` 的 `minY` 注释与 `game.js` 的 `belowWorld()` 注释
- [x] SubTask 4.3: `tools/autotest.mjs` 新增"掉到地形最低点以下会立刻回到安全点"断言

## Task 5: 重新标定三星时限曲线
- [x] SubTask 5.1: 修改 `src/config/levels.js`：`den3 = REF_SPEED * (0.72 - 0.22 * ramp)`（前期 ≈0.72×基准极速，末期 ≈0.50×），注释写明口径
- [x] SubTask 5.2: 在 `tools/autotest.mjs` 新增断言：全部 20 关的 `den3` 落在 `[0.45, 0.75] × REF_SPEED` 且随 `ramp` 单调收严；打印每关「三星时限 / 要求均速 / 自动骑手用时」对照表

## Task 6: 提高后期地形难度
- [x] SubTask 6.1: 修改 `src/config/levels.js`：按 `ramp` 放大三层波振幅/频率与断层落差
- [x] SubTask 6.2: `node tools/autotest.mjs --levels` 回归，20 关全部可通关、无 NaN、单关用时 ≤ 100s（按"先回退 `steps.drop` → 再回退细波 → 再回退主波"逐步回退）
- [x] SubTask 6.3: 在 `tools/autotest.mjs` 新增断言：第 20 关 `maxSlope` > 第 1 关 `maxSlope`，且全部关卡 `maxSlope <= 70°`

## Task 7: 收紧燃料经济（油罐必须吃）
- [x] SubTask 7.1: 修改 `src/game/world.js`：油罐余量 `M = 1.30 - 0.25 * ramp`（末期 ≈1.05），同步更新注释
- [x] SubTask 7.2: `node tools/autotest.mjs --levels` 回归（观察后期用时是否被拖长；超 110s 则回退到 `1.34 - 0.24 * ramp`）
- [x] SubTask 7.3: 在 `tools/autotest.mjs` 新增断言：第 20 关油罐数量 ≤ 3，且每关至少 1 个油罐

## Task 8: 强化比赛 AI
- [x] SubTask 8.1: 修改 `src/game/race.js`：AI 基准 `0.73 → 0.80`，随关卡加成 `1 + 0.35 * ramp → 1 + 0.42 * ramp`
- [x] SubTask 8.2: 复核既有断言"AI 与玩家速度同量级（0.85~1.15）"仍通过（跌破 0.85 则回调到 0.78）

## Task 9: 全量回归与断言扩展收尾
- [x] SubTask 9.1: 汇总 Task 1~8 新增断言，确保 `tools/autotest.mjs` 断言总数 > 78 且全部通过
- [x] SubTask 9.2: 确认既有静态检查仍全绿（无裸半标度换算、import/export 对应、无历史遗留死代码、index.html 约束），清理无用 import
- [x] SubTask 9.3: 更新 `README.md` 与本次改动相关的说明（三星时限口径、燃油余量、AI 基准、测试断言数）

# Task Dependencies
- Task 1~4 相互独立（已完成）
- Task 5 依赖 Task 6、Task 7（地形与燃油定稿后才标定三星曲线）
- Task 9 依赖 Task 1~8 全部完成