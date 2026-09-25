# 🚲 自行车越野 · 真实物理版

原生 JavaScript + Canvas 实现的物理越野自行车游戏，**零依赖、零构建**，打开网页即玩。

- 没有跳跃键：靠坡度冲起腾空，空中用 `←/→` 调整车身姿态落地
- 三质点刚体物理：油门翘头 / 刹车栽头 / 坡顶腾空 / 落地缓冲 / 陡坡打滑都是"算出来"的
- 20 关闯关、与 AI 竞速、无限模式；金币、升级车间、车库、成就、打赏、移动端触摸操作

## 🎮 操作

| 按键 | 作用 |
|---|---|
| `→` / `D` | 加速（空中：顺时针转体 = 前空翻） |
| `←` / `A` | 刹车（空中：逆时针转体 = 后空翻） |
| `P` / `Esc` | 暂停 / 继续 |
| `R` | 重开当前局 |
| `U` | 升级车间 |
| `M` | 静音开关 |
| `+` / `-` | 缩放视野 |

手机/平板：右下角 `🎮` 可切换屏幕方向键，右上角 `⛶` 全屏。

## 🚀 运行

本项目使用 **原生 ES Module**，浏览器出于安全策略**不允许**用 `file://` 直接打开模块（会报 CORS 错误），
所以本地运行需要一个静态服务器（任选其一）：

```bash
# 方式 1：Python（推荐，随系统自带）
python -m http.server 8000
# 然后浏览器打开 http://127.0.0.1:8000/

# 方式 2：Node
npx serve .
```

## 🌐 部署到 GitHub Pages

推送到 GitHub 后，进入仓库 `Settings → Pages`，把 **Source** 设为 `Deploy from a branch`，
分支选 `main`、目录选 `/ (root)`，保存即可。无需任何构建步骤（没有打包、没有依赖）。

访问地址：`https://<你的用户名>.github.io/<仓库名>/`

## 📁 目录结构

```
.
├── index.html            # 只有 DOM 骨架（约 120 行）
├── styles/main.css       # 全部样式
├── assets/qr.png         # 打赏二维码（可替换/删除）
├── src/
│   ├── main.js           # 入口：装配模块 + 启动固定步长主循环
│   ├── config/           # 纯数据与地形数学（常量/主题/车辆/关卡）
│   │   ├── constants.js  #   ★ 标度唯一事实来源（px↔m、px/s↔km/h、物理系数）
│   │   ├── themes.js     #   4 种主题：绿野 / 雪原 / 荒漠 / 月面（重力、抓地不同）
│   │   ├── vehicles.js   #   3 辆车：山地车 / 竞速车 / 越野车
│   │   └── levels.js     #   20 关参数 + 地形函数 + 真实坡度测量
│   ├── core/             # 运行时基础设施
│   │   ├── store.js      #   共享可变状态（唯一容器，避免循环依赖）
│   │   ├── loop.js       #   固定步长累加器（1/60 s）
│   │   ├── canvas.js     #   画布/视口/DPR
│   │   ├── input.js      #   键盘/触摸/全屏
│   │   ├── audio.js      #   WebAudio 合成音效
│   │   ├── storage.js    #   localStorage 存档
│   │   ├── toast.js      #   屏幕提示
│   │   └── utils.js      #   clamp/lerp/伪随机等
│   ├── physics/          # 物理
│   │   ├── terrain.js    #   地形访问层
│   │   ├── bike.js       #   三质点刚体（约束/腾空/落地/摔车）
│   │   └── fuel.js       #   燃料
│   ├── game/             # 玩法
│   │   ├── game.js       #   状态机与结算
│   │   ├── world.js      #   金币/油罐/加速带/装饰
│   │   ├── race.js       #   AI 竞速
│   │   ├── stats.js      #   里程/滞空/特技结算
│   │   └── progress.js   #   金币与成就
│   ├── render/           # 渲染
│   │   ├── scene.js      #   一帧的总装
│   │   ├── background.js / terrain.js / bike.js / entities.js
│   │   ├── particles.js / camera.js / hud.js
│   └── ui/               # 界面
│       ├── menu.js / panels.js / shop.js / donate.js
├── tools/autotest.mjs    # 无头自动测试（Node 运行，不需要浏览器）
└── .specs/               # 规范驱动开发的 spec/tasks/checklist 文档
```

依赖方向是单向的（无循环依赖）：

```
config/ + core/  →  physics/  →  game/  →  render/  →  ui/  →  main.js
```

`game/` 永不 `import` `ui/`：界面动作通过 `initGame(presenter)` 注入，因此模块图是严格无环的。

## 🧪 自动测试

```bash
node tools/autotest.mjs            # 跑全部测试
node tools/autotest.mjs --modules  # 只检查 33 个模块能否加载
node tools/autotest.mjs --diag=19  # 单关诊断（逐 5 秒打印位置/速度/摔车次数）
```

它会用 DOM 打桩加载**真实游戏代码**（不是模拟），然后验证：

- 33 个模块全部可加载（无循环依赖 / 初始化报错）
- 20 关"全油门 + 空中姿态修正"自动试跑**全部到达终点**，并打印每关用时
- 物理/油耗/计时与刷新率无关：`dt=1/60`、`1/120`、`1/144` 下 20 秒的位移差 `0.0000px`
- 落地冲击分级单调、≥0.9s 滞空可完成一圈空翻、倒立落地会摔车
- AI 与玩家速度同量级（比值 ≈0.89）、翘头里程 8m/8m、面板坡度与实测偏差 <0.1°
- 存档键名与历史版本一致、作弊键 `T` 已移除、暂停时 `R` 可重开

## 🎯 开发须知（标度纪律）

所有速度/距离换算集中在 `src/config/constants.js`：

| 量 | 约定 |
|---|---|
| 世界标度 | **100 px = 1 m** |
| 车速 | `px/s`，`toKmh()` 换算显示 |
| 物理步长 | 固定 `DT = 1/60 s`，每步 6 个子步；子步位移 × `SUBV` = 真实 px/s |
| 极速 | 平路 `MAXV`，下坡允许到 `1.35 × MAXV` |

> 历史教训：早期版本做过一次"速度标度重构"但只改了物理，渲染/AI/特技/粒子里残留了 6~7 处
> 旧常数（`*SUB`、`260*SUB`、`MAXV/SUB`…），造成"代码在、功能死"的假功能。
> 因此现在**任何阈值都必须写成真实 px/s**，禁止裸换算。

## 💾 存档

使用 `localStorage`（键名前缀 `bike_`）：金币、每辆车独立的升级等级、解锁关卡、星级、车辆、
静音、无限模式最佳成绩、成就。清空浏览器数据会重置存档。

## 📜 License

MIT
