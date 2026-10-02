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
const P = (mass, inertia, suspK, suspC, travel, torque, rpm) =>
  ({ mass, inertia, suspK, suspC, travel, torque, rpm });

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
    grip: 1,
    weight: 1.0,
    airRot: 1.0,
    fuel: 1,
    color: "#314ccd",
    // 山地车：常规形态 —— 中等胎宽、平把、中等上管、可见避震弹簧、中立骑姿
    art: ART({}),
    phys: P(1, 1.0, 1.0, 1.0, 16, 1, 1),
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
    grip: 0.72,
    weight: 0.8,
    airRot: 1.4,
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
    phys: P(0.8, 0.7, 1.25, 1.1, 13, 1.35, 1.25),
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
    grip: 1.45,
    weight: 1.5,
    airRot: 0.75,
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
    phys: P(1.5, 1.35, 0.85, 0.9, 20, 1.12, 0.85),
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
    grip: 1.2,
    weight: 0.85,
    airRot: 0.87,
    fuel: 1.3,
    color: "#00d4ff",
    // 电磁车：紧凑轻量、细高轮、大落差上管、车把前伸很低（骑手几乎趴平）
    art: ART({
      tire: 2.2, rim: false, spokes: 10, spokeW: 1.0, tube: 3.0,
      topDrop: 8, coil: 0.6, bar: "drop", saddleW: 8,
      helmR: 5.0, vents: 2,
      pose: POSE(5, 6, 7, 5.5, 2, 4),
    }),
    phys: P(0.85, 1.15, 1.35, 1.15, 14, 1.55, 1.3),
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
    grip: 1.55,
    weight: 0.7,
    airRot: 1.62,
    fuel: 2.2,
    color: "#9d4edd",
    // 影行者：细胎 + 细密辐条、几乎无避震、坐垫窄、头盔圆润无前檐、骑手高伏（探身向前）
    art: ART({
      tire: 1.5, rim: false, spokes: 14, spokeW: 0.7, tube: 2.2,
      topDrop: 9, coil: 0.3, bar: "drop", saddleW: 6,
      helmR: 5.2, peak: false, vents: 0,
      pose: POSE(6, 7, 8, 6, 2.5, 5),
    }),
    phys: P(0.7, 0.62, 1.5, 1.2, 12, 1.2, 1.45),
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
    grip: 2.1,
    weight: 2.4,
    airRot: 0.42,
    fuel: 2.6,
    color: "#f4a261",
    // 磁力堡垒：全项目最粗的胎与管、超长避震、超宽坐垫、大头盔多通风口、骑手坐得高把手很低
    art: ART({
      tire: 7.5, spokes: 4, spokeW: 3.0, tube: 8.0,
      topDrop: -3, coil: 2.6, bar: "wide", saddleW: 18,
      helmR: 5.4, vents: 4,
      pose: POSE(-4, -6, -2, -7, 0, -6),
    }),
    phys: P(2.4, 2.4, 0.72, 0.85, 24, 1.6, 1.9),
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
    grip: 1.35,
    weight: 0.6,
    airRot: 0.95,
    fuel: 1.6,
    color: "#ff70a6",
    // 光子摩托：介于公路车与电磁车之间的轻薄形态、中等胎宽、粗管、无避震、前倾伏低
    art: ART({
      tire: 2.6, rim: false, spokes: 11, spokeW: 1.2, tube: 3.4,
      topDrop: 10, coil: 0.2, bar: "drop", saddleW: 7,
      helmR: 5.1, peak: false, vents: 1,
      pose: POSE(7, 8, 9, 7, 3, 5.5),
    }),
    phys: P(0.6, 1.05, 1.45, 1.25, 13, 1.15, 1.7),
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
    grip: 3,
    weight: 1.2,
    airRot: 0.55,
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
    phys: P(1.2, 1.82, 1.6, 1.5, 26, 3, 3.6),
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
  {
    id: "omega",
    name: "归墟",
    icon: "☄️",
    desc: "究极之上：1000 km/h · 全程飞行 · 撞不烂",
    // ★ 全项目唯一的「常驻飞行」终局车，也是最贵的一台。
    //   价格刻意与"全程可获得金币"（约 412 万）拉开两个数量级 ——
    //   它不是靠刷得出来的目标，而是给长期存档的收束式彩蛋。
    //   车价 8 亿 / 满级升级 50 亿（costK=177054）/ 形态 100 亿，三段都远高于任何现有车，
    //   以保证"贵的车不能只是相对贵"。
    tier: "神话",
    costK: 177054,
    price: 800000000,

    speed: 2.6,
    grip: 6,
    weight: 1.42,
    airRot: 0.5128,
    fuel: 4,
    color: "#e0f0ff",
    // ★ hover：这是一台**飞行器**，裸车也悬停（物理层见 isFlighter）。
    //   它的 μ 拉到 11 是为 omega 形态的推力上限服务的，而那个抓地在地面上
    //   远超翘头临界 —— 实测不悬停时满级一踩油门就后空翻，只能跑 4.6 km/h。
    //   悬停之后抓地只用来定推力量级（场景抓地缩放仍成立），不再产生翘头力矩。
    hover: true,
    // 归墟号：极致的悬浮形态 —— 细高轮、无避震、超低趴姿、宽大尾翼式的长上管，
    // 视觉上要读出"这东西不属于地面"
    art: ART({
      tire: 1.4, rim: false, spokes: 16, spokeW: 0.6, tube: 2.0,
      topDrop: 14, coil: 0, bar: "drop", saddleW: 5,
      helmR: 5.6, peak: false, vents: 2,
      pose: POSE(10, 11, 13, 10, 5, 9),
    }),
    // ★ mass=1.42 / inertia=1.95 全表唯一；|airRot×inertia−1| = 0。
    //   torque/rpm 刻意**低于**奇点号：终焉形态的加速由 flightStep 的推力伺服负责，
    //   扭矩路径在这台车上几乎不参与（见 bike.js 的 omega 分支），
    //   堆扭矩只会在 27,778 px/s 下让车轮空转到 ωR ≈ 2300 rad/s，纯属数值噪声。
    phys: P(1.42, 1.95, 1.7, 1.5, 12, 2.4, 3.2),
    /** 最终形态：升满后花 100 亿解锁 */
    ultra: {
      /* 终焉形态不读 fx：极速与推力在 constants.js 按 1000 km/h 标定 */ fx: {},
      name: "终焉形态",
      icon: "☄️",
      mode: "omega",
      cost: 10000000000,
      desc: "1000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段",
    },
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
    grip: 1.05,
    weight: 0.95,
    airRot: 1.124,
    fuel: 1.2,
    color: "#7a9e7e",
    art: ART({tire: 2.6, spokes: 8, spokeW: 1.3, tube: 3.2, topDrop: 4, coil: 0.7, bar: "flat", saddleW: 11, helmR: 4.3, pose: POSE(1, 1, 2, 1, 0.5, -1)}),
    phys: P(0.95, 0.89, 1.1, 1.05, 15, 1.05, 1.25),
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
    grip: 1.3,
    weight: 1.25,
    airRot: 0.862,
    fuel: 1.35,
    color: "#b07d4f",
    art: ART({tire: 4.6, spokes: 6, spokeW: 1.9, tube: 5.0, topDrop: 0, coil: 1.5, bar: "wide", saddleW: 13, helmR: 4.4, vents: 2, pose: POSE(-1, -2, -1, -2, -0.5, -2.5)}),
    phys: P(1.25, 1.16, 0.9, 0.95, 19, 1.2, 1.15),
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
    grip: 1,
    weight: 0.9,
    airRot: 1.22,
    fuel: 1.4,
    color: "#a8d8e8",
    art: ART({tire: 2.2, rim: false, spokes: 10, spokeW: 1.0, tube: 2.8, topDrop: 5, coil: 0.5, bar: "drop", saddleW: 9, helmR: 4.8, peak: false, pose: POSE(3, 3, 4, 3, 1, 2)}),
    phys: P(0.9, 0.82, 1.25, 1.1, 14, 1.3, 1.55),
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
    grip: 1.75,
    weight: 1.35,
    airRot: 0.8,
    fuel: 1.5,
    color: "#ff8fab",
    art: ART({tire: 5.0, spokes: 5, spokeW: 2.2, tube: 5.6, topDrop: -1, coil: 1.6, bar: "wide", saddleW: 14, helmR: 4.4, vents: 3, pose: POSE(-2, -3, -2, -3, -0.8, -3)}),
    phys: P(1.35, 1.25, 0.88, 0.92, 19, 1.25, 1.4),
    ultra: {
      fx: {"speedN": 1.40}, name: "潮汐穿行", icon: "🐚", mode: "phase", cost: 135500, desc: "摔不坏 + 燃料无限 + 危险段限速豁免" },
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
    grip: 1.1,
    weight: 0.88,
    airRot: 1.163,
    fuel: 1.25,
    color: "#cd5c5c",
    art: ART({tire: 2.8, rim: false, spokes: 12, spokeW: 1.1, tube: 3.4, topDrop: 6, coil: 1.2, bar: "drop", saddleW: 8, helmR: 4.9, pose: POSE(4, 4, 5, 4, 1.5, 3)}),
    phys: P(0.88, 0.86, 1.3, 1.15, 17, 1.45, 1.7),
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
    grip: 0.95,
    weight: 0.78,
    airRot: 1.667,
    fuel: 1.3,
    color: "#66f0c8",
    art: ART({tire: 1.8, rim: false, spokes: 13, spokeW: 0.8, tube: 2.4, topDrop: 7, coil: 0.4, bar: "drop", saddleW: 7, helmR: 5.0, peak: false, pose: POSE(5, 6, 6, 5, 2, 4)}),
    phys: P(0.78, 0.6, 1.35, 1.15, 13, 1.35, 1.5),
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
    grip: 1,
    weight: 1.02,
    airRot: 1.099,
    fuel: 1.8,
    color: "#d4a373",
    art: ART({tire: 2.6, spokes: 10, spokeW: 1.2, tube: 3.2, topDrop: 4, coil: 0.6, bar: "drop", saddleW: 9, helmR: 4.6, pose: POSE(3, 3, 4, 3, 1, 2)}),
    phys: P(1.02, 0.91, 1.4, 1.25, 15, 1.5, 1.9),
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
    grip: 1.85,
    weight: 2,
    airRot: 0.595,
    fuel: 2.1,
    color: "#ff6b35",
    art: ART({tire: 6.4, spokes: 5, spokeW: 2.6, tube: 7.2, topDrop: -2, coil: 2.1, bar: "wide", saddleW: 16, helmR: 5.0, vents: 4, pose: POSE(-3, -5, -2, -5, -1, -5)}),
    phys: P(2, 1.68, 0.8, 0.88, 22, 1.7, 1.45),
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
    grip: 2.05,
    weight: 2.2,
    airRot: 0.526,
    fuel: 2.3,
    color: "#8ecae6",
    art: ART({tire: 7.0, spokes: 4, spokeW: 2.9, tube: 7.8, topDrop: -3, coil: 2.4, bar: "wide", saddleW: 17, helmR: 5.2, vents: 4, pose: POSE(-3, -6, -2, -6, -1, -6)}),
    phys: P(2.2, 1.9, 0.75, 0.85, 23, 1.55, 1.35),
    ultra: {
      fx: {"gripK": 1.75, "speedN": 1.10}, name: "冰封锁地", icon: "❄️", mode: "stable", cost: 371500, desc: "贴地滑行，永不腾空翻车" },
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
    grip: 1.35,
    weight: 1.15,
    airRot: 0.909,
    fuel: 1.9,
    color: "#4cc9f0",
    art: ART({tire: 3.6, spokes: 9, spokeW: 1.6, tube: 4.4, topDrop: 5, coil: 1.1, bar: "drop", saddleW: 11, helmR: 4.7, vents: 2, pose: POSE(2, 2, 3, 2, 1, 1)}),
    phys: P(1.15, 1.1, 1.2, 1.1, 18, 1.6, 1.8),
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
    grip: 1.55,
    weight: 2.3,
    airRot: 0.5,
    fuel: 2.2,
    color: "#2b2d42",
    art: ART({tire: 6.8, spokes: 6, spokeW: 2.7, tube: 7.5, topDrop: 1, coil: 2.3, bar: "wide", saddleW: 16, helmR: 5.1, vents: 3, pose: POSE(-3, -5, -2, -5, -1, -5)}),
    phys: P(2.3, 2.0, 0.7, 0.82, 24, 1.85, 1.55),
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
    grip: 2.15,
    weight: 2.5,
    airRot: 0.441,
    fuel: 2.5,
    color: "#6c757d",
    art: ART({tire: 7.8, spokes: 4, spokeW: 3.2, tube: 8.6, topDrop: -4, coil: 2.8, bar: "wide", saddleW: 19, helmR: 5.6, vents: 5, pose: POSE(-4, -7, -3, -7, -1, -7)}),
    phys: P(2.5, 2.27, 0.68, 0.8, 25, 1.3, 1.25),
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
    grip: 1.15,
    weight: 0.97,
    airRot: 1.149,
    fuel: 2.2,
    color: "#ffb703",
    art: ART({tire: 2.0, rim: false, spokes: 12, spokeW: 0.9, tube: 2.6, topDrop: 7, coil: 0.3, bar: "drop", saddleW: 8, helmR: 5.1, peak: false, pose: POSE(6, 7, 7, 6, 2.5, 4.5)}),
    phys: P(0.97, 0.87, 1.5, 1.3, 14, 1.65, 2.1),
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
    grip: 1.7,
    weight: 2.1,
    airRot: 0.472,
    fuel: 2.4,
    color: "#3a0ca3",
    art: ART({tire: 6.0, spokes: 8, spokeW: 2.4, tube: 7.0, topDrop: 3, coil: 2.0, bar: "wide", saddleW: 15, helmR: 5.2, vents: 3, pose: POSE(-2, -4, -2, -4, -0.5, -4)}),
    phys: P(2.1, 2.12, 0.75, 0.86, 22, 1.4, 1.6),
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
    grip: 1.4,
    weight: 0.82,
    airRot: 1.493,
    fuel: 2,
    color: "#adb5bd",
    art: ART({tire: 1.7, rim: false, spokes: 14, spokeW: 0.7, tube: 2.2, topDrop: 8, coil: 0.2, bar: "drop", saddleW: 6.5, helmR: 5.2, peak: false, pose: POSE(7, 8, 8, 7, 3, 5)}),
    phys: P(0.82, 0.67, 1.55, 1.35, 12, 1.55, 2.15),
    ultra: {
      fx: {"gripK": 1.20, "speedN": 1.10}, name: "幻影护盾", icon: "🌫️", mode: "shield", cost: 74000, desc: "任何姿态都摔不下去" },
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
    grip: 1.9,
    weight: 1.9,
    airRot: 0.559,
    fuel: 2.3,
    color: "#212529",
    art: ART({tire: 5.2, spokes: 9, spokeW: 2.2, tube: 6.4, topDrop: 2, coil: 1.8, bar: "wide", saddleW: 15, helmR: 5.3, peak: true, vents: 4, pose: POSE(-1, -3, -1, -3, 0, -3)}),
    phys: P(1.9, 1.79, 0.82, 0.9, 21, 1.95, 1.75),
    ultra: {
      fx: {"gripK": 1.80, "speedN": 1.40}, name: "蚀之护盾", icon: "🌑", mode: "shield", cost: 833500, desc: "任何姿态都摔不下去" },
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
    grip: 1.6,
    weight: 0.92,
    airRot: 1.235,
    fuel: 2.6,
    color: "#ff006e",
    art: ART({tire: 2.0, rim: false, spokes: 13, spokeW: 0.9, tube: 2.8, topDrop: 9, coil: 0.35, bar: "drop", saddleW: 7, helmR: 5.3, peak: false, vents: 2, pose: POSE(8, 9, 9, 8, 3.5, 6)}),
    phys: P(0.92, 0.81, 1.5, 1.3, 13, 2, 2.5),
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
    grip: 2.1,
    weight: 2.6,
    airRot: 0.38,
    fuel: 2.9,
    color: "#03045e",
    art: ART({tire: 8.2, spokes: 4, spokeW: 3.4, tube: 9.2, topDrop: -4, coil: 3.0, bar: "wide", saddleW: 20, helmR: 5.8, vents: 5, pose: POSE(-4, -8, -3, -8, -1, -8)}),
    phys: P(2.6, 2.63, 0.65, 0.78, 26, 1.6, 1.5),
    ultra: {
      fx: {"gripK": 2.00, "speedN": 1.20}, name: "湮灭领域", icon: "🕳️", mode: "stable", cost: 681000, desc: "贴地推进，永不腾空" },
  },

];

// 挂到每辆车的 ultra 上：render/panels.js 与 ui/shop.js 直接显示这一行
for (const v of VEHICLES) {
  if (v.ultra && v.ultra.fx) v.ultra.fxText = fxText(v.ultra.fx);
}
