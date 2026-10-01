# 交接说明 · expand-content-and-rebalance-economy

> **下一个 Agent 先读这一份。** 它记录了"已经做完了什么、为什么这么做、还剩什么、
> 哪些坑不要再踩"。三份规范文档（spec / tasks / checklist）是需求与验收口径，
> 本文件是**实现细节与上下文**，两者配合使用。
>
> 最后更新：2026-10-02

---

## 0. 三十秒上手

```bash
node tools/test-all.mjs        # 全量体检（约 2 分钟）
node tools/_serve.mjs          # 起本地服务 → http://localhost:8765
```

浏览器控制台执行 `localStorage.setItem('bike_trial','1'); location.reload()`
可解锁**全部车辆 + 200 万金币**，用来快速体验高价车与终极形态。

---

## 1. 本次已完成的改动

### 1.1 用户报的 4 个 Bug（都已修）

| Bug | 根因 | 修在哪 |
|---|---|---|
| **大额金币刷新后归零** | `String(Infinity)` → 落盘 `"Infinity"` → `parseInt` 得 `NaN` → `intOr` 兜底 **0**。另有 `1e21` → `"1e+21"` → `parseInt` 得 **1** | `constants.js` 新增 `safeGold()`/`GOLD_MAX`；`storage.js` 的 `intOr` 改用 `Number()`；`save()` 写盘前夹紧+取整；`addGold` 入口夹紧 |
| **升级车间手机端溢出** | `#shop` 是 `position:absolute; inset:0` + `justify-content:center` 且**不可滚动**。内容高于屏幕时上下同时溢出，**上半部分永久滚不到** | `styles/main.css`：`absolute`→`fixed`（视口锚定）、加 `overflow-y:auto`、`center`→`flex-start`、`.upItm` 宽度改 `min(360px,100%)` |
| **「立即购买并使用」按钮太小** | 购买入口只有卡片右上角那行价格文字，既小又不是按钮 | `ui/panels.js` 新增 `buyBlock()` / `buyVehicleNow()`，渲染独立按钮（min-height 48px / min-width 120px）+ 差额提示；`styles/main.css` 加 `.buyNow` |
| **升级没感觉** | 见下面 1.2 | `constants.js` / `physics/bike.js` / `ui/shop.js` |

### 1.2 「升级没感觉」的三个根因（已修）

1. **引擎升级不抬扭矩曲线的转速上限。**
   `torqueAt` 在 ω > w0×3.2 归零，而 `w0 = TORQUE_RPM_BASE × veh.rpm` **与升级无关**
   → 直线极速被钉死在 691px/s（18×1×3.2×12）。实测 Lv0→Lv100 只快 15%~32%。
   **修法**：`deriveHandling` 新增返回 `rpmK = 1 + ENGINE_RPM_UP × engine`（Lv100 ≈ ×2.8）。

2. **HUD 表盘满量程在说谎。**
   `MAXV` 过去由 `MAXV_BASE + 2.5·engine + 1.5·tire` 算出，满级涨 2.7 倍，
   而真实极速只涨 32% → 升完级指针反而越走越低（Lv25 就顶格），相机也不再前推。
   **修法**：新增 `topSpeedOf(veh, up)`，用二分法求「扭矩曲线 vs 空气阻力+滚动阻力」的交点，
   `MAXV` 直接取它。**表盘满量程 = 真能跑到的速度。**

3. **升级买到的是翻车。**
   驱动扭矩经悬挂把车架向后掀，重力绕后接地点的恢复力矩只有 `mTot·g·WHEELBASE/2`。
   扭矩越过它就必然后空翻。
   **修法**：提取共享常量 `WHEELIE_K`（系数 2.0）+ `wheelieTauOf(mTot, GRAV)`，
   `physics/bike.js` 的实际限幅与 `topSpeedOf()` 的解算**引用同一个常量**
   —— 两处各算一份的话，表盘按未限幅扭矩标定而实车被限死（实测满级只有 29%~63%）。

**效果**：山地车 1 秒末速度 336 → 607 px/s（+81%），越野车 267 → 623 px/s（+133%）。

另外：升级费用从 28250/项降到约 7060/项；商店每项直接显示
"极速 24.9 → 25.3 km/h"式真实差值（与物理层同源），买完 toast 播报变化。

### 1.3 内容扩容

| 项 | 改动 | 位置 |
|---|---|---|
| 场景 | 12 → **36** 套（手写新增 24 套，独立 sky/celestial/ridges/cloud/surface/ambient/deco） | `config/themes.js` |
| 关卡 | 6 关/场景 → **12** 关/场景，72 → **432** 关 | `config/levels.js` |
| 支线 | 12 → **36** 条，i 严格绑定 `THEMES[i]`；前 12 条手写，第 13~36 条**由 THEMES 派生** | `config/levels.js` |
| 变体 | 特殊变体关位 `[2,4,6,8,10]`（导出为 `SPECIAL_SLOTS`），5 种特殊变体各出现 36 次 | `config/levels.js` |
| 存档 | 版本 3 → **4**，星级数组 72 → 432 项 | `core/storage.js` |
| 金币 | 通关固定 280→1000、赛道金币数 24→72、单枚面值 30→60，均随进度递增 | `levels.js` / `game.js` / `world.js` |
| 排位赛 | 新增金币：胜 = 500 + rating×0.25，负 = 150 | `constants.js` `rankGold()` / `game.js` |
| 终局车 | 新增「奇点号」，350 km/h、摔不坏、价格最贵 | `config/vehicles.js` |

**实测**：前 36 关按 60% 收集率累计 28,614 金币（入门车四项升满需 28,240，达标）；
432 关一轮约 867,668；关卡生成耗时 681ms（预算 800ms 内）。

---

## 2. 关键实现细节（照着抄即可）

### 2.1 `topSpeedOf(veh, up)` —— 表盘满量程的唯一来源

```js
// config/constants.js
export function topSpeedOf(veh, up) {
  const peak = TORQUE_PEAK_BASE * p.torque * (1 + ENGINE_TORQUE_UP*eng + TIRE_TORQUE_UP*tire);
  const rpmK = 1 + ENGINE_RPM_UP * eng;
  const mu   = FRICTION_BASE * veh.grp * (1 + FRICTION_TIRE_UP * tire);
  const grip = mu * mTot * GRAV_BASE * REAR_LOAD;      // 摩擦上限：只有后轮被驱动
  const roll = ROLL_RES_K * mTot * GRAV_BASE;
  const tauCap = wheelieTauOf(mTot, GRAV_BASE);       // ★ 必须计入翘头限幅
  const avail = v => Math.min(Math.min(torqueAt(veh, v/WHEEL_R, 1, peak, rpmK), tauCap)/WHEEL_R, grip);
  const loss  = v => AIR_DRAG_K * v*v + roll;
  // avail 随 v 单调不增、loss 随 v 单调增 ⇒ 交点唯一，二分 40 次即可
}
```

### 2.2 翘头限幅 —— 两个物理现象共用一个常量

```js
export const WHEELIE_K = 2.0;           // 系数 1 = "刚过恢复力矩就翻"，对轻车太狠
export const wheelieTauOf = (mTot, GRAV) => mTot * GRAV * WHEELBASE * 0.5 * WHEELIE_K;
```

消费点只有两处，**必须同源**：`topSpeedOf()`（算表盘）、`applyDrive()`（实际限幅）。

### 2.3 切向摩擦冲量必须"子步累计"

`solveContacts` 里摩擦冲量按**累计量**限幅（`bike.fricAcc`），每轮迭代只施加增量：

```js
let dJ = (-slip) / (W.im + WHEEL_R*WHEEL_R/IW);
if (acc0 + dJ < -mu*Jn) dJ = -mu*Jn - acc0;
else if (acc0 + dJ >  mu*Jn) dJ =  mu*Jn - acc0;
b.fricAcc[wk] = acc0 + dJ;
```

不累加的话，打滑饱和时一轮迭代能叠加 `SOLVER_ITERS` 份满摩擦力。

### 2.4 特殊模式按 `ultra.mode` 字符串分派

`physics/bike.js` 的 `activeMode()` 是**唯一**分派入口。已有 7 种：

| mode | 效果 | 实现要点 |
|---|---|---|
| `stable` | 贴地、永不腾空、摔车无效 | `pinToGround()` 钉住轮/轴 |
| `surge` | 红线与极速暴涨 | `rpmK *= 8`、`airDragK *= 0.1` |
| `shield` | 摔车免疫，保留腾空 | 并入 `isCrashImmune()` |
| `phase` | 摔车免疫 + 燃料无限 + 危险段豁免 | 同上 + fuel/hazard 分支 |
| `railgun` | 推力与红线同时暴涨 | `torquePeak *= 2.2`、`rpmK *= 12.8` |
| `warp` | 持续推力冲量 | 复用 `warp` 伺服块 |
| `absolut` | 350 km/h + 永久摔不坏，**免解锁** | `ultra.builtin: true` |

加新车只需在 `vehicles.js` 挂一个 `ultra.mode`，**物理层不用改任何 if**。

---

## 3. ⚠️ 踩过的坑（不要再踩）

### 3.1 究极终局车「绝对形态」——三次返工才对

| 尝试 | 结果 |
|---|---|
| **速度伺服**（`applyDrive` 里直接把整车速度钳到目标） | ❌ 绕过整条传动链 → 刹车锁死 / 打滑率 / 场景抓地缩放（冰面 μ 是绿野 0.62 倍）三条不变式同时失效，**一次打挂 15 项断言** |
| **抬高翘头限幅 30 倍** | ❌ 限幅*就是*防后空翻的机制，放宽=车直接翻。满级只跑到 12 km/h |
| **`rpmK` ×60 抬红线** | ❌ 摩擦上限刹不住车轮，后轮空转到 ωR = **73,364 px/s**，再打挂 3 项 |
| ✅ **保留完整传动链 + 叠加一份推力** | 330 km/h（表盘 94%），摔不坏，0 兜底触发，0 NaN |

**最终实现要点**：
- 附加推力与「光子跃迁」共用一个代码块，但**上限不同**：
  `warp` 用 `WARP_V_CAP`（90，按整秒标定）；`absolut` 用 `grip × ABSOLUT_THRUST_K`
  （**与可用抓地成比例**，这样冰面 μ 低 → 推力小 → 冰面极速仍然更低）。
- ⚠️ **绝对不能给 absolut 套 `WARP_V_CAP`**：那个值除以子步长只剩 0.25px/子步，
  会把推力掐掉万分之一（实测极速直接掉到 36%）。
- 风阻必须**调小**到 `ABSOLUT_DRAG_K = 1.3e-4`（默认 0.0026 的 1/20），
  否则 9722 px/s 处减速约 7.8 万 px/s²，任何驱动力都顶不住，会变成"冲一下就掉速"。
- `NUM_CAP_V` 从 6000 抬到 **20000**：350 km/h 时一帧走 162px = 4.3 个轴距，
  车轮在两次接触采样间跨过整段地形（穿透峰值 11~15px，容差只有 2px），
  接触解算会注入巨大冲量。这是 **60Hz 固定步长的分辨率极限**，不是数值发散。

### 3.2 奇点号已被排除出"常规标定扫描"

`tools/audit-physics.mjs` 里新增：

```js
const STD_VEHICLES = VEHICLES.filter(v => !(v.ultra && v.ultra.builtin));
```

原因是那些断言都按 ≤1200 px/s 标定，与 350 km/h 结构性冲突。
**强行放宽阈值会把真正的低速回归一起放过**，所以是"分出来"而不是"改阈值"。

### 3.3 车辆参数的三条硬约束（改数值前必读）

1. `phys.mass` 全表两两不同、`phys.inertia` 两两不同（`autotest` 断言）
2. `|air × inertia − 1| ≤ 0.05`（空中角冲量与惯量互为倒数）
3. **`grp` 不要超过 2.2**：奇点号曾设 3.2，μ 达 5.9 → 轮胎永远不突破摩擦极限 →
   冰面打滑 / 滑移率 / 无动力滑行纯滚动**一整套断言全部归零**（实测滑移率 0.000）
4. `phys.torque ≤ 2.0`：越高越容易后空翻（顶穿翘头限幅）

---

## 4. 断言维护纪律（本次扩容踩得最多）

关卡从 72 → 432 后，**大量断言是"写死了旧规模"而不是"逻辑坏了"**。
本次已改成从配置派生的：

| 断言 | 改成 |
|---|---|
| `seenSlope[71]`（旧末关下标） | `seenSlope[seenSlope.length - 1]` |
| `N_BRANCHES === 12` / `每支线 6 关` / `LEVELS.length === 72` | 从 `N_BRANCHES` / `LEVELS_PER_BRANCH` 派生 |
| `bike_v` 合法值 `=== "3"` | `parseInt(v) >= 2`，dft 比 `CUR_VER` |
| `CUR_VER` | 从 `storage.js` **导出** |
| 物理扫描的取样关卡 `[2,30],[40,58],[65,71]` | `vehLvOf(vi)` 按**难度分位**取（见下） |
| `HZ_IDX = 40`（写死，432 关下那关没危险段 → autotest 崩） | 遍历找出**确实有 `world.hazards`** 的关 |
| 前沿支线测试的 `[...Array(12)]` / `Array(72)` | `LEVELS_PER_BRANCH * 2` / `LEVELS.length` |
| 变体布局的"第 3、5 关" | `SPECIAL_SLOTS.includes(k)` |
| 新增媒体查询 | 同步登记进 `tools/audit-a11y.mjs` 的 `EXPECT_MEDIA` |

**`makeLevel` 的难度是 `gN = gi / (TOTAL - 1)`** —— 关卡总数一变，
**所有写死的关卡下标都会平移到不同的难度带**。测试取样必须按难度分位，不能写死下标：

```js
const vehLvOf = (vi) => {
  const n = LEVELS.length;
  const q = [0.08, 0.34, 0.62, 0.9][vi % 4];
  const r = [0.2, 0.75][vi % 2];
  return [Math.floor(n*q*r), Math.floor(n*q*(0.55 + r*0.45))];
};
```

---

## 5. 两个顺带修掉的数据丢失 Bug

1. **版本迁移清零段位分**：`loadSave` 的迁移分支里 `save()` 会委托 `saveProgress()`，
   把 `store.progress.rating` 原样写回 —— 而此刻它还是模块初始的 **0**。
   玩家升级版本号后攒的段位分与累计统计会被清空。
   **修法**：迁移分支里**先 `loadProgress()` 再 `save()`**。
2. **被 catch 吞掉的 ReferenceError**：`storage.js` 外层有个 `try { … } catch { /* 用默认值继续 */ }`，
   里面一个函数改名后的残留调用会让 `loadSave` **中途夭折**（后续键全不读）。
   改这类文件时改完一定要跑 `node tools/test-all.mjs` 看 `audit-save` 的逐键体检。

---

## 6. GitHub Pages 的 URL 路由（**待办，未实现**）

用户需求：「服务要做 URL 路由，不然一刷新就没了」。

### 结论：GitHub Pages **不支持** clean URL（history 模式）路由

GitHub Pages 是纯静态托管，没有服务端 rewrite 规则：
- `https://user.github.io/repo/play/level/12` 这种路径刷新后 → **404**
- 但 `#` 哈希路由**永远可用**（哈希不会发给服务器）

### 推荐做法：hash 路由（改动最小、零配置）

1. **URL 形态**：`index.html#garage` / `#shop` / `#level/12` / `#race`
2. **状态来源**：真正的状态其实已经在 `localStorage` 里
   （`bike_sel` 存当前关卡、`bike_veh` 存当前车辆），
   所以"刷新丢失"只是**界面回不到原页**，不是数据丢失。
   → hash 路由只需负责把面板名与关卡下标编码进 URL。
3. **接入点**（都在 `src/ui/`，互不依赖，可独立改）：
   - 打开面板：`ui/menu.js` 的 `showPanel` / `ui/panels.js` 的 `showPanel`
   - 关闭面板：`closePanel` / `hidePanel`
   - 启动读 URL：`src/main.js` 首屏（检测 `location.hash` 并恢复）
   - 监听 `hashchange` → 切面板（注意别与"程序内切面板"形成回环）
4. **落点建议**：不要散落到各处。新建 `src/ui/router.js`，导出
   `routeTo(name, arg)` / `currentRoute()` / `startRouter(onRoute)`，
   由 `main.js` 统一接线。
5. **备选（若将来换到支持 rewrite 的平台，如 Vercel/Netlify/自建 Nginx）**：
   history 模式 + 一份 `404.html` 兜底把任意路径重写到 `index.html`，
   并在 `index.html` 里加 `<base href="/repo/">`。
   GitHub Pages 上这条路走不通，**不要在 GitHub Pages 上试**。

### 验收口径
- 打开 `#garage` → 刷新 → 仍停在车库面板
- 打开 `#level/12` → 刷新 → 仍选中第 12 关
- 手输 `#shop` 直接访问 → 能进升级车间
- 不带 hash 打开 → 正常进主菜单（hash 为空不是错误）