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
    phys: P(0.8, 0.7, 1.25, 1.1, 13, 1.35, 1.25),
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
    phys: P(1.5, 1.35, 0.85, 0.9, 20, 1.12, 0.85),
  },
];
