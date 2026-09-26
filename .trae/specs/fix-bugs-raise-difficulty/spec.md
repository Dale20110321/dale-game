# 修复缺陷并提升难度 Spec

## Why

全量自动检查（`node tools/autotest.mjs`，78 项）目前**全部通过**，说明缺陷都落在测试覆盖不到的缝隙里。逐模块通读后确认了 5 处玩家可感知的真实缺陷：

1. **结算定时器串档**：通关 / 燃料耗尽后用的 `setTimeout(...)` 回调没有作废机制，玩家在结算动画期间按 `R` 重开，旧回调随后会**把新开的一局强行推走**（跳到下一关 / 弹回主菜单）。
2. **车架升级是"假功能"**：商店写着「🛡️ 车架 耐摔 / 抗倒立」，但 `deriveHandling()` 算出的 `crashMargin` **全项目没有任何地方读取**，摔车判定完全没用到它。
3. **车间白吃三星时限**：`update()` 在 `shopOpen` 时仍然推进 `store.time`，而通关用时 = `store.time - run.levelStartTime`，于是玩到一半按 `U` 打开车间看一眼，就会白白损失三星时限。
4. **掉出地图判定基准写反**：注释说"以关卡地形最低点为基准"，但 `measureMinY()` 返回的是**地形最高点**（y 最小），差值 800px 的阈值因此比设计意图低了几百像素，掉坑后要在虚空里坠落很久才触发回退。
5. **三星时限曲线不合理**：实测自动骑手（全油门 + 空中修正）用时 vs 三星时限——第 1 关 9.9s / 10.8s（新手几乎不可能），第 11 关 19.7s / 18.9s，第 20 关 60.9s / 22.6s。**中后期多关的三星时限低于自动骑手用时**，3★ 这一目标对真人形同虚设（不是"难"，是"不可达"）。

同时玩家反馈"想更难、更有意思"：目前后期关卡只靠地形堆参数，燃油余量 1.14 仍偏宽松，比赛 AI 基准只有玩家极速的 0.73（实测玩家 9.9s vs AI 11.0s，稳赢），后段缺少真实挑战。

## What Changes

### 缺陷修复
- **结算串档**：引入"单局世代号"（`store.run.gen`），所有结算 `setTimeout` 捕获世代号，回调时若世代号已变（说明已重开 / 已换关）则直接作废。**BREAKING**（内部运行态新增字段，`resetRunState` 负责递增）。
- **车架升级落地为真实效果**：`crashMargin` 接入倒立摔车判定——车架等级越高，"头必须更贴近地面"才算倒立摔车（即更抗摔）。
- **删除死状态** `bike.stunned`：写入 + 递减但**从未被读取**（真正的昏迷计时是 `run.crashTimer`）。
- **车间冻结时钟**：`play` 状态下打开车间时不再推进 `store.time`（菜单/结算态的背景动画时钟保持不变）。
- **掉出地图基准修正**：改为按"地形真正的最低点（y 最大）"判定，回退及时、与注释一致。
- **三星时限重新标定**：改为 `den3 = REF_SPEED × (0.72 − 0.22 × ramp)`，曲线单调、可达且依然严苛（前期 ≈0.72×基准极速，末期 ≈0.50×）。

### 难度提升
- **后期地形更陡**：三层波的振幅/波长与断层落差随 `ramp` 进一步放大，后段腾空更多、容错更低。
- **燃油更紧**：油罐数量容错余量 `M` 由 `1.42 → 1.14` 收紧为 `1.30 → 1.02`，后期必须吃到油罐。
- **比赛 AI 更有竞争力**：基准由玩家极速的 `0.73` 提到 `0.80`，随关卡的加成 `0.35 → 0.42`，比赛不再是必胜局（仍保证可赢）。

## Impact

- 受影响能力：单局生命周期（重开/结算/换关）、升级实际效果、星级评定、燃料经济、竞速 AI、地形难度曲线。
- 受影响代码：
  - [game.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/game/game.js)（世代号、结算回调、时钟、掉出地图）
  - [store.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/core/store.js)（`run.gen`、移除 `bike.stunned`）
  - [bike.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/physics/bike.js)（`crashMargin` 接入、移除 `stunned`）
  - [constants.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/config/constants.js)（`crashMargin` 语义、`REF_SPEED` 复用）
  - [levels.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/config/levels.js)（三星时限、地形难度）
  - [world.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/game/world.js)（油罐余量、掉出地图基准）
  - [race.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/game/race.js)（AI 基准）
  - [autotest.mjs](file:///c:/Users/1/Documents/GitHub/dale-game/tools/autotest.mjs)（新增回归断言）
- 不改 `index.html` / `styles/main.css`（无界面结构变化）。

## MODIFIED Requirements

### Requirement: 单局生命周期与结算
结算路径（通关、对手先到、燃料耗尽）**SHALL** 通过"单局世代号"与其延迟回调绑定；任何重开 / 换关 / 回菜单导致的世代变化 **MUST** 让尚未执行的旧回调失效。

#### Scenario: 通关动画期间按 R 重开
- **WHEN** 玩家越过终点线后在 800ms 结算窗口内按下 `R`
- **THEN** 留在当前关重新开始，不会被推到下一关

#### Scenario: 无限模式结算期间按 R 重开
- **WHEN** 燃料耗尽进入 `ended` 后 1.6s 内按下 `R`
- **THEN** 新一轮无限模式正常进行，不会被弹回主菜单

### Requirement: 升级必须产生真实效果
商店展示的每一项升级 **SHALL** 在物理层有可观测效果，不得存在"只计算、不读取"的参数。

#### Scenario: 车架升级的抗倒立
- **WHEN** 同一倒立落地姿态分别在车架 Lv0 与高等级下测试
- **THEN** 高等级下更不容易被判为倒立摔车（`crashMargin` 参与判定）

### Requirement: 计时只统计真实骑行时间
`store.time` 在 `play` 状态下 **SHALL** 仅在未打开车间时推进，保证通关用时不被非骑行时间污染。

#### Scenario: 中途查看升级车间
- **WHEN** 骑行中按 `U` 打开车间停留 3 秒后关闭
- **THEN** 通关用时统计不变

### Requirement: 星级目标物理可达
三星时限 **SHALL** 随关卡单调收严，且其隐含要求的平均速度 **MUST** 落在 `[0.45, 0.75] × REF_SPEED` 区间内——上限保证"不是物理上不可能"（现行公式末期要求 540px/s，已高于车辆平路极速 `MAXV=520px/s`，即 3★ 在末期根本无法达成），下限保证"依然严苛"。

#### Scenario: 全 20 关三星可达性
- **WHEN** 计算每一关的 `L.den3`（三星要求均速）并与 `REF_SPEED` 比较
- **THEN** 全部落在 `[0.45, 0.75] × REF_SPEED`，且随 `ramp` 单调收严（`den3` 单调不增，即"要求均速占基准极速的比例"逐关下降：0.72 → 0.50）

## ADDED Requirements

### Requirement: 难度曲线可量化
关卡难度参数 **SHALL** 使得实测最大坡度、燃油压力与竞速 AI 强度随关卡推进而递增。

#### Scenario: 后期地形更陡
- **WHEN** 比较第 1 关与第 20 关的实测最大坡度
- **THEN** 末期显著大于前期，且 20 关仍全部可被自动骑手通关

#### Scenario: 燃油必须管理
- **WHEN** 后期关卡不吃任何油罐
- **THEN** 无法仅靠初始油量完赛（会被回退惩罚），必须规划油罐路线

#### Scenario: 比赛不再稳赢
- **WHEN** 用自动骑手跑比赛模式第 1 关
- **THEN** 玩家与 AI 用时比值落在 0.85~1.15（AI 与玩家同量级、有胜负悬念）