# UI 视觉体系重构 Spec（第 2 期）

## Why

第 1 期把游戏做成了"能玩很久"的内容体量（12 场景 / 72 关 / 最终任务 / 排位 / 存档），但**外观仍是第 1 期的临时状态**——第 1 期 spec 明确写了"新面板沿用现有 CSS 语言，只求结构清晰、能玩"（见 `restructure-progression-and-hazards/spec.md` 的 Why 与 Impact）。结果是：

1. **简陋**：`#overlay` 是一层 `rgba(8,20,32,.74)` 平铺、按钮是统一的圆角渐变胶囊、`#modePanel` 是"半透明黑方块 + 12px 小字"，没有任何层次、光影或质感；`#toast` / `#comboTag` 是裸文字。
2. **杂乱**：主菜单 7 个按钮平铺无分组、无主次；72 关挤在 `repeat(4, 1fr)` 的格子里（一屏滚很久）；面板颜色靠 `panels.js` 里拼 `style="border-color:...44"` 内联字符串，与 `styles/main.css` 两套色值并行漂移。
3. **两套颜色各写各的**：DOM 用 CSS 写死一层色，Canvas（`hud.js` / `entities.js` / `terrain.js`）又各自写死一层色（`#ffd166`、`#4cff88`、`#e85d04`…），改一处配色要满仓库找。
4. **无动效语言**：面板是瞬间显示/隐藏，没有进出场过渡；没有 `prefers-reduced-motion` 降级；没有键盘焦点样式。
5. **画面质感缺失**：游戏内没有渐晕、色彩分级、景深或天气覆盖层，12 个场景的"氛围"只靠背景图层，看起来仍像 Demo。

本期把界面的"设计系统"立起来：**一套令牌 → 一套组件 → 一层动效 → 一层画面后处理**，让游戏从"功能齐但样子糙"变成"看起来像个正经作品"。

> **范围**：本期只做表现层（CSS / DOM / Canvas 绘制 / 后处理），**不改玩法数值与物理参数**（那属于第 3 期）。所有既有玩法、存档键名、测试断言必须保持通过。

## What Changes

### A. 设计令牌：唯一事实来源（DOM + Canvas 双端一致）

新增 `styles/tokens.css`（CSS 自定义属性）与 `src/config/ui-tokens.js`（Canvas 可读的 JS 镜像），两者**逐键等价**，并由自动化断言守护：

- **色板**：表面层级（surface-0/1/2/3）、玻璃层（glass + 模糊 + 边框光）、主强调色（accent）、语义色（success / warn / danger / gold / info）、文本层级（text-hi / text-mid / text-lo）、主题渐变（用于按钮与标题）。
- **玻璃拟态参数**：`backdrop-filter` 模糊半径、玻璃填充透明度、1px 高光边框、内外阴影。
- **排版**：字号阶梯（display / title / body / caption / micro）+ 行高 + 字重。
- **空间与形状**：间距阶梯（4/8/12/16/24/32）、圆角阶梯（chip 8 / card 14 / sheet 20 / pill 999）。
- **动效**：时长（fast 120ms / base 200ms / slow 320ms）+ 缓动（标准 / 进场 / 退出）。
- **画布令牌镜像**：Canvas 需要的色值与字体（HUD、实体、后处理）从 `ui-tokens.js` 读取，**渲染层不得再出现裸色值字面量**（纯白/纯黑阴影等结构性色值除外，白名单由断言固化）。

### B. 组件层：玻璃拟态组件库

在 `styles/main.css`（或拆分出的 `styles/components.css`）中定义一次性组件，所有面板只允许用这些类：

`glass-sheet`（浮层容器）、`card`（卡片）、`card.interactive`、`chip`（状态标签）、`btn` 三档（`primary` / `ghost` / `danger`）+ 尺寸档（`sm` / `lg`）、`progress`（进度条）、`stat`（数值块）、`tabs`（分页切换）、`badge`（星级/锁定/变体）、`empty`（空态）。

要求：
- **禁止在 `src/ui/*.js` 里拼 `style="..."` 做配色**（仅允许写布局相关的动态宽度/百分比，如进度条 `width`）。
- 组件必须支持 `:hover` / `:active` / `:focus-visible` / `[disabled]` / `[aria-disabled]` 五态，且禁用态与锁定态视觉可区分。

### C. 主菜单重构（信息架构 + 氛围）

- 由"7 个按钮平铺"改为**分组 + 主次**：
  - 主玩法：`继续 / 闯关（支线任务） / 最终任务 / 排位赛 / 无限模式`（按第 1 期解锁状态显示锁定）
  - 养成与进度：`车库 / 升级车间 / 成就 / 存档`
  - 支持：`你喜欢这个游戏吗`
- 顶部为 Hero 区：标题 + 一行"当前状态摘要"（车辆 / 金币 / 通关进度 / 总星 / 段位 / 无限最佳）。
- 菜单背景为**活体背景**：沿用当前关卡的 Canvas 场景渲染（已有），叠加一层动态渐晕与缓慢流动的光斑，避免静态黑幕的廉价感。
- 焦点默认落在"继续/闯关"，支持方向键 + Enter 操作，Esc 返回面板。

### D. 面板体系重构（数据驱动 + 支线卡片）

- `src/ui/panels.js` 拆分为"数据 → 组件"的渲染器：新增 `src/ui/components.js` 提供 `card()/chip()/grid()/badge()` 等返回 HTML 字符串的纯函数，`panels.js` 只负责取数据与绑定事件。
- **支线任务面板**：12 条支线的卡片墙（场景名 + 主题色描边 + 场景缩略示意 + 完成度 x/6 + 总星），点击展开该支线 6 关的关卡格（锁定 / 星级 / 变体图标 / 坡度 / 三星时限）。72 关不允许一次性全量渲染成一长条。
- 车库 / 成就 / 升级车间 / 存档 / 排位赛 / 无限选图**统一用同一套卡片语言**，并把各自的内联色值迁移到令牌。
- 所有面板必须有**明确的锁定提示**（缺什么解锁条件就写什么），不得出现空面板或死链。

### E. 游戏内 HUD 重构

- 左上信息区改为玻璃卡片：关卡名 + 变体徽标 + 里程进度条 + 限时门倒计时 chip（第 1 期已有倒计时数据，本期只做视觉与层级）。
- 车速改为**仪表化呈现**（速度数字 + 弧形量表 + 速度区间着色），燃料改为带刻度的量表，低量时脉冲提示。
- 状态提示（连招 / 特技 / 摔车 / 机制警告）分级：`info / success / warn / danger`，各自有图标、色与进出场动画；机制警告（危险段超速、限时门紧张）必须是**高优先级且不遮挡视野**。
- HUD 的 Canvas 绘制部分（`hud.js`）全部改为读 `ui-tokens.js`。
- 所有 HUD 元素在 `view.W < 520` 与横屏（`view.H < 480`）下不得重叠、不得被裁切。

### F. 画面质感层（后处理，带画质档位）

新增 `src/render/postfx.js`，在 `scene.js` 的绘制流程末尾追加一次性后处理：

- **渐晕（vignette）**、**色彩分级（按场景主题的暖冷偏移）**、**高速运动拖影/速度模糊**、**景深式远景淡化**、**场景天气覆盖层**（雪/沙/雨/灰烬/雾，数据来自 `THEMES[i].ambient`，第 1 期已声明但未接入）。
- 后处理必须**可降级**：设置里提供 `画质：高 / 中 / 低 / 关`，低档位关闭模糊类效果；移动端与低 DPR 设备默认中档。
- 后处理不得引入逐帧对象分配（复用离屏画布与固定缓冲），且**不得改变物理**（纯视觉层）。
- 必须在 `prefers-reduced-motion: reduce` 下关闭拖影与光斑流动。

### G. 动效与反馈语言

- 面板进出场（`translateY + opacity + backdrop`）统一走令牌时长/缓动；切换面板不得闪白。
- Toast 分为 `info / success / warn / danger` 四型，带图标与进入/退出动画，支持堆叠排队（同屏最多 2 条）。
- 结算（通关 / 失败 / 排位胜负 / 段位变化）使用**结果卡**：星级逐颗点亮动画、金币滚动计数、段位分变化 +Δ/-Δ。
- 全部动效在 `prefers-reduced-motion: reduce` 下降级为"无位移、仅透明度瞬变"。

### H. 可访问性与响应式

- 全部交互元素有 `:focus-visible` 焦点环；面板支持 Tab 遍历与 Esc 关闭。
- 正文文本对比度 ≥ 4.5:1，大字号 ≥ 3:1（由断言按令牌组合校验）。
- 断点：≥1024 / 768~1023 / ≤767 / 横屏矮屏（H<480）四档，每档给出布局规则；触摸目标 ≥ 44×44px。

### I. 无变化（工程铁律）

- **零依赖、零构建**：不引入任何 npm 包、CSS 框架、字体文件、图片资源（装饰仍用 Canvas 矢量绘制）。
- `index.html` ≤ 200 行、无 `<style>` 块、**无内联 `onclick`**；新增结构优先用 JS 动态生成或复用既有容器。
- 分层单向无环不变：`config/core → physics → game → render → ui → main.js`；`game/`、`render/` 永不 import `ui/`。
- 标度纪律不变：本期不涉及 px↔m 换算，但**不得在渲染层引入 `theme === <数字>` 形式的硬编码分支**（延续第 1 期约束）。
- 存档键名与格式**一个都不动**（本期不新增键）。
- 玩法数值、机制参数、物理常量**一律不动**（第 3 期范围）。

## Impact

- **Affected specs**：界面视觉体系（新增）、HUD 与反馈、面板信息架构、画面表现层。
- **Affected code**：
  - 新增 `styles/tokens.css`、`src/config/ui-tokens.js`、`src/ui/components.js`、`src/render/postfx.js`
  - [main.css](file:///c:/Users/1/Documents/GitHub/dale-game/styles/main.css)（令牌化 + 组件层 + 响应式重写）
  - [menu.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/ui/menu.js)（主菜单信息架构 + 键盘导航 + 标题区）
  - [panels.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/ui/panels.js)（支线卡片墙、组件化、去内联配色）
  - [shop.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/ui/shop.js)、[donate.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/ui/donate.js)（组件化）
  - [hud.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/render/hud.js)（玻璃 HUD + 仪表 + 分级提示 + 读令牌）
  - [scene.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/render/scene.js)（接入后处理层）
  - [entities.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/render/entities.js)、[terrain.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/render/terrain.js)、[background.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/render/background.js)（裸色值迁移到令牌）
  - [toast.js](file:///c:/Users/1/Documents/GitHub/dale-game/src/core/toast.js)（分级 + 排队）
  - [index.html](file:///c:/Users/1/Documents/GitHub/dale-game/index.html)（引入 tokens.css、菜单结构调整，仍 ≤200 行）
  - [autotest.mjs](file:///c:/Users/1/Documents/GitHub/dale-game/tools/autotest.mjs)（令牌一致性、内联样式禁令、对比度、面板可开合、后处理可降级等断言）
- **不在本期范围**：物理模型与手感（第 3 期）。

## ADDED Requirements

### Requirement: 设计令牌单一事实来源
系统 **SHALL** 以设计令牌（`styles/tokens.css` 的 CSS 变量与 `src/config/ui-tokens.js` 的 JS 镜像）作为全部颜色的唯一事实来源。两端的令牌**MUST** 逐键等价；渲染层与界面层 **MUST NOT** 各自硬编码同一语义色。

#### Scenario: 令牌双端一致
- **WHEN** 解析 CSS 令牌与 JS 令牌并逐键比较
- **THEN** 两端键集合与取值完全一致（缺失或不等即失败）

#### Scenario: 语义色只在一处定义
- **WHEN** 静态扫描 `src/render/**` 与 `src/ui/**`
- **THEN** 不出现白名单之外的裸色值字面量（`#rrggbb` / `rgba(...)` / `hsl(...)`）

### Requirement: 玻璃拟态组件库
界面 **SHALL** 由一套可复用组件构成（浮层 / 卡片 / 标签 / 按钮 / 进度 / 数值块 / 分页 / 徽标 / 空态），组件 **SHALL** 覆盖常态、悬停、按下、键盘焦点、禁用五种状态。

#### Scenario: 面板只用组件
- **WHEN** 静态扫描 `src/ui/*.js` 生成的 HTML
- **THEN** 不存在用于配色的内联 `style` 属性；布局类动态值（如进度条 `width`）允许

#### Scenario: 键盘焦点可见
- **WHEN** 用 Tab 遍历任意面板
- **THEN** 当前焦点元素有可见焦点环，且 Esc 可关闭面板返回上一级

### Requirement: 主菜单信息架构
主菜单 **SHALL** 按"主玩法 / 养成与进度 / 支持"分组，并 **SHALL** 在 Hero 区展示当前状态摘要（车辆、金币、通关进度、总星、段位、无限最佳）。锁定项 **SHALL** 显示明确的解锁条件。

#### Scenario: 未解锁项的提示
- **WHEN** 玩家在未通关 72 关时点击「最终任务」
- **THEN** 给出"通关全部 72 关后解锁（当前 x/72）"的明确提示，且不进入游戏

#### Scenario: 状态摘要实时
- **WHEN** 结算一关带来金币或星数变化后回到菜单
- **THEN** Hero 区摘要立即反映新数值，无需刷新页面

### Requirement: 支线任务面板
关卡选择 **SHALL** 以"支线卡片墙 → 展开支线内 6 关"的分层方式呈现，**MUST NOT** 一次性平铺全部 72 关。

#### Scenario: 展开一条支线
- **WHEN** 玩家点击"雨林秘境"支线卡片
- **THEN** 展示该支线 6 关的格子（含锁定态、星级、变体图标、坡度、三星时限），并可见返回卡片墙的入口

#### Scenario: 大列表不卡顿
- **WHEN** 打开支线任务面板
- **THEN** 首屏只渲染 12 张支线卡片，渲染耗时与交互无可感知卡顿

### Requirement: 游戏内 HUD 呈现
HUD **SHALL** 以玻璃卡片分层呈现：关卡与变体、里程进度、限时门倒计时、车速仪表、燃料量表。提示 **SHALL** 分级为 `info / success / warn / danger`，且 **MUST NOT** 遮挡车身与前方赛道。

#### Scenario: 危险段警告
- **WHEN** 玩家接近或进入第 1 期定义的危险段且速度高于限速
- **THEN** 出现 `danger` 级高优先级警告，位置在视野边缘，不遮挡车身

#### Scenario: 小屏不重叠
- **WHEN** 视口宽 < 520px 或横屏矮屏（高 < 480px）
- **THEN** HUD 各元素互不重叠、不被裁切，触摸目标 ≥ 44×44px

### Requirement: 画面后处理层
游戏内画面 **SHALL** 提供后处理表现（渐晕、按场景的色彩分级、速度拖影、远景淡化、场景天气覆盖），并 **SHALL** 提供可降级的画质档位。

#### Scenario: 切换画质档位
- **WHEN** 玩家把画质从"高"切到"低"
- **THEN** 模糊类效果被关闭、帧率提升，且画面仍可正常游玩；该设置被持久化

#### Scenario: 后处理不改变物理
- **WHEN** 在相同输入下分别以"高"与"关"两档跑同一关卡
- **THEN** 车身轨迹与用时完全一致（后处理为纯视觉层）

### Requirement: 动效与反馈语言
系统 **SHALL** 统一动效时长与缓动令牌，面板 **SHALL** 有进出场过渡，结算 **SHALL** 使用结果卡（星级逐颗点亮 / 金币滚动 / 段位分变化）。系统 **SHALL** 尊重 `prefers-reduced-motion`。

#### Scenario: 减少动效
- **WHEN** 系统设置为 `prefers-reduced-motion: reduce`
- **THEN** 位移类动画与拖影、光斑流动被关闭，仅保留透明度瞬变，功能不受影响

#### Scenario: 通关结果卡
- **WHEN** 玩家抵达终点并结算
- **THEN** 出现结果卡，星级逐颗点亮、金币滚动计数，随后可一键进入下一关或返回菜单

### Requirement: 界面可访问性
全部交互元素 **SHALL** 有键盘焦点样式，正文文本对比度 **SHALL** ≥ 4.5:1（大字号 ≥ 3:1），**SHALL** 提供 `aria-label` 或等价语义。

#### Scenario: 对比度校验
- **WHEN** 用令牌中的文本色与表面色两两组合计算对比度
- **THEN** 正文级组合全部 ≥ 4.5:1，未达标组合不得用于正文

#### Scenario: 纯键盘完成一局
- **WHEN** 玩家只用键盘（方向键 + Enter + Esc）
- **THEN** 可从菜单进入支线、选择关卡、暂停、结算后返回菜单，全程无需鼠标

## MODIFIED Requirements

### Requirement: 界面样式组织方式
界面样式 **SHALL** 由"令牌 + 组件"两层组织：`styles/tokens.css` 只定义变量，组件样式与布局从令牌取值，**MUST NOT** 出现脱离令牌的字面色值。`index.html` **SHALL** 保持 ≤ 200 行、无 `<style>` 块、无内联 `onclick`。

（原状态：样式集中在 `styles/main.css`，色值字面量散落在 CSS 与 `src/ui/*.js` 的内联 `style` 字符串中，两处并行维护。）

### Requirement: 关卡选择面板
关卡选择 **SHALL** 从"72 关单层网格"改为"支线卡片 + 支线内关卡格"的分层结构，并保留原有的锁定规则、星级展示与变体标识。

（原状态：`renderLevelsPanel()` 把 `LEVELS.map(...)` 全部格子一次性铺在 `#lvGrid` 中。）

## REMOVED Requirements

### Requirement: 平铺式关卡网格
**Reason**：72 关平铺导致面板冗长、层级缺失，与"支线"玩法模型不匹配。
**Migration**：保留 `levelCell` 的能力（锁定/星级/变体/坡度），迁移为支线卡片内的关卡格；旧的 `#lvGrid` 单层结构不再使用。
