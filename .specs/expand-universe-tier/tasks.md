# Tasks

> 实施顺序原则：**先修地基，再往上盖**。
> Task 1（存档）与 Task 2（性能分桶）必须最先做 —— 后面的百万像素级关卡与
> 万亿级金币全都建立在这两块之上，先做上层只会返工。

- [x] Task 1: 存档容量与序列化（地基，最高优先级）
  - [x] Task 1.1: 新增十进制序列化工具函数（BigInt 展开 + 解析）
    - [x] Task 1.1.1: 在 `core/utils.js` 新增 `toPlainDecimal(v)` 与 `fromPlainDecimal(s)`
    - [x] Task 1.1.2: 为两个函数写边界用例（0 / 1e20 / 2.43e22 / 非有限值 / 非数字字符串）
  - [x] Task 1.2: 改 `safeGold` 使用新序列化
    - [x] Task 1.2.1: 替换 `safeGold` 内部的 `String(v)` 与 `Number(v)`
    - [x] Task 1.2.2: 把 `GOLD_MAX` 从 1e15 改为 1e24
  - [x] Task 1.3: 改 `storage.js` 的金币读写路径
    - [x] Task 1.3.1: `save()` 的金币落盘改用 `toPlainDecimal`
    - [x] Task 1.3.2: `loadSave()` 的金币读回改用 `fromPlainDecimal`
    - [x] Task 1.3.3: 校验旧存档（十进制串）能被新解析器直接读取，无需迁移分支
  - [x] Task 1.4: 验证 R8.1~R8.4 全部通过

- [x] Task 2: 地形空间分桶索引（地基）
  - [x] Task 2.1: 定义分桶数据结构
    - [x] Task 2.1.1: 为关卡增加 `index` 字段，按固定桶宽（如 4096px）对 waves/steps/feats 分桶
    - [x] Task 2.1.2: 记录每桶的起止下标范围，避免二分查找时的空桶
  - [x] Task 2.2: 改造 `hillRaw` 的参数遍历
    - [x] Task 2.2.1: 由"遍历全部 steps"改为"只遍历 x 所在桶覆盖的 steps"
    - [x] Task 2.2.2: waves 同样按桶筛选（跨越桶边界的 wave 在多个桶中出现）
  - [x] Task 2.3: 保持数值等价
    - [x] Task 2.3.1: 对同一批关卡，改动前后 `levelHillY` 的输出逐位相同
    - [x] Task 2.3.2: 验证启动加载耗时仍 ≤ 1s（R9.2）

- [x] Task 3: 修复已知缺陷（低成本、高收益）
  - [x] Task 3.1: 修复 `finaleDone` 从未赋值
    - [x] Task 3.1.1: 在 `finishLevel()` 的 level 分支中，通关环大陆时置 `finaleDone = true`
    - [x] Task 3.1.2: 触发 `settleProgress()` 使 `invited` 同步解锁
  - [x] Task 3.2: 修复飞行形态倒车失效
    - [x] Task 3.2.1: 将 `revK` 的 `b.grounded > 0` 条件改为对飞行形态放行
    - [x] Task 3.2.2: 验证飞行形态下按倒挡键车辆确实后退
  - [x] Task 3.3: 修复环大陆编号显示
    - [x] Task 3.3.1: 在 `drawInfoCard` 与结算文案中对 `FINALE_INDEX` 特判，不显示"第 N 关"

- [x] Task 4: 物理手感修复（线性阻力）
  - [x] Task 4.1: 新增线性阻力系数常量
    - [x] Task 4.1.1: 在 `constants.js` 新增 `LINEAR_DRAG_K`，取值使驮马 40km/h 滑行减半耗时落在 3s 内
  - [x] Task 4.2: 在 `applyDrag` 中叠加线性项
    - [x] Task 4.2.1: 减速量增加 `LINEAR_DRAG_K × v`，与既有 v² 项相加
    - [x] Task 4.2.2: **不修改** `ROLL_RES_K`（它参与 `topSpeedOf` 的 loss 项，会压低全部车的极速）
  - [x] Task 4.3: 验证 R7.1 / R7.2
    - [x] Task 4.3.1: 抽测 6 台车，记录滑行减半耗时与总滑行距离
    - [x] Task 4.3.2: 对比改动前后 `topSpeedOf` 的全部 32 台车返回值，偏差须 < 0.1%

- [x] Task 5: 无限模式地形修复
  - [x] Task 5.1: 消除累积下沉（R4.1）
    - [x] Task 5.1.1: 移除 `freeHill` 中 `y += stepDrop * segIdx` 的无界累积
    - [x] Task 5.1.2: 改为有界的累积（基准线 + 饱和漂移），保证长期地形漂移可控
  - [x] Task 5.2: 消除边界瞬移（R4.2）
    - [x] Task 5.2.1: 让相位与波长不再随体格跳变（频率改为整局恒定，只让振幅过渡）
    - [x] Task 5.2.2: 断层起伏改用固定频率正弦表达，消除 `floor(d/gap)` 的整数跳变
    - [x] Task 5.2.3: 验证 400 个边界的高度差全部 ≤ 2px
  - [x] Task 5.3: 消除体格哈希的模周期（R4.3）
    - [x] Task 5.3.1: 替换 `h % 12`，改用对模 4 无周期性的混合（高位混合 + 二次打散）
    - [x] Task 5.3.2: 增加"最近 N 块不重复"的约束（NEP_BLOCKS=4）
    - [x] Task 5.3.3: 验证 200 块内用满 12 种体格，最小重复间隔 ≥ 4 块
  - [ ] Task 5.4: 验证高速不触发 `pitRewind`（R4.5）
    - [ ] Task 5.4.1: 待 Task 7 完成（无相车尚未存在），届时补测

- [x] Task 6: 车辆个性重塑（27 台）
  - [x] Task 6.1: 重塑重型簇的差异化
    - [x] Task 6.1.1: 磐石 → 纯抓地堡垒（grip 2.60 / torque 0.76）
    - [x] Task 6.1.2: 泰坦 → 质量锚点（mass 3.35，全表最重）
    - [x] Task 6.1.3: 冰魄 → 大悬挂漂浮（转速最低，shield 形态）
    - [x] Task 6.1.4: 玄铁 → 高扭矩低红线（torque 2.60 / rpm 1.24，最易后空翻）
    - [x] Task 6.1.5: 破阵 → 均衡但空中救不回（airRot 0.417）
    - [x] Task 6.1.6: 终末 → 质量之王（mass 3.60，全场最慢）
    - [x] Task 6.1.7: 天蚀 → 重而快（rpm 2.85，改归 surge 形态）
  - [x] Task 6.2: 重塑轻量簇的差异化
    - [x] Task 6.2.1: 银箭 → 高转零低扭（rpm 2.05 / torque 1.05）
    - [x] Task 6.2.2: 白毛风 → 冰雪专家（grip 0.62 / rpm 2.40）
    - [x] Task 6.2.3: 赤鹫 → 空中猛禽（inertia 0.66 → airRot 1.515）
    - [x] Task 6.2.4: 噬沙 → 续航怪（fuel 2.95，全表最大油箱）
    - [x] Task 6.2.5: 星轨 → 旋转王（airRot 1.0 → 2.941）
    - [x] Task 6.2.6: 磁暴 → 瞬时大扭（torque 2.50 / rpm 0.95）
    - [x] Task 6.2.7: 光子 → 最轻最快（mass 0.38 / rpm 2.90）
  - [x] Task 6.3: 拆分逐日与猎户
    - [x] Task 6.3.1: 逐日 → 长程冲刺（torque 2.20 / rpm 1.85）
    - [x] Task 6.3.2: 猎户 → 最高红线（rpm 3.35，全表第一）
  - [x] Task 6.4: 为驮马补最终形态（R5.2）
    - [x] Task 6.4.1: 选定 `phase`（相位）语义，命名「老驮马」，解锁价 ¥6000
    - [x] Task 6.4.2: 验证 27 辆车全部有 ultra 定义
  - [x] Task 6.5: 校验全表约束
    - [x] Task 6.5.1: `mass` 两两不同、`inertia` 两两不同
    - [x] Task 6.5.2: `|airRot × inertia − 1| ≤ 0.05`（实测最大 0.0010）
    - [x] Task 6.5.3: 两两欧氏距离最小值 ≥ 0.15（实测 0.170，改造前 0.047）
    - [x] Task 6.5.4: mode 分布均匀（实测 5/4/4/4/4/4，极差 1）
    - ★ 两处门槛在实现中修正并已写回 spec：归一化口径由 max 改为 min-max
      （归墟 grip=6.0 会主导 max 归一，把其余 26 台压到 [0.09,0.5]）；
      mode 上限由 4 改为 5（27 辆 / 6 种通用 mode，"≤4" 算术上不可能）

- [ ] Task 7: 宇宙级车辆（6 台）
  - [x] Task 7.1: per-vehicle 升级上限
    - [x] Task 7.1.1: `vehicles.js` 宇宙车增加 `maxLv: 500`；`constants.js` 新增 `maxLvOf(veh)`
    - [x] Task 7.1.2: `storage.js` 的 `clampLv(v, maxLv)` / `shop.js` / `panels.js` 全部改读 `maxLvOf`
    - [x] Task 7.1.3: 确认全库再无直接引用全局 `MAX_LV` 判定"满级"的地方
  - [x] Task 7.2: 新增 5 台宇宙车
    - [x] Task 7.2.1: 星殒（5000 km/h，¥2.4e10）
    - [x] Task 7.2.2: 坍缩（10000 km/h，¥7.2e11）
    - [x] Task 7.2.3: 虚掷（25000 km/h，¥2.16e13）
    - [x] Task 7.2.4: 终末（50000 km/h，¥5.184e15）
    - [x] Task 7.2.5: 无相（100000 km/h，¥1.5552e17）
    - [x] Task 7.2.6: 校验 R2.1 的价格与 costK 表格逐项一致（升满 = 车价×40、形态 = 车价×12.5，三条曲线同时单调）
  - [x] Task 7.3: 形态极速随等级解算（R2.2）
    - [x] Task 7.3.1: 新增 `ultraCruiseOf(veh, up, nominal)`，按解算比归一化插值
    - [x] Task 7.3.2: `applyUpgrades` 改用该函数设置 `topSpeed`，风阻按 (标称/cruise)² 缩放
    - [x] Task 7.3.3: 6 台车 Lv0/Lv100/Lv250/Lv400/Lv500 全档位曲线实测 + 实机 20 秒极速验证
    - [x] Task 7.3.4: **修 `flightStep` 推力上限**（原先只取 μ·m·g，10 万 km/h 差 36 倍；改取速度相关值又形成
          两周期极限环实测 73,275 km/h）→ 最终用 `OMEGA_ACC_FRAC = 0.25`（上限 = 目标速度 × 0.25）
  - [x] Task 7.4: 未开形态保留地面物理（R2.3）
    - [x] Task 7.4.1: 移除 6 台宇宙车的 `veh.hover`（它让裸车也常驻悬停 → 零摔车，R2.3 整个落空）
    - [x] Task 7.4.2: 归墟 grip 6.0 → 3.4（原来的 6.0 是为"悬停后抓地只定推力"服务的）
    - [x] Task 7.4.3: 6 台车 Lv0 未开形态 40 秒内全部触发摔车判据
  - [x] Task 7.5: 提高数值上限
    - [x] Task 7.5.1: `NUM_CAP_V` → 3e8
    - [x] Task 7.5.2: `TOP_SPEED_CAP` → 4e7
    - [x] Task 7.5.3: 6 台车全速实测 `capHitCount() === 0`
  - [x] Task 7.6: Task 5.4 延后项（无相在无限模式不回卷）
    - [x] 无相 Lv500 形态在无限模式跑 90 秒 = 2442 万公里，回卷次数 0

- [ ] Task 8: 终局关「环大陆」重构
  - [ ] Task 8.1: 长度与分段
    - [ ] Task 8.1.1: `FINALE.len` 改为 16,666,666
    - [ ] Task 8.1.2: `segments` 由 6 段改为 36 段，逐一对应 `THEMES[i]`
    - [ ] Task 8.1.3: 每段分配对应的 `TERRAIN_MOODS`
  - [ ] Task 8.2: 360 个计时门
    - [ ] Task 8.2.1: `gateN` 由 6 改为 360
    - [ ] Task 8.2.2: `buildGates` 改为"每段内均匀 10 门"
    - [ ] Task 8.2.3: 门限时按新长度重算，保证每段内可通过
  - [ ] Task 8.3: 标定适配超长关卡
    - [ ] Task 8.3.1: `fitSlope` 对 167km 关卡改为分段标定（或加大采样步长），避免 2.5s 生成耗时
    - [ ] Task 8.3.2: 验证生成耗时 ≤ 1s
  - [ ] Task 8.4: 断点续玩（R1.3）
    - [ ] Task 8.4.1: 新增 `store.progress.finaleSeg`（已通过的段数）
    - [ ] Task 8.4.2: 每通过一段的最后一个门时落盘
    - [ ] Task 8.4.3: 重新进入时从段首继续，并跳过已通过的门
  - [ ] Task 8.5: 验证 R1.1
    - [ ] Task 8.5.1: 用满级归墟实测通关耗时落在 600±30s

- [ ] Task 9: 普通关卡与赛事长度
  - [ ] Task 9.1: 普通关卡长度重定
    - [ ] Task 9.1.1: `makeLevel` 的 `len` 公式改为 5,610 → 78,000
    - [ ] Task 9.1.2: 保持 `den3` 的比例关系，使三星时限为 15s → 300s
    - [ ] Task 9.1.3: 验证第 1 关与第 432 关的三星时限
  - [ ] Task 9.2: 赛事 ≥6min（R6.1）
    - [ ] Task 9.2.1: 赛事的赛道长度改为 360,000px
    - [ ] Task 9.2.2: 验证驮马完赛时间 ≥ 360s
  - [ ] Task 9.3: 资源生成适配长关卡
    - [ ] Task 9.3.1: 金币 / 油罐 / 危险段的密度按新长度重新推导
    - [ ] Task 9.3.2: 验证燃料仍足以通关

- [ ] Task 10: 宇宙场
  - [ ] Task 10.1: 模式与分级定义
    - [ ] Task 10.1.1: 在 `constants.js` 定义 5 个分级的长度与 AI 基准
    - [ ] Task 10.1.2: 新增 `space` 模式标识
  - [ ] Task 10.2: 太空背景与星球（R3.1）
    - [ ] Task 10.2.1: 在 `themes.js` 新增太空主题
    - [ ] Task 10.2.2: 新增星球绘制（带视差）
  - [ ] Task 10.3: AI 自适应配速（R3.3 / R3.4）
    - [ ] Task 10.3.1: 新增 `spaceAIScale(playerVeh, up, tier)`，基于玩家实际极速计算
    - [ ] Task 10.3.2: 移除宇宙场对全局 `REF_SPEED` 的依赖
    - [ ] Task 10.3.3: 上限钳制在 50000 km/h
    - [ ] Task 10.3.4: 验证 Lv0 与 Lv100 玩家的 AI 配速差异显著
    - [ ] Task 10.3.5: 验证无相在任何分级均为第 1 名
  - [ ] Task 10.4: 金币任务换车（R3.5）
    - [ ] Task 10.4.1: 无宇宙车进入宇宙场时弹出任务说明
    - [ ] Task 10.4.2: 定义任务内容与完成条件
    - [ ] Task 10.4.3: 完成后发放归墟
  - [ ] Task 10.5: 收益曲线（R3.6）
    - [ ] Task 10.5.1: 定义各分级的金币收益
    - [ ] Task 10.5.2: 验证高分级收益显著高于低分级

- [ ] Task 11: 无限模式宇宙分支（R4.4）
  - [ ] Task 11.1: 宇宙图选择入口
    - [ ] Task 11.1.1: 无限模式面板增加"宇宙图"选项
  - [ ] Task 11.2: 宇宙地形与渲染
    - [ ] Task 11.2.1: 新增宇宙专属体格表
    - [ ] Task 11.2.2: 宇宙图采用太空背景渲染

- [ ] Task 12: 高速表现层（R10）
  - [ ] Task 12.1: 巡航层切换
    - [ ] Task 12.1.1: 车速超过 100,000 px/s 时启用巡航层
    - [ ] Task 12.1.2: 地形降采样为色带绘制
    - [ ] Task 12.1.3: 强化速度线效果
  - [ ] Task 12.2: 相机适配（R10.2）
    - [ ] Task 12.2.1: 巡航层下调整 `camZoomOf` 的缩放下限策略
    - [ ] Task 12.2.2: 验证 100000 km/h 时车辆仍在屏幕可见范围内
  - [ ] Task 12.3: 验证无相可跑完全部关卡与终局关，无 NaN、无穿透尖峰

- [ ] Task 13: UI 精修（R11）
  - [ ] Task 13.1: 车库适配 32 辆
    - [ ] Task 13.1.1: 分组与筛选支持宇宙级分组
    - [ ] Task 13.1.2: 金币与价格显示改为缩写格式（R11.3）
  - [ ] Task 13.2: 升级车间适配 500 级
    - [ ] Task 13.2.1: 等级显示为 `LvN/500`
    - [ ] Task 13.2.2: 进度条按 500 为满格
  - [ ] Task 13.3: 宇宙场面板
    - [ ] Task 13.3.1: 5 个分级的选择界面
    - [ ] Task 13.3.2: 金币任务弹窗
  - [ ] Task 13.4: 终局关界面
    - [ ] Task 13.4.1: 显示 36 地形进度与断点信息
    - [ ] Task 13.4.2: 修正关卡编号（R11.2）
  - [ ] Task 13.5: 整体视觉一致性复查
    - [ ] Task 13.5.1: 逐页核对文案与实际行为一致
    - [ ] Task 13.5.2: 移动端与桌面端布局核对

- [ ] Task 14: 全量回归与打包
  - [ ] Task 14.1: 物理回归
    - [ ] Task 14.1.1: 32 台车 × 全部形态 × 5 种地形，验证无数值兜底触发
    - [ ] Task 14.1.2: 验证穿透量均在容差内
  - [ ] Task 14.2: 存档回归
    - [ ] Task 14.2.1: 旧存档加载验证（R8.3）
    - [ ] Task 14.2.2: 万亿级余额的写入-读回往返验证
  - [ ] Task 14.3: 性能回归
    - [ ] Task 14.3.1: 启动加载耗时 ≤ 1s
    - [ ] Task 14.3.2: 终局关内 60fps
  - [ ] Task 14.4: 重新打包 `dist/game.bundle.js`
    - [ ] Task 14.4.1: 运行 `build.bat`（或 `bun build`）
    - [ ] Task 14.4.2: 确认 bundle 与源码同步提交

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 5] depends on [Task 2]
- [Task 7] depends on [Task 1]
- [Task 7.3] depends on [Task 7.1]
- [Task 8] depends on [Task 2]
- [Task 8.3] depends on [Task 2]
- [Task 9] depends on [Task 2]
- [Task 10] depends on [Task 7]
- [Task 10.3] depends on [Task 7.3]
- [Task 11] depends on [Task 5]
- [Task 11] depends on [Task 10.2]
- [Task 12] depends on [Task 7]
- [Task 13] depends on [Task 8]
- [Task 13] depends on [Task 10]
- [Task 14] depends on [Task 4]
- [Task 14] depends on [Task 6]
- [Task 14] depends on [Task 12]
- [Task 14] depends on [Task 13]