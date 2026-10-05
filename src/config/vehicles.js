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
 *   ★ **有硬上限，别再往上加**。render/bike.js 的骑手几何是：
 *       髋 x = −12.5 + shX·0.42   肩 x = 2.5 + shX   头 x = 5.6 + hdX
 *       车把 x = 9.5 + barX（轴距只有 38，前轮中心在 x=19）
 *     所以 shX 每加 1，躯干长 15 + 0.58·shX 就涨 0.58px，且头同步前移。
 *     中立骑手 shX=0 时躯干 15px、头在车把**后** 3.9px。
 *     ★ 判据：躯干 ≤ 25px、头−车把 ≤ +10px。越线的样子不是"更伏"，
 *       是人被拉长 + 头拧到车把前面（无极曾经做到躯干 30 / 头超前轮 18px，
 *       加上 9.6 的头盔，读起来像 rider 掉在车前面飘着）。
 *     想要"更贴地"的观感请调 shY / hdY（压低身体），那才是伏得低而不是探得远。
 * bar   车把形态：flat 平把 / drop 弯把（公路车）/ wide 直把（越野车）
 * coil  悬挂弹簧幅度；0 = 刚性前叉（公路车本来就没有避震）
 */
const POSE = (shX, shY, hdX, hdY, barX, barY) => ({ shX, shY, hdX, hdY, barX, barY });

/**
 * 速度拖尾规格（纯表现层，render/trail.js 消费）。
 *
 * ★ 形态学（ART）管的是"车长什么样"，拖尾管的是"车跑起来留下什么"——
 *   两者分开，是因为拖尾不参与任何物理，且要按**该车此刻的极速**归一化，
 *   塞进 art 会让人以为改 art 会影响物理。
 *
 * ★ 十二台宇宙级车必须**每台一种颜色 + 一种形态**（用户明确要求）。形态不是换色，
 *   是换画法：电弧 / 螺旋 / 日冕 / 余烬 / 涟漪 / 涡旋 / 光矛 / 光锥 / 弦裂 /
 *   光网 / 编织 / 事件视界，十二种连抖动相位（seed）都错开，避免同屏时拖尾同频闪烁。
 *
 * core  拖尾**芯**：接近白的高温色（能量最密处）
 * glow  拖尾**外焰**：车辆主色系（余晖、边缘）
 * style 签名形态，决定 render/trail.js 走哪条绘制分支：
 *       arc 电弧 / helix 螺旋 / corona 日冕 / ember 余烬 / ripple 涟漪 /
 *       vortex 涡旋 / lance 光矛 / cone 光锥 / rift 弦裂 / lattice 光网 /
 *       braid 编织 / event 事件视界
 * len   **满档尾长（屏幕 px，不是世界 px）** —— 见 render/trail.js 的"零逐帧分配"纪律 3
 * width 满档半宽（屏幕 px）
 * count 元素数（闪电条数 / 火舌数 / 光环数 / 碎块数），随画质档缩放
 * spread 横向散布（屏幕 px），只对 arc / corona 生效
 * seed  抖动相位种子：黄金角错开，保证七台车不同步
 */
const TRAIL = (style, core, glow, o) => Object.assign({
  style, core, glow,
  len: 220,
  width: 9,
  count: 4,
  spread: 8,
  seed: 0,
}, o);

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
    name: "星环",
    icon: "🛰️",
    desc: "第一宇宙速度 · 7.9 km/s 环绕速度 · 近地轨道",
    tier: "宇宙",
    maxLv: 500,
    // ★ 该车「形态」的标称极速（km/h）。omega 形态据此 + 升级等级解算出实际极速，
    //   所以 Lv0 只有裸车水平，升满才到这个数（见 constants.js 的 ultraCruiseOf）。
    nominalKmh: 28440,
    // ★ costK 由"四项升满 = 车价 × 40"反解：单项满级 ΣupCost(1..500) = 155,300，
    //   四项就是 155,300 × 4 = 621,200，于是 costK = 车价 / 15,530。
    costK: 51513,
    price: 800000000,

    speed: 2.6,
    grip: 3.42,
    weight: 3.10,
    airRot: 0.612,
    fuel: 5,
    color: "#5EC8F5",   // 冰蓝 —— 近地轨道的天空色
    // ★ 近地轨道：常规胎、有避震、平把、标准头盔 —— "刚够上天的入门轨道车"
    art: ART({
      tire: 2.8, rim: true, spokes: 10, spokeW: 1.3, tube: 3.6,
      topDrop: 6, coil: 1.1, bar: "flat", saddleW: 9,
      helmR: 5.0, peak: true, vents: 2,
      pose: POSE(1.5, 0.5, 2.0, 0.5, 0.5, -0.5),
    }),
    // ★ 拖尾：电弧（arc）—— 近地轨道的第一印象是"电"。三条分叉电弧，
    //   越靠后越散开；芯是接近白的蓝，外焰是车色。
    trail: TRAIL("arc", "#EAF9FF", "#5EC8F5",
      { len: 190, width: 8, count: 3, spread: 9, seed: 0.13 }),
    // ★ inertia = 1 / airRot = 1.63（|airRot×inertia−1| = 0）
    phys: P(68.6, 1.63, 2.4, 1.5, 12, 26.4, 0.75, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "环绕形态", icon: "🛰️", mode: "omega", cost: 10000000000,
      desc: "28440 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv2",
    name: "离尘",
    icon: "🚀",
    desc: "第二宇宙速度 · 11.2 km/s 地球逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 11.2 km/s = 40,320 km/h —— 摆脱地球引力束缚的最小速度。
    //   月球 1 号是第一个达到它的探测器。
    nominalKmh: 40320,
    costK: 1545396,
    price: 24000000000,

    speed: 2.6,
    grip: 6.18,
    weight: 2.45,
    airRot: 0.745,
    fuel: 6,
    color: "#3FE0A5",   // 翡翠 —— 脱离地球后的第一抹绿
    // ★ 逃逸轨道：细胎、弯把、窄坐垫、前倾伏低
    art: ART({
      tire: 2.0, rim: false, spokes: 14, spokeW: 1.0, tube: 3.0,
      topDrop: 10, coil: 0.5, bar: "drop", saddleW: 7,
      helmR: 5.4, peak: false, vents: 3,
      pose: POSE(4.5, 2.5, 5.5, 2.0, 1.5, 1.5),
    }),
    // ★ 拖尾：螺旋（helix）—— 挣脱地球之后进入绕行轨道，两股反向螺旋束。
    trail: TRAIL("helix", "#E6FFF6", "#3FE0A5",
      { len: 235, width: 10, count: 2, seed: 0.41 }),
    // ★ inertia = 1 / airRot = 1.34
    phys: P(101.9, 1.34, 3.5, 1.5, 11, 39.2, 0.82, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "逃逸形态", icon: "🚀", mode: "omega", cost: 300000000000,
      desc: "40320 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv3",
    name: "越日",
    icon: "🌌",
    desc: "第三宇宙速度 · 16.7 km/s 太阳系逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 16.7 km/s = 60,120 km/h —— 摆脱太阳引力、飞出太阳系所需的最小速度。
    //   （地球轨道上的绝对值是 42.1 km/s；取地球公转方向发射，故只需额外补一点。）
    //   旅行者 1/2 号靠引力弹弓达到了它。
    nominalKmh: 60120,
    costK: 46361880,
    price: 720000000000,

    speed: 2.6,
    grip: 11.4,
    weight: 1.90,
    airRot: 0.868,
    fuel: 7,
    color: "#FFE14D",   // 明黄 —— 太阳的金
    // ★ 星际逃逸：极细胎、多辐条、直把展开、大头盔开面罩
    art: ART({
      tire: 1.5, rim: false, spokes: 20, spokeW: 0.7, tube: 2.6,
      topDrop: 14, coil: 0, bar: "wide", saddleW: 10,
      helmR: 6.0, peak: true, vents: 4,
      pose: POSE(-1.0, -2.0, -1.5, -2.0, -2.0, -3.0),
    }),
    // ★ 拖尾：日冕（corona）—— 太阳的金。日冕从尾根向后**成扇形炸开**，
    //   与前三台的"束状"读法完全不同；每根日珥末端带一枚亮斑。
    trail: TRAIL("corona", "#FFF8D6", "#FFE14D",
      { len: 215, width: 11, count: 9, seed: 0.68 }),
    // ★ inertia = 1 / airRot = 1.15
    phys: P(136.8, 1.15, 5.0, 1.5, 11, 52.6, 0.9, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "星际形态", icon: "🌌", mode: "omega", cost: 9000000000000,
      desc: "60120 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv4",
    name: "出银",
    icon: "🌠",
    desc: "第四宇宙速度 · 525 km/s 银河系逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 525 km/s = 1,890,000 km/h —— 摆脱**银河系**引力束缚的最小速度。
    //   中文维基给的是"≥525 km/s"（银河系含暗物质、精确质量未知，只能给下限），
    //   而非广为误传的 ~30 km/s —— 29.8 km/s 是地球的**公转速度**。
    nominalKmh: 1890000,
    costK: 1390856407,
    price: 21600000000000,

    speed: 2.6,
    grip: 27.8,
    weight: 1.42,
    airRot: 0.942,
    fuel: 9,
    color: "#FF6B3D",   // 烈橙 —— 银河核的炽热
    // ★ 银河逃逸：粗胎配宽辐条、长上管、大坐垫 —— 罕见的"重装高速车"
    art: ART({
      tire: 3.0, rim: true, spokes: 12, spokeW: 1.8, tube: 4.6,
      topDrop: 3, coil: 1.5, bar: "flat", saddleW: 13,
      helmR: 5.6, peak: true, vents: 3,
      pose: POSE(-0.5, -2.5, -1.0, -2.0, 0, -3.0),
    }),
    // ★ 拖尾：余烬（ember）—— 银河核的炽热。这是七台里唯一**离散**的一台：
    //   碎块沿尾部散开、边飞边升高、边冷边暗，和其余六台的连续能量束互补。
    trail: TRAIL("ember", "#FFD98A", "#FF6B3D",
      { len: 245, width: 10, count: 15, seed: 0.29 }),
    // ★ inertia = 1 / airRot = 1.06
    phys: P(240.2, 1.06, 8.0, 1.5, 12, 92.4, 1.0, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "银河形态", icon: "🌠", mode: "omega", cost: 270000000000000,
      desc: "1890000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv5",
    name: "破群",
    icon: "🕸️",
    desc: "第五宇宙速度 · 1000 km/s 本星系群逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 约 1000 km/s = 3,600,000 km/h —— 脱离**本星系群**（银河系 + 仙女座等
    //   约 50 个星系）所需的逃逸速度。无统一定义，取常见科普值。
    nominalKmh: 3600000,
    costK: 41725692209,
    price: 648000000000000,

    speed: 2.6,
    grip: 63.4,
    weight: 1.02,
    airRot: 1.031,
    fuel: 11,
    color: "#FF4D9E",   // 洋红 —— 星系团的能量
    // ★ 星系群逃逸：细管、超多辐条、极端前趴、无前檐
    art: ART({
      tire: 1.0, rim: false, spokes: 26, spokeW: 0.45, tube: 2.0,
      topDrop: 20, coil: 0, bar: "drop", saddleW: 4,
      helmR: 6.4, peak: false, vents: 6,
      pose: POSE(7.5, 6.0, 9.5, 5.0, 3.0, 4.5),
    }),
    // ★ 拖尾：涟漪（ripple）—— 星系团的能量。垂直于行进方向的一圈圈激波环，
    //   沿尾部向外扩散并变淡，是七台里唯一的"波"形画法。
    trail: TRAIL("ripple", "#FFD6EC", "#FF4D9E",
      { len: 250, width: 12, count: 6, seed: 0.87 }),
    // ★ inertia = 1 / airRot = 0.97
    phys: P(435.7, 0.97, 12.0, 1.5, 14, 168.5, 1.08, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "星系群形态", icon: "🕸️", mode: "omega", cost: 8100000000000000,
      desc: "3600000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv6",
    name: "超脱",
    icon: "🕳️",
    desc: "第六宇宙速度 · 1500 km/s 超星系团逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 约 1500 km/s = 5,400,000 km/h —— 脱离**本超星系团**所需的逃逸速度。
    //   ★ 取 1500 而非常见的 2000：用户指定第七项落在 1500~2000 km/s，
    //     而七档必须严格递增 —— 若第六项取 2000，第七项就无处安放了。
    nominalKmh: 5400000,
    costK: 1251770766259,
    price: 19440000000000000,

    speed: 2.6,
    grip: 128.5,
    weight: 0.72,
    airRot: 0.502,
    fuel: 13,
    color: "#B07CFF",   // 星紫 —— 超星系团的冷辉
    // ★ 超星系团：粗胎、宽辐条、宽大尾翼式长上管 —— "越强越难驾驭"的重量派
    art: ART({
      tire: 3.8, rim: true, spokes: 8, spokeW: 2.4, tube: 5.2,
      topDrop: 1, coil: 1.8, bar: "wide", saddleW: 15,
      helmR: 5.8, peak: true, vents: 2,
      pose: POSE(1.0, -5.0, -0.5, -4.0, 1.0, -5.5),
    }),
    // ★ 拖尾：涡旋（vortex）—— 超星系团的冷辉。环面倾角沿尾部一路扭转并自转，
    //   越远越小 = 一条正在收束的虫洞，是七台里唯一带"透视纵深"的画法。
    trail: TRAIL("vortex", "#F0E4FF", "#B07CFF",
      { len: 262, width: 13, count: 5, seed: 0.55 }),
    // ★ inertia = 1 / airRot = 1.99
    phys: P(790.8, 1.99, 18.0, 1.5, 16, 305.8, 1.15, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "超星系团形态", icon: "🕳️", mode: "omega", cost: 243000000000000000,
      desc: "5400000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv7",
    name: "无界",
    icon: "💫",
    desc: "第七宇宙速度 · 1750 km/s 全域逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    // ★ 1750 km/s = 6,300,000 km/h —— 取用户给的 1500~2000 km/s 区间中值。
    //   ★ 严格说"第七宇宙速度"没有科学共识：第六项已对应可观测宇宙边界，
    //     再往外没有明确的引力系统可供"逃逸"。这里按玩家的世界观命名。
    nominalKmh: 6300000,
    costK: 37553122987766,
    price: 583200000000000000,

    speed: 2.6,
    grip: 312.0,
    weight: 0.42,
    airRot: 1.284,
    fuel: 16,
    color: "#F0F4FF",   // 星白 —— 逃出一切之后只剩光
    // ★ 全域逃逸：最细管、最多辐条、最极端前趴
    art: ART({
      tire: 0.6, rim: false, spokes: 32, spokeW: 0.22, tube: 1.1,
      topDrop: 25, coil: 0, bar: "drop", saddleW: 2,
      helmR: 6.8, peak: false, vents: 8,
      pose: POSE(11.5, 9, 14.5, 8.5, 4.5, 7),
    }),
    // ★ 拖尾：光矛（lance）—— 逃出一切之后只剩光。全场最长、最直、最亮：
    //   一枚纺锤形光幕 + 一条贯穿的芯线 + 稀疏的星屑，是七台里唯一的"直线"画法
    //   （其余六台都在摆动），刻意与"全域逃逸 = 不再有曲率"的设定对上。
    trail: TRAIL("lance", "#FFFFFF", "#F0F4FF",
      { len: 420, width: 9, count: 7, seed: 0.02 }),
    // ★ inertia = 1 / airRot = 0.78
    phys: P(1087.6, 0.78, 26.0, 1.5, 20, 420.6, 1.22, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "全域形态", icon: "💫", mode: "omega", cost: 7290000000000000000,
      desc: "6300000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },

  // ================================================================
  //  光速级（3 台）—— 用户点名追加的终点
  //
  //  ★ 极速取**真光速**而不是"更快一点的数"：
  //    c = 299,792.458 km/s（SI 定义的精确值）= 1,079,252,849 km/h。
  //    弦外取 10c、裂界取 100c —— 大统一理论里超光速并不被禁止（不是"更快的光"，
  //    而是载 info 时的群速度），所以世界观上成立。
  //
  //  ★ 价格每一档跳 **×900**（不是宇宙序列的 ×30）：
  //    第七宇宙速度 5.832e17 → 光锥 5.2488e20 → 弦外 4.72392e23 → 裂界 4.25153e26。
  //    ×30 是同一"宇宙速度阶梯"内部的等比；×900 是**跨出那个阶梯** ——
  //    光速车与前十台宇宙车之间应当是一道天堑，而不是同一条曲线上的下一格。
  //    代价是总资产量级冲到 ~2.3e28，故 GOLD_MAX 必须跟着抬到 1e30。
  //
  //  ★ 这三台把速度推到 2.998e12 px/s，牵出四处硬上限的连锁抬升
  //    （改之前必须一起改，否则会静默截断）：
  //    constants.TOP_SPEED_CAP / NUM_CAP_V → 1e14
  //    camera.CAM_ZOOM_ABS_MIN → 1e-10（否则一帧横移 5e10px 直接闪出画面）
  //  ================================================================
  {
    id: "cv8",
    name: "光锥",
    icon: "⚡",
    desc: "光速 · 299,792 km/s · 形态极速即光速本身",
    tier: "宇宙",
    maxLv: 500,
    // ★ 1,079,252,849 km/h = c（299,792.458 km/s × 3600）。形态满级恰好跑到光速。
    nominalKmh: 1079252849,
    // costK = 车价 × 40 ÷ 四项升满单价合计(621,200) = 车价 ÷ 15,530
    costK: 33797810688989053,
    price: 524880000000000000000,

    speed: 2.6,
    grip: 620.0,
    weight: 0.30,
    airRot: 1.412,
    fuel: 18,
    color: "#C9F7FF",   // 纯白光 —— 越过彩色光谱之后只剩白
    // ★ 光锥：外胎与车架都细到接近消失（轮胎 0.4px、管径 0.8px），
    //   辐条 40 根密到读成一片连续环，骑手压到极限前趴。
    art: ART({
      tire: 0.4, rim: false, spokes: 40, spokeW: 0.15, tube: 0.8,
      topDrop: 28, coil: 0, bar: "drop", saddleW: 1.5,
      helmR: 7.0, peak: false, vents: 10,
      pose: POSE(12.5, 9, 15.5, 8, 5, 7),
    }),
    // ★ 拖尾：光锥（cone）—— 九道**向后收束**的锥面，越远越窄越亮。
    //   这是九种画法里唯一的"会聚"：其余八种都从尾根向外散开，
    //   而光速不该看起来像一团炸开的火 —— 它该看起来像一个正在合拢的锥。
    trail: TRAIL("cone", "#FFFFFF", "#C9F7FF",
      { len: 460, width: 12, count: 9, seed: 0.31 }),
    // ★ inertia = 1 / airRot = 0.708
    phys: P(1346.8, 0.708, 40.0, 1.5, 24, 520.8, 1.3, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "光锥", icon: "⚡", mode: "omega", cost: 6561000000000000000000,
      desc: "1079252849 km/h（= 光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv9",
    name: "弦外",
    icon: "🌀",
    desc: "十倍光速 · 2,997,925 km/s · 超出因果律的那一格",
    tier: "宇宙",
    maxLv: 500,
    // ★ 10c = 2,997,924.58 km/s = 1.079252849e10 km/h
    nominalKmh: 10792528488,
    costK: 30418029620090148100,
    price: 472392000000000000000000,

    speed: 2.6,
    grip: 1180.0,
    weight: 0.22,
    airRot: 1.557,
    fuel: 20,
    color: "#FF4DE8",   // 品红 —— 光谱之外第一次出现的颜色
    // ★ 弦外：车架已经薄到没有厚度可言（管径 0.4px），辐条 56 根，
    //   头盔开到极限 —— 这一台的整个卖点就是"你画不出它，因为它没有宽度了"。
    art: ART({
      tire: 0.25, rim: false, spokes: 56, spokeW: 0.1, tube: 0.4,
      topDrop: 32, coil: 0, bar: "drop", saddleW: 1,
      helmR: 7.2, peak: false, vents: 12,
      pose: POSE(13.5, 9, 16.5, 8, 5.5, 7),
    }),
    // ★ 拖尾：弦裂（rift）—— 两道平行的断裂面，彼此**剪切错开**并缓慢换位，
    //   像空间本身被撕开一条缝。全场唯一的"成对"画法（其余都是单束或放射）。
    trail: TRAIL("rift", "#FFFFFF", "#FF4DE8",
      { len: 520, width: 14, count: 6, seed: 0.77 }),
    // ★ inertia = 1 / airRot = 0.642
    phys: P(1655.6, 0.642, 60.0, 1.5, 30, 640.2, 1.38, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "弦外", icon: "🌀", mode: "omega", cost: 5904900000000000000000000,
      desc: "10792528488 km/h（= 10 倍光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv10",
    name: "裂界",
    icon: "♾️",
    desc: "百倍光速 · 29,979,245 km/s · 光网之外的最后一格",
    tier: "宇宙",
    maxLv: 500,
    // ★ 100c = 1.079252849e11 km/h（c = 1,079,252,849 km/h，SI 定义的精确值 ×100）。
    //   px/s = 2.998e12 —— **比原上界 NUM_CAP_V = 1e12 还大**，
    //   所以 constants 的 NUM_CAP_V / TOP_SPEED_CAP 一并抬到 1e14，
    //   camera.CAM_ZOOM_ABS_MIN 抬到 1e-10（否则一帧横移 5e10 px 直接闪出画面）。
    nominalKmh: 107925284880,
    // costK = 车价 × 40 ÷ 四项升满单价合计(621,200) = 车价 ÷ 15,530
    // 价格 = 弦外 × 900（与"第七宇宙速度 → 光锥"同档跨阶，×30 是宇宙阶梯内部的等比）
    costK: 27379400000000000000000,
    price: 425152800000000000000000000,

    speed: 2.6,
    grip: 2242.0,
    weight: 0.16,
    airRot: 1.713,
    fuel: 22,
    color: "#E0FF00",   // 酸绿 —— 可见光谱长波端，也是"网格"最该有的颜色
    // ★ 裂界：车架已经薄到连"细"都谈不上（管径 0.2px、胎 0.15px），
    //   辐条 72 根密成一片连续环 —— 它的卖点就是"你画不出它，因为它没有厚度了"。
    art: ART({
      tire: 0.15, rim: false, spokes: 72, spokeW: 0.06, tube: 0.2,
      topDrop: 38, coil: 0, bar: "drop", saddleW: 0.6,
      helmR: 7.4, peak: false, vents: 14,
      pose: POSE(14.5, 8.5, 17.5, 7.5, 6, 6.5),
    }),
    // ★ 拖尾：光网（lattice）—— 一张向车尾**透视收缩并翻滚**的网格，
    //   横向的环与纵向的辐条交替亮灭，像身后拖着一条正在被拉直的空间坐标网。
    //   这是十种画法里唯一的"二维面"：其余九种都是单束 / 放射 / 环 / 成对，
    //   只有它读起来是一张有面积的网 —— 百倍光速不该还有"一条线"的形状。
    trail: TRAIL("lattice", "#FFFFFF", "#E0FF00",
      { len: 600, width: 16, count: 7, seed: 0.64 }),
    // ★ inertia = 1 / airRot = 0.584（|airRot×inertia−1| = 0）
    phys: P(2034.7, 0.584, 90.0, 1.5, 38, 786.8, 1.463, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "裂界", icon: "♾️", mode: "omega", cost: 5314410000000000000000000000,
      desc: "107925284880 km/h（= 100 倍光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv11",
    name: "千界",
    icon: "🌠",
    desc: "千倍光速 · 299,792,458 km/s · 连因果都开始追不上你",
    tier: "宇宙",
    maxLv: 500,
    // ★ 1000c = 1.079252849e12 km/h = 2.998e13 px/s。
    //   价格 ×900 接在裂界后面 —— 与「第七宇宙速度 → 光锥 → 弦外 → 裂界」
    //   用的是同一个跨阶倍率（宇宙阶梯内部是 ×30，跨出那个阶梯才是 ×900）。
    //   尊贵感靠**价格跨越的量级**：裂界的形态解锁是 5.3×10^27，这一台是
    //   4.78×10^30 —— 中间隔了三个数量级，"贵"这件事不需要文案解释。
    nominalKmh: 1079252848800,
    costK: 24636700000000000000000000,
    price: 382637520000000000000000000000,

    speed: 2.6,
    grip: 4260.0,
    weight: 0.12,
    airRot: 1.884,
    fuel: 24,
    color: "#FF2D95",   // 霓粉 —— 光谱之外第二次出现的颜色（比弦外的品红更刺眼）
    // ★ 千界：管径 0.12px、胎 0.1px，辐条 90 根。裂界是"没有厚度"，
    //   这一台是"厚度成了负数"——它比上一台薄了一个数量级。
    art: ART({
      tire: 0.1, rim: false, spokes: 90, spokeW: 0.04, tube: 0.12,
      topDrop: 44, coil: 0, bar: "drop", saddleW: 0.4,
      helmR: 7.6, peak: false, vents: 16,
      pose: POSE(15.5, 8, 18.5, 7, 6.5, 6),
    }),
    // ★ 拖尾：编织（braid）—— 四股互相缠绕的束，两两交叉、一股压一股。
    //   光网是"一张面"，这是"几根实打实的绳子"；十二种画法里唯一的编结结构。
    trail: TRAIL("braid", "#FFFFFF", "#FF2D95",
      { len: 680, width: 15, count: 4, seed: 0.28 }),
    // ★ inertia = 1 / airRot = 0.531
    phys: P(2502.7, 0.531, 135.0, 1.5, 48, 967.8, 1.551, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "千界", icon: "🌠", mode: "omega", cost: 4782969000000000000000000000000,
      desc: "1079252848800 km/h（= 1000 倍光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },
  {
    id: "cv12",
    name: "无极",
    icon: "💠",
    desc: "万倍光速 · 2,997,924,580 km/s · 整个游戏的终点",
    tier: "宇宙",
    maxLv: 500,
    // ★ 10000c = 1.079252849e13 km/h = **2.998e14 px/s**。
    //   这比旧的 NUM_CAP_V = 1e14 还大，所以上限抬到 1e16，
    //   camera.CAM_ZOOM_ABS_MIN 抬到 1e-12（否则一帧横移 5e12 px 直接闪出画面）。
    nominalKmh: 10792528488000,
    costK: 22173400000000000000000000000,
    price: 344373768000000000000000000000000,

    speed: 2.6,
    grip: 8094.0,
    weight: 0.09,
    airRot: 2.072,
    fuel: 26,
    color: "#7B00FF",   // 极深紫 —— 可见光谱的最后一段，后面什么都没有了
    // ★ 无极：管径 0.08px、胎 0.06px，辐条 112 根、头盔开 18 道通风槽。
    //   它的"卖点"是终于放弃了"越来越快"，转而**越来越空**——
    //   所以拖尾也是十二种里唯一的"减法"：不做加法，直接把尾根吃掉。
    art: ART({
      tire: 0.06, rim: false, spokes: 112, spokeW: 0.025, tube: 0.08,
      topDrop: 50, coil: 0, bar: "drop", saddleW: 0.25,
      helmR: 7.8, peak: false, vents: 18,
      pose: POSE(16.5, 7.5, 19.5, 6.5, 7, 5.5),
    }),
    // ★ 拖尾：事件视界（event）—— 一圈圈**向内塌缩**的环，环内比环外更亮，
    //   最后收成一个吞掉一切的暗点。这是十二种画法里唯一的"减法"：
    //   其余十一种都在往尾根**加**能量，只有它一路把能量**拿走**，
    //   读起来就是"连光都被甩掉了"。
    trail: TRAIL("event", "#FFFFFF", "#7B00FF",
      { len: 760, width: 17, count: 8, seed: 0.93 }),
    // ★ inertia = 1 / airRot = 0.483
    phys: P(3078.3, 0.483, 203.0, 1.5, 60, 1190.4, 1.644, /* wheelieK */ 1.2, /* wheelieUp */ 1.4),
    ultra: { fx: {}, name: "无极", icon: "💠", mode: "omega", cost: 4304672100000000000000000000000000,
      desc: "10792528488000 km/h（= 10000 倍光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段" },
  },


  // ================================================================
  //  档位阶梯（共 28 辆）：普通 4 / 稀有 5 / 史诗 3 / 传说 2 / 神话 4 / 宇宙 10
  //
  //  ★ **2026-10 精简**：删掉 8 台形态重复的地面车（蜂鸟 / 潮生 / 噬沙 / 雨燕 /
  //    泰坦 / 破阵 / 焰裔 / 幽影）。删的判据不是"便宜"，而是**同 mode 里
  //    已经有定位相同的两台**，玩家横向比出来得不到一次真正的选择。
  //    保留判据：① 每种 mode 至少剩 2 台（absolut 是奇点号的内置特权，例外）；
  //    ② 宇宙级车与三台光速车一台不删；③ 价格阶梯不许出现断层。
  //    删完每档的台数是 普通 4 / 稀有 5 / 史诗 3 / 传说 2 / 神话 4 / 宇宙 10。
  //
  //  · costK = 升级费倍率（普通 1 / 稀有 5 / 史诗 12 / 传说 25 / 神话 40；
  //    宇宙级车由"四项升满 = 车价 × 40"反解，见每台的注释）。
  //    四项升满 = 28,240 × costK：普通 28,240 / 稀有 141,200 / 史诗 338,880 /
  //    传说 706,000 / 神话 1,129,600。
  //  · 每辆都有「最终形态」：八种 mode，absolut 仅奇点号（免解锁的内置形态），
  //    omega 是十台宇宙级车的通用形态。
  //  · 极速由**扭矩曲线的归零转速**决定，也就是 phys.rpm 才是"贵车更快"的唯一干净杠杆
  //    （堆 torque 只会在平路撞上抓地上限，堆 grip 只会更抗滑而不是更快）。
  //    所以 rpm 随档位递增。
  //  · 改数值前必读：
  //    mass / inertia 全表两两不同、|airRot × inertia − 1| ≤ 0.05、
  //    torque 再高容易后空翻。
  //  ★ 注意：grip **不受 ≤2.2 之类的硬上限约束**（早先的这条限制写在 1.9 那代数据上，
  //    早已不成立）—— 真正的约束是"满级 μ 仍要留出打滑空间"，奇点号的 3 就是标定结果。
  //  ★ **删车前必读**：存档的车库按**车辆 id** 索引（见 core/storage.js 的 v5 存档），
  //    所以再删任何一台都不会让老存档指向错车。若哪天回退到"数组下标"存档，
  //    删车会让全部下标前移、老存档整体错位 —— 那是不能做的。
  // ================================================================

  // ---------------- 普通档 ----------------
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
// ---------------- 史诗档 ----------------
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

