# Tasks（第 1 期：场景/关卡扩容 + 进度阶梯 + 机制性难度 + 存档）

> 只管本期范围。UI 视觉重构与物理手感打磨分别留给第 2、3 期，本期不碰。

## Task 1: 场景系统数据驱动重构 + 扩容到 12 场景
- [x] SubTask 1.1: 把 `src/render/background.js` 中对 `store.phys.theme === 3`、`th === 1/2` 的硬编码分支重构为**数据驱动图层描述**（场景数据里声明图层列表，渲染层只按列表画）
- [x] SubTask 1.2: 把 `src/render/terrain.js` 中对 `th === 0/1/2/else` 的硬编码地表纹理分支重构为数据驱动（场景数据里声明纹理类型与参数）
- [x] SubTask 1.3: 扩展 `src/config/themes.js` 为 **12 个场景**完整数据：名称、重力、抓地、天空渐变、太阳色、地表三色、纹理类型、装饰组合、背景图层、环境粒子类型
- [x] SubTask 1.4: 场景：绿野、雪原、荒漠、月面、雨林、火山、冰川、红岩峡谷、沼泽、城市废墟、天空浮岛、极夜星空
- [x] SubTask 1.5: `src/render/entities.js` 装饰物类型数据化（12 场景 × 2 种装饰 = 24 种绘制），并保证主题切换后装饰不串用
- [x] SubTask 1.6: `tools/autotest.mjs` 新增断言：12 个场景逐一渲染一帧无异常；渲染层源码中不存在 `theme === <数字>` 形式的硬编码分支；不同重力场景的物理行为按数据生效

## Task 2: 关卡大扩容（12 支线 × 6 关 = 72 关 + 最终任务）
- [x] SubTask 2.1: 在 `src/config/levels.js` 定义支线结构：12 条支线 × 6 关，每条支线绑定一个场景（`id / name / theme / desc`）
- [x] SubTask 2.2: 重排 72 关数据（关卡名、长度、坡度曲线、金币数、燃料倍率），使难度沿**全局进度**单调递增
- [x] SubTask 2.3: 新增「最终任务」关卡定义（超长赛道 + 最高机制密度 + 多场景分段）
- [x] SubTask 2.4: 导出辅助查询函数：按支线取关卡、按全局索引取关卡、取关卡所属支线、取全局进度比例
- [x] SubTask 2.5: `tools/autotest.mjs` 新增断言：恰好 12 条支线 × 6 关 = 72 关 + 1 关最终任务；难度指标逐关单调递增；关卡主题与所属支线场景一致

## Task 3: 关卡变体（穿插"好玩的"）
- [x] SubTask 3.1: 在 `src/config/levels.js` 定义 6 种变体 `normal / sprint / gauntlet / airtime / fuelrun / downhill` 及其对关卡参数的改写规则
- [x] SubTask 3.2: 排布规则：每条支线第 3、5 关为特殊变体，其余为 `normal`；保证 6 种变体在全游戏中都出现
- [x] SubTask 3.3: `sprint`（门时限极严、无油罐）/ `fuelrun`（全场 1 个油罐）/ `gauntlet`（障碍密集成通道）的实体生成特化
- [x] SubTask 3.4: `airtime` 变体的结算条件改为"累计滞空 + 连招达标"，未达标不判通过并提示差距
- [x] SubTask 3.5: `downhill` 变体的危险段密集化
- [x] SubTask 3.6: `src/render/hud.js` 显示当前变体名称与 `airtime` 关的目标进度
- [x] SubTask 3.7: `tools/autotest.mjs` 新增断言：变体穿插排布正确、6 种变体均出现、`airtime` 未达标不判通过、`fuelrun` 油罐数为 1 且自动试跑可通过

## Task 4: 障碍物机制
- [x] SubTask 4.1: 在 `src/config/constants.js` 定义障碍物标度常量（碰撞半径、视觉尺寸），遵守"标度纪律"
- [x] SubTask 4.2: 关卡数据支持 `obstacles`；`src/game/world.js` 构建关卡时按配置与确定性随机放置（不得落在出生点/终点缓冲区），`gauntlet` 变体生成通道式密集布局
- [x] SubTask 4.3: `src/physics/bike.js` 新增车身三质点 vs 障碍物碰撞检测，命中走既有摔车流程
- [x] SubTask 4.4: `src/render/entities.js` 绘制障碍物（含 12 场景主题化外观）
- [x] SubTask 4.5: `tools/autotest.mjs` 新增断言：撞击障碍物会摔车、腾空越过障碍不摔车、障碍物不生成在出生点附近

## Task 5: 危险段（超速必摔）机制
- [x] SubTask 5.1: 关卡数据支持 `hazards`（起止 x + 速度阈值）；`world.js` 构建并暴露给判定逻辑
- [x] SubTask 5.2: `src/game/game.js` 每步判定：车身中点进入危险段且 `|bike.speed|` 超阈值 → 摔车 + "减速！"提示
- [x] SubTask 5.3: `src/render/entities.js` 绘制危险段（地表警示纹理/路标），保证可提前预判
- [x] SubTask 5.4: `tools/autotest.mjs` 新增断言：超阈值进入必摔车、低于阈值通过不摔车

## Task 6: 限时门机制
- [x] SubTask 6.1: 关卡数据支持 `gates`（x 位置 + 相对本关起点的累计时限），每关 3~5 道
- [x] SubTask 6.2: `src/game/game.js` 每步判定通过门的时间；超时 → 本局判负（提示原因、不计星、不解锁、回该关入口）
- [x] SubTask 6.3: `src/render/entities.js` 绘制门（含通过状态），`src/render/hud.js` 显示下一道门倒计时
- [x] SubTask 6.4: `tools/autotest.mjs` 新增断言：按时通过全部门可正常结算、超时判负且星级/解锁不被写入

## Task 7: 摔车惩罚
- [x] SubTask 7.1: 在 `src/config/constants.js` 定义惩罚常量（扣燃料 8%、计时惩罚 2s）
- [x] SubTask 7.2: `src/game/game.js` 摔车时应用惩罚，并让 `elapsed` 计入累计惩罚（影响三星判定）
- [x] SubTask 7.3: 摔车提示文案体现惩罚（"燃料 -8% / 计时 +2s"）
- [x] SubTask 7.4: `tools/autotest.mjs` 新增断言：摔车两次后燃料减少 16%、本关用时累加 4s

## Task 8: 最终任务多场景串联
- [x] SubTask 8.1: 关卡数据支持"场景分段"（按 x 位置切换场景）；最终任务按分段覆盖多个场景，赛程长度显著大于任一支线关
- [x] SubTask 8.2: `src/physics/terrain.js` 与 `src/game/world.js` 支持按当前 x 查询所属分段的重力/抓地与渲染主题
- [x] SubTask 8.3: 保证分段切换**物理连续**：切换处不允许车身瞬移、速度突变或出现 NaN
- [x] SubTask 8.4: `tools/autotest.mjs` 新增断言：跨越场景分界点时位置与速度连续、最终任务可通关、赛程中确实切换了 ≥3 个场景

## Task 9: 进度阶梯状态机与本地自动存档
- [x] SubTask 9.1: `src/core/store.js` 新增 `store.progress`：`{ branchCleared: [], finaleDone, invited, rating, wins, losses, peak, freeThemes: [] }`
- [x] SubTask 9.2: `src/config/constants.js` 的 `SAVE_KEYS` 新增 `prog: "bike_prog"`、`rating: "bike_rating"`、`stat: "bike_stat"`（既有 10 个键名一个都不动）
- [x] SubTask 9.3: `src/core/storage.js` 实现 `saveProgress()` 与读取；**老存档 20 关 → 72 关迁移**：旧第 i 关星级映射到新第 i 关（全局索引），`bike_unlocked` 同步，72 关星级数组补齐 0，由 `bike_v` 版本号守护只执行一次
- [x] SubTask 9.4: 实现阶梯解锁规则：72 关全通 → 最终任务；最终任务通关 → `invited = true`；`rating ≥ 1200` → 高级排位赛；`rating ≥ 2400` → `peak = true`
- [x] SubTask 9.5: 累计统计 `bike_stat`：总局数、总里程、总时长、最后游玩时间，在通关/结束时累加
- [x] SubTask 9.6: 自动保存时机：通关结算、解锁关卡/场景、购车、升级、成就、段位变化立即写盘；骑行中每 30 秒兜底写盘；`visibilitychange` 切后台时写盘
- [x] SubTask 9.7: 容错与降级：任一键缺失/JSON 损坏 → 回退默认值不崩溃；`localStorage` 读写抛异常 → 标记为"不可用"，首屏提示"本次无法保存进度"且游戏仍可玩
- [x] SubTask 9.8: `tools/autotest.mjs` 新增断言：全新存档只有第 1 关解锁、老存档迁移后星级与解锁不回退且长度补齐到 72、迁移只执行一次、解锁阈值边界（1190/1210、2390/2410）、`bike_stars` 损坏时正常启动、`localStorage` 抛异常时游戏仍可运行

## Task 10: 存档导入 / 导出
- [x] SubTask 10.1: 在 `src/core/storage.js` 实现 `exportSave()`：收集全部 `bike_` 键，组装为 `{ app: "dale-bike", format: 1, savedAt, data }`（`data` 为与 `localStorage` 一一对应的原样字符串键值）
- [x] SubTask 10.2: 实现 `downloadSave()`：把导出内容序列化并用 `Blob` + `URL.createObjectURL` 触发下载，文件名形如 `dale-bike-save-<YYYYMMDD-HHmm>.json`
- [x] SubTask 10.3: 实现 `parseSave(text)`：**先完整校验**（JSON 可解析、`app === "dale-bike"`、`format` 受支持、`data` 为非数组对象），返回 `{ ok, error?, data?, summary? }`；校验失败**不写入任何键**
- [x] SubTask 10.4: 实现 `importSave(data)`：校验通过后**整体写回**全部键 → 重新执行读档与迁移 → 返回结果供界面刷新
- [x] SubTask 10.5: 实现 `summarizeSave(data)`：从导入数据中解析出"通关数 / 总星数 / 段位分 / 金币"，供导入前对比展示
- [x] SubTask 10.6: `tools/autotest.mjs` 新增断言：导出内容含四个字段且 `data` 覆盖全部 `bike_` 键；导出→重置→导入后进度完全一致；导入非法文件（`app` 不符 / `format` 不支持 / `data` 非对象 / 非法 JSON）被拒绝且现有存档**逐键保持不变**；`summarizeSave` 结果正确

## Task 11: 排位赛段位系统
- [x] SubTask 11.1: `src/game/game.js` 新增 `mode = "ranked"` 流程：入口需 `progress.invited`；结束按胜负更新 `rating`（胜 +N、负 -M、下限 0）
- [x] SubTask 11.2: `src/game/race.js` 让 AI 强度随 `rating` 与是否高级赛缩放（高级赛基准与加成显著更高）
- [x] SubTask 11.3: 结算显示段位分变化与当前段位名称
- [x] SubTask 11.4: `tools/autotest.mjs` 新增断言：未收到邀请时无法进入排位赛、胜负正确改变 rating 且不为负、高级赛 AI 强度 > 普通排位赛

## Task 12: 无限模式自由选图（12 场景）
- [x] SubTask 12.1: 无限模式入口按 `progress.peak` 分为"随机地形"与"自由选图"两种形态
- [x] SubTask 12.2: `src/game/world.js` 的 `freeInit()` 接受场景参数，用该场景的重力/抓地/渲染主题/环境特效启动
- [x] SubTask 12.3: `tools/autotest.mjs` 新增断言：未登顶时无法选图、登顶后可按 12 个场景逐一初始化且物理环境随场景切换

## Task 13: 菜单与面板接线（沿用现有视觉风格）
- [x] SubTask 13.1: `src/ui/panels.js` 新增"支线任务"面板：12 条支线卡片（含场景主题、完成度）+ 支线内 6 关格子（锁定/星级/变体图标），替换原线性关卡面板
- [x] SubTask 13.2: 新增"最终任务"入口（按解锁状态显示锁定）与"排位赛"面板（段位分、战绩、普通/高级两档）
- [x] SubTask 13.3: 无限模式面板：未登顶走随机地形，登顶后可自选已通关场景
- [x] SubTask 13.4: 新增「存档」面板：进度概览（已通关/总星/段位/成就/金币/累计里程/累计时长/最后游玩时间）+ **导出存档**（下载 JSON 文件）+ **导入存档**（文件选择 → 校验 → 展示"当前 vs 导入"对比 → 明确提示"将覆盖当前进度" → 二次确认 → 成功后刷新界面）+ **重置存档**（二次确认）
- [x] SubTask 13.5: `src/ui/menu.js` 与 `index.html` 接线新入口（按钮 + 事件委托，保持 `index.html` ≤ 200 行、无内联 `onclick`）
- [x] SubTask 13.6: 手动核对：所有面板可正常打开/返回，锁定项给出明确提示，不出现死链或空面板；72 关列表在面板中不卡顿

## Task 14: 反向断言与全量回归
- [x] SubTask 14.1: 在 `tools/autotest.mjs` 实现"全油门自动骑手"，逐关统计能否通关及失败原因（撞障碍 / 危险段超速 / 限时门超时 / 变体未达标）
- [x] SubTask 14.2: 新增**反向断言**：至少后 1/3 关卡无法被全油门通关；前 1/3 关卡仍可被全油门通关（保留教学余量）
- [x] SubTask 14.3: 跑 `node tools/autotest.mjs --levels` 确认 72 关无 NaN、可通关（含"刹车策略"参考用时），并打印难度/机制对照表
- [x] SubTask 14.4: 跑完整 `node tools/autotest.mjs` 确认全绿、静态检查通过（无裸半标度换算、import/export 对应、`index.html` 约束）
- [x] SubTask 14.5: 同步 `README.md`：12 场景、72 关 + 最终任务、6 种变体、支线/排位赛/无限选图玩法、新机制说明、**浏览器本地存档与导入/导出用法**、测试断言数

---

## Task 15: 比赛 / 排位赛 AI 配速修正（实机反馈：对手速度太快）
- [x] SubTask 15.1: 定位根因：AI 巡航速度按 `MAXV×(0.80~1.28)×(1+42%×ramp)` 标定，与关卡难度脱钩 → 后期 AI 达三星节奏 2~3 倍（实测玩家/AI 用时比 1.00 → 2.23）
- [x] SubTask 15.2: `src/game/race.js` 改为按本关三星要求均速 `den3` 标定：普通比赛基准 `0.68×den3` + 有界追赶修正 `[0.80, 1.25]`（上限 0.85×den3 < 三星节奏，结构性保证"跑到三星水平必赢"）
- [x] SubTask 15.3: 排位赛改为 `rankedAIScale(rating, advanced)×den3`（普通 0.70→0.90、高级 0.95→1.25），解除与 `MAXV` 的耦合，保留"高级显著强于普通"的段位阶梯
- [x] SubTask 15.4: 导出纯函数 `raceBaseSpeed()` / `catchupFactor()` 与常量 `RACE_PACE` / `CATCHUP_MIN` / `CATCHUP_MAX` 供断言
- [x] SubTask 15.5: 更新排位赛面板文案（倍率语义由"×玩家极速"改为"×三星节奏"）
- [x] SubTask 15.6: `tools/autotest.mjs` 改写"比赛公平性"断言：基准配速慢于三星节奏、追赶有界且上限 <1、逐关实机跑参考骑手获胜 ≥85%、最差用时比 <1.5
- [x] SubTask 15.7: 修复测试桩 `localStorage` 缺 `length` / `key()` 导致存档用例"空跑通过"的问题，并修正"通关星级"断言未排除最终任务槽位
- [x] SubTask 15.8: 同步 `README.md` 的每局时长/比赛与排位赛说明与测试断言数

# Task Dependencies
- Task 2 依赖 Task 1（场景定稿后关卡才能绑定场景）
- Task 3、Task 4、Task 5、Task 6、Task 7 依赖 Task 2（关卡数据结构定稿）
- Task 8 依赖 Task 1、Task 2（需要场景与最终任务定义）
- Task 5 与 Task 6 相互独立，可并行；Task 4 与 Task 7 相互独立，可并行
- Task 10 依赖 Task 9（导出/导入要覆盖全部 `bike_` 键，含新增的 `bike_prog` / `bike_rating` / `bike_stat`）
- Task 11 依赖 Task 9（进度字段与解锁规则）
- Task 12 依赖 Task 9、Task 11（`peak` 由 rating 推导）
- Task 13 依赖 Task 9、Task 10、Task 11、Task 12（入口状态来自进度；存档面板调用 Task 10 的接口）
- Task 14 依赖 Task 1~13 全部完成
- Task 15 依赖 Task 1~14 全部完成（AI 配速按最终关卡标定）