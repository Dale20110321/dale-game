# 第 1 轮：移动端 UI 深度审查（14 角度 / 13 完成）

> 只读审查，未修改任何项目文件。agent 数：14（1 个因 API 错误两次失败：移动端硬 BUG 扫描）。

## 汇总：跨 agent 复现的高危问题

| # | 位置 | 问题 | 复现 agent |
|---|---|---|---|
| M-01 | `styles/main.css:904` | 竖屏媒体查询把 `#overlay` 的 `padding-bottom: max(--space-5, safe-area)` 覆盖回 `var(--space-2)`，底部图标栏被 home indicator 压住 | viewport/orientation/home-menu ×3 |
| M-02 | `styles/main.css:925` | 横屏 `padding: var(--space-2) 0` 简写把左右 safe-area 清零，内容顶进刘海 | viewport/orientation/home-menu ×3 |
| M-03 | `styles/main.css:18` | `touch-action:none` 挂在 `html,body`，与所有 `overflow-y:auto` 浮层冲突 → 手机上关卡地图/车库/车间可能完全无法滚动（桌面滚轮正常故漏测） | 5 个 agent 独立报出 |
| M-04 | `src/render/hud.js:82` | `TOUCH_KEY_ZONE=90` 算错（真实 116+inset），速度表被油门键压住 36px | touch-layout/orientation/hud |
| M-05 | `src/core/input.js:58-64` | `syncTouchVisibility` 把按键 `display:none` 时不清 `key`，油永久卡 true | touch-layout/touch-events |
| M-06 | `src/core/input.js` | 无 `visibilitychange` 清键，切后台/来电回来车自动全油门 | touch-layout |
| M-07 | `src/core/input.js:118` + `index.html` | 移动端**完全没有暂停入口**（仅 Esc/P） | onboarding/touch-events/docs ×3 |
| M-08 | `src/core/audio.js` + `input.js` | 移动端主流程从不调 `initAudio()`（只有 keydown 和几个面板按钮调）→ **手机上全程静音** | fullscreen |
| M-09 | `src/core/input.js:181-191` | iPhone 点 ⛶ 完全静默失败，无任何反馈；无 `fullscreenchange` 监听；`requestFullscreen()` 无 catch | fullscreen |
| M-10 | `styles/main.css:119` | `.btn.ghost` 没覆盖 `color`，继承深色 `--surface-0` 落在白 12% 玻璃上，对比度 1.44~1.49:1（AA 要求 4.5），影响 8 个高频按钮 | visual-hierarchy |

## 分角度详细发现

### 触摸控制布局与 ergonomics
- `main.css:571-582` vs `:609-617`：代码自己认定必需的 `backdrop-filter`+投影只给了 `.tfull/.ttoggle/.thome`，三个**主**方向键 `.tbtn[data-k]` 只有 12% 白底 → 亮雪原下几乎不可见，优先级倒置。
- `main.css:583-584,587`：无惯用手/镜像选项；`.trev` 距 `.tleft` 仅 ~10px，位置不在拇指弧线上。
- `main.css:588-591`：右上三枚浮按钮垂直间隙仅 4px，误触 🏠 直接丢本局。
- `input.js:166-169`：`off` 无条件 `key[k]=false`，无触点计数 → 拇指+食指同按 ▶，抬起一指即断油门。
- `input.js:162-169`：按下反馈只靠 CSS `:active`，与真实 key 状态解耦；iOS 上不可靠；卡键时零提示。
- `input.js:66-73`：键盘+触摸混用时先松开的会误清对方。
- `input.js:12,149`：`touchWanted` 注释写"持久状态"但从不落盘。
- `input.js:138-143`：`isTouch` 的 OR 分支让触屏笔记本凭空冒出方向键，与紧邻注释自相矛盾。
- `index.html:16-22`：5 个浮/触摸按钮无 `type` 属性。

### 视口 / 安全区
- `main.css:490-503` `#settings` 与 `:622-627` `#donate` **完全没有 safe-area**，而它们的 sticky 顶栏 `top:0` 恰好落在刘海下 → 返回键点不到。
- `main.css:624` `#donate` 用 `justify-content:center`（`#settings` 已改 `safe center`，它漏改）→ 矮屏内容顶部永久滚不到。
- `index.html:109`：`.qrBox` 写死 220×220，320px 视口上占近七成。
- `main.css:11-27` + `canvas.js:35-36,44-47`：CSS 用 `100dvh`、JS 用 `window.innerHeight`，两套视口高度并存且 canvas 的 CSS 尺寸被内联样式覆盖 → 地址栏收放时 HUD 与 DOM 按钮错位。
- `main.js:40`：resize 无防抖，每次都重建整块 backing store 并作废全部渐变缓存；无 `visualViewport` / `orientationchange` 监听。
- 全文无 `-webkit-tap-highlight-color` → 每次点按闪默认灰块。
- 除 `.tbtn` 外全站未禁文字选中 / 长按弹菜单。
- `canvas.js:44`：backing store 面积无上限（k 最大 2.5），4K 屏可越 iOS Safari 约 1677 万像素上限。
- 核对无问题：`viewport-fit=cover` 已声明；6 个浮控件四向 inset 都吃了；无 fixed 落在 transform 祖先里。

### 横竖屏
- `loop.js:24` 的 dt 钳制（0.25s / 15 步）**有效**，物理不会时间旅行。
- 但 `drawScene(dt)` 拿到的是**未钳制**的 dt → 切后台 30 秒回来，踏频猛转 30 秒的量、天气粒子一帧飞出几千 px 后聚成屏幕边缘一条直线。
- `postfx.js:85`：持久化的"锐利 1.25×"用 `setRenderScale` 而非 Persisted 版，`autoScaleFrom` 仍为 1 → 手动保护失效 → 自动降级把 1.25 静默改回 1。
- `postfx.js:74-81`：默认画质档的 dpr 口径（上限 2）与 `canvas.js:39`（窄屏 1.6）不一致 → 误判弱设备；且 `weak` 只在首屏算一次。
- `canvas.js:39`：DPR 分档在 700/480 边界转屏跳档，画面可见地由锐变糊。

### 主菜单布局（实测 320×568 / 375×812 / 430×932 / 三种横屏）
- **横屏压缩规则 `min-width:700px` 排除了最常见的两款 iPhone 宽度**（SE 568×320、8/11 667×375）→ `homeView` 塌到 **34px / 89px** 高，对面是 4129px 内容，当前关格完全在窗口外。
- `main.css:903`：`max-height:none` 被 `:1146` 的 `max-height:min(56vh,440px)` 覆盖 → Pro Max 上白死 222px。
- `main.css:1129`：`.mtab` 实测 **38px**（矮屏档 32px），全 App 一级导航低于 44px。
- `main.css:1127`+`#overlay` 的 `overflow-x:hidden`：320/360px 下 4 个 tab 差 1~2px 被**静默裁掉**。
- `main.css:1163`：`.fbtn` 文字 **10px**，是全首页最小字号，而这 5 个按钮是移动端唯一全局导航。
- `main.css:838` + `panels.js:152`：36 条支线卡片单列，320px 上占 4383px 滚动高度的 79%，要滑 12 屏。
- `panels.js:540,537,652,779`：文案硬编码"6 关"（实际 `LEVELS_PER_BRANCH=12`）、"第 3、5 关为特殊变体"（实际 `SPECIAL_SLOTS=[2,4,6,8,10]` 共 5 个）。
- `panels.js:149-152`：主页地图重渲染后不把当前关卡滚入视野。

### 浮层面板
- **`src/config/constants.js:300`：`topSpeedOf` 二分只迭代 40 次而区间是 [0, 1e16]，永远收敛不到真实极速（~670 px/s），实测 32 辆车全部返回 0** → 车库"极速"格全显示「极速 0 km/h」，车间升级预览退化为"下一级已达该指标上限"。这是本轮最严重的功能性 BUG，且与移动端无关（桌面同样中招）。
- `main.css:102-112` / `index.html:111`：`#donate` 无 `.panelBar`，唯一返回键在内容末尾，横屏矮视口下落到折叠线以下。
- `main.css:317-325`：`.panelBar` 的 sticky `top:0` 让吸顶栏上方恒定留 16px 空隙，滚动内容从缝里透出并抢走点击（hit-test 在 y=1/6/12 均命中内容而非 BAR）。
- `src/ui/donate.js`、`src/ui/shop.js:288`：**都不响应 Esc**，而 `input.js:41` 的 `modalOpen()` 已把 Esc 认领给模态 → Esc 打在打赏/车间面板上毫无反应。
- `src/ui/menu.js:203-220`：`showPanel` 给结算卡也注入了 panelBar，与卡内已有"🏠 返回菜单"语义重叠。
- `src/ui/menu.js:249-259`：`#overlay` 与 `#modePanel` 双层滚动容器，触屏上手指在面板内滑到边界会连带滚动背后菜单。
- `shop.js:288-304` / `panels.js:61` 两处车间入口都带 `if (store.state === "menu")` 守卫，而 `game.js:735` 明确支持骑行中开车间 → 这条精心设计的逻辑移动端完全用不上。

### HUD
- `hud.js:207-215,195`：**「结束本局」按钮离开无限模式后永不隐藏**，变成压在闯关画面上的死按钮（点击走 `quitFreeRun` 直接 return，无反馈）。
- `hud.js:392` vs `:109-111`：速度表绕开了 `glassRect` 自己用 6% 白底 + 白字且无阴影 → 亮色主题（雪原/冰川/天空浮岛）下速度读数基本不可读，与本文件自己论证过的结论矛盾。
- `hud.js:414-416`：`compact` 时表盘直径 72px 但字号固定 44px → 3~4 位速度必然溢出圆环（`OMEGA_KMH=1000` 起全程溢出）。`abbrevNum` 只处理了 ≥1e4，漏了 1000~9999。
- `main.css:218-225`：`#comboTag` 固定 30px 无 max-width，320~430px 上被截断，而被截掉的正是金币数和连招倍率。
- `hud.js:71-72` + `main.css:588`：320px 下机制警告条被 ⛶ 全屏按钮压住 44px。
- `hud.js:262-276`：比赛/接力徽标链不夹在视口内，3v3 接力在 320px 上溢出 13px。
- `hud.js:91,99`：桌面无限模式下「结束本局」按钮完全盖住 A/D 按键提示。
- `hud.js:36`：`view.H = window.innerHeight` 在 `viewport-fit=cover` 下包含刘海/home indicator 区 → HUD 全套布局零安全区感知。

### 触控目标尺寸
- **`.slotDel`（删除存档）仅 24×24 + 10px 🗑，只有 44px 标准的 55%，而这是不可撤销的删除操作**；且被 `position:absolute` 嵌在 `role="button"` 的 `.slotCell` 内部 → 屏幕阅读器很可能根本不暴露它。
- `.mtab` 38px（矮屏 32px）、`.fbtn` 矮屏 38px、`.rankLadder>summary` ~33px、`.heroCoffee` 34px（仅 `pointer:coarse` 才升 44）、`.hudQuit` 30px（同样问题，触屏笔记本上永久只有 30px，而这是无限模式唯一退出入口）。
- `main.css:34,37` 的 `.chip.interactive` / `.stat.interactive` 44px 规则全是死代码（第三个参数从未被传过）。
- 全文所有 `:hover` 规则都没有 `@media (hover:hover)` 包裹 → 触屏上点一下会**停留在 hover 态**直到点别处。
- `.mtab` / `.fbtn` / `.lvCell` / `.fmtBtn` **完全没有 `:active` 规则** —— 游戏里最常点的四类目标按下时零反馈。

### 触摸事件
- 全项目只有 6 个 touch 监听器且**全部正确声明 `{passive:false}`**，无遗漏。
- 玩家按住 ▶ 跑完全程/撞车 → 结算卡把 `#touch` 置 `display:none`（手指仍压着）→ 用另一根手指点"下一关" → `game.js:742` 的起步闸 `if (key.right||key.left)` 被击穿 → **车在无人触碰下直接起步并持续满油门**。发生在"结束→下一局"这个最高频路径上。
- 鼠标路径下"按住→滑出→滑回"按键不恢复（只绑了 `mouseup`/`mouseleave`，无 `mouseenter`），与触摸路径行为相反。
- `input.js:171-172`：`touchend`/`touchcancel` 的 `preventDefault()` 无意义且关闭了 Android 的异步滚动快速路径。
- 核对无问题：跨键多指同按正常；canvas 上零手势监听器无冲突；`.tbtn` 不绑 click 故无双触发；`touch-action:none` 是否真会禁掉浮层滚动存在 agent 分歧（见 M-03，需真机确认）。

### 移动端性能
- `postfx.js:81`：弱设备默认降到 `medium` 而非 `low`，而 `applyPostFx` 在 low 时是零后处理直接 return → 省电路径无任何自动机制会到达。
- `postfx.js:74-81`：不读 `navigator.deviceMemory` → 2GB 千元机与 12GB 旗舰拿到完全相同的默认档。
- `canvas.js:39`：DPR 封顶只看屏幕宽高不按像素总数封顶，3x DPR 手机 backing store 仍可达 219 万像素。
- `loop.js:46-60`：**RAF 永不因页面隐藏而停止**，菜单界面也持续 60fps 全屏渲染纯耗电。
- `background.js:238,224,263,278,18,80`：背景层每帧新建 4~5 个渐变对象，而它们只依赖 `(theme, W, H)` —— postfx 已把这套缓存做对，背景层完全没跟上。
- `hud.js:258,350`：每帧约 **17 次 `shadowBlur`**，在 Chrome/Skia 上走 mask blur 路径，是低端安卓单帧最贵的部分。
- `terrain.js:310-313`：`[0.15,0.5,0.85]` 字面量数组在循环内，26 条带 = 78 次分配/帧。
- `entities.js:654-661`：危险段每帧新建 `top` 数组 + N 个 `[x,y]` 二元组，且**完全不按可见范围剔除**。
- `hud.js:188,210-213`：`hudLayout` 每帧 new 7 个对象；`drawQuitButton` 每帧写 4 次内联样式 → 每帧触发一次样式重算+布局，与 canvas 抢主线程。
- `canvas.js:3`：`getContext("2d")` 缺 `{alpha:false, desynchronized:true}`。
- 核对无问题：粒子池硬上限 600 无无界增长；天气池定长 64 且 n 已夹紧；离屏画布只创建一次；GBUF/lBuf 用 TypedArray 按需扩容零逐帧分配；巡航层已提前 return 规避亚像素慢路径。

### 全屏 / 音频
- 手机上**全程静音**（M-08）+ 切后台回来永不 resume（`storage.js:1274` 的 `visibilitychange` 只有 `if(document.hidden) saveAll()`，无 else 分支）→ `audio.js:7` 注释声称的修复在移动端完全不存在。
- `main.css:588` (z-index:10) vs `:238` (z-index:20)：⛶ 是 `#overlay` 的兄弟节点 → **菜单态/暂停态下 ⛶ 与 🎮 看得见、点不到**，而 README 却写"全屏 🎮 按钮可随时开关"。
- `audio.js:10-16`：`resume()` 的 Promise 拒绝无法被同步 try/catch 捕获 → unhandledrejection。
- 全屏偏好与 🎮 偏好均零持久化。

### 新手引导与可发现性
- **零新手引导**：三个触摸键只有几何字形 `◀▼▶`，语义只存在于 `aria-label`；`main.css:245` 还留着 `#overlay .keys` 的样式规则但已无元素使用 → 提示层被删过且没补回。
- 🏠 无二次确认（全项目 `grep confirm(` 零命中），与 🎮 只隔 4px，误触直接丢本局。
- 结算卡**没有「重玩本关」**；`gateFail` 直接 `toMenu()` → 手机上过关失败要重新滚地图找同一关。
- `showResultCard` 漏了 `homeFloat.style.display="none"`（`togglePause` 在 `:341` 特意做了）→ 结算时透出一个灰色房子鬼影。
- toast：`white-space:nowrap` + `max-width:min(92vw,460px)`，390px 屏上约 24 汉字 → 排位结算 toast（约 45 字）被 ellipsis 截断，而这类 toast 时长只有 600~900ms，中文根本来不及读；且 toast 顶边 76px 与燃料条 y66~78 重叠 2px，有机制警告时更会盖住整块信息栏。
- `README.md:34,36-39`：仍宣传已删除的 `+`/`-` 缩放（`input.js:85-89` 明确写着"已移除"）。
- `README.md:45`：写"五种玩法"，实际菜单只有 4 个 tab。
- **游玩循环在"宇宙场"处断裂且 README 未提两道门**：宇宙联赛要求先通关终局关（167km）→ 拿到 `invited` → 再赢一场排位赛；README 大篇幅介绍联赛却完全没提这些前置条件。另 `game.js:137` 与 `panels.js:837` 对 30 关门槛的判据口径混乱。

### 视觉层次 / 设计令牌
- **`.btn.ghost` 缺 `color`（M-10）**，实测四种背板下对比度 1.44~4.79:1，既不达 AA 又视觉不稳定。
- `.tabs > button`（44px/600字重/青底）与 `.mtab`（38px/700字重/白底）是同一种控件的两套视觉，横屏档还把 `.mtab` 压到 32px。
- `.card` / `.vehCard` / `.branchCard` 三种"卡片"三套边框宽度（1/2/2px）与圆角，同一"选中"语义长得不一样。
- `--muted: #7a869a` 是 0 引用的死令牌，且是唯一不达 AA 的文本色（在 surface-3 上仅 3.72:1）—— 留着它后人会顺手拿去用然后踩坑。
- 禁用态统一 `opacity:.45` → `.card.locked` 合成后仅 **2.60:1**，在阳光下等于看不见，而车库/支线墙/段位表里到处都是锁定卡片；`filter:grayscale(.45)` 叠加还会让语义色彻底塌成灰。
- 排版阶梯定义了 5 档，实际 CSS 里 15 个字号；出现**字号倒挂**：横屏档 `.hero h1` = 20px，比它下面 `.modeTitle` = 22px 还小，而 `#shop h2` = 28px。
- `--font-micro-size: 10px` 在移动端低于可读下限，中文笔画糊成一团。
- **13 个 emoji 缺 VS16（U+FE0F）**，Android 上会掉成黑白：⛽(7处)、⏱(6处，含 HUD 计时门倒计时)、⏹(4处)、⛔(danger 级 toast 图标)等；`index.html` 里 `<h2>🛠 升级车间</h2>`(单色) 与 7 行后的 `🛠️ 减震`(彩色) 同面板混用。
- `--font-family: "Segoe UI", system-ui, sans-serif` —— Segoe UI 是 Windows 字体，移动端是死代码；**无任何中文字体入栈**；`--font-display-weight: 800` 在 PingFang SC（上限 600）上会 fake bold。全仓无 `-webkit-text-size-adjust`，iOS 横屏会自动放大正文冲掉横屏档字号。
- 令牌卫生：8 个死令牌（含 `.glass-sheet` 整套悬空组件）；`--obj-canister` 重复定义两处值不同；面板 680px 重复 5 次无令牌。

---

## 第 1 轮待确认项（需真机）
- **M-03**：`touch-action:none` 是否真的禁掉手机上的浮层滚动。5 个 agent 独立报出，但有 agent 按规范判定"求交到第一个滚动容器为止故不成立"。两种解读都指向同一个安全修法（把 `none` 移到 canvas/`.tbtn`，给浮层显式 `pan-y`）。