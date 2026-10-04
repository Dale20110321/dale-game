# 第 2 轮：桌面端 UI 与键鼠交互审查（14 角度 / 13 完成）

> 只读审查，未修改任何项目文件。agent 数：14（1 个因 API 错误失败：鼠标操作专项）。
> 键盘操作专项独立实测结论：**「开局→选关→结算→下一关」当前键盘走不通**。

## 跨 agent 复现的高危问题

| # | 位置 | 问题 |
|---|---|---|
| D-01 | `src/core/input.js:91,98,104` | `KeyR`/`KeyU`/`KeyM` 无 `ctrlKey/metaKey/altKey` 守卫 → **Ctrl+R 被劫持**：浏览器刷新前先跑了一次 `restart()`（tries+1、整关重建、落盘）；Ctrl+U 会弹出升级车间；Ctrl+P 打印被吞 |
| D-02 | `src/core/input.js:66-73` | `bind()` 的 WASD 只认 `e.key.toLowerCase()`，无 `e.code` 兜底、不看 `e.isComposing` → **中文/日文 IME 输入态下 WASD 全键失效**（方向键走 `e.code` 仍可用，故障表现为"只有字母键没反应"） |
| D-03 | `src/core/input.js:91,98,104` | 无 `e.repeat` 守卫 → 长按 R 一秒触发约 30 次 `restart()` + 30 次全量写 localStorage；长按 M 静音来回翻 |
| D-04 | `src/ui/shop.js`、`src/ui/donate.js` | 两处**都没有 Esc 处理器**，而 `input.js:41` 的 `modalOpen()` 已把 Esc 认领给模态 → Esc 被完全吞掉。且打赏从设置里打开时，settings 的 Esc 只判 `#settings` 是否 hidden → **Esc 把底下设置关掉、打赏留在屏幕上，再按 Esc 彻底没反应** |
| D-05 | `src/core/input.js:98-102` | `KeyU` 无状态门禁（点击入口有 `state==="menu"` 守卫）。骑行中按 U 开车间 → `game.js:735` 的 `if (store.shopOpen) return` **冻结整个游戏循环**，看起来像卡死 |
| D-06 | `src/game/game.js:331` | `startGame()` 内无 `store.shopOpen=false` → 车间开着时按 R 重开，车间浮层仍在、游戏仍冻结，只能靠再按 U 自救 |
| D-07 | `src/render/hud.js:449` | **AI 小车屏幕坐标漏乘 zoom**：世界层是 `ctx.scale(zoom)` 后减 `cam.x`，此处却写 `raceAI.x - cam.x` → 标记最多偏 3 倍，`sx > -40 && sx < W+40` 的剔除同样错 |
| D-08 | `src/render/postfx.js:400` | `autoTuneFrame` 的"升回去"分支是**死代码**：`cur(0.75) < autoScaleFrom(1)` 恒成立 → 自动降档后**永久锁死**，与该模块 382 行注释承诺的"帧宽裕后升回"相反 |
| D-09 | `src/render/hud.js:392,415-416` | 速度表底盘用 `glass-fill`（白 6%）且**数字零投影** → 与本文件 108-110 行自己论证过的"白色薄底等于没底"结论直接矛盾，亮色主题下速度读数不可读 |
| D-10 | `src/core/canvas.js:39,44-45` | **无绝对像素预算**。5K 屏默认 k=2 → 14.7M px；选"锐利"1.25 → 23M px ≈ 92MB，加同分辨率离屏共约 184MB 常驻，每帧还要过约 5 遍全屏 |
| D-11 | `src/ui/panels.js:673-674` | Esc 关掉「比赛」面板后 `panelKind` 仍是 race 且 `homeView` 被重新显示（显示的是闯关地图，tab 仍高亮"比赛"）→ 点关卡格会**把主线关卡当比赛开跑** |
| D-12 | `src/ui/panels.js:237-239` | 三个走面板的 tab 点「‹ 返回」= `showMenu()` → `selectMode(lastTab)`，`lastTab` 没变 → **同一个面板被原地重开**，返回按钮对这三个 tab 完全无效 |
| D-13 | `src/ui/panels.js:223` + `1587/1591` | `slotDel`（真 `<button>`）嵌套在 `role="button"` 的存档位内，`onPanelKeydown` 的 `closest` 命中父格 → **键盘永远删不掉存档，反而会误切档** |
| D-14 | `src/ui/shop.js:288` + `panels.js:59` | 暂停态 `.menuFoot` 五个图标与 `.modeTabs` 仍可见可点，但处理器有 `state==="menu"` 守卫 → **点车库/升级/成就/存档毫无反应**（唯独设置能开），看起来坏了 |
| D-15 | `src/ui/panels.js:627` | 可见文案含**乱码字符**：`"AI 配速固定在三��奏的 0.68 倍"` —— `星` 被坏字节替换，直接显示在屏幕上 |

## 分角度详细发现

### 键盘导航与焦点管理（独立结论：全流程走不通）
- `shop.js:59` / `donate.js:13`：打开面板只 `classList.remove("hidden")`，**不移入焦点**，焦点留在 z-index 背后按钮上，键盘/读屏用户完全感知不到面板已开（`settings.js:71` 是唯一做对的）。
- `menu.js:150`：方向键在 `state==="menu"` 下被无条件 `preventDefault` 并改写焦点，而 `#modePanel`/`#shop`/`#settings` 都是滚动容器 → **面板内按 ↓/↑ 不滚动，反而把焦点甩到浮层背后**。
- `menu.js:269`：`showResultCard()` 不移入焦点 → 从结算走到「下一关」需先 Tab 过 8 个浮按钮 + 4 个 mtab + 5 个 menuFoot ≈ **14 次**。
- `panels.js:149`：`renderHomeView()` 全量重写 `innerHTML` 销毁焦点节点 → 焦点掉回 body，键盘用户被迫从文档开头重 Tab。
- `index.html:63/78/102`：三个浮层无 `role="dialog"`/`aria-modal`，无 `inert`，无焦点陷阱 → 背景按钮全在 Tab 序列里。
- `input.js:160`：`.tbtn[data-k]` 只绑 touch/mouse，**不绑 click**。三键是真 `<button>`，Tab 能聚焦、Enter/Space 派发 click 却无人监听 → **键盘完全无效**。
- `index.html:42-48` + `panels.js:105`：`.mtab` 用 `aria-selected` 但父 `<nav>` 无 `role="tablist"`、按钮无 `role="tab"` → 无效 ARIA，读屏忽略或报错。
- `panels.js:499` / `components.js:39`：锁定卡片只有 CSS 类没有 `aria-disabled`，或同时带 `aria-disabled` + `tabindex=0` → 键盘 Enter 被静默吞掉零反馈（鼠标有 toast），两条路径不一致。
- `menu.js:136`：`onMenuKeydown` 的 Esc 分支不检查 `escForModal` → 菜单态同时开 modePanel 与设置时，一次 Esc 关两层。
- `menu.js:347`：恢复游戏时只加 `.hidden`，焦点仍停在刚被隐藏的 `resumeBtn` 上 → 之后 Tab 从头开始。
- `panels.js:222`：未判 `e.repeat` → 按住 Enter 反复 `startGame`。
- `menu.js:145`：`move()` 用 `i < 0 ? 0` → 焦点不在列表里时按 ↑ 跳到第一个而非最后一个，方向反直觉。
- `menu.js:123`：`visibleEntries()` 只收 `.mtab` 与 `.menuFoot button`，**homeView 里 36 张支线卡 + 12 个关卡格完全不在方向键路径里**。
- `index.html:13`：`<canvas id="cv">` 无 `aria-label`、无 fallback 内容、无 `tabindex` → 整个游戏状态对读屏不可达。

### 宽屏布局（1920 / 2560 / 3440）
- **唯一的宽屏断点是 `min-width:1180px`，上限 940px。1920/2560/3440 三档走同一条规则**，3440 屏上 UI 只占 27% 宽度。
- `main.css:1127` + `:825`：`.modeTabs` 拉到 940px，4 个 `.mtab` 各 `flex:1` → 每个 234px 承载「🏁 闯关」4 个字，拉伸变形最明显；`.menuFoot` 同理变成五条扁横杠。
- `main.css:252`：`#modePanel` 恒为 `min(680px,92vw)`，宽屏断点**漏了面板本身** → 点开车库时版面从 940 骤缩到 680。
- `tokens.css:57`：所有排版/间距令牌都是固定 px，无大屏缩放层 → 2560/3440 上整个 UI 与 1366px 完全等物理尺寸。
- `main.css:434-436`：1440px 屏上 `#shop` 内容只有 400px 高，上下各空 500px 且无面板底衬。
- `main.css:826` + `:1146`：竖屏 1200×1600 时 66vh=1056 仍被 640 卡死，上下各浪费约 350px。
- `main.css:832-834`：`@media (max-width:1023px){ #modePanel{max-width:92vw} }` 是死规则（基础样式已是 `min(680px,92vw)`）。

### 桌面性能 / 多显示器
- `canvas.js:39,44-45`：无绝对像素预算、无守恒；5K+1.25× 时主画布 92MB + 离屏 92MB。
- `postfx.js:156-173`：离屏 `off` 与主画布同分辨率，而高档内容全是柔和渐变 → **4× 填充率纯属浪费**，离屏按 CSS px（k=1）建即可。
- `canvas.js:3`：缺 `{alpha:false, desynchronized:true}` → 首屏就被天空渐变铺满、从不透明，却仍走带 alpha 混合的慢合成路径。
- `postfx.js:117-127`：`cv.style.filter` 挂在 canvas 元素上，合成器每次跑一遍全画布颜色矩阵，4K/5K 上是持续全屏 GPU pass。
- `canvas.js:34-49` + `main.js:40`：无防抖、无"尺寸未变则跳过"早退 → 窗口跨屏拖动时 5K 下等于每秒几十次 184MB 纹理重分配。
- 无 `matchMedia('(resolution: Xdppx)')` 监听 → Firefox 把窗口从 Retina 拖到普通屏、DPR 2→1 但 resize 不触发 → 画布保持 2 倍 backing store。
- `loop.js` + `main.js:71-77`：144Hz 屏上渲染 144fps 而物理固定 60Hz → **2.4× 填充率换零游戏收益**。
- `postfx.js:385`：`FRAME_BUDGET_MS = 22` 是绝对值，未按刷新率归一 → 120Hz 屏上 8.3ms 一帧永远"宽裕"，**自动降级从不触发**。
- `background.js:192-208`：每层星点每帧重播种，逐颗 `beginPath/arc/fill` → 宇宙场两屏 130 次独立路径填充，可并进一条 path。
- `background.js:238/224/263/278`：天空/雾带/大气雾/地平线辉光 4 个渐变每帧新建，且都与相机 x 无关。
- `terrain.js:22-30`：`eachGround` 不复用已算好的 `gBuf`，`strata` 一个画家跑 5 趟全量重算噪声。
- `terrain.js:449-493`：坡面光照逐段 `translate+beginPath+4×lineTo`，缩到 0.32 时 5K 屏达约 1000 段/帧，且 `translate` 在 continue 之前无条件执行。

### 桌面 HUD
- 全套固定 px 无缩放：`infoW` 上限 250（4K 上占 6.5% 宽）、`gr=50`（表盘占 2.6% 宽），1920 与 3840 表现完全一致。
- `hud.js:150`：警告只覆盖闯关模式（`store.mode !== "level"` 直接 return），但 `drawInfoCard:283` 明确给 `space` 也读 `world.gates` 显示限时门倒计时 → **宇宙场有时限门却永远不报警**，危险段超速提示一并消失。
- `hud.js:419-425`：按键提示只画 A/D，R/U/M/Esc·P/S·↓ 全零提示；`drawDriveIndicator` 无淡出，全程常驻底部正中（正是视线前方）。
- `hud.js:523`：速度线的 62% 上限与实际不符 —— `info` 卡在 y∈[8,100]、`race`/`warn` 在顶部正中，全在 62% 区内，线会划过信息栏与警告条。
- `hud.js:195`：结算屏仍显示「结束本局」（`state==="ended"` 但 `mode` 仍是 free，按钮继续 `display:flex`）。
- `hud.js:419-425`：无输入设备指示 —— 桌面玩家手动开 🎮 后 A/D 带凭空消失，画面无任何解释。
- `hud.js:279-295`：HUD 无本局用时，玩家必须等结算卡才知道跑了多久。
- `hud.js:48`：注释自称"纯函数只读 view 尺寸"，实际第 98 行读 `store.mode`。
- `hud.js:105-121`：`glassRect` 只被 race/drive 使用，信息栏与警告条各自手搓底色，**三套深浅并列**，玻璃层级不统一。
- 值得加：转速/挡位（`store.phys.rpmK` 与 `torqueAt()` 已在用，加一条转速弧+红区几乎零成本）。

### 菜单 / 浮层面板
- 四个浮层（`#shop`/`#settings`/`#donate`/`#modePanel`）**都没有"点遮罩关闭"**（全代码库无 `e.target === 容器` 的关闭处理），桌面习惯点外面关闭。
- `main.css:239,254`：`#overlay` 与 `#modePanel` 是两层嵌套 `overflow-y:auto` 且未设 `overscroll-behavior:contain` → 滚轮到底会连带滚动外层，把 hero 标题和 tab 栏一起滚出视野。
- `panels.js:149`：滚到第 8 张支线卡点一下 → `rerender()` 重写 innerHTML → **滚动位置被重置到顶**，展开的关卡块看不到。
- `menu.js:206`：`showPanel()` 只隐藏 `homeView`，`.hero`（含 ☕）、`.modeTabs`、`.menuFoot` 仍可见可点 → 点 ☕ 会在车库面板上再叠一层打赏。
- `main.css:317`：`#shop .panelBar { align-self: stretch }` 横跨整个视口宽，而车间内容是 360px 居中窄列 → 1920 屏上「‹ 返回」离内容列约 800px 孤零零挂右上角。
- `main.css:282`：`.panelBar { justify-content: flex-end }` 把返回键推到右上角，而正文左对齐；桌面对话框惯例是左上角。
- `main.css:434`：`@media (min-width:768px) and (min-height:720px){ #shop{ justify-content:center } }` **重新引入了它上面 15 行注释刚修掉的"居中溢出顶部裁掉"风险**。
- `main.css:1150-1151`：滚动条样式只有 `::-webkit-scrollbar` → Firefox 用约 15px 默认亮色宽滚动条，与 Chrome 6px 细条的内容宽度差 9~10px，`.lvGrid` 列宽与省略号位置两浏览器不一致。
- 三层返回语义不统一：`#modePanel` 走 sticky panelBar、`#shop`/`#settings` 是各自浮层、`#donate` 又是第三个 z-index（32 > 31 > 30），三套返回实现三套焦点归还逻辑。

### 桌面硬 BUG
- `main.css:233-234`：`#overlay` 兜底是 `justify-content:center` → Safari < 16.4（不支持 `safe` 关键字）桌面版把窗口压矮后菜单顶部点不到。同文件 499-500 行的 `#settings` 兜底用的是 `flex-start`，是对的，**`#overlay` 这处漏改**。
- `input.js:124`：`bind(e,true)` 在 `state==="menu"` 时也执行 → 菜单里用方向键移动焦点、松开前点「闯关」，`key.right` 仍为 true → `update()` 里 `awaitingStart` 被跳过，**车自己起步**，"等待首次按键"提示形同虚设。
- `input.js:128-133`：`blur` 只清按键、**不自动暂停** → Alt+Tab 到别的应用（窗口仍可见）时 rAF 仍在跑，车继续跑、继续耗燃料、继续撞，摔车判定全在用户看不到时发生。
- `panels.js:1293-1349`：`.dossier` 表格 5 列在 `#modePanel` 内 `white-space:nowrap`，窗口宽 700px 以下会横向撑出滚动条。
- `input.js:181-191`：`requestFullscreen()`/`exitFullscreen()` 返回 Promise 无 `.catch()`；无 `fullscreenchange` 监听，⛶ 按钮状态与实际不同步。
- 核对无问题：`:has()`/`scrollbar-gutter`/`@container` 零使用无回归面；`env()` 与 `backdrop-filter` 已带 `-webkit-` 前缀。

### 光标与反馈
- `main.css:571`：`.tbtn`（⛶/🎮/🏠）是真 `<button>` 但**整块无 `cursor` 声明**，桌面端悬停显示默认箭头，与同为按钮的 `.hudQuit` 不一致。
- `main.css:63`：锁定卡同时带 `.interactive` + `.locked` → `not-allowed` 生效，但 `:hover` 背景、`brightness(1.12)`、`:active` 位移**全部照常触发**（同类：`main.css:352` 的 `.lvCell:hover` 无 `:not(.locked)` 守卫）。
- `panels.js:475`：`branchCard` 恒 `interactive:true`，未开放时 `locked` → 光标 `not-allowed`，但 `case "branch"` **仍会响应并弹 toast** → "不可点"的承诺与实际反馈矛盾（`lvCell`/`spaceStart` 锁定格同理）。
- `.lvCell`（最高频点击面）只有 `:hover` 无 `:active`；`.fbtn`/`.mtab`/`.fmtBtn` 同样缺。
- `main.css:394`：`.vehCard`/`.branchCard` 把 `cursor:pointer` 写在基类而非 `.interactive` 上。
- `main.css:34,37,131` 的 `.chip.interactive` / `.stat.interactive` / `.badge.interactive` 三套 hover/active/focus 规则**全是死代码**（全仓无代码产出该类）。
- 全局无 `user-select:none` → 鼠标横扫菜单拉出蓝色选区，在全屏 canvas 上尤其突兀。
- 核对无问题：`:focus-visible` 主覆盖完整（`[tabindex]`/`[data-act]`/`button` 三重兜底）；`.btn[disabled]`/`aria-disabled` 的 `not-allowed` + `filter/transform:none` 覆盖顺序正确。

### 信息架构与菜单树
- **全局零搜索/筛选/跳转**。432 关靠 36 张支线墙 + 「▶ 下一关」定位，27 辆车只能逐屏扫，25 成就平铺无分组无进度，108 场宇宙赛靠折叠。这是这套菜单树最大的结构性缺口。
- `panels.js:191-218`：锁定态的最终任务卡仍以整卡形式钉在 homeView 顶部，占掉首屏约 1/5，把真正的「▶ 下一关」往下推；CSS 只在 ≤767px 压缩它。
- `panels.js:1033-1071`：车库 27 辆只有"按档位分组 + 组内价格升序"一种排法，档位头非 sticky，滚到宇宙档时看不到自己在哪一组。
- `panels.js:1236-1243`：25 项成就无 README 说的入门/熟练/精通/超越分组、无每组进度、无"只看未达成"；未解锁项藏了名字却照抄 desc，条件全泄。
- `panels.js:1584-1598` + `storage.js:38`：存档位是 6 个（`MAX_SLOTS=6`），每格只写「已通关 n/432」，切槽前无从比较金币/段位/车辆/最后游玩时间。
- `panels.js:1421-1430`：画质/锐度在「存档」面板里**重复了一套**（且描述文案与 settings 的 DESC 不是一套），被埋在 10 项统计之后。
- `panels.js:304-307`：宇宙场面板点联赛卡展开分区后**不调 `scrollStepIntoView`**（比赛面板的都有）→ 展开第 12 个联赛时新内容在折叠线以下，看起来像"点了没反应"。
- `menu.js:190` 注释写"车库 32 辆 / 6 组"，实际 27 辆；README 也是 27 辆。

### 桌面音频
- `audio.js:30,39`：**无 master GainNode**，每个音直接 connect destination、音量硬编码 0.06~0.12 → 无法在播放中掐断已发声音、无任何音量调节手段。
- `audio.js:30`：播放前不检查 `ctx.state` → suspended 时 `o.start()/stop()` 仍按冻结的 `currentTime` 排队，恢复瞬间**所有积压音齐响 = 爆音**。
- `audio.js:8-27`：resume 只挂在 keydown 和 4 个按钮上，无 `visibilitychange` → 鼠标点回游戏不会 resume。
- `audio.js:32-41`：每音 `new Oscillator + new Gain`，从不 disconnect、无 `onended` 清理 → 同帧叠音时 destination 上挂住一串 gain 节点。
- `audio.js:49,60,68,72`：多音高用 `setTimeout` 串联而非 WebAudio 时钟 → 后台标签页被节流到 ≥1s，第二/三个音迟到整秒且已跨局仍在响。
- `world.js:667-679`：第 1 关金币间距 155px、拾取半径 45px，高速档一帧位移可达数千 px → **既会整片漏吃（完全无声），也会同帧连吃多枚使音效齐响**。
- `input.js:104-110` + `settings.js:130`：按 M 静音后 `#btnMute` 文案不刷新（`renderMute` 是模块私有未导出）。
- `panels.js:57-63,232`：开局主路径（点关卡卡 → `playCell` → `startGame`）不调 `initAudio` → 纯鼠标点卡开局再点暂停/设置，全程零声音。
- `audio.js:5,22`：`audioInit` 一旦 true 永不重建（ctx 被 close 后永久哑掉且无自愈）；构造失败时保持 false，每个 keydown 都重新 new AudioContext。
- 无持续音源（引擎/轮胎/风声），7 个一次性 beep 之外全程静音 → CRUISE_V 以上的极速档玩家听不到任何速度反馈。
- 音效只覆盖 7 类事件；限时门通过、通关结算、跳台起飞、燃料耗尽、名次变化全部无音。`physics/events.js:22` 的 `onSlip` 钩子声明了却无人 dispatch 也无人订阅。
- 核对无问题：静音传播本身正确（所有音都经 `playTone` 单闸门，`store.muted` 已持久化并在任何发声前读档）；`src/render/*.js` 零音频代码。

### 文案一致性
- `panels.js:540/537/652/779`：「· 6 关」（实 12）、「第 3、5 关为特殊变体」（实 `SPECIAL_SLOTS=[2,4,6,8,10]` → 5 个）、「12 支线 × 6 关」（两处数字都错）、「6 关全部通关」（实 12）。
- `panels.js:821`：宇宙场锁定卡写"5 个难度分级的长程竞速"，实际是 12 联赛 × 3 分区 × 3 场 —— 面板在描述一个早已不存在的旧结构。
- `shop.js:109`：无形态车辆的提示写「除山地车外，每辆车都有专属特殊模式」，但 27 台车**全部**都有 `ultra`（该分支永不走到），且"山地车"不是任何一台车的名字。
- 「特殊模式」与「形态」两种叫法混用（`shop.js:86/109`、`panels.js:1155/1167` vs README、`vehicles.js` 的 `fxText`）。
- 无限模式四种叫法：HUD「♾ 自由模式」/ tab「♾️ 无限」/ 面板「♾️ 无限模式」/ README「无限模式」。
- 「限时门」（`hud.js:159`）与「计时门」（`game.js:824`、`panels.js:209`）。
- 金币格式破例：`game.js:317`（`toLocaleString`）、`:591`、`:646` 三处裸数字未走 `goldNum`，而 README 明确写"一律用科学计数法显示"。`hud.js:281` 无限模式里程行用裸 `Math.round` 未走 `abbrevNum`（同文件 271 行特意注明要避免撑爆信息栏）。
- README 数字错误：`:90` 「标称极速横跨 38 亿倍」实为 **3.79 亿倍**；`:114` 「无极是全程收入的 1600 万倍」实为 **1.6×10^26 倍**，且与同段自己写的"星环 194 倍"自相矛盾（8e8/2.13e6 ≈ 375）；`:111` 「213 万」与"够把一台入门车四项升满"矛盾（满级四项仅 28,240）。
- `README:45` 「五种玩法」vs 实际 4 个 tab；`index.html:7` meta description 漏"宇宙场"；`README:34,36-39` 仍宣传已删除的 `+`/`-` 缩放。
- `game.js:478` / `hud.js:96` 注释与文案仍引用已删除的车「归墟」。

### 设置项完整性
- 缺 **音量滑块**（`audio.js:36` gain 硬编码 0.08，只有布尔静音）、**按键自定义**（`input.js:69` 硬编码）、**恢复默认**（全仓无 resetDefaults）、**自动降档可视化**（`autoTuneFrame` 静默改倍率，UI 零记录）。
- `settings.js:64`：调整画质看不到预览 —— 面板只在 menu 态可达，而 `postfx.js:274` 在非 play 态直接 return，**档位差异最大的效果（暖浸染/暗角/远景淡化/天气）在面板前全部不渲染**。
- `settings.js:14`：`DESC.medium` 与实际不符 —— 坡面明暗与大气雾在 medium 就已开启（gain 0.7 / alpha 0.5），而真正区分 high 的暗角与暖浸染反而没写。
- `storage.js:433`：静音是唯一进存档文档的设置，切档会改静音、导入别人存档会静默覆盖自己的静音；而画质/锐度是全局键 → **三者归属策略互相矛盾**。
- `settings.js:130`：静音按钮无 `aria-pressed`，读屏无法获知当前开关。
- `settings.js:43`：画质/锐度 tab 声明了 `role="tablist"` 但无方向键导航（`visibleEntries()` 不收 `.tab`）。
- 无帧率显示；无游戏内热键开设置（必须先退出到主页）。
- 核对无问题：震动/惯用手/语言三项在本作无对应实现（全仓 0 处 `navigator.vibrate`），**不要加这三个设置项否则是死配置**。

### 游戏外壳
- `storage.js:1274`：**全项目零 `storage` 事件监听** → 两个标签页各持一份内存 store，30s 定时器 + `touchSlotMeta` 整份覆写同一键，后写的静默吃掉先写的。
- `storage.js:1271-1285`：只有 `visibilitychange` 落盘，无 `pagehide`/`beforeunload` → 各浏览器不一致，可能丢最后一局的成绩/里程。
- `main.js:62`：首屏无加载态 —— `heroSummary` 与 `homeView` 是空的，模块加载期（40 个 module 请求）用户看到标题 + 空地图区，点任何 tab 毫无反应。
- `main.js:1-79`：无 `window.onerror`/`unhandledrejection` → 任一 module 404 或抛错 = 一块死页，标题还在、按钮全哑且不报错。
- `index.html:8-9`：无 `<link rel="icon">` → Pages 上 `/favicon.ico` 404，标签页/书签全是默认地球图标；无 `manifest.webmanifest`/`theme-color`/`apple-touch-icon`。
- `panels.js:1446-1448`：导出只有 `downloadSave()` 一条路，失败就显示"导出失败"，**无 `navigator.clipboard` 兜底 → Safari/iOS 内置浏览器上导出实际不可用**。
- `menu.js:262-278`：结算卡只有"下一关/返回菜单"，成绩无法复制或分享。
- `index.html:11-12`：无 `<noscript>`；无 `@media print`；`user-select:none` 只在 `.tbtn`；无 `contextmenu` 屏蔽。