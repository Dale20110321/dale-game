# 第 3 轮：操作逻辑与手感审查（14 角度 / 13 完成）

> 只读审查，未修改任何项目文件。agent 数：14（1 个因 API 错误失败：相机手感专项）。
> **本轮发现三个"摧毁整个系统"的级联 BUG，必须排在所有 UI 修复之前。**

---

## 🔴 三个系统级 BUG（本轮最高优先级）

### SYS-1 `levels.js:402-411` 分桶索引与累积数学矛盾 → 地形在每个桶边界垂直跳变

`buildIndex` 把断层当"局部影响"分桶 `[cx, cx+STEP_W]`，但 `hillRaw` 的数学是**累积**的（x > cx+STEP_W 后 `relief += s.drop` 永久生效）。于是每过一个桶边界（2048px），之前所有已越过的断层被整段剔除，累计下降被一次性抹掉 → 地形向上垂直跳变。

实测：L431 有 **38 处跳变，总跳 139.2px**；L108 有 11 处共 16.0px。跳变量恰等于"已越过断层的 drop 之和"（L108 x=2048 处跳 −1.2696px vs 累计 drop 1.2697px，完全吻合）。

**修法**：`buildIndex` 的 steps 循环保留所有 `cx < bx1` 的元素（起点固定 0），即 `stepB[b] = [0, firstIdx(cx>=bx1)]`，让索引语义与累积数学一致。

### SYS-2 `levels.js:715-730` `fitSlope` 被 SYS-1 污染 → **432 关真实最大坡度全程 0.6°~2.9°，难度曲线事实上不存在**

`k` 被压到 0.017~0.044（原始振幅被砍掉 96%+），三层波只剩 1.7~4.8px 振幅。实测对照（去掉分桶 vs 现状）：

| 关卡 | 现状测得 | 修好后真实值 |
|---|---|---|
| L0 | 19.5° | **0.80°** |
| L216 | 35.6° | **0.96°** |
| L431 | 54.0° | **2.75°** |

面板显示的"坡度 19.5°~54°"与实测偏差 L216 达 5.5°、L431 达 **24.9°**。`levels.js:906` 的 `L.maxSlope = targetDeg` 直接回填而不重采样（注释称"缩放后必然相等"，但该推理只在 maxSlope 对振幅线性时成立，而 hillRaw 里 steps 贡献经 finishT 混合且被分桶截断，线性前提不成立）。

**修法**：先修 SYS-1，再重跑 fitSlope 标定。在此之前 L.maxSlope 与三星/门限的隐含前提全部失真。

### SYS-3 `constants.js:301` `topSpeedOf` 二分只迭代 40 次而区间是 `[0, 1e16]` → **几乎所有车返回 0**

网格步长 = 1e16/2^40 = **9095 px/s**。真实极速 181~11188 px/s 全部落在第一个网格点以下，`lo` 恒收敛到 0。实测 trail/sport/singularity/cv1 **全部 = 0**；只有 cv9~cv12 满级侥幸返回 9095（真值 9359/9934/10544/11188，误差 3~19%）。

这是 HEAD 提交 `783e8f6` 把 cap 从 1e14 抬到 1e16 时漏改迭代次数引入的回归（1e14 时还是 90.95 px/s，尚能分辨）。

**连锁后果（本轮至少 6 个 agent 独立撞上）**：
- 车库卡片"极速"格全部显示「极速 0 km/h」（第 1 轮浮层面板 agent 发现）
- 倒挡完全失效：`bike.js:918` 目标 = `-(baseTopSpeed||topSpeed)*REV_SPEED`，实测按住 ↓ 6 秒 `bikeVx=0.048 px/s`（应约 −201）
- `hud.js:386` 表盘满量程 `toKmh(0)||1 = 1` → 指针永远钉在满量程，**玩家完全无法从表盘判断是否超速**；警告 `hud.js:152` 同样失效
- `bike.js:876` 贴地（stable）形态 `target = P.topSpeed*0.95 = 0` → **开贴地形态的车根本动不了**
- 相机前馈 `camera.js:141` 基准失效
- `world.js:440` 燃料预算 `vAvg = 0.78×REF_SPEED×speed` 与实际极速严重脱节

**修法**：迭代数改 `Math.ceil(Math.log2(TOP_SPEED_CAP)) + 8`（≈62），或改对数域二分；加断言"返回值 > 0 且 < 上界/2"。

---

## 分角度详细发现

### 输入延迟与手感链路
`Stepper` 实现本身**正确**：`Math.min(dt, 0.25)` 配 `maxSteps=15`（=0.25/DT）恰好覆盖，4~240Hz 全区间能追平真实时间，`n>=maxSteps` 时清累加器避免死亡螺旋。真问题是输入的电平化采样与多处滞后消费。

- `bike.js:1261-1262`：**`airRot` 被平方**。代码取 `(AIR_ROT_MAX*veh.airRot)/inv`，而 `vehicles.js:468` 断言 `airRot×inertia≈1`（逐车核对：0.612×1.63、0.303×3.3、2.778×0.36 全为 1.0）→ `inv=1/airRot` → **wMax ∝ airRot²**。实测 27 台车 wMax 从 0.87 到 73.3 rad/s，**跨度 84 倍**（文档意图只是 ∝1/inertia，应为 9 倍）。后果：airRot=2.778 的车 180° 只要 0.043s（比一帧还快，无法控制的瞬间翻面）；airRot=0.303 的车 180° 要 3.6s，超过任何滞空时间，**这台车永远拿不到空翻**。
- `bike.js:1445`：`b.speed = lerp(..., 0.12)` 是每固定步、τ≈0.13s 滞后，却被 `world.js:741` 跳台起跳速度、`game.js:795/798` 成就、`stats.js:25` 翘头里程读取 → 加速上跳台时 `up = KICK_V + spd*0.15` 系统性偏低。
- `camera.js:141`：相机前喂用滞后的 `bike.speed`，而同函数 zoom 用无滞后的 `speedOf()`（:63）→ 急加速时前喂欠 0.13s 速度分量，zoom 已到位，**车往屏幕边上漂**。
- `main.js:75-76`：`stepper.advance(dt)` 后直接 `drawScene(dt)`，全项目**无任何渲染插值** → 144Hz 下 144 帧里有 84 帧姿态完全相同，画面按 60Hz 台阶式抖动。
- `main.js:76`：`drawScene` 拿的是未钳制的真实 dt（物理被 Stepper 钳到 0.25s）→ 切后台回来 `trail.js:556` 的拖尾相位与 `render/bike.js:69` 的踏频相位一次性跳掉整段。
- `bike.js:1304` + `constants.js:520`：`drvK` 是二值 0/1，`torqueAt` 只乘 `c01(throttle)` → 扭矩在 1 个子步（2.78ms）内 0→满，**响应曲线是阶跃不是曲线**（项目里相机等全用指数平滑，唯独油门没有）。
- `bike.js:922-926`：刹车二值且 `cap=min(brakePeak,|w|*IW/sub)`，<25px/s 直接抱死，高速也是恒扭矩无调制、**两轮同 cap 无前后分配** → 玩家无法点刹。
- `bike.js:1256 vs 1361`：空中 ←/→ 是转体、地面 ←/→ 是刹车/油门，但两条通路**同时生效** —— 空中按 → 会让后轮在真空转（Fn=0，滚动阻力不生效）直到落地，`solveContacts` 见到巨大 slip → **落地凭空获得 μ·Jn 前冲**；空中按 ← 把轮子刹到 0，落地必打滑。
- `bike.js:1304,1316`：摔车期间 `drvK` 与 `brkK` 同时被 `run.crashed` 清零，`STUN_TIME=1.1s` 内玩家对 300km/h 的车**完全没有刹车能力**，纯滑行。
- `bike.js:1263-1266`：松键后角速度守恒且反向也要靠 `acc` 线性穿过 0（恒需 0.475s，与车无关）→ 高速车在此期间已转 2.7 圈，**玩家无法减速转体**。
- `input.js:9`：`key` 是电平量而非事件队列，一个 16.7ms 窗口内完成按下+松开的轻点会被完全丢弃（快点点刹无响应）。

### 动力链调校
- `constants.js:284` vs `bike.js:1026`：抓地上限用 `REAR_LOAD=0.62` 固定值，但真实求解器里后轮载荷是动态的 —— 实测 trail Lv100 巡航时**后轮承担 83.5%** 重量（μ·Fn_rear=3723 vs 表盘假设 2687，**1.39 倍**）→ 即使修好 SYS-3，表盘仍系统性偏低。
- `constants.js:298`：`loss()` 里的 `dragK*v² + LINEAR_DRAG_K*v` 是**加速度**量纲（`applyDrag` 里要 `/sv.m`），却与 `ROLL_RES_K*mTot*g`（**力**）直接相加比较。轻车 mTot=3.14 时 drag 项被低估 3.14 倍，重车 cv12 mTot=9666 时低估 9666 倍——同一式子在两端偏差方向相反。
- `bike.js:908,922`：**油门与刹车在同一 tau 上无仲裁地相加**（`tau = throttle_tau - brake_tau`，无"刹车优先"）。实测 28 台车中 **21 台**按住 ←+→ 仍在加速：cv1 满级 1.5s 冲到 1506 px/s。
- `bike.js:908`（wheelieGovernor）：`ANTI_ENGAGE=4` 判定用 `wheelieExcessOf = WHEELIE_K*wheelieMul = 2*mul`，全车队 mul 最大 1.3 → **excess 最大 2.60 < 4，`antiWheelie` 在正常游戏中永远不触发**（只有 ultra 形态 ×1.8 后才 4.68）。:296 行注释声称"弦外满级 620 倍"与实际差 240 倍，整段论证已失效。
- `bike.js:922-926`：刹车扭矩前后轮各给满 `brakePeak` 无视载荷分配 —— 实测 trail Lv100 巡航时前轮 Fn=0，**前轮 slip=1.00 锁死 25/40 帧**，玩家失去转向能力。
- `bike.js:321`：`brakePeak` 只乘 `veh.grip` **不含质量项**，而驱动力含 → 刹车/加速比在车队里横跨 **0.27~14.1 倍**（cv1 满级刹车只有加速的 27% = 刹不住；cv12 是 14 倍 = 一碰就翻）。
- `bike.js:908`：起步即空转的车太多 —— 28 台中 **12 台**满级 `fTrq/grip > 1`（sport 5.04、storm 4.48、volt 2.78…），`wheelieGovernor` 只在 >200 px/s 介入，**起步段 0~200 px/s 完全不设防**。
- `bike.js:1314-1317`：倒挡判定无迟滞，速度在 24px/s 阈值附近会逐帧抖动。
- `bike.js:920`：倒挡伺服扭矩单子步就把 Δω 拉到 13 rad/s，实测挂挡瞬间扭矩是刹车的 **13.9 倍** → 挂挡有明显顿挫。

### 空中姿态控制与落地判定
- `stats.js:50`：圈数用 `Math.round(rotAcc/TAU)` —— **转 0.5 圈记 1 圈**（一次误触就给满分）；且方向不对称：`Math.round(-0.5)===-0` 而 `-0 !== 0` 为 false，**后空翻半圈判 0 圈**（还顺带清空连招），前空翻半圈判 1 圈；1.5 圈前翻记 2、后翻记 1。
- `bike.js:1417` + `game.js:435,449`：`respawn`/`pitRewind` 不重置 `run.airTime`/`run.landed`，`resetBike` 把 `grounded` 归 0 → 重生后第一帧必然满足 `prevGrounded===0 && grounded>0`，补发一次 onLand → **摔前/掉坑前跳了 2s 就白拿 40 金币 + 空翻成就**，外加在重生点炸一次震屏/尘烟/落地音。
- `stats.js:56-58`：连招窗口按"距上一次翻转"计（`store.time - comboStamp <= 4`），间隔 3.9s 的连续翻转会**每跳 +1 且无上限**；最快车单跳 4-8 圈、combo 数跳即到 4+，**单次落地数千金币**（车价仅 3000~556500）→ 可稳定刷钱。
- `bike.js:1259-1266`：空中**无角阻尼**（注释明说"松键后角速度保持"），且 `a` 与 `wMax` 同比例缩放 ⇒ **所有车 spin-up/spin-down 都恰好 0.237s 满档**，玩家无法做"半圈"级别的姿态微调。
- `bike.js:1256 vs 1304`：`key.right` 同时是油门与前空翻输入（`inp=+1`）→ **冲跳台时只要全程加油，起飞瞬间就自动进入前空翻输入，玩家无法保持姿态过跳台**。空中全程加油严格优于松手，与"松油门比按什么键重要"的设定相反。
- `bike.js:1478`：落地判定只有"倾角 > tiltMin(99°~126°) 且头离地 < max(20, crashTol)"两条 → **95° 近乎仰面落地既不罚也不提示**；转体不足与过度都没有任何部分反馈。
- `world.js:331-345` + `levels.js:70-75`：`jumpN` 只在 airtime(4)/gauntlet(8) 两变体非 0，**normal/sprint/fuelrun/downhill 全部 `jumpN:0` → 无跳台** → 整套连招机制在 4/7 变体里事实上不可用。
- `bike.js:1417-1423`：同一帧内**落地结算先于摔车判定**（1417 vs 1478）→ 倒立落地会先 `addGold` 空翻奖励 + `playFlipSound` + `showCombo`，随后才 `crash()`（连招清零但金币不退、成就已解锁）。
- `bike.js:1302` + `1478`：`Math.max(HEAD_R+CONTACT_BAND, crashTol)` —— crashMargin ≥ 12 后 crashTol 降到 20 以下被钳死为 20，**"头离地多近算撑地"这一整路车架升级完全失效**；玩家花钱升到 80 级以上后抗摔数值不再变化。
- `bike.js:1330-1342`：飞行形态（omega）在子步循环之前整段 return，airControl 从不执行 ⇒ **空转体能力完全不存在**，而商店/面板照常展示 `airRot 百分比`。
- `bike.js:1417` + `game.js:57`：高速/颠簸地形下 `b.grounded` 逐帧在 0/1 间闪烁 → onLand 高频触发，落地音 + `addShake(≥1.0)` + 尘粒不断叠加，**屏幕持续抖动、声音连成一片**。
- `stats.js:31-38` vs `game.js:752,767`：`stepPhysics` 先于 `updateStats`，落地判定用的是**上一帧**的 grounded 状态 → `run.airTime` 少累计落地那一帧（1/60s），**所有滞空奖励与 `KICK_TARGET=0.62` 达标线系统性偏低**。
- `stats.js:79-80` + `game.js:196`：`world.airScore` 只被累加和清零，**全项目无任何读取方** → 整套"airtime 变体"是死代码，玩家看不到也拿不到。`airTargetOf` 同样 0 个消费者。

### 关卡难度曲线与节奏
- `levels.js:867`：关卡长度线性 5610→78000px（每关恒 +168px），但 `den3 = REF_SPEED×(0.72−0.22·ramp)` 后期递减 → **starTime 15s→300s（20 倍）**；单关时长从 15 秒暴涨到 5 分钟，且后 1/3 关每关都是 5 分钟长跑，无短关缓冲。
- `levels.js:866`：`ramp = gN^1.15` 使 fuelK(1→4.1) 与 hazardN(1→6) 在前期几乎不动 —— **前 36 关 hazardN 全为 1、gateN 全为 3、fuelK 仅 1.0→1.18**，"教学→加难"曲线在前 1/12 段是条直线。
- `levels.js:866,880`：体格按 `bi%12` 轮转，与难度解耦 → **难度倒挂**。实测断层密度在 L107→L108 从 1/2620px 突跳到 1/990px（2.6 倍）；反向 L95→L96 从 1/1348 掉到 1/2415（变简单）。
- `levels.js:225`：`FEAT_AMP_MAX=0` 使 5/6 类局部地貌永久失效；ramp 播撒用 `round()` → rolling/dunes 的 ramp 权重 0.3 在任何 gN 都 round 到 0 → **这两条支线 72 关永远零 feats**。实测 432 关中 **132 关（30.5%）feats 为空**，前 72 关无一有局部地貌。
- `levels.js:866-871`：`coinN = 36+72gN` 只涨 3 倍而 len 涨 13.9 倍 → **金币密度实测从 6.42 枚/1000px 掉到 1.38（4.6 倍变稀）**，与注释"金币密度必须与路程无关"相反。
- `levels.js:900-901`：`gateN` 仅 3→5 而 len 涨 13.9 倍 → **门间距从 1346px 涨到 11232px（8.3 倍）**，后期 78km 只有 5 道门，"限时门"这一节奏装置基本消失。hazardN 同理（密度降 4 倍）。
- `levels.js:864`：变体轮转 `SPECIALS[(bi*2+slotIdx)%5]` 与难度无关 → **变体成为难度倒挂源**：sprint（gateK=1.1 最严门）出现在支线 0 的第 3 关（新手期）；实测末道门要求均速在同支线内从 284px/s 掉到 157px/s 再回到 236px/s（1.8 倍摆动）而坡度只涨 0.15°。
- **`levels.js:1024` 终局关物理上不可通关**：`FINALE hazardN = round(len/12000)` = 1389 段，但 `hazardSpeed(0.5)=442px/s` 与 `den3=27778px/s` 差 63 倍。1389 段 × 430px 宽 ÷ 442px/s = **1351 秒，而 starTime 预算仅 600 秒**。除非用 noHazard 形态（要 1e10~1e32 金币），而解锁条件不要求任何形态。
- `levels.js:1020`：终局关 `den3 = len/600` 反解 1000km/h，`starTime` 恰好等于 `den3` → **全程零容错**；实测门间距 42088px = 1.5s/门，360 门零容错累积。建议 `den3 = len/720` 留 20% 余量。
- `levels.js:961`：`buildLongCourse` 用 `Math.pow(0.62, s%12)` 递减主波振幅 → 每 12 段循环一次，段 0 振幅 2.7px → 段 9~11 振幅 **0.0px（完全消失）** → 36 段里 9 段（25%）是"平段"，relief 在段 11→12 从 32.8→34.8px 突变。
- `levels.js:999-1033`：`fitSlope(L, 54)` 与 `buildLongCourse` 的 `slopeDeg:54` 重复写死同一数值，只改其一会静默失配。
- `game.js:624-630` vs `:818`：三星判定 `elapsedScore = time - levelStartTime + penaltyTime`，关卡限时 `time - levelStartTime - crashStall` —— 两套口径并存是刻意的，但 penaltyTime（人为 +2s/次）与 crashStall（真实昏迷）**方向相反**且无注释说明。

### 流程与状态机
- `game.js:333`：`store.lastMode` **全仓库从未被赋值**（只声明 + 此处读）→ `restart()`→`startGame()` 恒定 `mode="level"`。**比赛中按 R 会跳进闯关模式**，且 `store.racers`/`raceAI` 未清（实测残留进闯关，HUD `drawRaceBar` 与 cruise 层凭空画 AI）。
- `game.js:224`：**面板选的赛制被丢弃** —— `beginRun` 调 `raceInit(store.raceFormat)`（上一局的赛制）而非本轮刚写的 `raceFormatPick`。实测选"多人竞技"后仍跑 `raceFormat=duel, racers=1`；`raceFormatPick` 也被 raceInit 的 `!keepFormat` 分支反写成 duel。**3 种赛制跑起来都是 1V1。**
- `game.js:735` + `shop.js:288`：车间开着时按 R → `restart()` 走完 `beginRun()` 把 state 置 play、overlay 收起，但 `shopOpen` 仍为 true → **新车重开后永久冻结**，玩家看到"点了重开但车不动"。
- `game.js:257` + `world.js:541`：`freeInit` 清了 coins/deco/hazards 但**没清 `world.chunks`/`takenX`/`chunksDirty`，也没清 `world.js:41` 的模块级 `currentL`** → 跑完宇宙联赛回主页再开无限模式，`streamChunks()` 每帧仍按 `currentL.streaming` 重建 `world.coins`；跨 chunk 边界那帧宇宙赛道的 13 枚 85k 间距金币把 free 模式全部金币顶掉。
- `game.js:249-283` + `nextLevel:403`：终局关断点续玩在 `finaleSeg >= 36` 时把出生点设成 `L.len`（= `finishX`）→ 通关环大陆后按 R 实测 `spawnX === finishX === 16666666`，`awaitingStart` 一解除 `mid > finishX` 立即 `finishLevel()`：`elapsedScore=0.167s`、白拿 3 星（`goldBase` 为 undefined 空转，但星/成就/统计照记）。
- `game.js:404,632,650`：最后一关（`selLevel === 431`）三处都用 `< LEVELS.length-1` 做边界，FINALE 的下标 432 永远进不来 → 通关第 432 关后玩家必须自己回菜单找终局关卡卡。
- `game.js:362-363`：**高级排位档不可达** —— 面板只写 `store.raceRanked`，从不写 `store.rankedAdvanced`；`wantAdv` 回落到默认 false。靠 `storage.js:394` 落盘后重载才"歪打正着"生效。
- `game.js:496-519`：`endFreeRun` 的 1600ms 延迟回调只设 `state="menu"` 并 `toMenu()`，**不清 `world`/`bike`/`store.cam`**。
- `game.js:330`：`startGame` 的 `try/catch` 吞掉异常后只弹 toast，`store.mode`/`selLevel` 可能已被改成新模式但 `beginRun()` 未执行 → 菜单背景与实际 mode 不符。
- `game.js:851`：比赛判负的 900ms 回调直接 `nextLevel()` → `presenter.toMenu()`，**跳过结算卡**，玩家看不到名次/金币。
- `loop.js:26-34` + `game.js`：`maxSteps` 触顶时 `acc=0` 丢弃积压。**终局关单次 `buildLevel()` 实测 1217ms**（普通关 7ms），连续重开 10 次 = 12s 主线程卡死。
- 核对无问题：`pause` 态物理完全冻结（update 与 updateCamera 都 early-return，60 步增量均为 0）；`runGuard` 世代守卫能正确作废 R 重开后的延迟结算。

### 多点触控与组合操作
- `bike.js:1256`：**空中左右同按 → `inp = 1-1 = 0`，转体净输入为零，一点都不转**。玩家双手拇指同时按住 ◀▶ 想"一边转体一边加速"，空中完全无响应。
- `bike.js:1304,1316,903`：地面左右同按是油门与刹车同时施加，净扭矩被抵消、车几乎不动，但仍走翘头限幅逻辑。
- `bike.js:1314`：`revK` 要求 `b.grounded > 0` → **空中按 ▼ 完全无效**（三指组合时 ▼ 是死键且无提示）。
- `input.js:171`：**无 `touchmove` 换键** —— 事件按 touchstart 原始 target 派发，手指从 ▶ 滑到 ◀ 只会在 ▶ 收到 touchend → 小屏上想滑键做空中转体必须完全抬指重按。
- `input.js:151-158` + `58-64`：🎮 切换把 `#touch` 置 `display:none`，正在按住的手指收不到 touchend（代码未显式清键，完全依赖 UA 是否补 touchcancel）→ **下一局 `awaitingStart` 立刻解除并满油起步**。
- `menu.js:61-64,184`：暂停态 `playing = play || pause` → 方向键继续显示，但 `#overlay`(z20) 盖住 `#touch`(z10) → **暂停时方向键可见却点不动**。
- `input.js:173-175`：无 window 级 `mouseup` 兜底；桌面按住 ▶ 后把指针拖出浏览器窗口再松开，回来油门仍锁死。
- 核对无问题：多点触控控制**不同**键（◀+▶+▼）本身是通的，三个独立布尔量互不干扰。

### 起步闸门与操作引导
- `game.js:741-748`：**起步闸全程无任何画面提示**（全库 grep `awaitingStart` 在 render/ui 零命中）。新玩家开局看到的是完全静止的画面，**与"卡死"无法区分**。
- `bike.js:657` + `game.js:435,459`：`resetBike` 无条件 `awaitingStart=true`，而 `respawn()`/`pitRewind()` 都调 resetBike → **每次摔车重生、每次掉出地图都会重新上闸**。摔车 1.1s 昏迷结束→重生→闸门重新上锁；若玩家此刻已松开油门（摔车后的自然反应），游戏再次静默冻结，只剩 420ms 的"回到安全点"toast。
- `game.js:218-236`：开局 3/2/1 倒计时完全不存在。
- `game.js:218-236` vs `404-429`：`nextLevel()` 有 `showToast(关卡名+主题, 800ms)`，而**玩家一生一次的"第一次进关"走 beginRun，全程零 toast**。
- `hud.js:150`：`activeWarning` 只对 `mode==="level"` 返回警告，但 `game.js:804` 对 `level || MODE_SPACE` 都判危险段超速摔车 → **宇宙场玩家在无任何预警的情况下被判超速摔车**。
- `game.js:804` vs `levels.js:1063`：反向不一致 —— 比赛模式 `hazardN=RACE_LEN/12000 > 0`，危险段会被 `drawHazards` 画出来，但 `game.js:804` 不对 race 判罚 → **纯装饰性机制，玩家会误以为要减速**。
- `game.js:742`：闸门只认 `key.right`/`key.left`，**不认 `key.rev`** → 摔车重生后玩家按下▼无法解冻，会以为卡死。
- `stats.js:26`：`run.maxWheelieDist` 全库无任何读取方 → **玩家做翘头零反馈，该机制等于不存在**。
- `stats.js:63`：首次空翻直接弹"🔃 前空翻×1 连招x1 +40"—— 文案假定玩家已知"空中按 A/D 转体"和"连招"含义，首触发即术语轰炸。
- `game.js:50-54`：摔车 toast 只报惩罚，不含任何恢复引导；`run.hasCrashed` 只用于成就判定，无首次摔车教学。
- `hud.js:343-379`：燃料条无首次说明；低油仅靠 alpha 闪烁，无文字/音效预警。
- `hud.js:154-160`：限时门从开局就显示"⏱ 第1门 45.0s"，但没有任何规则说明（超时=判负、不计星不解锁）。
- `hud.js:283`：`mode === "level" || mode === "space"` 分支是死代码（space 的 gateN=0）。
- `game.js:442,455`：`bike.locked` 是幽灵字段（store.js 从未声明、全库无读取点）。
- 全库无 `seen`/`tutorial`/`firstRun` 之类的一次性标记位 → 所有"首次提示"都缺持久化判据。

### 燃料系统
- `game.js:466`：**死亡螺旋** —— 耗尽只补 30%，但油罐间距恒大于 0.3×续航。实测 3182 个（关卡×车）组合中 **100%** 满足 `spacing > 0.3×range`（例 L432 驮马间距 3467px，0.3 箱只够跑 1989px）→ 掉油→回到安全点→再跑 1989px→再掉油，**玩家被卡死在两罐之间反复重生**（无失败态、可无限刷距离）。
- `game.js:466-468`：**岩驼（mud）在 64/432 关数学上不可通关**，且赛事必败（缺 10028px / 65902px）。车架 Lv50 才解锁 432 关、Lv75 才解锁赛事。
- `hud.js:356`：25% 低油阈值**晚于不可逆点** —— 实测中位数需要 **63%** 的油才能到下一罐（p90=128%，max=161%）→ 100% 的组合里玩家看到红色闪烁时已注定到不了下一罐。
- `game.js:770,793` + `bike.js:760`：摔车扣 8% 与"耗尽补 30%"叠加成净收益 —— 油量 <8% 时摔车扣到 0，同帧 `fuelOk=false` 立刻补 30% → **低于 8% 摔车净赚 22% 油量**且跳过耗尽惩罚，可主动摔车刷油。
- `world.js:443`：容错余量 `M = 1.30 - 0.25×ramp` 在高难关降到 1.05，低于单次摔车的 8% → L432 驮马真实余量仅 **7 次摔车**；R201 一带余量已归零。
- `world.js:463` + `game.js:214`：`prepFuel` 放大 `fuelMax`，`crash()` 的 8% 也随之放大 → **变体关的摔车惩罚被悄悄加重**，与"总油量不变"的注释承诺不符。
- `world.js:609`：无限模式油罐按 `rng() < 0.11` 随机撒，与车速/油耗无关 → 重车 0.6 箱只够 5709px，而平均间距 4000px 的**指数分布尾部有 24% 概率出现 >5709px 空档** → 无限模式会无预警断油直接结束本局（`endFreeRun` 是硬失败，无重生）。
- `fuel.js:27-32`：free 分支与主分支代码重复且 `fuelK` 被完全绕过 → 无限模式油耗恒为 1.0 倍而关卡模式最高 4.1 倍，同一车在两种模式下续航感受差 4 倍且无任何提示。
- `fuel.js:37`：全程按 `key.right` 而非实际扭矩输出计费；腾空轮转、形态加速（`fx.speedN` 最高 4.2）都按满油门计费。
- `fuel.js:34`：`courseAt(idx, mode, topSpeed)` 第三参被忽略（`levels.js:1323` 只有两个形参）。
- `vehicles.js:223`：岩驼 `speed0.7/weight2.0/fuel1.45` 是唯一负收益车，`speed×fuel/weight = 0.51` 全场最低，续航不到驮马一半。
- `hud.js:344`：`fuelRatio() > 1` 时（改车/升级重算 `fuelMax` 但 `fuel` 不变）进度条按 >100% 绘制，实测 sprint 变体开局 160%、买一级车架后显示 159% 并画出超长条。

### 碰撞 / 翻车
- `hud.js:150` vs `game.js:804`：宇宙场有危险段判定却完全没有预警（照画危险带 + 限速牌，撞上即摔 8% 燃料 + 2s）。
- `hud.js:152,385` vs `game.js:806`：**HUD 车速与摔车判据用两个不同的速度源** —— HUD/警告用 `bike.speed`（τ=0.139s 滞后，系统性偏低），判定用 `bikeVx()`。按 2000px/s² 加速估算滞后 ≈278px/s ≈ **10km/h**，而危险段限速 `hazardSpeed(0)` 只有 494px/s（17.8km/h）—— **滞后量比整个裕度还大**。满油门加速中进危险带 → 表盘读数低于限速、警告不亮，`bikeVx()` 已超 → 摔。
- `bike.js:1230`：高速穿透的恢复被硬夹在 4px/帧且**不在 `SOLVER_ITERS` 循环内**。`constants.js:375-381` 自己记录了 350km/h 时穿透峰值 **14.6px**（容差仅 2px）→ 轮子要在地形里泡 4 帧以上，这几帧的 `grounded`/`fn` 全是按穿模采样算的。
- `bike.js:1478`：摔车判据每帧只在末位采样一次 —— cv9~cv12 地面形态实测 **156~186 px/帧**，帧内车头实际扫过 186px 而判据只看终点那一点 → 高速下坡掠过坡顶/凹坑时"车头明明还在空中却判摔"。
- `bike.js:1107-1112`：地形每子步只采样一次，注释用 `flightStep` 整条替换掉 omega 形态，但 cv9~cv12 **未开形态**时仍走接触求解器：186px/帧 ÷ 6 子步 = **31px/子步**，而 `groundInfo` 的中心差分 e=2 对 4px 以下特征完全不可见 → 可能穿模上台或落进台体。
- `world.js:665,687`：**金币/油罐拾取半径 45px 是单点采样**（窗口直径 90px），cv9~cv12 地面形态 156~186px/帧，采样点每帧跳跃 > 窗口宽度 → 高速必然漏检（"一枚不捡，燃料永远上不去"）。
- `world.js:715`：**加速带判定窗口只有 ±26px，是全场最窄的碰撞体积**，而视觉是半径 30px 的椭圆 → "看着压上去了却没触发"，且高速下大面积不触发。
- `world.js:739`：跳台触发窗口 ±60px，cv9~cv12 是 186px → `🛫 起飞台!` 永远不触发。
- `bike.js:750-769`：`crash()` 只写 `run.combo = 0`，**`comboStamp` 与 `airTime` 都保留原值** → 掉坑重生后可跨坑续接连招刷分；且惩罚期玩家完全无输入 1.1s 后瞬移回 `lastSafeX`。
- `bike.js:760`：8% 按油箱**上限**扣而非按余量 → 油量 5% 时摔车直接归零 → 再 `handleFuelEmpty` 补 30% + 重生，**等于一次摔车换两次传送**。
- `game.js:683`：危险段摔车弹两次 toast，且两个数字（-8% / +2s）都是硬编码字符串，`CRASH_FUEL_LOSS`/`CRASH_TIME_PENALTY` 一改这里就撒谎。
- `game.js:441` + `terrain.js:77`：`safeSpot` 在 `[x-200, x+600]` 里挑最平缓点但不排除 `world.hazards`/`world.gates` → lvl0 门距 1346px，+600px 搜索窗足以跨过一道门 → **门前 300px 处摔车 → 重生点落在门后 → 白送一道门**。
- `terrain.js:28`：非有限地形的兜底 `y=0` 会被摔车判据当成真实地面（`0` 是有限值）→ 任何让采样返回 NaN 的路径都立刻误判摔车。
- 附带发现：`b.penetration`（`bike.js:1347` 清零 / `:1027` 写入）**无任何读取方** —— 它恰好是高速穿透最直接的可观测量，接上就能把"轮子陷进地里"从静默变成可断言。

### 比赛 / 排位模式
- `constants.js:1056`：团赛队伍划分错 —— riders=5/teamSize=3 → `i < size-1` 判出 2 名队友 + 3 名对手，而 `racePlaceOf` 的"队内第 N / 3"分母是 3（含玩家）→ **"3v3"实际是 2v3**。
- `constants.js:1078`：团赛队名次判定错误 —— `ahead <= rivalAhead ? 1 : 2` 比较的是"**队友**中在玩家前面的数量"vs"**对手**在玩家前面的数量"，与两队总里程无关 → 玩家跑第 3 时 ahead=2、rivalAhead=0 → 判我方**落后**，即使队伍总里程领先。
- `game.js:843`：**团赛"接力"无任何实现** —— AI 队友只是被追赶逻辑约束的独立个体，没有交棒/接棒/换人，`desc` 写"两队都贡献里程"但只是并列跑。
- `constants.js:1047`：AI 起点 `START_X-120-i*190` = -80…-840，**全部在玩家身后且在 x=0 之外** → 玩家开局即领先，名次从第 0 帧就定了。
- `race.js:152`：排位赛正弦抖动用**世界坐标 x** 做相位 → AI 之间 x 不同，抖动互不同步，赛道越长相位差越大，配速行为不可预测。
- `race.js:150`：追赶以**玩家**为参照，团赛里队友也被拉住（注释承认）→ 叠加上面 `racePlaceOf` 的错误判定，团赛体验是"队友永远跟不上"。
- `race.js:146`：排位赛 AI 乘 `ai.bias`（0.93~1.03），但面板 `paceRange` 只算 `rankedAIScale` 不含 bias → 宣传"0.70× → 0.97×"实际最高 1.00×；高级档宣传 1.35× 实际 1.39×。
- `constants.js:28-29` + `race.js:146`：**高级排位在段位爬高后可能数学上不可赢** —— 段位满时 1.355× → 479 px/s，玩家基础极速仅 520 px/s 且爬坡/换挡必然低于此。
- `hud.js:250`：比赛模式仍显示"🏆 比赛 第 N 关"，但 `courseAt` 对 race 恒返回 `RACE_COURSE`（`levels.js:1325`）→ **关卡号纯属误导**；面板宣传的"随机赛道"也不成立（`selLevel` 只影响抽签池）。
- `race.js:154` vs `levels.js` 的 `SPACE_AI_ACC=0.6`：`raceUpdate` 仍是 `dt*3`（≈1/3 秒满速）而玩家 omega 伺服要 ~4 秒 → **同一个 bug 在 `spaceUpdate` 修过了，`raceUpdate` 没修**。
- 核对无问题：race 模式不判危险段与计时门是有意的（`RACE_COURSE.gateN = 0`），操作键位/物理/燃料/崩溃惩罚完全复用闯关，无手感割裂。

### 无限模式与宇宙场
- `game.js:721`：free 走 `groundY(midX)+800`，**没有宇宙场那套 `perFrame*1.8` 余量** → 26° 坡下 v=1e5 px/s 一帧落差 813px > 800 → **高速车在连续下坡被反复判"掉出地图"**。
- `world.js:596`：`guard++ < 200` 每帧生成上限 × 最大间距 710 = 14.2 万 px/帧，而 v=2.9e8 px/s 时相机一帧走 4.8e6 px（**34×**）→ 生成器永久跟不上，`world.freeGenX` 越落越远再也追不回来。
- `world.js:598`：难度 `diff = min(1, d/120000)` 在 **1200m 处完全饱和** —— 实测 1.2km 之后 coin/km 恒 79、coinVal 恒 60、间距恒 570px。而「光年之旅」成就目标是 9.46e15 m —— **99.99999% 的里程是零难度变化的平地跑**。
- `game.js:481-520`：`endFreeRun` 只弹 1600ms toast 就回主菜单，**不走结算卡** → commit `ae7d151` 刚把"本局用时"补回所有玩法，唯独无限模式玩家看不到完整数据。
- **`levels.js:275`（world.js）+ `:1286`：`hazardSpeed(L.ramp)` = 442 px/s（15.9 km/h）与联赛配速完全无关** —— 实测 L1 甲区 AI 已是 1.67e4 px/s（**AI 配速的 38 倍**），L12 丙区是 4.9e11 倍。而 `game.js:804` 让 space 走危险段判定 → **每一场 space 赛事的 2 个危险段都是必摔**（430px 宽 vs L1 一帧 278px）。唯一豁免是买形态（要 1e10~1e32 金币）。space 的 `vmax` 必须由 `spaceDefOf().ai` 推导而非复用 `REF_SPEED` 系。
- `world.js:275` + `camera.js:82-93`：危险段在 cruise 层**根本不画**（`scene.js:41-50` 提前 return）→ 实测 L2 起 zoom<0.05 就进 cruise 层 → **玩家在 L2+ 遇到的是「看不见的限速带 + 必摔」，HUD 预警还被 `ignoresHazardLimit` 挡掉 —— 三重不可见**。
- `world.js:665`：space 赛道 `coinN ≈ 13~41` 枚铺在最长 2.25e16 px 上（间距 7.5e14 px），拾取是逐帧点采样 → **L2 之后金币命中率<2%、L4 之后恒 0**，注释里说的"金币合计≈奖金 20%"在高层联赛完全拿不到。
- `levels.js:1180-1188`：面板与注释都称"单场 30~122 秒"，但真实完赛时长 = `dur/aiK` → **实测甲区实际 50~90 秒、丙区 78~141 秒**（比标称多 16%~67%）。
- `game.js:593-618` + `panels.js:308-315`：108 场的进出场**没有「下一场」** —— 结算卡"继续 →"→ `nextLevel()` 对 space 走 else 分支回主菜单 → 108 场 = **216+ 次无效导航**。
- `levels.js:1165` + `game.js:603`：`LEAGUE_RATING_STEP=260` 而 L11 甲区一胜给 267 分 → **一次胜利就跨过一个联赛的整段门槛**，12 联赛后半段失去阶梯感；且 `store.space.rating` 是全局单一数值，**可只刷 L1 甲区（门槛 0）攒够 11×260 分解锁 L12**。
- `cruise.js:100-111`：`rel = (ai.x - base)/visW` 且 `rel < -0.6 || rel > 1.6` 就 cull → L4+ 一帧位移 4.2e5 px 而 `visW` 仅 160k px → **对手几乎永远在视窗外，玩家在 cruise 层看不到任何对手**。
- `cruise.js:138-165`：`drawCruiseGround` 地平线是**纯水平的**，完全不反映 `groundY` 起伏 → space 地形有 10~26° 实坡，玩家在 cruise 层**无法判断自己在上坡还是下坡**。
- 核对无问题：space 准入双门、`courseAt` 的 `spacePinned` 钉住机制、`runGuard` 世代守卫、流式 chunk 的独立种子纯函数性、`spaceCourse` 三级下标缓存与 6 条 LRU。

### 游戏反馈（juice）缺口
代码里**完全没有 hitstop/慢动作原语**（全库 grep 无），所以每个"大时刻"——摔车、过门、通关、成就——都只能停在"震屏 + toast + 音"的同一档。
- `game.js:824`：过计时门只有一条 600ms toast，**无音效/粒子/震屏/绿闪**，音量还低于捡金币 —— 这是闯关最高频的正反馈。
- `game.js:536-680`：`finishLevel` **零 FX**，全局最大成就时刻的观感等于一条 900ms toast。（`game.js` import 了 `addShake` 但 `finishLevel` 从未用它 —— 全局最大的反馈面板根本没接线。）
- `race.js:133-168`：比赛**完全没有超车检测** —— place 每帧重算但无人比对上一帧名次。赛车最核心的多巴胺事件零反馈。
- `hud.js:166`：形态的无敌/无限油/限速豁免在 render/ui **完全无引用** → 玩家开启护盾后危险段警告直接消失，却没有任何"我现在无敌"的替代信号。
- `hud.js:283-295`：`coinGot/totalCoins` 决定二星（≥0.7）但 **HUD 全程不显示已收集/总数** → 玩家不知道差 3 枚就掉一星。
- `stats.js:80` + `game.js:196`：`airtime`/`gauntlet` 变体的 `airScore` 与 `airTargetOf` 都 0 个消费者 → 变体说明写"多刷滞空与连招"但既不显示累计滞空也不判达标。
- `game.js:626`：`noteLevelRun` 的返回值被丢弃 → **个人最佳用时更新了但从不播报**（只有无限模式有"🏅 新纪录"）→ 刷新纪录这个重玩核心驱动力完全隐形。
- `game.js:632-634`：`store.unlocked` 推进时**完全静默**（只有 433 终局有 toast）。
- `world.js:717-722`：加速带只给一次性粒子 + toast + shake3，0.5 秒助推期间无任何持续视觉，且 `bike.boostT` 在 render/ui **0 个读者** → 粒子在推力生效前就散了。
- `game.js:46-55,770-776`：摔车有震屏/音效/粒子但无顿帧、无去饱和、无"倒地"状态 → 1.1s 无输入期间玩家不知道何时恢复控制。
- `stats.js:36` + `game.js:57`：落地音效与扬尘都是固定值不看 vimp，而震屏下限锁死 1.0 → **常态低频抖动把大摔车的 11 点震屏钝化了**。
- `core/toast.js:100-125`：终局关 360 道门每道文案唯一 → toast 变成 360 条滚动字幕条，队列丢最旧还会挤掉真正的成就/解锁提示。
- `game.js:444,457`：`respawn`/`pitRewind` 硬改 `cam.x` 但**从不重置 `cam.zoom`** → 宇宙车在 1e-4 缩放下摔车后，重生瞬间画面先缩成一个点再炸开（约 20 帧 CAM_ZOOM_LERP 0.05）。
- `physics/events.js:20,33`：`onSlip` 是死钩 —— `b.slip[]` 每子步都在算但 0 处派发。
- `stats.js:68`：非空翻落地立即 `run.combo=0` 硬清零无衰减斜坡，HUD 里也 0 处 combo 引用 → 玩家既看不到当前连招数，也看不到 4 秒窗口在关。
- `core/toast.js:128-137`：`showCombo` 是全局单元素 + 单计时器，连跳时后一条直接顶掉前一条。
- `stats.js:63`：`run.maxWheelieDist` 统计了但无消费者。
- 音效覆盖：只有落地/翻车/加油/金币/加速带/成就 7 类；限时门通过、通关结算、跳台起飞、燃料耗尽、名次变化全部无音。