// 车辆数据：差异化旋转 / 油箱 / 抓地 / 重量
// color 同时用于车架主色、骑手服条纹、关卡面板边框
//
// phys（第 3 期 Task 1.1）：数据化的物理参数。质量与转动惯量是**真参数**（参与求解），
// 不再只是乘到加速度/极速上的倍率。沿用 drv/spd/grp/wgt/air/tank 以保持第 1/2 期标定不变。
//   mass     相对质量（求解器按逆质量加权）：重车更难被推动、更难翘头
//   inertia  相对转动惯量：空中角冲量 → 角速度 ω ∝ 1/inertia（与 air 互为倒数，断言约束）
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

export const VEHICLES = [
  {
    id: "trail",
    name: "驮马",
    icon: "🐴",
    desc: "均衡全能，新手之选",

    tier: "普通",
    costK: 1,
    price: 0,
    drv: 1.0,
    spd: 1.0,
    grp: 1,
    wgt: 1.0,
    air: 1.0,
    tank: 1,
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
    drv: 1.35,
    spd: 1.4,
    grp: 0.72,
    wgt: 0.8,
    air: 1.4,
    tank: 0.75,
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
    drv: 1.12,
    spd: 0.7,
    grp: 1.45,
    wgt: 1.5,
    air: 0.75,
    tank: 1.45,
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
      name: "贴地模式",
      icon: "🛡️",
      mode: "stable",
      cost: 40500,
      desc: "磁悬浮贴地：始终贴地，永不翻车",
    },
  },

  // ================================================================
  //  以下 4 辆是"高价变态车"：底子就吊打前三辆，满级后再开终极模式更是离谱。
  //  下面几条是被物理逼出来的硬约束，改数值前先想清楚：
  //    · phys.mass 两两不同、phys.inertia 两两不同
  //    · air × inertia ≈ 1（空中角冲量 ω ∝ air/inertia，两者互为倒数）
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
    drv: 1.55,
    spd: 1.85,
    grp: 1.2,
    wgt: 0.85,
    air: 0.87,
    tank: 1.3,
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
    drv: 1.4,
    spd: 1.6,
    grp: 1.55,
    wgt: 0.7,
    air: 1.62,
    tank: 2.2,
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
    drv: 1.6,
    spd: 1.35,
    grp: 2.1,
    wgt: 2.4,
    air: 0.42,
    tank: 2.6,
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
    drv: 1.9,
    spd: 2.1,
    grp: 1.35,
    wgt: 0.6,
    air: 0.95,
    tank: 1.6,
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
    drv: 2.4,
    spd: 2.6,
    // ★ grp=1.9 是反复标定的结果，不是随手填的：抓地拉到 3.2 时 μ 达 5.9，
    //   轮胎**永远不会突破摩擦极限** —— 冰面空转 / 滑移率等一整套"打滑是物理、
    //   不是特效"的断言会全部归零（实测绿野与冰面滑移率都是 0.000）。
    //   1.9 让满级 μ≈3.5，略高于磁力堡垒的 3.86 之下、全项目最高，且冰面仍能打滑。
    grp: 3,
    wgt: 1.2,
    air: 0.55,
    tank: 3.4,
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
      name: "绝对形态",
      icon: "🌌",
      mode: "absolut",
      builtin: true,
      cost: 1020000,
      desc: "免解锁：350 km/h 极速 · 怎么摔都摔不坏 · 抗摔不设上限",
    },
  },


  // ================================================================
  //  档位阶梯（共 26 辆）：普通 5 / 稀有 6 / 史诗 6 / 传说 5 / 神话 4
  //  · costK = 升级费倍率。四项升满 = 28,240 × costK：
  //      普通 28,240 / 稀有 62,128 / 史诗 141,200 / 传说 310,640 / 神话 706,000 / 奇点号 1,129,600
  //  · 除山地车（免费新手车）外每辆都有「最终形态」，六种 mode 各 4 辆；
  //    奇点号是唯一免解锁的内置形态（absolut），但它的四项升级照样要花钱买。
  //  · 极速由**扭矩曲线的归零转速**决定，也就是 phys.rpm 才是"贵车更快"的唯一干净杠杆
  //    （堆 torque 只会在平路撞上抓地上限，堆 grp 只会更抗滑而不是更快）。
  //    所以 rpm 随档位递增：普通 ~1.2 / 稀有 ~1.5 / 史诗 ~1.6 / 传说 ~1.9 / 神话 ~2.0。
  //  · 改数值前必读文件头：
  //    mass / inertia 全表两两不同、|air × inertia − 1| ≤ 0.05、
  //    grp ≤ 2.2（再高轮胎永不突破摩擦极限，打滑类断言会全部归零）、
  //    torque ≤ 2.0（再高容易后空翻）。
  // ================================================================

  // ---------------- 普通档 ----------------

  // ---------------- 普通档 ----------------
{
    id: "commuter",
    name: "蜂鸟",
    icon: "🐦",
    desc: "城市里最灵活的一台，钻小巷、爬缓坡都不费力",
    tier: "普通",
    costK: 1,
    price: 4000,
    drv: 1.05,
    spd: 1.05,
    grp: 1.05,
    wgt: 0.95,
    air: 1.124,
    tank: 1.2,
    color: "#7a9e7e",
    art: ART({tire: 2.6, spokes: 8, spokeW: 1.3, tube: 3.2, topDrop: 4, coil: 0.7, bar: "flat", saddleW: 11, helmR: 4.3, pose: POSE(1, 1, 2, 1, 0.5, -1)}),
    phys: P(0.95, 0.89, 1.1, 1.05, 15, 1.05, 1.25),
    ultra: { name: "通勤喷射", icon: "🛴", mode: "warp", cost: 12000, desc: "踩住油门持续加速，0.6 秒逼近极速" },
  },
{
    id: "dirt",
    name: "山魈",
    icon: "🐒",
    desc: "松软地面上的老手，颠簸路面也稳当",
    tier: "稀有",
    costK: 5,
    price: 12000,
    drv: 1.2,
    spd: 0.95,
    grp: 1.3,
    wgt: 1.25,
    air: 0.862,
    tank: 1.35,
    color: "#b07d4f",
    art: ART({tire: 4.6, spokes: 6, spokeW: 1.9, tube: 5.0, topDrop: 0, coil: 1.5, bar: "wide", saddleW: 13, helmR: 4.4, vents: 2, pose: POSE(-1, -2, -1, -2, -0.5, -2.5)}),
    phys: P(1.25, 1.16, 0.9, 0.95, 19, 1.2, 1.15),
    ultra: { name: "泥地推进", icon: "🏇", mode: "railgun", cost: 49500, desc: "推力与红线同时暴涨，泥地也能飞" },
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
    drv: 1.3,
    spd: 1.5,
    grp: 1,
    wgt: 0.9,
    air: 1.22,
    tank: 1.4,
    color: "#a8d8e8",
    art: ART({tire: 2.2, rim: false, spokes: 10, spokeW: 1.0, tube: 2.8, topDrop: 5, coil: 0.5, bar: "drop", saddleW: 9, helmR: 4.8, peak: false, pose: POSE(3, 3, 4, 3, 1, 2)}),
    phys: P(0.9, 0.82, 1.25, 1.1, 14, 1.3, 1.55),
    ultra: { name: "暴风增压", icon: "🌨️", mode: "surge", cost: 14500, desc: "红线与极速暴涨，雪地起飞" },
  },
{
    id: "reef",
    name: "潮生",
    icon: "🐚",
    desc: "潮间带专属，湿滑礁石上稳如磐石",
    tier: "史诗",
    costK: 12,
    price: 26000,
    drv: 1.25,
    spd: 1.15,
    grp: 1.75,
    wgt: 1.35,
    air: 0.8,
    tank: 1.5,
    color: "#ff8fab",
    art: ART({tire: 5.0, spokes: 5, spokeW: 2.2, tube: 5.6, topDrop: -1, coil: 1.6, bar: "wide", saddleW: 14, helmR: 4.4, vents: 3, pose: POSE(-2, -3, -2, -3, -0.8, -3)}),
    phys: P(1.35, 1.25, 0.88, 0.92, 19, 1.25, 1.4),
    ultra: { name: "潮汐穿行", icon: "🐚", mode: "phase", cost: 135500, desc: "摔不坏 + 燃料无限 + 危险段限速豁免" },
  },
{
    id: "canyon",
    name: "赤鹫",
    icon: "🦅",
    desc: "台地上连落差，俯冲落地比谁都稳",
    tier: "稀有",
    costK: 5,
    price: 5500,
    drv: 1.45,
    spd: 1.6,
    grp: 1.1,
    wgt: 0.88,
    air: 1.163,
    tank: 1.25,
    color: "#cd5c5c",
    art: ART({tire: 2.8, rim: false, spokes: 12, spokeW: 1.1, tube: 3.4, topDrop: 6, coil: 1.2, bar: "drop", saddleW: 8, helmR: 4.9, pose: POSE(4, 4, 5, 4, 1.5, 3)}),
    phys: P(0.88, 0.86, 1.3, 1.15, 17, 1.45, 1.7),
    ultra: { name: "台地飞驰", icon: "🏜️", mode: "warp", cost: 18000, desc: "持续喷射：踩住油门就一直加速" },
  },
{
    id: "aurora",
    name: "星轨",
    icon: "🌠",
    desc: "极夜里最亮的一辆，空中转得飞快",
    tier: "普通",
    costK: 1,
    price: 3500,
    drv: 1.35,
    spd: 1.55,
    grp: 0.95,
    wgt: 0.78,
    air: 1.667,
    tank: 1.3,
    color: "#66f0c8",
    art: ART({tire: 1.8, rim: false, spokes: 13, spokeW: 0.8, tube: 2.4, topDrop: 7, coil: 0.4, bar: "drop", saddleW: 7, helmR: 5.0, peak: false, pose: POSE(5, 6, 6, 5, 2, 4)}),
    phys: P(0.78, 0.6, 1.35, 1.15, 13, 1.35, 1.5),
    ultra: { name: "极光穿行", icon: "🌌", mode: "phase", cost: 10000, desc: "摔不坏 + 燃料无限 + 危险段限速豁免" },
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
    drv: 1.75,
    spd: 1.7,
    grp: 1,
    wgt: 1.02,
    air: 1.099,
    tank: 1.8,
    color: "#d4a373",
    art: ART({tire: 2.6, spokes: 10, spokeW: 1.2, tube: 3.2, topDrop: 4, coil: 0.6, bar: "drop", saddleW: 9, helmR: 4.6, pose: POSE(3, 3, 4, 3, 1, 2)}),
    phys: P(1.02, 0.91, 1.4, 1.25, 15, 1.5, 1.9),
    ultra: { name: "沙暴穿行", icon: "🌪️", mode: "phase", cost: 33000, desc: "摔不坏 + 燃料无限 + 危险段限速豁免" },
  },
{
    id: "magma",
    name: "焰裔",
    icon: "🔥",
    desc: "高重力熔岩滩上的重型战车",
    tier: "传说",
    costK: 25,
    price: 47500,
    drv: 1.7,
    spd: 1.4,
    grp: 1.85,
    wgt: 2,
    air: 0.595,
    tank: 2.1,
    color: "#ff6b35",
    art: ART({tire: 6.4, spokes: 5, spokeW: 2.6, tube: 7.2, topDrop: -2, coil: 2.1, bar: "wide", saddleW: 16, helmR: 5.0, vents: 4, pose: POSE(-3, -5, -2, -5, -1, -5)}),
    phys: P(2, 1.68, 0.8, 0.88, 22, 1.7, 1.45),
    ultra: { name: "熔岩护壳", icon: "🛡️", mode: "shield", cost: 303500, desc: "任何姿态都摔不下去，操控全保留" },
  },
{
    id: "glacier",
    name: "冰魄",
    icon: "🧊",
    desc: "冰面上最不容易失控的那台",
    tier: "传说",
    costK: 25,
    price: 55500,
    drv: 1.55,
    spd: 1.3,
    grp: 2.05,
    wgt: 2.2,
    air: 0.526,
    tank: 2.3,
    color: "#8ecae6",
    art: ART({tire: 7.0, spokes: 4, spokeW: 2.9, tube: 7.8, topDrop: -3, coil: 2.4, bar: "wide", saddleW: 17, helmR: 5.2, vents: 4, pose: POSE(-3, -6, -2, -6, -1, -6)}),
    phys: P(2.2, 1.9, 0.75, 0.85, 23, 1.55, 1.35),
    ultra: { name: "冰封锁地", icon: "❄️", mode: "stable", cost: 371500, desc: "贴地滑行，永不腾空翻车" },
  },
{
    id: "monsoon",
    name: "雨燕",
    icon: "🌧️",
    desc: "暴雨泥石流里照样全油门",
    tier: "史诗",
    costK: 12,
    price: 22000,
    drv: 1.6,
    spd: 1.75,
    grp: 1.35,
    wgt: 1.15,
    air: 0.909,
    tank: 1.9,
    color: "#4cc9f0",
    art: ART({tire: 3.6, spokes: 9, spokeW: 1.6, tube: 4.4, topDrop: 5, coil: 1.1, bar: "drop", saddleW: 11, helmR: 4.7, vents: 2, pose: POSE(2, 2, 3, 2, 1, 1)}),
    phys: P(1.15, 1.1, 1.2, 1.1, 18, 1.6, 1.8),
    ultra: { name: "季风过载", icon: "🌧️", mode: "surge", cost: 110500, desc: "红线与极速暴涨" },
  },
{
    id: "obsidian",
    name: "玄铁",
    icon: "⬛",
    desc: "重到离谱，却快得离谱",
    tier: "传说",
    costK: 25,
    price: 65000,
    drv: 1.85,
    spd: 1.6,
    grp: 1.55,
    wgt: 2.3,
    air: 0.5,
    tank: 2.2,
    color: "#2b2d42",
    art: ART({tire: 6.8, spokes: 6, spokeW: 2.7, tube: 7.5, topDrop: 1, coil: 2.3, bar: "wide", saddleW: 16, helmR: 5.1, vents: 3, pose: POSE(-3, -5, -2, -5, -1, -5)}),
    phys: P(2.3, 2.0, 0.7, 0.82, 24, 1.85, 1.55),
    ultra: { name: "黑曜石炮", icon: "⬛", mode: "railgun", cost: 454500, desc: "推力与红线同时暴涨" },
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
    drv: 1.9,
    spd: 1.35,
    grp: 2.15,
    wgt: 2.5,
    air: 0.441,
    tank: 2.5,
    color: "#6c757d",
    art: ART({tire: 7.8, spokes: 4, spokeW: 3.2, tube: 8.6, topDrop: -4, coil: 2.8, bar: "wide", saddleW: 19, helmR: 5.6, vents: 5, pose: POSE(-4, -7, -3, -7, -1, -7)}),
    phys: P(2.5, 2.27, 0.68, 0.8, 25, 1.3, 1.25),
    ultra: { name: "泰坦领域", icon: "🗿", mode: "stable", cost: 248000, desc: "贴地推进，永不腾空" },
  },
{
    id: "solstice",
    name: "逐日",
    icon: "☀️",
    desc: "追着太阳跑，滑行距离长得离谱",
    tier: "史诗",
    costK: 12,
    price: 14000,
    drv: 1.65,
    spd: 2.05,
    grp: 1.15,
    wgt: 0.97,
    air: 1.149,
    tank: 2.2,
    color: "#ffb703",
    art: ART({tire: 2.0, rim: false, spokes: 12, spokeW: 0.9, tube: 2.6, topDrop: 7, coil: 0.3, bar: "drop", saddleW: 8, helmR: 5.1, peak: false, pose: POSE(6, 7, 7, 6, 2.5, 4.5)}),
    phys: P(0.97, 0.87, 1.5, 1.3, 14, 1.65, 2.1),
    ultra: { name: "至日喷射", icon: "☀️", mode: "warp", cost: 60500, desc: "一脚油门不见尽头" },
  },
{
    id: "vanguard",
    name: "破阵",
    icon: "🔺",
    desc: "重装与速度的折中，攻守兼备",
    tier: "传说",
    costK: 25,
    price: 35000,
    drv: 2,
    spd: 1.75,
    grp: 1.7,
    wgt: 2.1,
    air: 0.472,
    tank: 2.4,
    color: "#3a0ca3",
    art: ART({tire: 6.0, spokes: 8, spokeW: 2.4, tube: 7.0, topDrop: 3, coil: 2.0, bar: "wide", saddleW: 15, helmR: 5.2, vents: 3, pose: POSE(-2, -4, -2, -4, -0.5, -4)}),
    phys: P(2.1, 2.12, 0.75, 0.86, 22, 1.4, 1.6),
    ultra: { name: "先锋轨道炮", icon: "🔺", mode: "railgun", cost: 202500, desc: "推力与红线同时暴涨" },
  },
{
    id: "phantom",
    name: "幽影",
    icon: "🌫️",
    desc: "传说档里最轻，撞不坏还滑得远",
    tier: "史诗",
    costK: 12,
    price: 16500,
    drv: 1.55,
    spd: 2,
    grp: 1.4,
    wgt: 0.82,
    air: 1.493,
    tank: 2,
    color: "#adb5bd",
    art: ART({tire: 1.7, rim: false, spokes: 14, spokeW: 0.7, tube: 2.2, topDrop: 8, coil: 0.2, bar: "drop", saddleW: 6.5, helmR: 5.2, peak: false, pose: POSE(7, 8, 8, 7, 3, 5)}),
    phys: P(0.82, 0.67, 1.55, 1.35, 12, 1.55, 2.15),
    ultra: { name: "幻影护盾", icon: "🌫️", mode: "shield", cost: 74000, desc: "任何姿态都摔不下去" },
  },
{
    id: "eclipse",
    name: "天蚀",
    icon: "🌑",
    desc: "传说档的终点，越暗的地方它越快",
    tier: "神话",
    costK: 40,
    price: 103000,
    drv: 1.95,
    spd: 1.9,
    grp: 1.9,
    wgt: 1.9,
    air: 0.559,
    tank: 2.3,
    color: "#212529",
    art: ART({tire: 5.2, spokes: 9, spokeW: 2.2, tube: 6.4, topDrop: 2, coil: 1.8, bar: "wide", saddleW: 15, helmR: 5.3, peak: true, vents: 4, pose: POSE(-1, -3, -1, -3, 0, -3)}),
    phys: P(1.9, 1.79, 0.82, 0.9, 21, 1.95, 1.75),
    ultra: { name: "蚀之护盾", icon: "🌑", mode: "shield", cost: 833500, desc: "任何姿态都摔不下去" },
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
    drv: 2.1,
    spd: 2.3,
    grp: 1.6,
    wgt: 0.92,
    air: 1.235,
    tank: 2.6,
    color: "#ff006e",
    art: ART({tire: 2.0, rim: false, spokes: 13, spokeW: 0.9, tube: 2.8, topDrop: 9, coil: 0.35, bar: "drop", saddleW: 7, helmR: 5.3, peak: false, vents: 2, pose: POSE(8, 9, 9, 8, 3.5, 6)}),
    phys: P(0.92, 0.81, 1.5, 1.3, 13, 2, 2.5),
    ultra: { name: "新星过载", icon: "💫", mode: "surge", cost: 165500, desc: "红线与极速暴涨，一路顶到极速" },
  },
{
    id: "oblivion",
    name: "终焉",
    icon: "🕳️",
    desc: "神话档最重：一台会走路的深坑",
    tier: "神话",
    costK: 40,
    price: 88000,
    drv: 2.2,
    spd: 1.8,
    grp: 2.1,
    wgt: 2.6,
    air: 0.38,
    tank: 2.9,
    color: "#03045e",
    art: ART({tire: 8.2, spokes: 4, spokeW: 3.4, tube: 9.2, topDrop: -4, coil: 3.0, bar: "wide", saddleW: 20, helmR: 5.8, vents: 5, pose: POSE(-4, -8, -3, -8, -1, -8)}),
    phys: P(2.6, 2.63, 0.65, 0.78, 26, 1.6, 1.5),
    ultra: { name: "湮灭领域", icon: "🕳️", mode: "stable", cost: 681000, desc: "贴地推进，永不腾空" },
  },

];
