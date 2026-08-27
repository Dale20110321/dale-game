const fs=require("fs");
const html=fs.readFileSync("C:/1/index.html","utf8");
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m){console.log("找不到script块");process.exit(1);}
try{new Function(m[1]);console.log("✅ 脚本语法正确");}
catch(e){console.log("❌ 语法错误:",e.message);process.exit(1);}
const checks=[
  ["100级","MAX_LV=100"],
  ["价格函数","function upCost"],
  ["引擎650","DRIVE=650+25*upgrades.engine"],
  ["极速cap350","Math.min(350,130+2.5*upgrades.engine"],
  ["金币+30","gold+=30"],
  ["过关+150","gold+=150"],
  ["限速下限60","Math.max(60,MAXV/(1+(-gmG.m)*1.3))"],
  ["无残留UP_COST","UP_COST"],
  ["upCost调用","upCost(lv+1)"],
];
for(const [n,p] of checks){
  if(n==="无残留UP_COST")console.log((html.includes(p)?"❌ "+n:"✅ 无UP_COST残留"));
  else console.log((html.includes(p)?"✅":"❌")+" "+n);
}