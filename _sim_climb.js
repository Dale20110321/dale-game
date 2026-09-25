// 隔离测试：恒定坡度上，原装车从静止出发能爬多陡、能否持续推进
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
let code=html.match(/<script>([\s\S]*)<\/script>/)[1];
// 允许测试注入自定义地形
code=code.replace("function groundY(x){return hillY(x);}","function groundY(x){return globalThis.__hill?globalThis.__hill(x):hillY(x);}");
// 调参实验：PITCH_TORQUE=0 node _sim_climb.js 可关掉"油门翘头"力矩，用来定位 27~30° 死区成因
if(process.env.PITCH_TORQUE!==undefined)code=code.replace("const PITCH_TORQUE=0.22;","const PITCH_TORQUE="+process.env.PITCH_TORQUE+";");
// SLOPE_G=0 → 关掉"沿坡重力分量"（stepPhysics 里 *0.11*sq 那一项），用来定位 27~30° 死区
if(process.env.SLOPE_G!==undefined)code=code.replace("*0.11*sq;","*"+process.env.SLOPE_G+"*sq;");
// DRIVE_MULT=n → 把驱动力整体放大 n 倍。注意不能直接改 `let DRIVE=600`：
// applyUpgrades() 会用 DRIVE=Math.min(GRAV*0.95, ...) 重新算一遍，把覆盖值冲掉。
if(process.env.DRIVE_MULT!==undefined){
  const K=process.env.DRIVE_MULT;
  code=code.replace("DRIVE=Math.min(GRAV*0.95,(600+20*u.engine+16*u.tire)*v.drv);",
                    "DRIVE=Math.min(GRAV*0.95*"+K+",(600+20*u.engine+16*u.tire)*v.drv*"+K+");");
}
// UPHILL_CAP=0 → 关掉"上坡限速"（vT = MAXV/(1+|m|*1.3)），用来定位 27~30° 死区
if(process.env.UPHILL_CAP==="0")code=code.replace("const vT=Math.max(60,MAXV/(1+(-gmG.m)*1.3));","const vT=1e9;");
code=code.replace("requestAnimationFrame(loop);",
"requestAnimationFrame(loop);globalThis.__probe={bike:()=>({x:bike.rear.x,y:bike.rear.y,speed:bike.speed,grounded:bike.grounded,stunned:bike.stunned,locked:bike.locked,ang:Math.atan2(bike.front.y-bike.rear.y,bike.front.x-bike.rear.x)*180/Math.PI}),drive:()=>DRIVE,grav:()=>GRAV,reset:x=>resetBike(x),crashed:()=>crashed,refuel:()=>{fuel=fuelMax;},state:()=>state};");
function makeEl(id){const self={id,style:{},_cls:new Set(["hidden"]),children:[],_handlers:{},
  classList:{add:c=>self._cls.add(c),remove:c=>self._cls.delete(c),toggle:(c,f)=>{if(f===undefined)self._cls.has(c)?self._cls.delete(c):self._cls.add(c);else f?self._cls.add(c):self._cls.delete(c);},contains:c=>self._cls.has(c)},
  textContent:"",innerHTML:"",width:0,height:0,
  addEventListener(t,f){(self._handlers[t]=self._handlers[t]||[]).push(f);},fire(t,e){for(const f of (self._handlers[t]||[]))f(e||{});},
  appendChild(){},insertBefore(c){self.children.push(c);return c;},getContext(){return ctxStub;},disabled:false,dataset:{},parentNode:{style:{}}};return self;}
let ctxStub={canvas:{width:0,height:0},setTransform(){},scale(){},translate(){},rotate(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},ellipse(){},fillRect(){},fillText(){},fillStyle:"",strokeStyle:"",lineWidth:1,font:"",textAlign:"",globalAlpha:1,roundRect(){},quadraticCurveTo(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}}),clearRect(){}};
ctxStub=new Proxy(ctxStub,{get:(t,k)=>(k in t?t[k]:()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
const elements={};
const doc={getElementById:id=>{if(!elements[id])elements[id]=makeEl(id);return elements[id];},querySelector:s=>{if(!elements[s])elements[s]=makeEl(s);return elements[s];},querySelectorAll:()=>[],createElement:()=>makeEl(""),documentElement:makeEl("html"),body:makeEl("body"),fullscreenElement:null,exitFullscreen(){},webkitExitFullscreen(){}};
const listeners={},store={"bike_unlocked":"19"};
globalThis.document=doc;
globalThis.window={addEventListener(){},devicePixelRatio:1,innerWidth:1280,innerHeight:800,AudioContext:function(){},webkitAudioContext:function(){},requestAnimationFrame(){},setTimeout(){},matchMedia:()=>({matches:false})};
globalThis.navigator={maxTouchPoints:0};
globalThis.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
globalThis.addEventListener=(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);};
globalThis.CanvasRenderingContext2D={prototype:{}};
let rafCb=null,errs=[];
new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,globalThis.window,navigator,globalThis.localStorage,fn=>{rafCb=fn;},(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);},1280,800);
const ev=(c,k)=>({code:c,key:k||"",preventDefault(){}});
const press=(c,k,d)=>{for(const f of (listeners[d?"keydown":"keyup"]||[]))f(ev(c,k));};
let t=0;
const tick=n=>{for(let i=0;i<n;i++){t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;try{cb(t);}catch(e){errs.push(e.message);}}}};
const P=()=>globalThis.__probe;
// 用自由模式起步，再换成恒定斜坡
doc.getElementById("btnFree").fire("click");
tick(5);
console.log("DRIVE="+P().drive()+"  GRAV="+P().grav()+"  理论静止爬坡极限="+(Math.atan(P().drive()/P().grav())*180/Math.PI).toFixed(1)+"°");
const TRACE=process.argv[2]?process.argv[2].split(",").map(Number):null;   // node _sim_climb.js 28,30 → 只看指定坡度并逐秒打印轨迹
const ANGLES=TRACE||[5,10,15,20,25,30,33,36,40];
for(const ang of ANGLES){
  const m=Math.tan(ang*Math.PI/180);
  // 前 600px 平路助跑，之后才是恒定斜坡。真实关卡里车总是带着速度冲进坡，
  // 直接"从静止站在陡坡上"不是游戏里会出现的场景（且会因回溜过深触发深坑回退而卡住）。
  globalThis.__hill=x=>x<600?300:300-(x-600)*m;
  const RUNUP=process.env.RUNUP!=="0";
  if(!RUNUP)globalThis.__hill=x=>300-x*m;
  // 关键1：每轮补满油。自由模式油耗尽会令 state="ended"，物理循环直接停摆，
  //        后几轮会全部变成"0px 不动"，看着像爬不上去，其实是测试没油了。
  // 关键2：每轮用 resetBike 把车放回起点并清零速度/角速度，否则上一轮末速会污染起点 x0。
  P().refuel();
  P().reset(40);
  tick(2);
  const x0=P().bike().x;
  press("ArrowRight","ArrowRight",true);
  let maxX=x0,crashF=0,stunF=0,airF=0;
  for(let i=0;i<600;i++){
    tick(1);const b=P().bike();if(b.x>maxX)maxX=b.x;
    if(P().crashed())crashF++;
    if(b.stunned>0)stunF++;
    // 默认策略：腾空时松开右键（新机制里空中按右键会让车身顺时针前倾）。
    // STRATEGY=hold 全程按住；STRATEGY=once 只在开头按一次、之后不再触发任何按键事件
    // （用来排除"反复 keydown/keyup 干扰物理"这一测试脚手架因素）。
    if(process.env.STRATEGY==="once"){}
    else if(b.grounded===0){airF++;if(process.env.STRATEGY!=="hold")press("ArrowRight","ArrowRight",false);}
    else press("ArrowRight","ArrowRight",true);
    if(TRACE&&i%60===0)console.log("     t="+(i/60).toFixed(1)+"s x="+Math.round(b.x)+" speed="+Math.round(b.speed)+" grounded="+b.grounded+" 车身角="+Math.round(b.ang)+"°");
  }
  press("ArrowRight","ArrowRight",false);
  const b=P().bike();
  // 助跑模式下，只统计"上坡段"的推进量（x>600 才算真正在爬坡）
  const climbed=Math.max(0,maxX-(RUNUP?600:x0));
  const ok=climbed>200;
  console.log("  "+(ok?"✅":"❌")+" 坡度"+ang+"°: 上坡段推进 "+Math.round(climbed)+"px (末速 "+Math.round(b.speed)+"px/s, 腾空"+airF+"帧, 摔车"+crashF+"帧)");
}