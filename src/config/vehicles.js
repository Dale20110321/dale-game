// 车辆数据：差异化旋转 / 油箱 / 抓地 / 重量
// color 同时用于车架主色、骑手服条纹、关卡面板边框
//
// phys：数据化的物理参数。质量与转动惯量是**真参数**（参与求解），
// 不再只是乘到加速度/极速上的倍率。
//
// 车辆属性键（speed 极速 / grip 抓地 / weight 质量 / airRot 空中转体 / fuel 油箱）
// 是**派生层**参数；真正参与求解器的是下面 phys 里的 mass / inertia / torque / rpm。
// 改名自早期的 drv/spd/grp/wgt/air/tank —— 其中 drv 已删除：它只用于车库展示，
// 且与物理实际读取的 phys.torque 在 26 辆里有 8 辆对不上（终局车显示 240%、实际 300%）。
//   mass     相对质量（求解器按逆质量加权）：重车更难被推动、更难翘头
//   inertia  相对转动惯量：空中角冲量 → 角速度 ω ∝ 1/inertia（与 airRot 互为倒数，断言约束）
//   suspK/C  悬挂刚度 / 阻尼倍率；travel 悬挂行程上限（px）
//   torque   发动机扭矩峰值倍率；rpm 扭矩峰值转速倍率
/**
 * 派生层物理参数。
 *
 * ★ `wheelieK` / `wheelieUp` 是**翘头限幅的逐车标定**（见 constants.js 的 wheelieMulOf）：
 *   wheelieK = 该车固有的抗翘头能力，wheelieUp = 随车架等级从 0 线性涨到满级的增量。
 *   二者决定了裸车极速（wheelieK 决定 Lv0，wheelieK+wheelieUp 决定满级），且是
 *   "买这辆车能不能在宇宙场跑得动"的唯一决定项。缺省缺省 → 普通车行为逐字节不变。
 */
const P = (mass, inertia, suspK, suspC, travel, torque, rpm, wheelieK, wheelieUp) =>
  ({ mass, inertia, suspK, suspC, travel, torque, rpm, wheelieK, wheelieUp });

/**
 * 形态规格（纯表现层，render/bike.js 消费）。
 *
 * ★ 铁律：`WHEEL_R / WHEELBASE / SEAT_H` 是**物理常量**（进转动惯量公式），
 *   形态再怎么区分也不能改它们。这里改的全是"同一物理包络之内的样子"：
 *   胎宽 / 辐条 / 管径 / 上管坡度 / 车把 / 坐垫 / 骑手伏低程度。
 *   轮子的**外缘半径三辆车都是 WHEEL_R**（外胎只是描得更粗，中心线不动），
 *   所以换车只换样子，轮胎既不会穿地也不会浮空，物理逐位不变。
 *
 * pose  骑手姿态偏移（px）：肩/头的位移决定"伏"还是"直"，车把位移决定手往哪儿够
 * bar   车把形态：flat 平把 / drop 弯把（公路车）/ wide 直把（越野车）
 * coil  悬挂弹簧幅度；0 = 刚性前叉（公路车本来就没有避震）
 */
const POSE = (shX, shY, hdX, hdY, barX, barY) => ({ shX, shY, hdX, hdY, barX, barY });
const ART = (o) => Object.assign({
  tire: 3,        // 外胎线宽（px）
  rim: true,      // 是否画内圈（细胎高轮不画）
  spokes: 6,      // 辐条数
  spokeW: 1.6,    // 辐条线宽
  tube: 4,        // 车架管径
  topDrop: 2,     // 上管前端相对座管顶的下沉（正 = 更低）
  coil: 1,        // 悬挂弹簧幅度
  bar: "flat",
  saddleW: 10,    // 坐垫宽
  helmR: 4.4,     // 头盔圆顶半径
  peak: true,     // 是否有前檐
  vents: 1,       // 通风槽数量
  pose: POSE(0, 0, 0, 0, 0, 0),
}, o);

/**
 * ★ 形态数值的标定口径（改之前先读这段）
 *
 * fx 里的数字不是"想要多猛就写多猛"。这版物理有一个**既有的脆弱点**：
 * 把驱动力顶到翘头临界以上，车会后空翻出去（满级按住不放，26 辆里有 16 辆会翻）——
 * 这是"松油门比按什么键重要"的核心手感，本来就该如此，但它的余量比看上去小：
 * 抓地一旦被抬到 μ≈3，满级银箭挂形态后每 2 秒翻一次，同一辆车裸车 30 秒零摔车。
 *
 * 所以这里的取值守两条线：
 *   1. **不给形态加绝对抓地下限**（gripMin）。绝对 μ 抬高 = 驱动力直接越过翘头临界。
 *      抓地只以**倍率**形式给（gripK，stable / shield 用），倍率不改变量级。
 *   2. 提速类的 speedN / rpmK / dragK 一律收窄在"加得动、但顶不翻"的范围里。
 *      实测：光子、逐日 的跃迁形态在满级 + 持续油门下仍会翻，
 *      这两台目前仍偏激进 —— 要根治得动 WHEELIE_K 或加骑手配重，那是另一件事。
 *
 * 形态之间的差异靠"同一 mode 内分档"实现：便宜的给弱参数、贵的给强参数，
 * 因此"买哪辆车的形态"才是一次真选择。
 */
const FX_CALIBRATION_NOTE = true;

/**
 * 由 fx 反推一句**可比较**的效果说明。
 *
 * ★ 为什么不让 desc 手写数字：同一 mode 下的车效果同类、量级不同，
 *   手写文案必然和 fx 漂移（改了一个数忘了改另一处，就是玩家花 ¥30000
 *   买到的"大幅提升"和 ¥3000 那辆一模一样）。这里从 fx 直接算，改一处即同步。
 *
 * 输出示例："极速 ×9.2 · 抓地 3.6 · 风阻 ×0.14"
 */
function fxText(fx) {
  if (!fx || !Object.keys(fx).length) return "";
  const out = [];
  if (fx.speedN != null) out.push("极速 ×" + fx.speedN);
  if (fx.rpmK != null) out.push("红线 ×" + fx.rpmK);
  if (fx.gripK != null) out.push("抓地 ×" + fx.gripK);
  if (fx.dragK != null) out.push("风阻 ×" + fx.dragK);
  if (fx.accel != null) out.push("推进 " + fx.accel);
  if (fx.vCap != null) out.push("限速 " + fx.vCap);
  return out.join(" · ");
}


export const VEHICLES = [
  {
    id: "trail",
    name: "驮马",
    icon: "🐴",
    desc: "均衡全能，新手之选",

    tier: "普通",
    costK: 1,
    price: 0,

    speed: 1.0,
    grip: 1.0,
    weight: 1.0,
    airRot: 1.0,
    fuel: 1,
    color: "#314ccd",
    // 山地车：常规形态 —— 中等胎宽、平把、中等上管、可见避震弹簧、中立骑姿
    art: ART({}),
    phys: P(1.0, 1.0, 1.0, 1.0, 16, 1.0, 1.0),
    /** 特殊终极模式：全部升级满级后可花金币解锁
     *  ★ 驮马此前是 27 辆里**唯一没有形态**的车 —— 免费新手车反而最没个性。
     *    给它 phase（相位）语义："老驮马见得多"—— 永不摔车 + 燃料无限 + 危险段豁免。
     *    数值取该 mode 里的**最低档**：它是基准车，不该因为形态而变强太多。
     */
    ultra: {
      fx: {"speedN": 1.10},
      name: "老驮马",
      icon: "🐴",
      mode: "phase",
      cost: 6000,
      desc: "见惯不惊：永不摔车 + 燃料无限 + 危险段限速豁免",
    },
  },
  {
    id: "sport",
    name: "银箭",
    icon: "🏹",
    desc: "极速快，空中旋转快，油箱小",

    tier: "普通",
    costK: 1,
    price: 3000,

    speed: 1.4,
    grip: 0.55,
    weight: 0.6,
    airRot: 2.0,
    fuel: 0.75,
    color: "#e63946",
    // 竞速车：公路姿态 —— 细胎高轮（密而细的辐条、不画内圈）、细管、上管低而向车头下斜、
    // 弯把、无避震弹簧、窄坐垫、无前檐的流线头盔、骑手整个人压低前探
    art: ART({
      tire: 1.7, rim: false, spokes: 12, spokeW: 0.8, tube: 2.4,
      topDrop: 6, coil: 0, bar: "drop", saddleW: 6.5,
      helmR: 4.9, peak: false, vents: 0,
      pose: POSE(4.5, 5.5, 6, 5, 1.5, 3.5),
    }),
    phys: P(0.55, 0.5, 1.25, 1.1, 13, 1.05, 2.05),
    /** 特殊终极模式：全部升级满级后可花金币解锁 */
    ultra: {
      fx: {"speedN": 3.2, "rpmK": 2.0, "dragK": 0.55},
      name: "极速模式",
      icon: "🚀",
      mode: "surge",
      cost: 8000,
      desc: "引擎过载：加速与极速大幅提升，风驰电掣",
    },
  },
  {
    id: "mud",
    name: "岩驼",
    icon: "🐫",
    desc: "抓地强，耐撞，油箱大，旋转慢",

    tier: "稀有",
    costK: 5,
    price: 10500,

    speed: 0.7,
    grip: 1.72,
    weight: 2.0,
    airRot: 0.455,
    fuel: 1.45,
    color: "#8a5a2b",
    // 越野车：胖胎形态 —— 粗胎配少而粗的辐条、胖管、高而平直的上管、
    // 加长避震弹簧、宽坐垫、三道通风槽的宽头盔、骑手坐得高、手臂张开够宽把
    art: ART({
      tire: 5.6, spokes: 5, spokeW: 2.4, tube: 6.2,
      topDrop: -1, coil: 1.9, bar: "wide", saddleW: 14,
      helmR: 4.2, vents: 3,
      pose: POSE(-3, -4.5, -3.5, -4.5, -1, -4),
    }),
    // ★ torque 保持 1.12（τ=20,160）：它**低于**冰面的摩擦上限 43,825，
    //   也就是这辆车的轮胎在任何地面都碰不到摩擦极限 —— 冰面照样不慢、照样不打滑。
    //   这是"抓地强"这个角色定位的直接后果，不是标定失误。
    //   曾试过把 torque 抬到 2.6 让它在冰面打滑，结果与"最陡上坡不可爬"那条难度断言
    //   **数学冲突**：冰面打滑要 τ > 43,825，而爬不上 43° 坡要 τ/12 < 2,407（τ < 28,884），
    //   两个区间没有交集 —— 这不是标定没做完，是真无解。所以保留"抓地无敌"这个设定。
    phys: P(2.05, 2.2, 0.85, 0.9, 20, 0.92, 0.68),
    /** 特殊终极模式：全部升级满级后可花金币解锁 */
    ultra: {
      fx: {"gripK": 1.30, "speedN": 0.95},
      name: "贴地模式",
      icon: "🛡️",
      mode: "stable",
      cost: 40500,
      desc: "磁悬浮贴地：始终贴地，永不翻车",
    },
  },

  // ================================================================
  //  以下 8 辆是早期就定下的"高价变态车"：底子吊打同期车辆，满级后再开终极模式更是离谱。
  //  下面几条是被物理逼出来的硬约束，改数值前先想清楚：
  //    · phys.mass 两两不同、phys.inertia 两两不同
  //    · airRot × inertia ≈ 1（空中角冲量 ω ∝ airRot/inertia，两者互为倒数）
  //    · ultra.mode 是物理层唯一的分派依据（见 physics/bike.js 的 activeMode）
  // ================================================================
  {
    id: "volt",
    name: "磁暴",
    icon: "⚡",
    desc: "满级极速是山地车的 2 倍，爬坡不喘",

    tier: "稀有",
    costK: 5,
    price: 7500,

    speed: 1.85,
    grip: 1.0,
    weight: 0.62,
    airRot: 1.136,
    fuel: 1.3,
    color: "#00d4ff",
    // 电磁车：紧凑轻量、细高轮、大落差上管、车把前伸很低（骑手几乎趴平）
    art: ART({
      tire: 2.2, rim: false, spokes: 10, spokeW: 1.0, tube: 3.0,
      topDrop: 8, coil: 0.6, bar: "drop", saddleW: 8,
      helmR: 5.0, vents: 2,
      pose: POSE(5, 6, 7, 5.5, 2, 4),
    }),
    phys: P(0.6, 0.88, 1.35, 1.15, 14, 2.5, 0.95),
    ultra: {
      fx: {"speedN": 3.4, "rpmK": 2.2, "dragK": 0.52},
      name: "电磁轨道炮",
      icon: "🔌",
      mode: "railgun",
      cost: 27000,
      desc: "电磁轨道炮：推力与红线同时暴涨，平地直接贴地飞行",
    },
  },
  {
    id: "ghost",
    name: "夜枭",
    icon: "🦉",
    desc: "摔不坏、油无限、危险段随便冲",

    tier: "史诗",
    costK: 12,
    price: 19000,

    speed: 1.6,
    grip: 1.25,
    weight: 0.48,
    airRot: 2.778,
    fuel: 2.2,
    color: "#9d4edd",
    // 影行者：细胎 + 细密辐条、几乎无避震、坐垫窄、头盔圆润无前檐、骑手高伏（探身向前）
    art: ART({
      tire: 1.5, rim: false, spokes: 14, spokeW: 0.7, tube: 2.2,
      topDrop: 9, coil: 0.3, bar: "drop", saddleW: 6,
      helmR: 5.2, peak: false, vents: 0,
      pose: POSE(6, 7, 8, 6, 2.5, 5),
    }),
    phys: P(0.45, 0.36, 1.5, 1.2, 12, 1.35, 1.85),
    ultra: {
      fx: {"speedN": 1.30},
      name: "相位穿行",
      icon: "🌀",
      mode: "phase",
      cost: 90500,
      desc: "相位穿行：永不摔车 + 燃料无限 + 危险段限速豁免",
    },
  },
  {
    id: "fort",
    name: "磐石",
    icon: "🛡️",
    desc: "巨重巨稳，抓地碾压，翻过来也能爬起来",

    tier: "神话",
    costK: 40,
    price: 75500,

    speed: 1.35,
    grip: 2.6,
    weight: 2.7,
    airRot: 0.385,
    fuel: 2.6,
    color: "#f4a261",
    // 磁力堡垒：全项目最粗的胎与管、超长避震、超宽坐垫、大头盔多通风口、骑手坐得高把手很低
    art: ART({
      tire: 7.5, spokes: 4, spokeW: 3.0, tube: 8.0,
      topDrop: -3, coil: 2.6, bar: "wide", saddleW: 18,
      helmR: 5.4, vents: 4,
      pose: POSE(-4, -6, -2, -7, 0, -6),
    }),
    phys: P(2.85, 2.6, 0.72, 0.85, 24, 0.76, 1.0),
    ultra: {
      fx: {"gripK": 1.60, "speedN": 1.30},
      name: "磁力护盾",
      icon: "🔰",
      mode: "shield",
      cost: 556500,
      desc: "磁力护盾：任何姿态都摔不下去，腾空与操控全部保留",
    },
  },
  {
    id: "photon",
    name: "光子",
    icon: "💫",
    desc: "神话档第一台：极速与操控的巅峰",

    tier: "稀有",
    costK: 5,
    price: 6500,

    speed: 2.1,
    grip: 1.1,
    weight: 0.4,
    airRot: 1.087,
    fuel: 1.6,
    color: "#ff70a6",
    // 光子摩托：介于公路车与电磁车之间的轻薄形态、中等胎宽、粗管、无避震、前倾伏低
    art: ART({
      tire: 2.6, rim: false, spokes: 11, spokeW: 1.2, tube: 3.4,
      topDrop: 10, coil: 0.2, bar: "drop", saddleW: 7,
      helmR: 5.1, peak: false, vents: 1,
      pose: POSE(7, 8, 9, 7, 3, 5.5),
    }),
    phys: P(0.38, 0.92, 1.45, 1.25, 13, 1.0, 2.9),
    ultra: {
      fx: {"speedN": 3.6, "accel": 3.2, "vCap": 40},
      name: "光子跃迁",
      icon: "🌌",
      mode: "warp",
      cost: 22000,
      desc: "光子跃迁：踩住油门持续喷射，0.7 秒逼近极速",
    },
  },
  {
    id: "singularity",
    name: "奇点",
    icon: "🌌",
    desc: "究极终局：350 km/h 极速 · 摔不坏 · 全项目最强参数",
    // ★ 终局车：四项性能（极速 / 抓地 / 油箱 / 扭矩）都是全场第一，价格也是最贵。
    //   升满花费 = 28,240 × 40 = 1,129,600（神话档），是车价的 9.4 倍 ——
    //   买回来只是入场，真正的投入是升级；「绝对形态」还要再单独买 1,020,000。
    //   摔不坏是**内置**特性（免解锁），但四项升级仍要一级一级正常花钱买。
    tier: "神话",
    costK: 40,
    price: 120000,

    speed: 2.6,
    // ★ grip 是反复标定的结果，不是随手填的：抓地再往上拉，μ 会高到让轮胎
    //   **永远不可能突破摩擦极限** —— 冰面空转 / 滑移率等一整套"打滑是物理、
    //   不是特效"的表现会全部归零（实测绿野与冰面滑移率都是 0.000）。
    //   3 是全项目最高，仍低于磁力堡垒满级的水平，且冰面依然能打滑。
    grip: 3.0,
    weight: 1.22,
    airRot: 0.532,
    fuel: 3.4,
    color: "#00ff9d",
    // 奇点号：全项目最夸张的形态 —— 中等胎宽配满辐条、极粗车架、超长避震、
    // 超宽坐垫、大头盔多通风口、骑手压得极低（趴在车头上）
    art: ART({
      tire: 6.2, spokes: 12, spokeW: 2.0, tube: 9.0,
      topDrop: 12, coil: 2.2, bar: "drop", saddleW: 20,
      helmR: 6.0, peak: true, vents: 5,
      pose: POSE(9, 9, 11, 8, 4, 7),
    }),
    // 全项目最优：扭矩倍率最高、红线最高、抓地最高、油箱最大
    phys: P(1.22, 1.88, 1.6, 1.5, 26, 3.0, 3.6),
    /** 最终形态：升满后花金币解锁 */
    ultra: {
      /* 绝对形态不读参数：极速与推力在 physics/bike.js 里按 350km/h 标定 */ fx: {},
      name: "绝对形态",
      icon: "🌌",
      mode: "absolut",
      builtin: true,
      cost: 1020000,
      desc: "免解锁：350 km/h 极速 · 怎么摔都摔不坏 · 抗摔不设上限",
    },
  },
// ================================================================
  //  宇宙级车辆（7 台：按真实的七级宇宙速度命名）
  //
  //  ★ 命名与极速全部取自真实数据（km/s → km/h 换算 ×3.6）：
  //    第一 7.9 km/s = 28,440 km/h   环绕速度（近地轨道）—— 教科书标准值
  //    第二 11.2 km/s = 40,320 km/h  地球逃逸速度        —— 教科书标准值
  //    第三 16.7 km/s = 60,120 km/h  太阳系逃逸速度      —— 教科书标准值
  //    第四 525 km/s = 1,890,000 km/h 银河系逃逸速度     —— 中文维基给"≥525"
  //    第五 ~1000 km/s = 3,600,000 km/h 本星系群逃逸      —— 无统一定义，取常见科普值
  //    第六 ~1500 km/s = 5,400,000 km/h 超星系团逃逸      —— 同上
  //    第七 ~1750 km/s = 6,300,000 km/h 整个宇宙的逃逸    —— 用户指定区间 1500~2000 的中值
  //
  //  ★ 两个必须写清楚的事实偏差（避免把科普误传说成定论）：
  //    1. **第四宇宙速度不是常传的 ~30 km/s**。29.8 km/s 是地球的**公转速度**
  //       （第三宇宙速度的推导里出现过），把它当第四宇宙速度是以讹传讹。
  //       中文维基给的"≥525 km/s"才是脱离银河系的量级 —— 银河系含暗物质、
  //       精确质量未知，所以只能给下限。本表取 525。
  //    2. **第五、六、七宇宙速度没有科学共识**。第六项已对应"可观测宇宙"边界，
  //       再往外没有明确的引力系统可供"逃逸"，所以"第七宇宙速度"严格说不存在。
  //       这里按玩家世界观当作"逃出整个宇宙"来命名，取值落在常见科普区间内。
  //
  //  ★ 三条设计原则（都写进了 spec 的 R2）：
  //   1. **价格与极速严格单调递增**。统一按 **四项升满 = 车价 × 40 /
  //      形态解锁 = 车价 × 12.5** 反解 costK，三条曲线因此同时单调
  //      （升满 > 形态 > 车价）。早期按"每级 ×30"递推会算出
  //      "虚掷升满 7.4e13 < 形态解锁 2.7e14"这种倒挂 —— 更慢的车反而更贵。
  //   2. **500 级升级上限**（普通车 100）。判定一律走 maxLvOf(veh)。
  //   3. **不开形态就是一台普通的、会摔的地面车**。飞行只由 omega 形态提供
  //      （MODE_FLAGS.omega.fly），早期版本给宇宙车全挂 `veh.hover` 让裸车也常驻
  //      悬停，结果"没开最终形态也会摔车"这条需求整个落空 —— 实测 6 台
  //      Lv0 不开形态跑 25 秒零摔车。μ 拉到 3.4~312 是为了让它们在地面上
  //      又快又难驾驭（扭矩远超翘头临界，一脚油门就可能翻），这才是"关卡仍然
  //      有挑战"的真实来源。
  //
  //  ★ `|airRot × inertia − 1| ≤ 0.05` 是硬约束：airRot 是空中转体能力，
  //   inertia 是转动惯量，二者必须互为倒数（见 Task 6.5.2）。每台车的
  //   inertia 都由 1 / airRot 反解得到，不是随手填的。
  // ================================================================
  {
    id: "cv1",
    name: "第一宇宙速度",
    icon: "🛰️",
    desc: "7.9 km/s · 环绕速度 · 近地轨道",
    tier: "宇宙",
    maxLv: 500,
    // ★ 该车「形态」的标称极速（km/h）。omega 形态据此 + 升级等级解算出实际极速，
    //   所以 Lv0 只有裸车水平，升满才到这个数（见 constants.js 的 ultraCruiseOf）。
    nominalKmh: 28440,
    // ★ costK 由"四项升满 = 车价 × 40"反解：单项满级 ΣupCost(1..500) = 155,300，
    //   四项就是 155,300 × 4 = 621,200，于是 costK = 车价 / 15,530。
    costK: 643915,
    price: 10000000000,

    speed: 2.6,
    grip: 3.42,
    weight: 3.10,
    airRot: 0.612,
    fuel: 5,
    color: "#8ec9ff",
    // ★ 近地轨道：常规胎、有避震、平把、标准头盔 —— "刚够上天的入门轨道车"
    art: ART({
      tire: 2.8, rim: true, spokes: 10, spokeW: 1.3, tube: 3.6,
      topDrop: 6, coil: 1.1, bar: "flat", saddleW: 9,
      helmR: 5.0, peak: true, vents: 2,
      pose: POSE(1.5, 0.5, 2.0, 0.5, 0.5, -0.5),
    }),
    // ★ inertia = 1 / airRot = 1.63（|airRot×inertia−1| = 0）
    phys: P(3.10, 1.63, 1.7, 1.5, 12, 26.4, 6.6, /* wheelieK */ 4.6, /* wheelieUp */ 20.2),
    ultra: { fx: {}, name: "环绕形态", icon: "🛰️", mode: "omega", cost: 125000000000,
      desc: "28440 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv2",
    name: "第二宇宙速度",
    icon: "🚀",
    desc: "11.2 km/s · 地球逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 11.2 km/s = 40,320 km/h —— 摆脱地球引力束缚的最小速度。
    //   月球 1 号是第一个达到它的探测器。
    nominalKmh: 40320,
    costK: 3090792,
    price: 48000000000,

    speed: 2.6,
    grip: 6.18,
    weight: 2.45,
    airRot: 0.745,
    fuel: 6,
    color: "#6fb8ff",
    // ★ 逃逸轨道：细胎、弯把、窄坐垫、前倾伏低
    art: ART({
      tire: 2.0, rim: false, spokes: 14, spokeW: 1.0, tube: 3.0,
      topDrop: 10, coil: 0.5, bar: "drop", saddleW: 7,
      helmR: 5.4, peak: false, vents: 3,
      pose: POSE(4.5, 2.5, 5.5, 2.0, 1.5, 1.5),
    }),
    // ★ inertia = 1 / airRot = 1.34
    phys: P(2.45, 1.34, 1.8, 1.5, 11, 39.2, 8.1, /* wheelieK */ 7.4, /* wheelieUp */ 41.5),
    ultra: { fx: {}, name: "逃逸形态", icon: "🚀", mode: "omega", cost: 600000000000,
      desc: "40320 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv3",
    name: "第三宇宙速度",
    icon: "🌌",
    desc: "16.7 km/s · 太阳系逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 16.7 km/s = 60,120 km/h —— 摆脱太阳引力、飞出太阳系所需的最小速度。
    //   （地球轨道上的绝对值是 42.1 km/s；取地球公转方向发射，故只需额外补一点。）
    //   旅行者 1/2 号靠引力弹弓达到了它。
    nominalKmh: 60120,
    costK: 18544752,
    price: 288000000000,

    speed: 2.6,
    grip: 11.4,
    weight: 1.90,
    airRot: 0.868,
    fuel: 7,
    color: "#9d8cff",
    // ★ 星际逃逸：极细胎、多辐条、直把展开、大头盔开面罩
    art: ART({
      tire: 1.5, rim: false, spokes: 20, spokeW: 0.7, tube: 2.6,
      topDrop: 14, coil: 0, bar: "wide", saddleW: 10,
      helmR: 6.0, peak: true, vents: 4,
      pose: POSE(-1.0, -2.0, -1.5, -2.0, -2.0, -3.0),
    }),
    // ★ inertia = 1 / airRot = 1.15
    phys: P(1.90, 1.15, 1.9, 1.5, 10, 52.6, 9.6, /* wheelieK */ 11.6, /* wheelieUp */ 86.4),
    ultra: { fx: {}, name: "星际形态", icon: "🌌", mode: "omega", cost: 3600000000000,
      desc: "60120 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv4",
    name: "第四宇宙速度",
    icon: "🌠",
    desc: "525 km/s · 银河系逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 525 km/s = 1,890,000 km/h —— 摆脱**银河系**引力束缚的最小速度。
    //   中文维基给的是"≥525 km/s"（银河系含暗物质、精确质量未知，只能给下限），
    //   而非广为误传的 ~30 km/s —— 29.8 km/s 是地球的**公转速度**。
    nominalKmh: 1890000,
    costK: 222537025,
    price: 3456000000000,

    speed: 2.6,
    grip: 27.8,
    weight: 1.42,
    airRot: 0.942,
    fuel: 9,
    color: "#c77dff",
    // ★ 银河逃逸：粗胎配宽辐条、长上管、大坐垫 —— 罕见的"重装高速车"
    art: ART({
      tire: 3.0, rim: true, spokes: 12, spokeW: 1.8, tube: 4.6,
      topDrop: 3, coil: 1.5, bar: "flat", saddleW: 13,
      helmR: 5.6, peak: true, vents: 3,
      pose: POSE(-0.5, -2.5, -1.0, -2.0, 0, -3.0),
    }),
    // ★ inertia = 1 / airRot = 1.06
    phys: P(1.42, 1.06, 2.0, 1.5, 9, 92.4, 13.5, /* wheelieK */ 9.7, /* wheelieUp */ 104.2),
    ultra: { fx: {}, name: "银河形态", icon: "🌠", mode: "omega", cost: 43200000000000,
      desc: "1890000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv5",
    name: "第五宇宙速度",
    icon: "🕸️",
    desc: "1000 km/s · 本星系群逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 约 1000 km/s = 3,600,000 km/h —— 脱离**本星系群**（银河系 + 仙女座等
    //   约 50 个星系）所需的逃逸速度。无统一定义，取常见科普值。
    nominalKmh: 3600000,
    costK: 2670444301,
    price: 41472000000000,

    speed: 2.6,
    grip: 63.4,
    weight: 1.02,
    airRot: 1.031,
    fuel: 11,
    color: "#e05fff",
    // ★ 星系群逃逸：细管、超多辐条、极端前趴、无前檐
    art: ART({
      tire: 1.0, rim: false, spokes: 26, spokeW: 0.45, tube: 2.0,
      topDrop: 20, coil: 0, bar: "drop", saddleW: 4,
      helmR: 6.4, peak: false, vents: 6,
      pose: POSE(7.5, 6.0, 9.5, 5.0, 3.0, 4.5),
    }),
    // ★ inertia = 1 / airRot = 0.97
    phys: P(1.02, 0.97, 2.1, 1.5, 8, 168.5, 19.5, /* wheelieK */ 22.4, /* wheelieUp */ 192.7),
    ultra: { fx: {}, name: "星系群形态", icon: "🕸️", mode: "omega", cost: 518400000000000,
      desc: "3600000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv6",
    name: "第六宇宙速度",
    icon: "🕳️",
    desc: "1500 km/s · 超星系团逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 约 1500 km/s = 5,400,000 km/h —— 脱离**本超星系团**所需的逃逸速度。
    //   ★ 取 1500 而非常见的 2000：用户指定第七项落在 1500~2000 km/s，
    //     而七档必须严格递增 —— 若第六项取 2000，第七项就无处安放了。
    nominalKmh: 5400000,
    costK: 32045331616,
    price: 497664000000000,

    speed: 2.6,
    grip: 128.5,
    weight: 0.72,
    airRot: 0.502,
    fuel: 13,
    color: "#ff5fd2",
    // ★ 超星系团：粗胎、宽辐条、宽大尾翼式长上管 —— "越强越难驾驭"的重量派
    art: ART({
      tire: 3.8, rim: true, spokes: 8, spokeW: 2.4, tube: 5.2,
      topDrop: 1, coil: 1.8, bar: "wide", saddleW: 15,
      helmR: 5.8, peak: true, vents: 2,
      pose: POSE(1.0, -5.0, -0.5, -4.0, 1.0, -5.5),
    }),
    // ★ inertia = 1 / airRot = 1.99
    phys: P(0.72, 1.99, 2.2, 1.5, 7, 305.8, 27.5, /* wheelieK */ 8.4, /* wheelieUp */ 92.6),
    ultra: { fx: {}, name: "超星系团形态", icon: "🕳️", mode: "omega", cost: 6220800000000000,
      desc: "5400000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv7",
    name: "第七宇宙速度",
    icon: "💫",
    desc: "1750 km/s · 整个宇宙的逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 1750 km/s = 6,300,000 km/h —— 取用户给的 1500~2000 km/s 区间中值。
    //   ★ 严格说"第七宇宙速度"没有科学共识：第六项已对应可观测宇宙边界，
    //     再往外没有明确的引力系统可供"逃逸"。这里按玩家的世界观命名。
    nominalKmh: 6300000,
    costK: 384543979395,
    price: 5971968000000000,

    speed: 2.6,
    grip: 312.0,
    weight: 0.42,
    airRot: 1.284,
    fuel: 16,
    color: "#ffffff",
    // ★ 全域逃逸：最细管、最多辐条、最极端前趴
    art: ART({
      tire: 0.6, rim: false, spokes: 32, spokeW: 0.22, tube: 1.1,
      topDrop: 25, coil: 0, bar: "drop", saddleW: 2,
      helmR: 6.8, peak: false, vents: 8,
      pose: POSE(12, 10, 15, 9.5, 5, 8),
    }),
    // ★ inertia = 1 / airRot = 0.78
    phys: P(0.42, 0.78, 2.3, 1.5, 6, 420.6, 36, /* wheelieK */ 31.2, /* wheelieUp */ 398.4),
    ultra: { fx: {}, name: "全域形态", icon: "💫", mode: "omega", cost: 74649600000000000,
      desc: "6300000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },


  // ================================================================
  //  档位阶梯（共 26 辆）：普通 5 / 稀有 6 / 史诗 6 / 传说 5 / 神话 4
  //  · costK = 升级费倍率（普通 1 / 稀有 5 / 史诗 12 / 传说 25 / 神话 40）。
  //    四项升满 = 28,240 × costK：普通 28,240 / 稀有 141,200 / 史诗 338,880 /
  //    传说 706,000 / 神话 1,129,600。
  //  · 除驮马（免费新手车）外每辆都有「最终形态」：七种 mode，
  //    除 absolut（仅奇点号一辆、免解锁）外其余六种各 4 辆；
  //    奇点号是唯一免解锁的内置形态（absolut），但它的四项升级照样要花钱买。
  //  · 极速由**扭矩曲线的归零转速**决定，也就是 phys.rpm 才是"贵车更快"的唯一干净杠杆
  //    （堆 torque 只会在平路撞上抓地上限，堆 grip 只会更抗滑而不是更快）。
  //    所以 rpm 随档位递增。
  //  · 改数值前必读：
  //    mass / inertia 全表两两不同、|airRot × inertia − 1| ≤ 0.05、
  //    torque 再高容易后空翻。
  //  ★ 注意：grip **不受 ≤2.2 之类的硬上限约束**（早先的这条限制写在 1.9 那代数据上，
  //    早已不成立）—— 真正的约束是"满级 μ 仍要留出打滑空间"，奇点号的 3 就是标定结果。
  // ================================================================

  // ---------------- 普通档 ----------------
{
    id: "commuter",
    name: "蜂鸟",
    icon: "🐦",
    desc: "城市里最灵活的一台，钻小巷、爬缓坡都不费力",
    tier: "普通",
    costK: 1,
    price: 4000,

    speed: 1.05,
    grip: 1.32,
    weight: 0.85,
    airRot: 1.351,
    fuel: 1.2,
    color: "#7a9e7e",
    art: ART({tire: 2.6, spokes: 8, spokeW: 1.3, tube: 3.2, topDrop: 4, coil: 0.7, bar: "flat", saddleW: 11, helmR: 4.3, pose: POSE(1, 1, 2, 1, 0.5, -1)}),
    phys: P(0.85, 0.74, 1.1, 1.05, 15, 1.22, 1.55),
    ultra: {
      fx: {"speedN": 2.6, "accel": 2.2, "vCap": 26}, name: "通勤喷射", icon: "🛴", mode: "warp", cost: 12000, desc: "踩住油门持续加速，0.6 秒逼近极速" },
  },
{
    id: "dirt",
    name: "山魈",
    icon: "🐒",
    desc: "松软地面上的老手，颠簸路面也稳当",
    tier: "稀有",
    costK: 5,
    price: 12000,

    speed: 0.95,
    grip: 1.48,
    weight: 1.6,
    airRot: 0.658,
    fuel: 1.35,
    color: "#b07d4f",
    art: ART({tire: 4.6, spokes: 6, spokeW: 1.9, tube: 5.0, topDrop: 0, coil: 1.5, bar: "wide", saddleW: 13, helmR: 4.4, vents: 2, pose: POSE(-1, -2, -1, -2, -0.5, -2.5)}),
    phys: P(1.66, 1.52, 0.9, 0.95, 19, 1.28, 0.98),
    ultra: {
      fx: {"speedN": 4.0, "rpmK": 2.8, "dragK": 0.45}, name: "泥地推进", icon: "🏇", mode: "railgun", cost: 49500, desc: "推力与红线同时暴涨，泥地也能飞" },
  },

  // ---------------- 稀有档 ----------------
{
    id: "storm",
    name: "白毛风",
    icon: "🌬️",
    desc: "雪地极速，滑起来比谁都远",
    tier: "普通",
    costK: 1,
    price: 5000,

    speed: 1.5,
    grip: 0.62,
    weight: 0.64,
    airRot: 1.923,
    fuel: 1.4,
    color: "#a8d8e8",
    art: ART({tire: 2.2, rim: false, spokes: 10, spokeW: 1.0, tube: 2.8, topDrop: 5, coil: 0.5, bar: "drop", saddleW: 9, helmR: 4.8, peak: false, pose: POSE(3, 3, 4, 3, 1, 2)}),
    phys: P(0.62, 0.52, 1.25, 1.1, 14, 1.68, 2.4),
    ultra: {
      fx: {"speedN": 3.6, "rpmK": 2.4, "dragK": 0.50}, name: "暴风增压", icon: "🌨️", mode: "surge", cost: 14500, desc: "红线与极速暴涨，雪地起飞" },
  },
{
    id: "reef",
    name: "潮生",
    icon: "🐚",
    desc: "潮间带专属，湿滑礁石上稳如磐石",
    tier: "史诗",
    costK: 12,
    price: 26000,

    speed: 1.15,
    grip: 2.05,
    weight: 1.12,
    airRot: 0.952,
    fuel: 1.5,
    color: "#ff8fab",
    art: ART({tire: 5.0, spokes: 5, spokeW: 2.2, tube: 5.6, topDrop: -1, coil: 1.6, bar: "wide", saddleW: 14, helmR: 4.4, vents: 3, pose: POSE(-2, -3, -2, -3, -0.8, -3)}),
    phys: P(1.12, 1.05, 0.88, 0.92, 19, 1.35, 1.55),
    ultra: {
      // ★ 归入 stable：潮生的定位是"礁石上的定海神针"（grip 2.05，全表前列），
      //   它的形态就该是"贴着礁盘不飞起来"，而不是"摔不下去"。
      fx: {"gripK": 1.45, "speedN": 1.25}, name: "礁石定根", icon: "🐚", mode: "stable", cost: 135500, desc: "轮轴钉死在礁盘上，抓地再涨四成半" },
  },
{
    id: "canyon",
    name: "赤鹫",
    icon: "🦅",
    desc: "台地上连落差，俯冲落地比谁都稳",
    tier: "稀有",
    costK: 5,
    price: 5500,

    speed: 1.6,
    grip: 1.02,
    weight: 1.02,
    airRot: 1.515,
    fuel: 1.25,
    color: "#cd5c5c",
    art: ART({tire: 2.8, rim: false, spokes: 12, spokeW: 1.1, tube: 3.4, topDrop: 6, coil: 1.2, bar: "drop", saddleW: 8, helmR: 4.9, pose: POSE(4, 4, 5, 4, 1.5, 3)}),
    phys: P(1.05, 0.66, 1.3, 1.15, 17, 1.38, 1.18),
    ultra: {
      fx: {"speedN": 3.2, "accel": 2.8, "vCap": 34}, name: "台地飞驰", icon: "🏜️", mode: "warp", cost: 18000, desc: "持续喷射：踩住油门就一直加速" },
  },
{
    id: "aurora",
    name: "星轨",
    icon: "🌠",
    desc: "极夜里最亮的一辆，空中转得飞快",
    tier: "普通",
    costK: 1,
    price: 3500,

    speed: 1.55,
    grip: 0.78,
    weight: 0.5,
    airRot: 2.941,
    fuel: 1.3,
    color: "#66f0c8",
    art: ART({tire: 1.8, rim: false, spokes: 13, spokeW: 0.8, tube: 2.4, topDrop: 7, coil: 0.4, bar: "drop", saddleW: 7, helmR: 5.0, peak: false, pose: POSE(5, 6, 6, 5, 2, 4)}),
    phys: P(0.48, 0.34, 1.35, 1.15, 13, 1.8, 1.42),
    ultra: {
      fx: {"speedN": 1.10}, name: "极光穿行", icon: "🌌", mode: "phase", cost: 10000, desc: "摔不坏 + 燃料无限 + 危险段限速豁免" },
  },

  // ---------------- 史诗档 ----------------
{
    id: "sandstorm",
    name: "噬沙",
    icon: "🏜️",
    desc: "能见度为零也照样全速",
    tier: "稀有",
    costK: 5,
    price: 9000,

    speed: 1.7,
    grip: 0.92,
    weight: 1.08,
    airRot: 1.01,
    fuel: 1.8,
    color: "#d4a373",
    art: ART({tire: 2.6, spokes: 10, spokeW: 1.2, tube: 3.2, topDrop: 4, coil: 0.6, bar: "drop", saddleW: 9, helmR: 4.6, pose: POSE(3, 3, 4, 3, 1, 2)}),
    phys: P(1.1, 0.99, 1.4, 1.25, 15, 1.36, 1.4),
    ultra: {
      fx: {"speedN": 1.20}, name: "沙暴穿行", icon: "🌪️", mode: "phase", cost: 33000, desc: "摔不坏 + 燃料无限 + 危险段限速豁免" },
  },
{
    id: "magma",
    name: "焰裔",
    icon: "🔥",
    desc: "高重力熔岩滩上的重型战车",
    tier: "传说",
    costK: 25,
    price: 47500,

    speed: 1.4,
    grip: 2.1,
    weight: 2.2,
    airRot: 0.575,
    fuel: 2.1,
    color: "#ff6b35",
    art: ART({tire: 6.4, spokes: 5, spokeW: 2.6, tube: 7.2, topDrop: -2, coil: 2.1, bar: "wide", saddleW: 16, helmR: 5.0, vents: 4, pose: POSE(-3, -5, -2, -5, -1, -5)}),
    phys: P(2.3, 1.74, 0.8, 0.88, 22, 1.85, 1.45),
    ultra: {
      fx: {"gripK": 1.40, "speedN": 1.20}, name: "熔岩护壳", icon: "🛡️", mode: "shield", cost: 303500, desc: "任何姿态都摔不下去，操控全保留" },
  },
{
    id: "glacier",
    name: "冰魄",
    icon: "🧊",
    desc: "冰面上最不容易失控的那台",
    tier: "传说",
    costK: 25,
    price: 55500,

    speed: 1.3,
    grip: 2.35,
    weight: 1.95,
    airRot: 0.538,
    fuel: 2.3,
    color: "#8ecae6",
    art: ART({tire: 7.0, spokes: 4, spokeW: 2.9, tube: 7.8, topDrop: -3, coil: 2.4, bar: "wide", saddleW: 17, helmR: 5.2, vents: 4, pose: POSE(-3, -6, -2, -6, -1, -6)}),
    phys: P(2.0, 1.86, 0.75, 0.85, 23, 1.18, 1.14),
    ultra: {
      // ★ 从 stable 改为 shield：冰魄的设定是"大悬挂漂浮"（suspK 0.75 / travel 23，
      //   全表最软的悬挂之一），它的挑战本来就来自"起伏中保持平衡"而不是"贴地不飞"。
      //   shield 保留全部腾空与操控、只给摔车免疫 —— 正好是"晃但摔不死"。
      //   同时把 stable 让给真正该"永不腾空"的那四台重型低转车。
      fx: {"gripK": 1.75, "speedN": 1.10}, name: "冰魄浮壳", icon: "❄️", mode: "shield", cost: 371500, desc: "大悬挂继续晃，但怎么都摔不下去" },
  },
{
    id: "monsoon",
    name: "雨燕",
    icon: "🌧️",
    desc: "暴雨泥石流里照样全油门",
    tier: "史诗",
    costK: 12,
    price: 22000,

    speed: 1.75,
    grip: 1.18,
    weight: 1.25,
    airRot: 0.82,
    fuel: 1.9,
    color: "#4cc9f0",
    art: ART({tire: 3.6, spokes: 9, spokeW: 1.6, tube: 4.4, topDrop: 5, coil: 1.1, bar: "drop", saddleW: 11, helmR: 4.7, vents: 2, pose: POSE(2, 2, 3, 2, 1, 1)}),
    phys: P(1.28, 1.22, 1.2, 1.1, 18, 1.6, 1.8),
    ultra: {
      fx: {"speedN": 4.4, "rpmK": 3.0, "dragK": 0.42}, name: "季风过载", icon: "🌧️", mode: "surge", cost: 110500, desc: "红线与极速暴涨" },
  },
{
    id: "obsidian",
    name: "玄铁",
    icon: "⬛",
    desc: "重到离谱，却快得离谱",
    tier: "传说",
    costK: 25,
    price: 65000,

    speed: 1.6,
    grip: 1.32,
    weight: 2.5,
    airRot: 0.435,
    fuel: 2.2,
    color: "#2b2d42",
    art: ART({tire: 6.8, spokes: 6, spokeW: 2.7, tube: 7.5, topDrop: 1, coil: 2.3, bar: "wide", saddleW: 16, helmR: 5.1, vents: 3, pose: POSE(-3, -5, -2, -5, -1, -5)}),
    phys: P(2.6, 2.3, 0.7, 0.82, 24, 2.6, 1.24),
    ultra: {
      fx: {"speedN": 5.4, "rpmK": 4.0, "dragK": 0.30}, name: "黑曜石炮", icon: "⬛", mode: "railgun", cost: 454500, desc: "推力与红线同时暴涨" },
  },

  // ---------------- 传说档 ----------------
{
    id: "titan",
    name: "泰坦",
    icon: "🗿",
    desc: "传说档最重的一台，压过去就是了",
    tier: "传说",
    costK: 25,
    price: 41000,

    speed: 1.35,
    grip: 1.7,
    weight: 3.2,
    airRot: 0.328,
    fuel: 2.5,
    color: "#6c757d",
    art: ART({tire: 7.8, spokes: 4, spokeW: 3.2, tube: 8.6, topDrop: -4, coil: 2.8, bar: "wide", saddleW: 19, helmR: 5.6, vents: 5, pose: POSE(-4, -7, -3, -7, -1, -7)}),
    phys: P(3.35, 3.05, 0.68, 0.8, 25, 1.12, 1.08),
    ultra: {
      fx: {"gripK": 1.55, "speedN": 1.05}, name: "泰坦领域", icon: "🗿", mode: "stable", cost: 248000, desc: "贴地推进，永不腾空" },
  },
{
    id: "solstice",
    name: "逐日",
    icon: "☀️",
    desc: "追着太阳跑，滑行距离长得离谱",
    tier: "史诗",
    costK: 12,
    price: 14000,

    speed: 2.05,
    grip: 1.02,
    weight: 1.02,
    airRot: 1.25,
    fuel: 2.2,
    color: "#ffb703",
    art: ART({tire: 2.0, rim: false, spokes: 12, spokeW: 0.9, tube: 2.6, topDrop: 7, coil: 0.3, bar: "drop", saddleW: 8, helmR: 5.1, peak: false, pose: POSE(6, 7, 7, 6, 2.5, 4.5)}),
    phys: P(0.86, 0.8, 1.5, 1.3, 14, 2.2, 1.85),
    ultra: {
      fx: {"speedN": 4.2, "accel": 3.8, "vCap": 50}, name: "至日喷射", icon: "☀️", mode: "warp", cost: 60500, desc: "一脚油门不见尽头" },
  },
{
    id: "vanguard",
    name: "破阵",
    icon: "🔺",
    desc: "重装与速度的折中，攻守兼备",
    tier: "传说",
    costK: 25,
    price: 35000,

    speed: 1.75,
    grip: 1.58,
    weight: 2.1,
    airRot: 0.417,
    fuel: 2.4,
    color: "#3a0ca3",
    art: ART({tire: 6.0, spokes: 8, spokeW: 2.4, tube: 7.0, topDrop: 3, coil: 2.0, bar: "wide", saddleW: 15, helmR: 5.2, vents: 3, pose: POSE(-2, -4, -2, -4, -0.5, -4)}),
    phys: P(2.2, 2.4, 0.75, 0.86, 22, 1.38, 1.52),
    ultra: {
      fx: {"speedN": 4.8, "rpmK": 3.4, "dragK": 0.36}, name: "先锋轨道炮", icon: "🔺", mode: "railgun", cost: 202500, desc: "推力与红线同时暴涨" },
  },
{
    id: "phantom",
    name: "幽影",
    icon: "🌫️",
    desc: "传说档里最轻，撞不坏还滑得远",
    tier: "史诗",
    costK: 12,
    price: 16500,

    speed: 2,
    grip: 1.12,
    weight: 0.72,
    airRot: 1.786,
    fuel: 2,
    color: "#adb5bd",
    art: ART({tire: 1.7, rim: false, spokes: 14, spokeW: 0.7, tube: 2.2, topDrop: 8, coil: 0.2, bar: "drop", saddleW: 6.5, helmR: 5.2, peak: false, pose: POSE(7, 8, 8, 7, 3, 5)}),
    phys: P(0.7, 0.56, 1.55, 1.35, 12, 1.72, 2.55),
    ultra: {
      fx: {"gripK": 1.20, "speedN": 1.10}, name: "幻影护盾", icon: "🌫️", mode: "shield", cost: 74000, desc: "任何姿态都摔不下去，腾空与操控全部保留" },
  },
{
    id: "eclipse",
    name: "天蚀",
    icon: "🌑",
    desc: "传说档的终点，越暗的地方它越快",
    tier: "神话",
    costK: 40,
    price: 103000,

    speed: 1.9,
    grip: 1.65,
    weight: 2.45,
    airRot: 0.769,
    fuel: 2.3,
    color: "#212529",
    art: ART({tire: 5.2, spokes: 9, spokeW: 2.2, tube: 6.4, topDrop: 2, coil: 1.8, bar: "wide", saddleW: 15, helmR: 5.3, peak: true, vents: 4, pose: POSE(-1, -3, -1, -3, 0, -3)}),
    phys: P(1.38, 1.3, 0.82, 0.9, 21, 2.15, 2.85),
    ultra: {
      // ★ 归入 surge：天蚀是"重而快"（mass 1.38 / rpm 2.85，全表第 4 高红线），
      //   surge 的"扭矩域拉满换极速"正对着它的画像；shield 是给"稳"的车准备的。
      //   迁过来之后 surge 里多了一台神话档重高速车，与其余四台轻车拉开差异。
      fx: {"speedN": 4.2, "rpmK": 2.6, "dragK": 0.44}, name: "蚀之超载", icon: "🌑", mode: "surge", cost: 833500, desc: "暗蚀引擎全功率：红线与极速暴涨，风阻压到四成半" },
  },

  // ---------------- 神话档 ----------------
{
    id: "nova",
    name: "猎户",
    icon: "🎯",
    desc: "神话档第二台：极速与操控的巅峰",
    tier: "史诗",
    costK: 12,
    price: 30000,

    speed: 2.3,
    grip: 1.42,
    weight: 0.76,
    airRot: 1.563,
    fuel: 2.6,
    color: "#ff006e",
    art: ART({tire: 2.0, rim: false, spokes: 13, spokeW: 0.9, tube: 2.8, topDrop: 9, coil: 0.35, bar: "drop", saddleW: 7, helmR: 5.3, peak: false, vents: 2, pose: POSE(8, 9, 9, 8, 3.5, 6)}),
    phys: P(0.74, 0.64, 1.5, 1.3, 13, 1.42, 3.35),
    ultra: {
      fx: {"speedN": 5.0, "rpmK": 3.6, "dragK": 0.36}, name: "新星过载", icon: "💫", mode: "surge", cost: 165500, desc: "红线与极速暴涨，一路顶到极速" },
  },
{
    id: "oblivion",
    name: "终焉",
    icon: "🕳️",
    desc: "神话档最重：一台会走路的深坑",
    tier: "神话",
    costK: 40,
    price: 88000,

    speed: 1.8,
    grip: 1.95,
    weight: 3.4,
    airRot: 0.303,
    fuel: 2.9,
    color: "#03045e",
    art: ART({tire: 8.2, spokes: 4, spokeW: 3.4, tube: 9.2, topDrop: -4, coil: 3.0, bar: "wide", saddleW: 20, helmR: 5.8, vents: 5, pose: POSE(-4, -8, -3, -8, -1, -8)}),
    phys: P(3.6, 3.3, 0.65, 0.78, 26, 0.98, 1.0),
    ultra: {
      fx: {"gripK": 2.00, "speedN": 1.20}, name: "湮灭领域", icon: "🕳️", mode: "stable", cost: 681000, desc: "贴地推进，永不腾空" },
  },

];

// 挂到每辆车的 ultra 上：render/panels.js 与 ui/shop.js 直接显示这一行
for (const v of VEHICLES) {
  if (v.ultra && v.ultra.fx) v.ultra.fxText = fxText(v.ultra.fx);
}
