// 验证真实关卡里"从静止重新起步"是否可行。
// 场景来源：摔车 respawn() / 滑入深坑 pitRewind() 都会 resetBike(lastSafeX)，
// 而 lastSafeX 是在任意贴地位置更新的——如果那个位置正好在 27~30° 坡上，
// 车辆可能从静止起不了步，玩家就永久卡死（只能按 R 重开）。
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
let code=html.match(/<script>([\s\S]*)<\/script>/)[1];
code=code.replace("requestAnimationFrame(loop);",
"requestAnimationFrame(loop);globalThis.__probe={bike:()=>({x:bike.rear.x,speed:bike.speed,grounded:bike.grounded,locked:bike.locked}),reset:x=>resetBike(x),refuel:()=>{fuel=fuelMax;},crashed:()=>crashed,gi:x=>groundInfo(x),state:()=>state,mode:()=>mode};");
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
function enterLevel(lv){
  doc.getElementById("btnLevels").fire("click");
  const fakeCell={closest:sel=>sel===".lvCell"?{dataset:{lv:String(lv)}}:null};
  doc.getElementById("lvGrid").fire("click",{target:fakeCell});
}

const LV=parseInt(process.argv[2]||"19",10);   // 默认第20关（最陡）
enterLevel(LV);tick(5);
console.log("调试: state="+P().state()+" mode="+P().mode()+" locked="+P().bike().locked);
let bad=[],tested=0;
// 沿赛道每 250px 取一个点，模拟"在这里摔车重生后能否重新起步"
for(let x=400;x<12000;x+=250){
  const g=P().gi(x);
  if(!g||!isFinite(g.y))continue;
  const deg=Math.atan(Math.abs(g.m))*180/Math.PI;
  P().refuel();P().reset(x);tick(2);
  const x0=P().bike().x;
  // 注意：必须先按一次右键解锁。resetBike 后 grounded=0，若第一帧就按"腾空松油"规则松开，
  // bike.locked 永远不解除，车会被钉在起点，测出来全是 0px（假失败）。
  press("ArrowRight","ArrowRight",true);
  let maxX=x0,started=false;
  for(let i=0;i<300;i++){
    const b=P().bike();
    // 车辆首次贴地后才启用"腾空松油"规则；否则起步阶段 grounded=0 会把油门松开，导致解锁失败
    if(started&&b.grounded===0)press("ArrowRight","ArrowRight",false);
    else {press("ArrowRight","ArrowRight",true);if(b.grounded>0)started=true;}
    tick(1);
    const b2=P().bike();if(b2.x>maxX)maxX=b2.x;
  }
  press("ArrowRight","ArrowRight",false);
  const moved=maxX-x0;
  tested++;
  if(moved<60)bad.push({x,deg:deg.toFixed(0),moved:Math.round(moved)});
}
console.log("第"+(LV+1)+"关：测试 "+tested+" 个重生点，其中 "+bad.length+" 个无法重新起步");
for(const b of bad)console.log("  ❌ x="+b.x+" 坡度"+b.deg+"° 起步后只推进 "+b.moved+"px");
if(!bad.length)console.log("  ✅ 所有采样点都能从静止重新起步");
console.log("错误数:",errs.length,errs.slice(0,3));