// 地形主题：差异化物理（重力 / 抓地）+ 天空配色 + 装饰类型
// deco 为纯视觉装饰类型，由 render/entities.js 绘制
export const THEMES = [
  {
    name: "绿野",
    g: 750,
    traction: 1.0,
    sky: ["#7ec8f7", "#cdeffd", "#eef8fc"],
    sun: "#ffe677",
    pal: ["#3f7d3a", "#58a24f", "#8b5e3c"],
    ground: "#c4a882",
    deco: ["tree", "bush"],
  },
  {
    name: "雪原",
    g: 750,
    traction: 0.72,
    sky: ["#bcd8f2", "#e6f2fd", "#fbfeff"],
    sun: "#fff3c4",
    pal: ["#dbe9f5", "#eef5fb", "#9fb8cc"],
    ground: "#eef5fb",
    deco: ["snowman", "icespike"],
  },
  {
    name: "荒漠",
    g: 750,
    traction: 0.88,
    sky: ["#ffc46b", "#ffe0b0", "#fff3d8"],
    sun: "#ffd27a",
    pal: ["#c28b4f", "#d9a766", "#7a5a36"],
    ground: "#e6c98f",
    deco: ["rock", "cactus"],
  },
  {
    name: "月面",
    g: 350,
    traction: 1.0,
    sky: ["#05070f", "#0d1326", "#141d3a"],
    sun: "#f6f8ff",
    pal: ["#6a7078", "#828a94", "#4d5259"],
    ground: "#9aa2ad",
    deco: ["crater", "moonrock"],
  },
];
