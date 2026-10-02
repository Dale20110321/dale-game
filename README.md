<div align="center">

# 🚲 自行车越野 · 真实物理版

**在线试玩** → https://dale20110321.github.io/dale-game/

[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f.svg)](LICENSE)
[![Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-3b82f6.svg)](https://dale20110321.github.io/dale-game/)
![dependencies](https://img.shields.io/badge/dependencies-0-success.svg)
![build](https://img.shields.io/badge/build-none-blueviolet.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-ES%20modules-yellow.svg)
![Canvas](https://img.shields.io/badge/render-Canvas%202D-orange.svg)

原生 JavaScript + Canvas 写的物理越野自行车游戏。**零依赖、零构建**，克隆下来打开网页就能玩。

[怎么玩](#怎么玩) · [游戏里有什么](#游戏里有什么) · [本地跑起来](#本地跑起来) · [部署](#部署到-github-pages) · [改代码](#想改点什么) · [测试](#跑测试)

</div>

---

## 怎么玩

| 按键 | 作用 |
|---|---|
| `→` / `D` | 踩油门 |
| `←` / `A` | 刹车 |
| `↓` / `S` | 倒车（先当刹车用，停稳后才挂上倒挡） |
| 空中 `←` / `→` | 调整车身姿态，决定落地是压平还是翻车 |

**没有跳跃键。** 想腾空只能靠冲上坡顶甩出去 —— 所以"什么时候松油门"比"按什么键"重要得多。

移动端直接触屏操作，左下角是虚拟按键。

---

## 游戏里有什么

**36 个场景 × 12 关 = 432 关**，外加一个最终任务。玩法有闯关、比赛、排位赛（普通 / 高级）、无限模式（登顶后可自选场景）四种。

每关的地形都是当场算出来的：先按难度挑一组地貌气质，再撒随机种子决定波长、相位、断层落点，最后实测一遍最大坡度、缩放到目标值。所以**同一关每次重玩的起伏细节都不一样，但难度是稳定的**。

**26 辆车，分 5 档**（普通 → 稀有 → 史诗 → 传说 → 神话）。越贵越快、越贵升级越贵、越贵解锁"最终形态"越贵。除了免费的新手车，每辆车都有一个专属形态：贴地锁死、极速过载、摔不坏、燃料无限、轨道炮、持续喷射……最后一辆「奇点」是终局目标，350 km/h 且怎么摔都摔不坏。

**钱从哪来**：通关固定奖励（后期关更多）+ 赛道上的金币 + 排位赛奖金。一轮 432 关全通大约 210 万，前 36 关就能把一台入门车升满。

---

## 本地跑起来

零依赖，**但需要一个静态服务器**（ES module 不能用 `file://` 直接打开）：

```bash
node tools/_serve.mjs      # 然后打开 http://localhost:8765
```

或者用任何你顺手的静态服务器：

```bash
python -m http.server 8765
npx serve .
```

### 想直接看所有车？

浏览器控制台执行这一行，刷新即可解锁全部车辆和 200 万金币：

```js
localStorage.setItem('bike_trial', '1'); location.reload()
```

删掉 `bike_trial` 这个键就恢复正常规则。

---

## 部署到 GitHub Pages

推上去之后进仓库 `Settings → Pages`，Source 选 `Deploy from a branch`，
分支 `main`、目录 `/ (root)`，保存即可。**不需要任何构建步骤。**

访问地址：https://dale20110321.github.io/dale-game/

> **想用干净的 URL（`/garage` 而不是 `/#garage`）？**
>
> GitHub Pages 是纯静态托管，没有服务端 rewrite，`/garage` 刷新会 404。
> 想做到"刷新后停在原页面"，只能用 **hash 路由**（`index.html#garage`）——
> 哈希不会发给服务器，所以它在 GitHub Pages 上一定可用。
>
> 好消息是游戏状态本来就存在 localStorage 里（当前关卡、当前车辆都存了），
> 所以刷新丢的只是"回到哪个面板"，进度不会丢。真要做的话，
> 加一个 `src/ui/router.js` 导出 `routeTo / currentRoute / startRouter`，
> 由 `main.js` 统一接线，不用动其它文件。

### 想生成一个可以双击游玩的单文件？

```bash
build.bat          # 需要 bun，产出 dist/game.bundle.js
```

日常开发不需要这一步，`index.html` 直接加载 `src/main.js`。

---

## 想改点什么

```
src/
├── config/          ← 数据都在这，改数值不用碰逻辑
│   ├── constants.js    所有物理常量 + 升级/金币公式的唯一出处
│   ├── vehicles.js     26 辆车的数据
│   ├── levels.js       432 关的生成规则 + 地貌体格
│   └── themes.js       36 套场景主题
├── physics/         物理内核：刚体、接触、悬挂、动力链
├── render/          Canvas 绘制
├── ui/              菜单、车库、升级车间、结算等界面
├── game/            关卡流程、结算、进度
└── core/            存档、输入、工具
```

**三条最容易踩的规矩：**

1. **物理量只能在 `config/constants.js` 里换算。**
   别处写 `* 6` 这类魔法数，标度一旦分裂，HUD 显示的和实际跑的对不上，排查起来非常痛苦。

2. **加车只要在 `vehicles.js` 里加一条，然后挂一个 `ultra.mode`。**
   七种形态（`stable` / `surge` / `shield` / `phase` / `railgun` / `warp` / `absolut`）
   在物理层各有一段实现，新车**不需要改任何 `if`**。

3. **改地形难度前先读 `levels.js` 的文件头注释。**
   坡度不是直接给的，而是"生成 → 实测 → 反解缩放系数"得到的，
   绕过这一步直接改振幅会让难度曲线断掉。

### 车辆数据里的几条硬约束

`vehicles.js` 里有几条看起来莫名其妙的限制（`mass` 必须两两不同、
`air × inertia` 必须等于 1、`grp` 不能超过 2.2），都是被物理逼出来的，
改数值前先看那里的注释再动手。

---

## 跑测试

```bash
node tools/test-all.mjs
```

约 2 分钟，4.5 万项检查，覆盖物理不变量、存档健壮性、渲染、无障碍、UI。

| 套件 | 查什么 | 套件 | 查什么 |
|---|---|---|---|
| `autotest` | 聚合断言 | `audit-core` | 核心模块 |
| `audit` | 逐项体检 | `audit-game` | 关卡流程 |
| `audit-physics` | 物理 | `audit-save` | 存档 |
| `audit-render` | 渲染 | `audit-ui` | 界面 |
| `audit-a11y` | 可访问性 | `mutate` | 变异测试 |

改完代码跑一次。**别为了让测试变绿而直接改阈值** —— 先确认是代码坏了，
还是断言自己过期了。

---

## 致谢

物理模型的取舍（哪些是真算了、哪些为了求解器稳定做了简化）都写在 `levels.js`
和 `bike.js` 的注释里。这个游戏最有意思的部分不是玩法本身，
是"想让某个手感成立，得先把物理调到那个手感上去"的过程。

## 📜 License

[MIT](LICENSE)