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
    name: "山地车",
    icon: "🚲",
    desc: "均衡全能，新手之选",
    price: 0,
    drv: 1.0,
    spd: 1.0,
    grp: 1.0,
    wgt: 1.0,
    air: 1.0,
    tank: 1.0,
    color: "#314ccd",
    // 山地车：常规形态 —— 中等胎宽、平把、中等上管、可见避震弹簧、中立骑姿
    art: ART({}),
    phys: P(1.0, 1.0, 1.0, 1.0, 16, 1.0, 1.0),
  },
  {
    id: "sport",
    name: "竞速车",
    icon: "🏍️",
    desc: "极速快，空中旋转快，油箱小",
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
      cost: 80000,
      desc: "引擎过载：加速与极速大幅提升，风驰电掣",
    },
  },
  {
    id: "mud",
    name: "越野车",
    icon: "🚜",
    desc: "抓地强，耐撞，油箱大，旋转慢",
    price: 9000,
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
    //   两个区间没有交集。所以保留"抓地无敌"，并让相关断言对它显式跳过（见 audit-physics）。
    phys: P(1.5, 1.35, 0.85, 0.9, 20, 1.12, 0.85),
    /** 特殊终极模式：全部升级满级后可花金币解锁 */
    ultra: {
      name: "贴地模式",
      icon: "🛡️",
      mode: "stable",
      cost: 120000,
      desc: "磁悬浮贴地：始终贴地，永不翻车",
    },
  },

  // ================================================================
  //  以下 4 辆是"高价变态车"：底子就吊打前三辆，满级后再开终极模式更是离谱。
  //  设计约束（被 autotest 锁死，改数值前先看 tools/autotest.mjs 的车辆体检）：
  //    · phys.mass 两两不同、phys.inertia 两两不同
  //    · air × inertia ≈ 1（空中角冲量 ω ∝ air/inertia，两者互为倒数）
  //    · ultra.mode 是物理层唯一的分派依据（见 physics/bike.js 的 activeMode）
  // ================================================================
  {
    id: "volt",
    name: "电磁脉冲车",
    icon: "⚡",
    desc: "变态：满级极速是山地车的 2 倍，爬坡不喘",
    price: 32000,
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
      cost: 260000,
      desc: "电磁轨道炮：推力与红线同时暴涨，平地直接贴地飞行",
    },
  },
  {
    id: "ghost",
    name: "影行者",
    icon: "👻",
    desc: "变态：摔不坏、油无限、危险段随便冲",
    price: 58000,
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
      cost: 400000,
      desc: "相位穿行：永不摔车 + 燃料无限 + 危险段限速豁免",
    },
  },
  {
    id: "fort",
    name: "磁力堡垒",
    icon: "🛡️",
    desc: "变态：巨重巨稳，抓地碾压，翻过来也能爬起来",
    price: 96000,
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
      cost: 620000,
      desc: "磁力护盾：任何姿态都摔不下去，腾空与操控全部保留",
    },
  },
  {
    id: "photon",
    name: "光子摩托",
    icon: "💫",
    desc: "变态：本项目最快的脚，0.7 秒冲到极速",
    price: 150000,
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
      cost: 1000000,
      desc: "光子跃迁：踩住油门持续喷射，0.7 秒逼近极速",
    },
  },
  {
    id: "singularity",
    name: "奇点号",
    icon: "🌌",
    desc: "究极终局：350 km/h 极速 · 摔不坏 · 全项目最强参数",
    price: 2000000,
    // ★ 升级费倍率：只有这台车 > 1。四项升满 = 7060 × 4 × 40 = 1,129,600 金币，
    //   是普通档（28,240）的 40 倍。摔不坏是**内置**特性，四项升级仍要正常花钱买。
    costK: 40,
    tier: "神话",
    drv: 2.4,
    spd: 2.6,
    // ★ grp=1.9 是反复标定的结果，不是随手填的：抓地拉到 3.2 时 μ 达 5.9，
    //   轮胎**永远不会突破摩擦极限** —— 冰面空转 / 滑移率等一整套"打滑是物理、
    //   不是特效"的断言会全部归零（实测绿野与冰面滑移率都是 0.000）。
    //   1.9 让满级 μ≈3.5，略高于磁力堡垒的 3.86 之下、全项目最高，且冰面仍能打滑。
    grp: 1.9,
    wgt: 1.2,
    air: 0.55,
    tank: 3.2,
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
    phys: P(1.2, 1.82, 1.6, 1.5, 26, 3.0, 2.2),
    /** 内置最终形态：免解锁、永久生效（升级照常花钱） */
    ultra: {
      name: "绝对形态",
      icon: "🌌",
      mode: "absolut",
      builtin: true,
      cost: 0,
      desc: "免解锁：350 km/h 极速 · 怎么摔都摔不坏 · 抗摔不设上限",
    },
  },
];
