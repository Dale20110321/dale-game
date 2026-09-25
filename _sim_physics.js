// 验证 v4：1) 跳跃已彻底移除 2) 空中转体（左右键+惯性） 3) 地形难度 4) 油罐续航布局 5) 燃料消耗速率
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m){console.error("❌ 未找到 <script> 块");process.exit(1);}
let code=m[1];
// 探针：暴露内部状态，便于断言
code=code.replace("requestAnimationFrame(loop);",
"requestAnimationFrame(loop);globalThis.__probe={"+
"can:()=>canisters.map(c=>({x:Math.round(c.x),taken:c.taken})),"+
"bike:()=>({rx:Math.round(bike.rear.x),ry:Math.round(bike.rear.y),gY:Math.round(groundY(bike.rear.x)),grounded:bike.grounded,speed:Math.round(bike.speed),angVel:bike.angVel,rotAcc:bike.rotAcc}),"+
"fuel:()=>fuel,"+
"keys:()=>({l:key.left,r:key.right}),"+
"airTime:()=>airTime,"+
"slope:()=>LEVELS[lvIdx].maxSlope,"+
"len:()=>LEVELS[lvIdx].len,"+
"veh:()=>VEHICLES[currentVehicle],"+
"up:()=>getUp(),"+
"air:(h)=>{const d=h||400;for(const p of [bike.rear,bike.front,bike.head]){p.y-=d;p.py-=d;}bike.grounded=0;bike.angVel=0;bike.rotAcc=0;}"+
"};");
function makeEl(id){const self={id,style:{},_cls:new Set(["hidden"]),children:[],_handlers:{},
  classList:{add:c=>self._cls.add(c),remove:c=>self._cls.delete(c),toggle:(c,f)=>{if(f===undefined)self._cls.has(c)?self._cls.delete(c):self._cls.add(c);else f?self._cls.add(c):self._cls.delete(c);},contains:c=>self._cls.has(c)},
  textContent:"",innerHTML:"",width:0,height:0,
  addEventListener(type,fn){ (self._handlers[type]=self._handlers[type]||[]).push(fn); },
  fire(type,ev){ for(const fn of (self._handlers[type]||[])) fn(ev||{}); },
  appendChild(){},insertBefore(c){self.children.push(c);return c;},
  getContext(){return ctxStub;},disabled:false,dataset:{},parentNode:{style:{}}};return self;}
let ctxStub={canvas:{width:0,height:0},setTransform(){},scale(){},translate(){},rotate(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},ellipse(){},fillRect(){},fillText(){},fillStyle:"",strokeStyle:"",lineWidth:1,font:"",textAlign:"",globalAlpha:1,roundRect(){},quadraticCurveTo(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}}),clearRect(){}};
ctxStub=new Proxy(ctxStub,{get:(t,k)=>{if(k in t)return t[k];return ()=>{};},set:(t,k,v)=>{t[k]=v;return true;}});
const elements={};
const doc={getElementById:id=>{if(!elements[id])elements[id]=makeEl(id);return elements[id];},
  querySelector:sel=>{if(!elements[sel])elements[sel]=makeEl(sel);return elements[sel];},
  querySelectorAll:()=>[],createElement:()=>makeEl(""),documentElement:makeEl("html"),body:makeEl("body"),fullscreenElement:null,exitFullscreen(){},webkitExitFullscreen(){}};
const listeners={};
const store={"bike_unlocked":"19"};
globalThis.document=doc;
globalThis.window={addEventListener(){},devicePixelRatio:1,innerWidth:1280,innerHeight:800,AudioContext:function(){},webkitAudioContext:function(){},requestAnimationFrame(){},setTimeout(){},matchMedia:()=>({matches:false})};
globalThis.navigator={maxTouchPoints:0};
globalThis.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
globalThis.addEventListener=(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn);};
globalThis.CanvasRenderingContext2D={prototype:{}};
let rafCb=null;
let errors=[];
try{
  new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,globalThis.window,navigator,globalThis.localStorage,(fn)=>{rafCb=fn;},(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn);},1280,800);
}catch(e){
  console.log("❌ 初始化错误:",e.message);process.exit(1);
}
function keyEvent(code,key,down){return{code,key:key||"",preventDefault(){}};}
function press(code,key,down){for(const fn of (listeners[down?"keydown":"keyup"]||[]))fn(keyEvent(code,key));}
function enterLevel(lv){
  doc.getElementById("btnLevels").fire("click");
  const fakeCell={closest:sel=>sel===".lvCell"?{dataset:{lv:String(lv)}}:null};
  doc.getElementById("lvGrid").fire("click",{target:fakeCell});
}
let t=0;
function tick(n){for(let i=0;i<n;i++){t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;try{cb(t);}catch(e){errors.push("frame "+i+": "+e.message);}}}}

const P=()=>globalThis.__probe;
let pass=0,fail=0;
function assert(name,cond,extra){
  if(cond){pass++;console.log("  ✅",name,extra||"");}
  else{fail++;console.log("  ❌",name,extra||"");}
}

// ---- 测试1：地形难度（最大合成坡度 25°→35°）----
// 说明：maxSlope 是三层波峰叠加的理论上界，实际地形局部坡度略低（波峰不重合）。
// 上界压在 35° 是有意的：原装车静止爬坡极限 atan(DRIVE/GRAV)=31°，满改车约 43.5°，
// 因此第20关需要"靠下坡攒速度冲坡 + 升级车架"，而不是硬爬。
console.log("【地形难度】");
enterLevel(0);tick(3);
const s1=P().slope();
enterLevel(19);tick(3);
const s20=P().slope();
console.log("  第1关最大坡度 "+s1.toFixed(1)+"° / 第20关 "+s20.toFixed(1)+"°");
assert("第1关坡度落在 20°~30°",s1>20&&s1<30,"实际 "+s1.toFixed(1)+"°");
assert("第20关坡度落在 30°~42°",s20>30&&s20<42,"实际 "+s20.toFixed(1)+"°");
assert("第20关坡度超过原装车爬坡极限(31°)",s20>31,"实际 "+s20.toFixed(1)+"°");
assert("难度随关卡递增(Δ>8°)",s20>s1+8,"Δ="+(s20-s1).toFixed(1)+"°");

// ---- 测试2：跳跃已彻底移除 ----
console.log("【跳跃移除】");
enterLevel(0);tick(5);
// 2a. Space / ArrowUp 不应绑定任何控制键
press("ArrowRight","ArrowRight",false);press("ArrowLeft","ArrowLeft",false);
press("Space"," ",true);press("ArrowUp","ArrowUp",true);
tick(2);
const k= P().keys();
assert("按 Space/↑ 不触发任何控制键",k.l===false&&k.r===false,"left="+k.l+" right="+k.r);
// 2b. 只按 Space 不应产生位移/旋转
const bA=P().bike();
tick(120);
const bB=P().bike();
assert("只按 Space 120帧不产生位移",Math.abs(bB.rx-bA.rx)<6,"Δx="+(bB.rx-bA.rx));
assert("只按 Space 不产生旋转",Math.abs(bB.rotAcc)<1e-6,"rotAcc="+bB.rotAcc);
assert("只按 Space 不产生空中时间",P().airTime()<0.05,"airTime="+P().airTime().toFixed(2)+"s");
press("Space"," ",false);press("ArrowUp","ArrowUp",false);

// ---- 测试3：空中转体（右键顺时针 / 左键逆时针 / 带惯性）----
console.log("【空中转体】");
enterLevel(0);tick(3);
// 3a. 右键 → 顺时针（angVel>0）
P().air(900);
press("ArrowRight","ArrowRight",true);
tick(12);
const r1=P().bike();
assert("空中按右键产生顺时针角速度",r1.angVel>0.5,"angVel="+r1.angVel.toFixed(2)+" rad/s");
assert("空中按右键产生顺时针位移",r1.rotAcc>0,"rotAcc="+r1.rotAcc.toFixed(3));
// 角速度上限约束
tick(15);
const r2=P().bike();
assert("角速度受上限约束(<2.9rad/s)",r2.angVel<2.9,"angVel="+r2.angVel.toFixed(2));
// 3b. 松手后惯性衰减（不是瞬间归零）
press("ArrowRight","ArrowRight",false);
tick(1);
const c1=P().bike();
assert("松手瞬间仍有角速度（惯性）",c1.angVel>0.2,"angVel="+c1.angVel.toFixed(3));
tick(15);
const c2=P().bike();
assert("松手后角速度平滑衰减",c2.angVel<c1.angVel*0.6&&c2.angVel>0.01,"1帧后="+c1.angVel.toFixed(3)+" → 16帧后="+c2.angVel.toFixed(3));
assert("惯性滑行使旋转继续累积",c2.rotAcc>r1.rotAcc,"rotAcc="+c2.rotAcc.toFixed(3));
// 3c. 左键 → 逆时针（angVel<0）
enterLevel(0);tick(3);
P().air(900);
press("ArrowLeft","ArrowLeft",true);
tick(12);
const l1=P().bike();
assert("空中按左键产生逆时针角速度",l1.angVel<-0.5,"angVel="+l1.angVel.toFixed(2));
assert("左右方向相反",l1.angVel<0&&r1.angVel>0,"L="+l1.angVel.toFixed(2)+" R="+r1.angVel.toFixed(2));
press("ArrowLeft","ArrowLeft",false);
// 3d. 落地清零角速度
tick(120);
const g1=P().bike();
assert("落地后角速度归零",g1.grounded>0&&g1.angVel===0,"g="+g1.grounded+" angVel="+g1.angVel);

// ---- 测试4：油罐续航布局 ----
console.log("【油罐布局】");
enterLevel(0);tick(5);
const cans1=P().can();
console.log("  第1关油罐:",JSON.stringify(cans1));
assert("第1关油罐数=1",cans1.length===1,"实际 "+cans1.length);
assert("第1关油罐在中段",cans1.length===1&&cans1[0].x>1500&&cans1[0].x<2500,"x="+(cans1[0]?cans1[0].x:"-"));
enterLevel(19);tick(5);
const cans20=P().can();
console.log("  第20关油罐:",JSON.stringify(cans20));
assert("第20关油罐数 2~4",cans20.length>=2&&cans20.length<=4,"实际 "+cans20.length);
if(cans20.length>=2){
  const gp=(cans20[cans20.length-1].x-cans20[0].x)/(cans20.length-1);
  assert("油罐间距>2500px（旧版约430px）",gp>2500,"平均间距 "+Math.round(gp)+"px");
}

// ---- 测试4b：全关卡燃油可行性（独立复算，不依赖游戏内公式）----
console.log("【燃油可行性 · 全20关】");
let bad=[];
for(let lv=0;lv<20;lv++){
  enterLevel(lv);tick(2);
  const v=P().veh(),up=P().up(),len=P().len(),n=P().can().length;
  const fMax=v.tank*(1+0.004*up.frame);
  const kIdle=0.005*v.wgt/fMax,kFull=0.021*v.wgt/fMax;
  const kAvg=kIdle+0.62*(kFull-kIdle);
  const range=(80.6*v.spd)/kAvg;
  const need=len/range;                    // 通关所需油量（箱）
  const avail=1+0.45*n;                    // 起始1箱 + 每罐0.45箱
  if(avail<need)bad.push("第"+(lv+1)+"关: 需"+need.toFixed(2)+"箱 > 有"+avail.toFixed(2)+"箱");
  if(n<1)bad.push("第"+(lv+1)+"关: 无油罐");
}
assert("20关全部可通关（油量≥需求）",bad.length===0,bad.slice(0,4).join(" | "));

// ---- 测试5：燃料消耗速率 ----
// 理论值：原装车滑行 0.005/s + 全油门 0.021/s = 0.026/s → 50% 约 19.2s。
// 实测偏长是因为摔车/昏迷期间 drainFuel 暂停，故窗口放宽到 14~26s。
console.log("【燃料消耗】");
enterLevel(19);tick(5);
const f0=P().fuel();
assert("第20关初始满油",f0>=0.99,"fuel="+f0.toFixed(2));
press("ArrowRight","ArrowRight",true);
let frames=0;
for(let i=0;i<1800;i++){tick(1);frames++;if(P().fuel()<=0.5)break;}
const fEnd=P().fuel();
press("ArrowRight","ArrowRight",false);
console.log("  全油门 "+frames+" 帧("+(frames/60).toFixed(1)+"s) 后 fuel="+fEnd.toFixed(2));
assert("全油门 14~26s 内消耗50%",frames>=840&&frames<=1560,"frames="+frames+" ("+(frames/60).toFixed(1)+"s)");
assert("燃料确实在消耗（非满油）",fEnd<=0.5,"fuel="+fEnd.toFixed(2));

console.log("\n结果: 通过 "+pass+" 项 / 失败 "+fail+" 项, 运行时错误 "+errors.length+" 个",errors.slice(0,5));
process.exit(fail||errors.length?1:0);