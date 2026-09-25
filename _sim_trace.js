// 逐帧追踪：node _sim_trace.js <关卡> <起始帧> <结束帧> [间隔]
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
let code=html.match(/<script>([\s\S]*)<\/script>/)[1];
const probe="globalThis.__probe={bike:()=>({rx:bike.rear.x,fx:bike.front.x,ry:bike.rear.y,fy:bike.front.y,grounded:bike.grounded,speed:bike.speed,locked:bike.locked}),crashed:()=>crashed,lastSafe:()=>lastSafeX,air:()=>airTime,gi:x=>groundInfo(x).m*180/Math.PI,fin:()=>finishX};";
const last=code.lastIndexOf("requestAnimationFrame(loop);");
code=code.slice(0,last)+probe+code.slice(last);
function makeEl(id){const self={id,style:{},_cls:new Set(["hidden"]),children:[],_handlers:{},
  classList:{add:c=>self._cls.add(c),remove:c=>self._cls.delete(c),toggle:(c,f)=>{if(f===undefined)self._cls.has(c)?self._cls.delete(c):self._cls.add(c);else f?self._cls.add(c):self._cls.delete(c);},contains:c=>self._cls.has(c)},
  textContent:"",innerHTML:"",width:0,height:0,addEventListener(type,fn){(self._handlers[type]=self._handlers[type]||[]).push(fn);},
  fire(type,ev){for(const fn of (self._handlers[type]||[]))fn(ev||{});},appendChild(){},insertBefore(c){return c;},
  getContext(){return ctxStub;},disabled:false,dataset:{},parentNode:{style:{}}};return self;}
let ctxStub=new Proxy({canvas:{width:0,height:0},setTransform(){},scale(){},translate(){},rotate(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},ellipse(){},fillRect(){},fillText(){},roundRect(){},clearRect(){},createLinearGradient:()=>({addColorStop(){}})},{get:(t,k)=>(k in t?t[k]:()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
const elements={};
const doc={getElementById:id=>elements[id]||(elements[id]=makeEl(id)),querySelector:s=>elements[s]||(elements[s]=makeEl(s)),querySelectorAll:()=>[],createElement:()=>makeEl(""),documentElement:makeEl("html"),body:makeEl("body"),fullscreenElement:null};
const listeners={};const store={"bike_unlocked":"19"};
globalThis.document=doc;
globalThis.window={addEventListener(){},devicePixelRatio:1,innerWidth:1280,innerHeight:800,AudioContext:function(){},webkitAudioContext:function(){},requestAnimationFrame(){},setTimeout(){},matchMedia:()=>({matches:false})};
globalThis.navigator={maxTouchPoints:0};
globalThis.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem(){}};
globalThis.addEventListener=(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);};
globalThis.CanvasRenderingContext2D={prototype:{}};
let rafCb=null;
new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,globalThis.window,navigator,globalThis.localStorage,(fn)=>{rafCb=fn;},(type,fn)=>{(listeners[type]=listeners[type]||[]).push(fn);},1280,800);
const P=()=>globalThis.__probe;
const press=(code,key,down)=>{for(const fn of (listeners[down?"keydown":"keyup"]||[]))fn({code,key,preventDefault(){}});};
const lv=Number(process.argv[2]||9),f0=Number(process.argv[3]||0),f1=Number(process.argv[4]||1200),step=Number(process.argv[5]||15);
doc.getElementById("btnLevels").fire("click");
doc.getElementById("lvGrid").fire("click",{target:{closest:s=>s===".lvCell"?{dataset:{lv:String(lv)}}:null}});
let t=0;const tick=()=>{t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;cb(t);}};
for(let i=0;i<3;i++)tick();
press("ArrowRight","ArrowRight",true);
console.log("帧     x      y    速度  贴地 摔车 安全点 局部坡度");
for(let i=0;i<f1;i++){
  tick();
  if(i>=f0&&i%step===0){const b=P().bike();
    console.log(String(i).padStart(5),String(Math.round(b.rx)).padStart(6),String(Math.round(b.ry)).padStart(6),
      String(Math.round(b.speed)).padStart(6),String(b.grounded).padStart(4),String(P().crashed()?"是":"否").padStart(5),
      String(Math.round(P().lastSafe())).padStart(7),(P().gi(b.rx).toFixed(0)+"°").padStart(8));}
}