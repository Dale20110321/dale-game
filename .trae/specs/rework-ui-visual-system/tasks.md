# Tasks（第 2 期：UI 视觉体系重构）

> 只管表现层（CSS / DOM / Canvas 绘制 / 后处理）。**不改玩法数值、机制参数、物理常量**，不动存档键名。
> 前置：第 1 期已交付（12 场景 / 72 关 / 最终任务 / 排位 / 存档），本期在其上做视觉与信息架构升级。

## Task 1: 设计令牌双端落地
- [x] SubTask 1.1: 新建 `styles/tokens.css`，定义色板（表面层级 4 档 / 玻璃层 / 强调色 / 语义色 4 档 / 文本 3 档 / 主题渐变）、玻璃参数（模糊半径、填充透明度、高光边框、内外阴影）、排版阶梯（display/title/body/caption/micro + 行高 + 字重）、间距阶梯（4/8/12/16/24/32）、圆角阶梯（8/14/20/999）、动效令牌（时长 fast/base/slow + 缓动标准/进场/退出）
- [x] SubTask 1.2: 新建 `src/config/ui-tokens.js`，导出与 `tokens.css` 逐键等价的 JS 镜像（Canvas 需要的色值与字体族），并提供 `TOKENS` 常量与按语义取色的辅助函数
- [x] SubTask 1.3: 在 `index.html` 引入 `styles/tokens.css`（置于 `styles/main.css` 之前），保持文件 ≤ 200 行、无 `<style>`、无内联 `onclick`
- [x] SubTask 1.4: `styles/main.css` 顶部对齐令牌：把既有硬编码色值替换为 `var(--...)` 引用，不改任何布局尺寸的视觉结果
- [x] SubTask 1.5: `tools/autotest.mjs` 新增断言：解析两端令牌并逐键比较完全一致；断言 `tokens.css` 覆盖 spec 要求的全部令牌分组

## Task 2: 玻璃拟态组件库
- [x] SubTask 2.1: 在 `styles/main.css`（或拆出的 `styles/components.css`）实现组件：`glass-sheet` / `card`（含 `interactive`）/ `chip`（含语义变体）/ `btn`（`primary`/`ghost`/`danger` × `sm`/`lg`）/ `progress` / `stat` / `tabs` / `badge`（星级/锁定/变体）/ `empty`
- [x] SubTask 2.2: 每个组件补齐 `:hover` / `:active` / `:focus-visible` / `[disabled]` / `[aria-disabled]` 五态，禁用态与锁定态视觉可区分
- [x] SubTask 2.3: 新建 `src/ui/components.js`，提供返回 HTML 字符串的纯函数（`card()/chip()/grid()/badge()/statRow()/emptyState()`），**不产生内联配色 style**
- [x] SubTask 2.4: 迁移 `src/ui/panels.js`、`src/ui/shop.js`、`src/ui/donate.js`：移除全部用于配色的内联 `style`，改用组件类（进度条宽度等布局类动态值保留）
- [x] SubTask 2.5: `tools/autotest.mjs` 新增断言：静态扫描 `src/ui/*.js` 不存在内联配色 `style=`；`components.js` 导出的每个函数可调用且返回非空字符串

## Task 3: 主菜单信息架构重构
- [x] SubTask 3.1: `index.html` 的 `#overlay` 结构改为 Hero 区（标题 + 状态摘要 + 活体背景层）+ 三组按钮容器（主玩法 / 养成与进度 / 支持），保持 ≤ 200 行
- [x] SubTask 3.2: `src/ui/menu.js` 实现 `setMenuChrome()` 渲染状态摘要（车辆 / 金币 / 通关进度 x/72 / 总星 / 段位 / 无限最佳），数据取自 `store` 与第 1 期的 `store.progress`
- [x] SubTask 3.3: 主玩法组按钮接线第 1 期入口（闯关=支线任务 / 最终任务 / 排位赛 / 无限模式），按解锁状态显示锁定并给出**具体解锁条件文案**（未解锁时附带当前进度）
- [x] SubTask 3.4: 菜单活体背景：在 Canvas 场景渲染之上叠加动态渐晕与缓慢流动光斑（`prefers-reduced-motion` 下静止）
- [x] SubTask 3.5: 键盘导航：方向键在按钮间移动、Enter 触发、Esc 关闭面板；默认焦点落在「继续/闯关」
- [x] SubTask 3.6: `tools/autotest.mjs` 新增断言：菜单三组容器存在且主玩法组含 4 个入口；未解锁项点击不进入游戏且给出提示；状态摘要数值与 `store` 一致

## Task 4: 支线任务面板与面板体系重构
- [x] SubTask 4.1: `src/ui/panels.js` 新增支线卡片墙：12 张卡片（场景名 + 主题色描边 + 场景缩略示意 + 完成度 x/6 + 总星），替换原单层 72 关网格
- [x] SubTask 4.2: 支线展开视图：该支线 6 关的关卡格（锁定 / 星级 / 变体图标 / 坡度 / 三星时限）+ 返回卡片墙入口
- [x] SubTask 4.3: 统一车库 / 成就 / 升级车间 / 存档 / 排位赛 / 无限选图面板的卡片语言与令牌取色
- [x] SubTask 4.4: 全部面板补齐明确锁定提示（写清解锁条件与当前进度），消除空面板与死链
- [x] SubTask 4.5: `tools/autotest.mjs` 新增断言：支线面板首屏只渲染 12 张卡片；展开任一 available 支线可得到 6 个关卡格；每个入口面板渲染后 HTML 非空且无 `undefined` / `[object Object]` 字样

## Task 5: 游戏内 HUD 重构与仪表化
- [x] SubTask 5.1: `src/render/hud.js` 左上信息区改为分层玻璃卡片：关卡名 + 变体徽标 + 里程进度条 + 限时门倒计时 chip
- [x] SubTask 5.2: 车速仪表化（速度数字 + 弧形量表 + 速度区间着色）；燃料改为带刻度量表，低量脉冲提示
- [x] SubTask 5.3: 状态提示分级 `info / success / warn / danger`，各有图标与色；机制警告（危险段超速、限时门紧张）为高优先级且不遮挡车身与前方赛道
- [x] SubTask 5.4: HUD 全部 Canvas 色值改从 `src/config/ui-tokens.js` 读取，移除裸色值
- [x] SubTask 5.5: 响应式：`view.W < 520` 与横屏矮屏（`view.H < 480`）下 HUD 元素互不重叠、不被裁切
- [x] SubTask 5.6: `tools/autotest.mjs` 新增断言：三种视口尺寸下 HUD 各元素包围盒互不重叠且在视口内；危险段警告渲染不抛异常

## Task 6: Canvas 渲染层色值令牌化
- [x] SubTask 6.1: 迁移 `src/render/entities.js` 的裸色值（金币/油罐/加速带/障碍/危险段/门/终点旗/装饰兜底）到令牌
- [x] SubTask 6.2: 迁移 `src/render/terrain.js` 与 `src/render/background.js` 中的结构性裸色值到令牌（场景数据自身的配色仍来自 `THEMES`，不并入令牌）
- [x] SubTask 6.3: 确保迁移后 12 场景逐帧渲染无异常、视觉主题不发生错误串用
- [x] SubTask 6.4: `tools/autotest.mjs` 新增断言：`src/render/**` 中白名单外的裸色值字面量为 0；12 场景各渲染一帧无异常（复用第 1 期断言）

## Task 7: 画面后处理层
- [x] SubTask 7.1: 新建 `src/render/postfx.js`，实现渐晕 + 按场景主题的色彩分级（暖冷偏移），使用复用型离屏画布，无逐帧对象分配
- [x] SubTask 7.2: 实现速度拖影/速度模糊（随车速强度上升）与远景淡化（景深式）
- [x] SubTask 7.3: 接入第 1 期已声明的 `THEMES[i].ambient`，生成场景天气覆盖层（雪/沙/雨/灰烬/雾/花粉）
- [x] SubTask 7.4: `src/render/scene.js` 在绘制流程末尾接入后处理；保证 `store.state` 非 `play` 时不影响菜单背景
- [x] SubTask 7.5: 实现画质档位 `高/中/低/关`（设置入口 + 持久化到既有存档机制之外的独立键或复用既有键，需在 spec 断言中固定），低端设备默认中档；低档关闭模糊类效果
- [x] SubTask 7.6: `prefers-reduced-motion: reduce` 下关闭拖影与光斑流动
- [x] SubTask 7.7: `tools/autotest.mjs` 新增断言：四档画质下渲染各一帧无异常；同一输入下"高"与"关"两档的车身轨迹与用时完全一致（后处理不改变物理）

## Task 8: 动效与反馈语言
- [x] SubTask 8.1: 面板进出场过渡（`translateY + opacity + backdrop`）统一走令牌时长/缓动，切换面板不闪白
- [x] SubTask 8.2: `src/core/toast.js` 重构为四型（`info/success/warn/danger`）分级 + 同屏最多 2 条排队 + 进出场动画
- [x] SubTask 8.3: 结算结果卡：星级逐颗点亮、金币滚动计数、段位分变化 Δ，提供"下一关 / 返回菜单"操作
- [x] SubTask 8.4: `prefers-reduced-motion: reduce` 下降级为无位移、仅透明度瞬变
- [x] SubTask 8.5: `tools/autotest.mjs` 新增断言：四型 toast 均可展示且排队上限为 2；结算卡渲染含星级与金币元素且无异常

## Task 9: 可访问性与响应式
- [x] SubTask 9.1: 全部交互元素补 `:focus-visible` 焦点环与 `aria-label` / 语义标签
- [x] SubTask 9.2: 实现四档断点布局规则（≥1024 / 768~1023 / ≤767 / 横屏 H<480），触摸目标 ≥ 44×44px
- [x] SubTask 9.3: 校验并修正正文级文本对比度 ≥ 4.5:1、大字号 ≥ 3:1（按令牌组合计算）
- [x] SubTask 9.4: 纯键盘全流程验证：菜单 → 支线 → 选关 → 暂停 → 结算返回菜单全程无鼠标
- [x] SubTask 9.5: `tools/autotest.mjs` 新增断言：面板 HTML 中交互元素含 `aria-label` 或文本内容；令牌文本色×表面色的正文组合对比度全部 ≥ 4.5:1

## Task 10: 全量回归与文档
- [x] SubTask 10.1: 跑 `node tools/autotest.mjs` 确认全绿（含第 1 期全部断言），断言总数相较本期开工前净增
- [x] SubTask 10.2: 跑 `node tools/autotest.mjs --levels` 确认 72 关仍全部可通关、无 NaN
- [x] SubTask 10.3: 静态检查全绿：无裸半标度换算、import/export 对应、`index.html` ≤ 200 行 / 无 `<style>` / 无内联 `onclick`、无 `theme === <数字>` 硬编码
- [x] SubTask 10.4: 手动核对：菜单三组、支线卡片墙、展开支线、各入口面板、HUD 三档视口、四档画质、四型 toast、结算卡、reduced-motion 降级全部可用且无死链
- [x] SubTask 10.5: 同步 `README.md`：视觉体系（令牌 + 组件）、主菜单结构、支线面板、HUD 说明、画质档位与可访问性说明、测试断言数

# Task Dependencies
- Task 2 依赖 Task 1（组件从令牌取值）
- Task 3、Task 4 依赖 Task 2（菜单与面板使用组件库）
- Task 5 依赖 Task 1（HUD 需读 JS 令牌）；Task 5 与 Task 3、Task 4 相互独立，可并行
- Task 6 依赖 Task 1；Task 6 与 Task 3、Task 4、Task 5 相互独立，可并行
- Task 7 依赖 Task 1（后处理配色取自令牌）；Task 7 与 Task 3~6 相互独立
- Task 8 依赖 Task 2（动效作用于组件与 toast）
- Task 9 依赖 Task 3、Task 4、Task 5（对比度与键盘流程需面板与 HUD 就位）
- Task 10 依赖 Task 1~9 全部完成

---

## Task 11: 修复回归：结算结果卡「下一关」后状态卡死（实机反馈）

> 触发：用户反馈"后退好像用不了了"。核对后确认为二期引入的真实回归，
> 根因是 Task 8.3 的 `showResultCard()` 把 `store.state` 置为 `"ended"`，
> 而 `nextLevel()` 的前进分支没有恢复 `"play"` / 收起菜单遮罩，
> 导致 `update()` 直接早退 —— 画面停在菜单遮罩上，看起来"点不动"。

- [x] SubTask 11.1: 把无头测试桩的元素 `addEventListener` 升级为真实监听表（支持 `dispatchEvent`），新增「面板交互（集成）」断言组；先复现失败（`state=ended 遮罩隐藏=false`）
- [x] SubTask 11.2: `src/game/game.js` 的 `nextLevel()` 前进分支补 `store.state = "play"` + `presenter.hideOverlay()`；末关按钮文案由「🎯 最终任务」改为「🏠 返回菜单」（此前点击只会回菜单，文案与行为不符）
- [x] SubTask 11.3: `styles/main.css` 的 `#modePanel` 补 `position: relative; z-index: 1`，避免被菜单活体背景 `#menuBg` 覆盖
- [x] SubTask 11.4: `src/ui/menu.js` 键盘导航：Esc 关面板不再依赖"当前有可聚焦入口"；分组被隐藏时不在隐藏按钮之间游走焦点
- [x] SubTask 11.5: 新增 6 项集成断言（返回 → 主菜单 / Esc 关面板 / 结算卡弹出 / 下一关可继续 / 返回菜单 / 三组入口可见），全量 425 项检查全绿、`--levels` 72 关全部可通关

# Task Dependencies
- Task 11 依赖 Task 1~10 全部完成（回归修复）

---

## Task 12: 修复二期回归：面板/菜单"点不动"+ 版式返工（实机反馈）

> 触发：用户反馈"这个 UI 改了过后不仅不好看，而且还点不动"。
> 定位方式：无头 Edge 加载真实页面，对每个可点元素做 `elementFromPoint` 命中测试 +
> 读取 `getBoundingClientRect` / `scrollHeight`（不再只靠无头断言猜）。

- [x] SubTask 12.1: 复现并定位根因：`#overlay` 的 `justify-content:center` + `overflow-y:auto` 在内容超高时把整体挤出视口，`#modePanel` 作为 flex 子项被压缩到 **26px** 高（探针实测 `scrollH=1384 clientH=24`）→ 面板等于没出现，表现为"点不动"
- [x] SubTask 12.2: 修 `#overlay` → `justify-content: safe center`；修 `#modePanel` → `flex: 0 0 auto` + 明确宽高 + 自有滚动 + `scrollIntoView`
- [x] SubTask 12.3: 面板改"一屏一视图"：打开面板时收起菜单分组（`showPanel/hidePanel` 统一管理），不再与菜单叠加
- [x] SubTask 12.4: 版式返工：状态摘要改一行紧凑 chips；按钮改等宽网格 + 单行省略；锁定项按钮只留短标签与当前进度，完整条件移入 `aria-label` / `title`；支线卡片墙改 2 列 + 文字单行省略
- [x] SubTask 12.5: 遮罩加强（`scrim-strong` + 轻微模糊），场景退为氛围；校验 1280×720 下 `overlay 溢出=false`、10 个入口全部在视口内且可点
- [x] SubTask 12.6: 把 `elementFromPoint` 命中测试的判定思路固化为可复现的排查手段（临时探针用后即删；结论写入本任务）
