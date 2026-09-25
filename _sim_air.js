// 坡顶腾空探针：全油门跑图，统计"离地间隙/滞空时间/摔车/卡死"
// 用法: node _sim_air.js [关卡号...]   默认 0 9 19
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m){console.error("❌ 未找到 <script> 块");process.exit(1);}
let code=m[1];
// 实验开关（用于定位问题，不改动 index.html）
if(process.env.MAXDA)code=code.replace("const MAXDA=0.08;","const MAXDA="+process.env.MAXDA+";");
if(process.env.BAND)code=code.replace("if(p.y>srf-60){","if(p.y>srf-"+(process.env.BAND)+"){");
if(process.env.SLOPEG)code=code.replace("*0.11*sq;","*"+process.env.SLOPEG+"*sq;");
if(process.env.GRAVMULT)code=code.replace("let GRAV=1000,TRACTION=1,","let GRAV=1000*"+(process.env.GRAVMULT)+",TRACTION=1,").replace(/g:(1000|420)/g,(s,n)=>"g:"+(Number(n)*Number(process.env.GRAVMULT)));
if(process.env.MAXVMULT)code=code.replace("MAXV=Math.min(350,130+2.5*u.engine+1.5*u.tire)*v.spd;","MAXV=Math.min(350*"+process.env.MAXVMULT+",(130+2.5*u.engine+1.5*u.tire)*v.spd*"+process.env.MAXVMULT+");");
code=code.replace("requestAnimationFrame(loop);",
"requestAnimationFrame(loop);globalThis.__probe={"+
"bike:()=>({rx:bike.rear.x,fx:bike.front.x,ry:bike.rear.y,fy:bike.front.y,hy:bike.head.y,"+
"gapR:(groundY(bike.rear.x)-WHEEL_R)-bike.rear.y,gapF:(groundY(bike.front.x)-WHEEL_R)-bike.front.y,"+
"grounded:bike.grounded,speed:bike.speed,ang:Math.atan2(bike.front.y-bike.rear.y,bike.front.x-bike.rear.x)*180/Math.PI}),"+
"airTime:()=>airTime,"+
"crashed:()=>crashed,"+
"lastSafe:()=>lastSafeX,"+
"grav:()=>GRAV,drive:()=>DRIVE,"+
"len:()=>LEVELS[lvIdx].len,"+
"slope:()=>LEVELS[lvIdx].maxSlope,"+
"fin:()=>finishX,"+
"maxHop:()=>globalThis.__maxHop,"+
"lv:()=>lvIdx"+
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
let rafCb=null,errors=[];
try{
  new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,globalThis.window,navigator,globalThis.localStorage,(fn)=>{rafCb=fn;},(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn);},1280,800);
}catch(e){console.log("❌ 初始化错误:",e.message);process.exit(1);}
function press(code,key,down){for(const fn of (listeners[down?"keydown":"keyup"]||[]))fn({code,key:key||"",preventDefault(){}});}
function enterLevel(lv){
  doc.getElementById("btnLevels").fire("click");
  doc.getElementById("lvGrid").fire("click",{target:{closest:sel=>sel===".lvCell"?{dataset:{lv:String(lv)}}:null}});
}
let t=0;
function tick(n){for(let i=0;i<n;i++){t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;try{cb(t);}catch(e){errors.push("frame: "+e.message);}}}}
const P=()=>globalThis.__probe;

function run(lv,frames){
  enterLevel(lv);tick(4);
  press("ArrowRight","ArrowRight",true);
  const b0=P().bike();let startX=b0.rx;
  let airEp=0,airMax=0,hopMax=0,airFrames=0,crashes=0,wasCrash=false;
  let inAir=false,curAir=0;
  let stuckFrames=0,stuckMax=0,stuckAt=0;
  let prevX=b0.rx,reached=b0.rx;
  let noProg=0,stalls=[],maxStep=0;
  for(let i=0;i<frames;i++){
    tick(1);
    const b=P().bike();
    if(Math.abs(b.rx-prevX)>maxStep)maxStep=Math.abs(b.rx-prevX);
    const gap=Math.max(b.gapR,b.gapF);
    const grounded=b.grounded>0;
    if(!grounded&&!P().crashed()){
      if(!inAir){inAir=true;curAir=0;}
      curAir++;airFrames++;
      if(curAir>airMax)airMax=curAir;
      if(gap>hopMax)hopMax=gap;
    }else{
      if(inAir){inAir=false;if(curAir>=8)airEp++;}
    }
    if(P().crashed()&&!wasCrash)crashes++;
    wasCrash=P().crashed();
    if(b.rx>reached)reached=b.rx;
    // 卡死检测：贴地且几乎不前进
    if(grounded&&!P().crashed()&&Math.abs(b.rx-prevX)<0.35){stuckFrames++;if(stuckFrames>stuckMax){stuckMax=stuckFrames;stuckAt=Math.round(b.rx);}}
    else stuckFrames=0;
    prevX=b.rx;
    // 停滞检测：连续 150 帧没有推进 60px 以上
    if(reached>P().fin()-80)break;
    noProg++;
    if(noProg>150){
      stalls.push({x:Math.round(b.rx),slope:+P().slope().toFixed(1),speed:Math.round(b.speed)});
      noProg=0;
    }
    if(b.rx>reached+60){reached=Math.max(reached,b.rx);noProg=0;}
  }
  press("ArrowRight","ArrowRight",false);
  return {lv:lv+1,slope:+P().slope().toFixed(1),grav:P().grav(),len:P().len(),reach:Math.round(reached),
    dist:Math.round(reached-startX),airEp,airMax:+(airMax/60).toFixed(2),airFrames,hopMax:Math.round(hopMax),
    crashes,stuckMax,stuckAt,stalls,maxStep:+(maxStep*60).toFixed(0)};
}

const args=process.argv.slice(2).map(Number).filter(n=>!isNaN(n));
const levels=args.length?args:[0,9,19];
console.log("关卡  坡度   重力  里程    位移   腾空次数 最长滞空 累计滞空 最高离地 摔车 峰值帧步(px/s) 最长卡死(位置)");
for(const lv of levels){
  const r=run(lv,4200);
  console.log(`  ${String(r.lv).padStart(2)}  ${String(r.slope).padStart(5)}°  ${String(r.grav).padStart(4)}  ${String(r.len).padStart(5)}  ${String(r.dist).padStart(5)}   ${String(r.airEp).padStart(4)}    ${String(r.airMax).padStart(4)}s   ${String(r.airFrames).padStart(5)}   ${String(r.hopMax).padStart(4)}px  ${String(r.crashes).padStart(3)}   ${String(r.maxStep).padStart(6)}   ${r.stuckMax>60?("⚠ "+r.stuckMax+"f @"+r.stuckAt):"无"}`);
  if(r.stalls.length)console.log("      停滞点:",r.stalls.map(s=>"x="+s.x+"(v="+s.speed+")").join(" "));
}
console.log("运行时错误:",errors.length,errors.slice(0,3));