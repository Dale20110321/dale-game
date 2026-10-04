# Tasks

> 任务按 spec.md 的阶段 A→E 顺序排列。**必须严格串行执行，按编号从低到高**，不得并行或交叉切换。
> 每完成一项立即在下方勾选 `[x]`。
> 审查阶段（第 5~10 轮）发现的新问题，在本文件**末尾**按 `Task N.M` 递增追加，不重排已有编号。

---

## 阶段 A — 级联缺陷修复（最先做，后续多项依赖它）

- [ ] Task 1: 修复地形生成的分桶索引缺陷（SYS-1）
  - [ ] Task 1.1: 定位 `levels.js` `buildIndex` 中 `stepB` 的分桶切片逻辑，确认它按 `[cx, cx+STEP_W]` 只保留局部断层
  - [ ] Task 1.2: 改为保留所有 `cx < bx1` 的断层元素（起点固定 0），使索引语义与 `hillRaw` 的累积数学一致
  - [ ] Task 1.3: 写脚本沿关卡 x 轴以 1px 步长扫描地形高度，确认垂直跳变消失
  - [ ] Task 1.4: 写脚本统计各关卡的断层跳变次数与总量，确认第 431 关从 38 处降到 0 处

- [ ] Task 2: 修复难度标定失真（SYS-2）
  - [ ] Task 2.1: 在 Task 1 完成后重跑 `levels.js` `fitSlope` 的反解缩放，确认 `k` 不再被压到 0.02 以下
  - [ ] Task 2.2: 修正 `levels.js:906` 的 `L.maxSlope = targetDeg` 直接回填，改为实测 `measureMaxSlope` 后写回
  - [ ] Task 2.3: 写脚本统计 432 关的实测最大坡度，确认呈单调递增且覆盖预期区间
  - [ ] Task 2.4: 按新坡度重标 `starTime`、`gateK`、`hazardSpeed` 的相关系数

- [ ] Task 3: 修复极速求解器精度（SYS-3）
  - [ ] Task 3.1: 修正 `constants.js` `topSpeedOf` 的二分迭代次数为 `Math.ceil(Math.log2(TOP_SPEED_CAP)) + 8`
  - [ ] Task 3.2: 加数值健全性断言：返回值 > 0 且 < 上限的一半，不满足时抛错而非静默返回 0
  - [ ] Task 3.3: 写脚本枚举 `VEHICLES` 全部车辆在零级与满级下的极速，确认全部 > 0 且误差 < 5%
  - [ ] Task 3.4: **BREAKING** 重跑 `vehicles.js` 的档位标定，使 27 辆车与 6 档位的关系在真实极速下仍成立
  - [ ] Task 3.5: 重新标定 `constants.js:284` 的 `REAR_LOAD`（实测真实求解器中后轮承担 83.5% 重量，当前用 0.62）

- [ ] Task 4: 修复 `loss()` 的量纲错误
  - [ ] Task 4.1: 在 `constants.js:298` 把 drag 的两个加速度项乘 `mTot` 归一到力的量纲
  - [ ] Task 4.2: 写脚本验证轻车（mTot≈3）与重车（mTot≈9666）的极速计算偏差方向一致

- [ ] Task 5: 修复空中转体的 `airRot` 二次方放大
  - [ ] Task 5.1: 修正 `bike.js:1261-1262` 的 `wMax` 公式，去掉重复的 `* veh.airRot`
  - [ ] Task 5.2: 给 `wMax` 加绝对上限，避免慢车在滞空时间内根本转不完 180°
  - [ ] Task 5.3: 写脚本统计 27 台车的 180° 转体耗时，确认比值从 84 倍降到 10 倍以内

- [ ] Task 6: 修复赛制选择被丢弃
  - [ ] Task 6.1: 修正 `game.js:224` 的 `raceInit(store.raceFormat)` 为 `raceInit(store.raceFormatPick)`
  - [ ] Task 6.2: 修正 `race.js:126`，仅在 format 来自面板时才回写 `store.raceFormatPick`
  - [ ] Task 6.3: 修正 `constants.js:1056` 的团赛队伍划分，使 riders 与 teamSize 自洽
  - [ ] Task 6.4: 修正 `constants.js:1078` 的队名次判定，改为按两队累计里程比较
  - [ ] Task 6.5: 决定「接力」是否实现换人；若不实现，修改 `desc` 文案避免承诺

- [ ] Task 7: 修复 `store.lastMode` 从未被赋值
  - [ ] Task 7.1: 在 `game.js` `startGame` 落定 `store.mode` 后写回 `store.lastMode = mode`
  - [ ] Task 7.2: 在 `beginRun` 的非 race/space 分支清空 `store.racers` 与 `store.raceAI`

- [ ] Task 8: 修复 `shopOpen` 不复位导致的永久冻结
  - [ ] Task 8.1: 在 `game.js` `startGame` 开头调用 `closeShop()`，复位 `store.shopOpen`
  - [ ] Task 8.2: 修正 `closeShop` 的 `state === "ended"` 分支，不得丢弃结算卡
  - [ ] Task 8.3: 为 `KeyU` 加状态门禁，骑行中开车间时先自动暂停

- [ ] Task 9: 修复 `freeInit` 不清流式分块导致的跨模式污染
  - [ ] Task 9.1: 在 `game.js:257` 的 `freeInit` 中清 `world.chunks`、`world.takenX`、`world.chunksDirty`
  - [ ] Task 9.2: 在 `world.js` 导出 `resetStreaming()`，把模块级 `currentL`、`lastLo`、`lastHi`、`lastCamX` 归零
  - [ ] Task 9.3: 验证：跑完宇宙联赛后开无限模式，确认金币不再被空间赛道的金币顶掉

- [ ] Task 10: 修复起跑闸门无提示与重生冻结
  - [ ] Task 10.1: 在 `hud.js` 新增 `drawStartGate()`，闸门生效时显示「◀ A / D ▶ 起步」
  - [ ] Task 10.2: 给 `resetBike` 增加参数，区分「开局等首键」与「重生」
  - [ ] Task 10.3: 在 `respawn()` 与 `pitRewind()` 中不重新上锁
  - [ ] Task 10.4: 闸门接受 `key.rev`，使任意方向键都能解除

---

## 阶段 B — 输入与状态机

- [ ] Task 11: 重构输入按键为按来源计数
  - [ ] Task 11.1: 把 `key` 改为 `{left:{kb,touch}, right:{...}, rev:{...}}` 双来源结构
  - [ ] Task 11.2: 实现读取时的并集逻辑，任一来源仍按下即保持生效
  - [ ] Task 11.3: 为同键多指维护 `activeIds` 集合，仅当全部抬起才释放
  - [ ] Task 11.4: 改用 Pointer Events + `setPointerCapture`，并补 `pointercancel` 兜底
  - [ ] Task 11.5: 实现 `releaseAllKeys()`，在 `blur`、`visibilitychange`、`showMenu`、`showResultCard`、`togglePause`、`syncTouchVisibility`（由 true→false 时）统一调用

- [ ] Task 12: 补齐快捷键守卫
  - [ ] Task 12.1: 在 `KeyR`/`KeyU`/`KeyM` 分支前加 `if (e.ctrlKey || e.metaKey || e.altKey) return;`
  - [ ] Task 12.2: 在三个分支开头加 `if (e.repeat) return;`
  - [ ] Task 12.3: 在 `bind()` 首行加 `if (e.isComposing) return;`
  - [ ] Task 12.4: 为 WASD 分支补 `e.code === "KeyD"/"KeyA"/"KeyS"` 兜底
  - [ ] Task 12.5: 统一拦截四个方向键与 `Space` 的 `preventDefault`

- [ ] Task 13: 修复模态面板的 Esc 归属
  - [ ] Task 13.1: 在 `shop.js` 的 `initShop` 中补 window 级 Esc → `closeShop()`
  - [ ] Task 13.2: 在 `donate.js` 中补 window 级 Esc → `closeDonate()`
  - [ ] Task 13.3: 修正 `settings.js` 的 Esc 处理器，在 `store.donateOpen` 时不关闭设置
  - [ ] Task 13.4: 把 `modalOpen()` 与 Esc 分派收敛为单一来源，消除双轨维护

- [ ] Task 14: 修复 HUD 元素残留
  - [ ] Task 14.1: `drawQuitButton` 改为无条件写 `display`，`r` 为空时写 `none`
  - [ ] Task 14.2: `showResultCard` 末尾调用 `syncTouchVisibility()`
  - [ ] Task 14.3: `showResultCard` 开头隐藏 `homeFloat`
  - [ ] Task 14.4: `postfx.js` 的 `applyPostFx` 门禁从 `state !== "play"` 改为 `state === "menu"`
  - [ ] Task 14.5: 巡航分支移除重复的 `drawSpeedLines()` 调用，统一由 `drawHud` 负责

- [ ] Task 15: 修复复活回退的派生状态残留
  - [ ] Task 15.1: 在 `respawn()` 中清 `run.airTime`、`run.landed`、`run.combo`、`run.comboStamp`
  - [ ] Task 15.2: 在 `pitRewind()` 中做同样清理
  - [ ] Task 15.3: 在 `beginRun()` 中显式设 `store.cam.zoom = CAM_ZOOM_BASE`
  - [ ] Task 15.4: 在 `crash()` 中一并清 `bike.rotAcc`

- [ ] Task 16: 补齐移动端功能入口
  - [ ] Task 16.1: 在 `index.html` 的 `#touch` 容器内加 ⏸ 暂停按钮，接 `togglePause`
  - [ ] Task 16.2: 在 `pauseBar` 中加「🔧 升级车间」与「🔇 静音」按钮
  - [ ] Task 16.3: 结算卡加「🔄 重玩本关」按钮
  - [ ] Task 16.4: `gateFail` 改走 `presentResult` 而非直接 `toMenu`
  - [ ] Task 16.5: 返回主页按钮改为二次确认（3 秒内再点生效）
  - [ ] Task 16.6: 暂停时隐藏 `.modeTabs` 与 `.menuFoot`，或为各入口统一加状态门禁

- [ ] Task 17: 修复音频
  - [ ] Task 17.1: 在 master 链上加 GainNode，所有音走 master，`toggleMute` 改为淡到 0
  - [ ] Task 17.2: 在 `playTone` 入口检查 `audioCtx.state`，非 running 时 resume 并丢弃本次
  - [ ] Task 17.3: 为每个 oscillator 加 `onended` 清理，disconnect node
  - [ ] Task 17.4: 多音高改用 `o.start(t0 + delay)`，delay 走 `audioCtx.currentTime`
  - [ ] Task 17.5: 在 `initInput` 加一次性 `touchend`/`pointerdown` 解锁器调用 `initAudio()`
  - [ ] Task 17.6: 在 `visibilitychange` 的 else 分支调用 `initAudio()`
  - [ ] Task 17.7: 在设置中加主音量滑块，`store.volume` 持久化
  - [ ] Task 17.8: `audioCtx` 为 `closed` 时重建，`audioInit` 失败时加退避
  - [ ] Task 17.9: 限时门通过、通关结算、名次变化补音效
  - [ ] Task 17.10: `world.js` 的金币音效加 60ms 同帧节流

- [ ] Task 18: 修复全屏
  - [ ] Task 18.1: 补 `fullscreenchange` 与 `webkitfullscreenchange` 监听，重算 `resize()` 并更新按钮图标与 `aria-label`
  - [ ] Task 18.2: 为 `requestFullscreen`/`exitFullscreen` 的 Promise 加 `.catch`
  - [ ] Task 18.3: 两个 API 都不存在时提示「可尝试分享 → 添加到主屏幕」
  - [ ] Task 18.4: 全屏偏好持久化（受浏览器策略限制，只做引导不做自动恢复）

---

## 阶段 C — 渲染层

- [ ] Task 19: 实现 8 种形态的视觉表现
  - [ ] Task 19.1: 在 `drawBike` 中读 `activeMode()`
  - [ ] Task 19.2: 为 shield 画护盾泡、为 stable 画磁吸地效、为 omega/absolut 画能量环
  - [ ] Task 19.3: 为 surge/phase/railgun/warp 各设计可辨识的视觉元素
  - [ ] Task 19.4: 加 `store.ultraBlend` 0→1 缓动，形态切换走 0.3 秒过渡
  - [ ] Task 19.5: HUD 加形态状态常驻条，显示无敌/无限油/免疫与剩余时间

- [ ] Task 20: 修复巡航色带的采样缩放方向
  - [ ] Task 20.1: 修正 `terrain.js:312` 的 `cx + x0*z` 为 `cx + x0/z`
  - [ ] Task 20.2: 修正 `bandW*z*f` 为 `bandW/z*f`
  - [ ] Task 20.3: 验证：zoom 0.32 时采样覆盖完整可见世界且中心与车辆对齐
  - [ ] Task 20.4: 色带改为填满到下一带 gy，使其连通

- [ ] Task 21: 修复拖尾归一化
  - [ ] Task 21.1: 修正 `trail.js:74-81` 的 `intensity()` 分母，取 cruise 门槛与 topSpeed 的 min
  - [ ] Task 21.2: 巡航分支接入拖尾绘制（把 early return 移到 drawTrail 之后）
  - [ ] Task 21.3: 修正 `velOf()`，排除 `head` 点，只用 rear/front
  - [ ] Task 21.4: 为 `TRAIL_ON` 阈值加软过渡带
  - [ ] Task 21.5: 摔车时给拖尾 150ms 淡出而非硬 return
  - [ ] Task 21.6: 验证：cv1~cv12 每台车的签名拖尾都能完整出现一次

- [ ] Task 22: 修复粒子与背景的视口口径
  - [ ] Task 22.1: `particles.js` 剔除改用 `worldView()` 的 `visW()`，而非 `view.W`
  - [ ] Task 22.2: `emitParticles` 前置校验 x/y 的有限性
  - [ ] Task 22.3: `particles.js` 的 `||` 取默认改为 `??`
  - [ ] Task 22.4: `drawParticles` 按 `getQuality()` 降档
  - [ ] Task 22.5: 背景各层与 `light.js` 的 `parallax` 按 `cam.zoom` 或速度钳制到 0，消除高速频闪
  - [ ] Task 22.6: 雾带渐变填充到 `H`，消除 0.72H 的硬横缝

- [ ] Task 23: 修复地形渲染缺陷
  - [ ] Task 23.1: 修正 `terrain.js:453` 的受光符号（去掉负号）
  - [ ] Task 23.2: 在 `terrain.js:425` 补 `ctx.lineTo(W, H)`，消除对角接缝
  - [ ] Task 23.3: 主体填充下方加 `pal[2]` 土壤层渐变，让死字段 `ground` 重新有意义
  - [ ] Task 23.4: 表层线描边中心改为 `gy - 4`，贴住地面
  - [ ] Task 23.5: SURFACE_PAINTERS 改为从 `gBuf` 插值取值，消除重复采样
  - [ ] Task 23.6: strata 的 `groundY` 采样提到 dy 循环外

- [ ] Task 24: 修复巡航层设计
  - [ ] Task 24.1: 加入带迟滞的进出过渡（zoom<0.05 进、>0.062 退）
  - [ ] Task 24.2: 在巡航层补画危险带、终点旗、计时门的屏幕空间标记
  - [ ] Task 24.3: 修正 `cruise.js:101-111` 的对手 x 换算，补上 0.38 偏移
  - [ ] Task 24.4: 修正 `cruise.js:47-48`，车光点的 y 跟随地形采样
  - [ ] Task 24.5: 把 `spdN` 改为 log 归一，让 6 个数量级的速度差可见
  - [ ] Task 24.6: `drawCruiseGround` 的地平线跟随 `groundY` 的斜率
  - [ ] Task 24.7: 地面虚线滚动量改由 `cam.x` 驱动

- [ ] Task 25: 引入屏幕像素锁定的 LOD
  - [ ] Task 25.1: 以 `trail.js:560` 的 `sw(px)=px/z` 为样板，在 `entities.js` 中实现统一的屏幕像素锁定
  - [ ] Task 25.2: 世界层文字（限速牌、终点、门）改为屏幕空间绘制，最小 9px
  - [ ] Task 25.3: 地表纹理的采样步长乘 `1/zoom`，保持屏幕密度恒定
  - [ ] Task 25.4: 装饰物加 zoom 相关的 alpha/尺寸斜坡，`zoom<0.25` 时停画背景装饰
  - [ ] Task 25.5: 金币在低 zoom 时简化为带辉光的实心点，屏幕高度不小于 3px
  - [ ] Task 25.6: 把 `CAM_ZOOM_MIN` 改为随速，或去掉下限只保留「车身可辨」检查
  - [ ] Task 25.7: 色带切换判据与缩放判据统一，或给 dense 路径加 zoom 下限保护

- [ ] Task 26: 修复危险段与限速牌的可见性
  - [ ] Task 26.1: 危险带 alpha 从 0.16 提到 0.3，斜纹铺满整条 130px 带
  - [ ] Task 26.2: 危险带上缘加实心描边
  - [ ] Task 26.3: 限时门改为双柱门楣并在 badge 上直接写剩余秒数

---

## 阶段 D — UI 与样式

- [ ] Task 27: 修复安全区被媒体查询覆盖
  - [ ] Task 27.1: 修正 `main.css:904`，改为 `padding-bottom: max(var(--space-2), env(safe-area-inset-bottom, 0px))`
  - [ ] Task 27.2: 修正 `main.css:925` 的 `padding` 简写，保留左右安全区
  - [ ] Task 27.3: 把 `@supports` 兜底块移到文件末尾
  - [ ] Task 27.4: 为 `#settings` 与 `#donate` 补 safe-area padding
  - [ ] Task 27.5: 同步修正 `#settings` `.panelBar` 的负 margin 公式
  - [ ] Task 27.6: `#donate` 改 `justify-content: safe center` 并加 `.panelBar`

- [ ] Task 28: 修复滚动与手势
  - [ ] Task 28.1: 把 `touch-action: none` 从 `html, body` 移到 `canvas#cv` 与 `.tbtn`
  - [ ] Task 28.2: 给 `#overlay`、`#modePanel`、`#shop`、`#settings`、`#homeView` 显式加 `touch-action: pan-y`
  - [ ] Task 28.3: 真机确认浮层可滚动
  - [ ] Task 28.4: `html, body` 加 `user-select: none`、`-webkit-touch-callout: none`、`-webkit-tap-highlight-color: transparent`
  - [ ] Task 28.5: `input.js` 加全局 `contextmenu` 屏蔽（面板态放开）

- [ ] Task 29: 触控目标尺寸
  - [ ] Task 29.1: `.slotDel` 从 24×24 提到 44×44，并移出 `.slotCell` 避免嵌套交互元素
  - [ ] Task 29.2: `.mtab` 的 `min-height` 提到 44px，矮屏档用伪元素撑热区
  - [ ] Task 29.3: `.fbtn` 的 `min-height` 提到 44px
  - [ ] Task 29.4: `.rankLadder > summary`、`.heroCoffee`、`.hudQuit` 补 44px 命中区
  - [ ] Task 29.5: `pointer: coarse` 改为 `any-pointer: coarse`
  - [ ] Task 29.6: 写脚本枚举全部可点元素，核对实际命中尺寸

- [ ] Task 30: 补齐按压反馈
  - [ ] Task 30.1: 为 `.mtab`/`.fbtn`/`.lvCell`/`.fmtBtn` 补 `:active` 规则
  - [ ] Task 30.2: 全站 `:hover` 规则包进 `@media (hover: hover)`
  - [ ] Task 30.3: 为 `.tbtn` 增加 `is-down` class 与 `aria-pressed`，与 `:active` 共用样式
  - [ ] Task 30.4: `.tbtn` 补 `cursor: pointer`
  - [ ] Task 30.5: 修正锁定卡的 hover/active 泄漏，改用 `:not(.locked)`

- [ ] Task 31: 修复对比度与配色
  - [ ] Task 31.1: `.btn.ghost` 显式设 `color: var(--text-hi)`
  - [ ] Task 31.2: 禁用态从 `opacity: .45` 改为显式换色
  - [ ] Task 31.3: 处理或删除死令牌 `--muted`
  - [ ] Task 31.4: 速度表改用 `hud-scrim` 底板并补文字投影
  - [ ] Task 31.5: HUD 信息栏、警告条、竞速条、燃料条改用 `glassRect` 统一玻璃层级
  - [ ] Task 31.6: AI 进度条颜色从 `danger` 改为 `warn`
  - [ ] Task 31.7: 终点旗改用非红色系，避免与危险段混淆
  - [ ] Task 31.8: 轮胎与头盔颜色按主题明度自适应，或统一加深色描边
  - [ ] Task 31.9: `DECO_COLORS` 支持主题覆盖
  - [ ] Task 31.10: 速度弧三档增加线型或位置冗余，不单靠色相
  - [ ] Task 31.11: 雪/盐 4 场景的 `pal[0]`/`pal[1]` 拉开对比
  - [ ] Task 31.12: `dust.light` 改为相对 `pal[0]` 提亮一档，让骑尘可见

- [ ] Task 32: 修复 HUD 布局
  - [ ] Task 32.1: 在 `main.css` 定义 `--touch-key-zone`，`hud.js` 通过 `getComputedStyle` 读取，替换硬编码的 90
  - [ ] Task 32.2: `hudLayout` 的顶部与底部 padding 纳入安全区
  - [ ] Task 32.3: 速度表字号随 `gr` 变化，`abbrevNum` 阈值从 `1e4` 降到 `1e3`
  - [ ] Task 32.4: 比赛/接力徽标链加上视口内夹取
  - [ ] Task 32.5: `compact` 判定抽为单一函数
  - [ ] Task 32.6: 机制警告条宽度按 `measureText` 反算，并避开右上浮按钮
  - [ ] Task 32.7: `#comboTag` 加 `max-width`，小屏降字号
  - [ ] Task 32.8: toast 时长按字数计算，长文案允许换行
  - [ ] Task 32.9: HUD 增加本局用时行与输入设备指示
  - [ ] Task 32.10: `drive` 提示带与 `quit` 按钮错开；提示带开局 8 秒后淡出

- [ ] Task 33: 修复键盘可达性
  - [ ] Task 33.1: `showPanel`、`showResultCard` 时把焦点移入面板
  - [ ] Task 33.2: 关闭面板时把焦点归还触发按钮
  - [ ] Task 33.3: `renderHomeView` 重绘前后保存与恢复焦点
  - [ ] Task 33.4: 三个浮层加 `role="dialog"`、`aria-modal="true"`，打开时给背景加 `inert`
  - [ ] Task 33.5: 方向键在焦点位于滚动面板内时不接管
  - [ ] Task 33.6: 关卡地图支持方向键漫游
  - [ ] Task 33.7: `onPanelKeydown` 先判断 `e.target` 是否为真按钮，避免 `closest` 命中父级 `role="button"`
  - [ ] Task 33.8: `onPanelKeydown` 加 `if (e.repeat) return`
  - [ ] Task 33.9: 锁定元素统一键盘与鼠标的反馈路径

- [ ] Task 34: 桌面端布局
  - [ ] Task 34.1: 新增 `@media (min-width: 1800px)` 与 `(min-width: 2400px)` 断点
  - [ ] Task 34.2: `#modePanel` 纳入 1180px 断点的 940px 放宽
  - [ ] Task 34.3: `.modeTabs` 与 `.menuFoot` 改为定宽 + 居中，不再 `flex: 1` 拉伸
  - [ ] Task 34.4: 为 `--space-*` 与 `--font-*` 增加大屏令牌覆盖
  - [ ] Task 34.5: `#shop`/`#settings`/`#donate` 加限宽内容容器
  - [ ] Task 34.6: 浮层统一为 `position: fixed`

- [ ] Task 35: 字体与令牌收敛
  - [ ] Task 35.1: 字体栈补中文字体（`PingFang SC`、`Noto Sans CJK SC`、`Microsoft YaHei`）
  - [ ] Task 35.2: `--font-display-weight` 从 800 降到 700，避免中文 fake bold
  - [ ] Task 35.3: 加 `-webkit-text-size-adjust: 100%`
  - [ ] Task 35.4: 13 个缺 VS16 的 emoji 统一补 U+FE0F，集中在 `ICONS` 常量表
  - [ ] Task 35.5: `--font-micro-size` 提到 11px；`.fbtn`/`.setGrp` 改用 caption
  - [ ] Task 35.6: 消除字号倒挂（横屏 h1 不小于 modeTitle）
  - [ ] Task 35.7: 清裸色值与魔法数（`main.css:290` 的 rgba、三处 `3px`、触摸键裸偏移）
  - [ ] Task 35.8: 删死令牌（`.glass-sheet` 整套、`--font-mono`、`--ease-exit`）
  - [ ] Task 35.9: 删除 `obj-canister` 与 `--obj-canister` 的重复定义（CSS 与 JS 同步）
  - [ ] Task 35.10: `ui-tokens.js` 补 `--cosmic`，使两侧键集合一致
  - [ ] Task 35.11: canvas 侧 6 处字面量字体改走 `fontOf()`
  - [ ] Task 35.12: `label()` 增加 `maxWidth` 与省略号机制
  - [ ] Task 35.13: 对手配色抽成单一来源

---

## 阶段 E — 内容与文档

- [ ] Task 36: 接线叙事信息
  - [ ] Task 36.1: 把 `L.mood` 的地形气质标签显示在关卡地图的关卡格上
  - [ ] Task 36.2: 增加「已发现 N/36 场景」聚合计数
  - [ ] Task 36.3: 通关全部 432 关后解锁无限模式的场景自由选图
  - [ ] Task 36.4: 新支线解锁时给 toast 与入场高亮
  - [ ] Task 36.5: `finaleTile` 显示将要穿越的场景名
  - [ ] Task 36.6: 缩略图体现主题差异，不再只是两色渐变
  - [ ] Task 36.7: 12 联赛使用不同太空场景；`slopeDeg` 随层级递增而非递减
  - [ ] Task 36.8: 消除三处撞图标（🌠）
  - [ ] Task 36.9: 补充与场景收集相关的成就

- [ ] Task 37: 修复可见文案与数据脱节
  - [ ] Task 37.1: `panels.js` 的「6 关」改为由 `LEVELS_PER_BRANCH` 派生
  - [ ] Task 37.2: 「第 3、5 关为特殊变体」改为由 `SPECIAL_SLOTS` 派生
  - [ ] Task 37.3: `panels.js:652` 的「12 支线 × 6 关」两处数字都改
  - [ ] Task 37.4: `panels.js:779` 的无限模式空态文案
  - [ ] Task 37.5: `panels.js:821` 的宇宙场锁定卡描述（5 个难度 → 12 联赛 × 3 分区 × 3 场）
  - [ ] Task 37.6: `panels.js:627` 的乱码字符「三��奏」修正为「三节奏」
  - [ ] Task 37.7: 「特殊模式」统一为「形态」
  - [ ] Task 37.8: 无限模式四种叫法统一
  - [ ] Task 37.9: 「限时门」与「计时门」统一
  - [ ] Task 37.10: `game.js` 三处金币裸数字改走 `goldNum`
  - [ ] Task 37.11: `hud.js` 的里程行与最佳行改走 `abbrevNum`
  - [ ] Task 37.12: 删除 `shop.js` 中永不执行的「除山地车外」分支
  - [ ] Task 37.13: 修正注释中引用已删除车辆「归墟」的描述
  - [ ] Task 37.14: `constants.js` 与 `levels.js` 注释中的陈旧数字

- [ ] Task 38: 修复 README
  - [ ] Task 38.1: 删除 `+/-` 缩放的描述与整段引用框
  - [ ] Task 38.2: 「五种玩法」改为「四种玩法」
  - [ ] Task 38.3: 极速跨度「38 亿倍」改为实测值
  - [ ] Task 38.4: 收入倍数「1600 万倍」重算
  - [ ] Task 38.5: 「一轮 432 关全通约 213 万」与升满成本的矛盾
  - [ ] Task 38.6: 补充宇宙联赛的两道前置门（终局关 + 排位赛胜利）
  - [ ] Task 38.7: 补充移动端的功能入口与快捷键说明
  - [ ] Task 38.8: `index.html` 的 meta description 补上宇宙场

- [ ] Task 39: 修复玩法流程缺口
  - [ ] Task 39.1: 终局关断点续玩在 `finaleSeg >= 36` 时不再把出生点设为 `finishX`
  - [ ] Task 39.2: 最后一关的边界判断由 `< LEVELS.length-1` 改为 `<=`
  - [ ] Task 39.3: 补 FINALE 的 `goldBase`
  - [ ] Task 39.4: 高级排位档的面板写入 `store.rankedAdvanced`
  - [ ] Task 39.5: 比赛判负走 `presentResult` 而非直接回菜单
  - [ ] Task 39.6: 结算卡加「再赛一场」
  - [ ] Task 39.7: 无限模式结算走 `presentResult`
  - [ ] Task 39.8: 宇宙联赛结算卡加「再打一场」与「下一分区」
  - [ ] Task 39.9: 比赛 HUD 不再显示无意义的关卡号

- [ ] Task 40: 修复经济与可达性
  - [ ] Task 40.1: 修正燃料死亡螺旋（补油量与油罐间距的关系）
  - [ ] Task 40.2: 低油预警阈值改为按到达下一罐的中位需求量
  - [ ] Task 40.3: 摔车扣油按余量而非油箱上限，并留不低于 10% 的地板
  - [ ] Task 40.4: 变体关 `prepFuel` 放大后的摔车惩罚按未放大基准计算
  - [ ] Task 40.5: 无限模式油罐密度按车速自适应
  - [ ] Task 40.6: 危险段限速在宇宙场按联赛配速推导
  - [ ] Task 40.7: 终局关危险段数量按 `den3` 缩放，使通关时间落在 starTime 预算内
  - [ ] Task 40.8: 重标 `antiWheelie` 的 `ANTI_ENGAGE` 阈值
  - [ ] Task 40.9: `brakePeak` 补质量项，使刹车/加速比车队一致
  - [ ] Task 40.10: 刹车扭矩按前后轮载荷分配
  - [ ] Task 40.11: 油门与刹车同按时刹车优先
  - [ ] Task 40.12: 起步段加入牵引力控制，限制空转
  - [ ] Task 40.13: 进度条上限与数值格式修 `fuelRatio() > 1` 的显示

- [ ] Task 41: 修复玩法反馈
  - [ ] Task 41.1: 过计时门补音效、粒子、震屏、绿闪
  - [ ] Task 41.2: `finishLevel` 加 FX（顿帧、礼花、相机轻推、星级逐颗点亮）
  - [ ] Task 41.3: 比赛补超车检测与反馈
  - [ ] Task 41.4: HUD 显示金币收集进度 `12/24`
  - [ ] Task 41.5: 个人最佳用时更新时播报
  - [ ] Task 41.6: 摔车加顿帧与恢复倒计时提示
  - [ ] Task 41.7: 落地音效与震屏按冲击力分档
  - [ ] Task 41.8: 终局关的门提示限频
  - [ ] Task 41.9: 连招加常驻标与衰减条，摔车时提示中断
  - [ ] Task 41.10: `showCombo` 改队列式上浮，入场有缩放 punch
  - [ ] Task 41.11: 加速带持续视觉反馈
  - [ ] Task 41.12: `world.airScore` 与 `airTargetOf` 接入结算或删除
  - [ ] Task 41.13: `onSlip` 钩子接入打滑反馈或删除
  - [ ] Task 41.14: `squashVel` 实现真正的二阶弹簧或删除

- [ ] Task 42: 修复判定窗口与扫掠
  - [ ] Task 42.1: 金币与油罐拾取改为线段扫掠
  - [ ] Task 42.2: 加速带判定窗口放宽到覆盖视觉椭圆，并按帧位移自适应
  - [ ] Task 42.3: 跳台触发窗口按 `bikeVx()*dt` 自适应
  - [ ] Task 42.4: 摔车判据在子步上分别采样，不只看帧末
  - [ ] Task 42.5: 穿透推出移入位置求解迭代，或按穿透深度成比例给位移
  - [ ] Task 42.6: `safeSpot` 排除危险段与计时门附近
  - [ ] Task 42.7: `groundInfo` 兜底改为返回 `null`，让判据可跳过
  - [ ] Task 42.8: `onLand` 加最小滞空节流，避免接地闪烁触发
  - [ ] Task 42.9: 陆地结算移到摔车判定之前

- [ ] Task 43: 修复模式白名单不一致
  - [ ] Task 43.1: 抽出危险段与计时门的模式白名单为单一常量
  - [ ] Task 43.2: `hud.js` 与 `game.js` 引用同一常量
  - [ ] Task 43.3: 决定比赛模式是否生成危险段：要么纳入判定，要么不生成

---

## 阶段 F — 性能与健壮性

- [ ] Task 44: 降低渲染开销
  - [ ] Task 44.1: `postfx.js` 弱设备默认降到 `low` 而非 `medium`
  - [ ] Task 44.2: `postfx.js` 增加 `navigator.deviceMemory` 判定
  - [ ] Task 44.3: `canvas.js` 增加绝对像素预算封顶
  - [ ] Task 44.4: 离屏画布按 CSS px 而非 k 倍分辨率建立
  - [ ] Task 44.5: `canvas.js` 的 `getContext` 加 `{alpha: false, desynchronized: true}`
  - [ ] Task 44.6: `main.js` 的 resize 加 rAF 防抖与「尺寸未变则跳过」早退
  - [ ] Task 44.7: 背景层的 5 个渐变按 `(theme, W, H)` 缓存
  - [ ] Task 44.8: 低画质档去掉 HUD 的 `shadowBlur`
  - [ ] Task 44.9: `RENDER_SCALES` 增加 0.5 档供自动降级使用
  - [ ] Task 44.10: 星空按 `(seed, W, H, layer)` 缓存到离屏 canvas

- [ ] Task 45: 修复逐帧分配
  - [ ] Task 45.1: `terrain.js:310` 把 `[0.15,0.5,0.85]` 字面量提到循环外
  - [ ] Task 45.2: `entities.js:654` 的危险段采样改用复用数组并按可见范围剔除
  - [ ] Task 45.3: `hud.js` 的 `hudLayout` 加尺寸缓存
  - [ ] Task 45.4: `drawQuitButton` 只在数值变化时写样式
  - [ ] Task 45.5: `camera.js` 与 `light.js` 的返回对象改为模块级单例
  - [ ] Task 45.6: `bike.js` 的 `mixHex` 改为按主题缓存
  - [ ] Task 45.7: `particles.js` 的删除改为 swap-with-last

- [ ] Task 46: 修复帧率相关缺陷
  - [ ] Task 46.1: `camera.js` 的 `shPhase` 改为按 dt 累加
  - [ ] Task 46.2: shake 衰减移出 `updateCamera`，避免暂停时冻结
  - [ ] Task 46.3: `loop.js` 补 `resetRafClock()`，在 `visibilitychange` 时调用
  - [ ] Task 46.4: `drawScene` 的 dt 改为 `Math.min(dt, 0.1)`
  - [ ] Task 46.5: `applyPostFx` 不再读 `store.time`，统一用传入的 dt
  - [ ] Task 46.6: `hud.js` 的 `drawSpeedLines` 重掷按 dt 节流
  - [ ] Task 46.7: `main.js` 增加 `visibilitychange` 时暂停游戏

- [ ] Task 47: 修复自适应画质
  - [ ] Task 47.1: `postfx.js` 的 `initPostFx` 读档后调用 `markManualRenderScale()`
  - [ ] Task 47.2: `autoTuneFrame` 的降级改为在 `RENDER_SCALES` 上取相邻档
  - [ ] Task 47.3: `autoTuneFrame` 的「升回去」分支修正，使其真正可触发
  - [ ] Task 47.4: `FRAME_BUDGET_MS` 按实测刷新率归一

- [ ] Task 48: 修复 canvas 与 CSS 的坐标一致性
  - [ ] Task 48.1: 统一 canvas 与 `#wrap` 的视口高度口径（`100dvh` vs `innerHeight`）
  - [ ] Task 48.2: 增加 `visualViewport` 与 `orientationchange` 监听
  - [ ] Task 48.3: `postfx.js` 的弱设备判定改用 `canvas.js` 的 `view.DPR`

- [ ] Task 49: 补外壳与健壮性
  - [ ] Task 49.1: 增加 favicon、`theme-color`、PWA manifest
  - [ ] Task 49.2: 增加 `<noscript>` 提示
  - [ ] Task 49.3: 增加全局 `error` 与 `unhandledrejection` 处理器
  - [ ] Task 49.4: 首屏增加加载态占位
  - [ ] Task 49.5: `storage.js` 增加 `storage` 事件监听，处理多标签页冲突
  - [ ] Task 49.6: `storage.js` 增加 `pagehide` 落盘
  - [ ] Task 49.7: 存档导出增加 `navigator.clipboard` 兜底
  - [ ] Task 49.8: 结算卡增加复制成绩入口
  - [ ] Task 49.9: 场景切换时的星空过渡实现
  - [ ] Task 49.10: 终局关的 `buildLevel` 分帧或缓存（当前实测单次 1217ms）

---

## 阶段 G — 新手引导（新增体验项）

- [ ] Task 50: 建立一次性标记位
  - [ ] Task 50.1: 在存档进度中加 `flags` 位图
  - [ ] Task 50.2: 首次进入 `play` 且 `touchActive` 时显示触摸引导层
  - [ ] Task 50.3: 引导层说明加速/刹车/倒车/空中转体，任意触摸即消失
  - [ ] Task 50.4: 首次限时门出现时说明规则
  - [ ] Task 50.5: 首次低油时给出预警文案
  - [ ] Task 50.6: 首次空翻时给出教学文案而非术语轰炸
  - [ ] Task 50.7: 首次摔车时给出恢复引导
  - [ ] Task 50.8: 首次进入菜单时说明玩法入口

---

## 审查阶段追加区

> 第 5~10 轮审查完成后，新发现的每一项在此按 `Task N.M` 递增追加，编号接续上方最大号（当前最大 50）。
> 追加格式：`Task 编号: 描述（第 N 轮发现）`
>
> 示例：
> - [ ] Task 51.1: 修复 XXX（第 5 轮 · 刚体求解器发现）
> - [ ] Task 51.2: 修复 YYY（第 7 轮 · 存档迁移发现）
>
> **规则见 `README.md` 第 3 节。**

---

# Task Dependencies

- Task 1 无前置，最先执行
- Task 2 依赖 Task 1（必须先修分桶，否则标定仍失真）
- Task 3 无前置
- Task 4 依赖 Task 3
- Task 5 无前置
- Task 6 无前置
- Task 7 无前置
- Task 8 无前置
- Task 9 无前置
- Task 10 无前置
- Task 11 无前置
- Task 12 无前置
- Task 13 依赖 Task 11（Esc 分派收敛依赖输入层改造）
- Task 14 依赖 Task 10（起跑闸门的 HUD 提示是残留清理的一部分）
- Task 15 无前置
- Task 16 依赖 Task 10（暂停入口与闸门提示共用状态）
- Task 17 无前置
- Task 18 无前置
- Task 19 依赖 Task 5（形态视觉与空中转体相关）
- Task 20 无前置
- Task 21 依赖 Task 3（拖尾归一分母依赖真实极速）
- Task 22 依赖 Task 20
- Task 23 无前置
- Task 24 依赖 Task 20（巡航层改造基于正确的地面采样）
- Task 25 依赖 Task 23（纹理 LOD 基于修好的地形绘制）
- Task 26 无前置
- Task 27 无前置
- Task 28 依赖 Task 27
- Task 29 无前置
- Task 30 无前置
- Task 31 依赖 Task 23（配色对比需基于正确的受光）
- Task 32 依赖 Task 27（布局依赖修好的安全区）
- Task 33 依赖 Task 13（焦点管理依赖 Esc 分派收敛）
- Task 34 依赖 Task 27
- Task 35 无前置
- Task 36 无前置
- Task 37 依赖 Task 2（关卡文案依赖修好的关卡数据）
- Task 38 依赖 Task 3（数值文档依赖修好的极速）
- Task 39 依赖 Task 7、Task 9
- Task 40 依赖 Task 3（燃料与极速相关）
- Task 41 无前置
- Task 42 依赖 Task 3（帧位移依赖真实极速）
- Task 43 无前置
- Task 44 依赖 Task 48
- Task 45 无前置
- Task 46 无前置
- Task 47 依赖 Task 44
- Task 48 无前置
- Task 49 无前置
- Task 50 无前置
- 阶段 A~G 之间无强制顺序，可按依赖图分层并行，但**同一 Task 内部必须串行**