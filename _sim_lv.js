const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const m=html.match(/<script>([\s\S]*)<\/script>/);
if(!m){console.error("❌ 未找到 <script> 块");process.exit(1);}
const code=m[1];
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

// 进入闯关面板
doc.getElementById("btnLevels").fire("click");
// 点击第 20 关（最高难度：5裂缝+3跳台+主题）
const fakeCell={closest:sel=>sel===".lvCell"?{dataset:{lv:"19"}}:null};
doc.getElementById("lvGrid").fire("click",{target:fakeCell});
console.log("点击后 overlay hidden:",doc.getElementById("overlay").classList.contains("hidden")," modePanel hidden:",doc.getElementById("modePanel").classList.contains("hidden"));
let t=0;
function tick(n){for(let i=0;i<n;i++){t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;try{cb(t);}catch(e){errors.push("frame "+i+": "+e.message);}}}}
console.log("[0帧] 关卡:",doc.getElementById("lvl").textContent);
press("ArrowRight","ArrowRight",true);
// 跳跃+空中旋转：每 80 帧跳一次，空中持续按 D
tick(80);
press("Space"," ",true);tick(5);press("Space"," ",false);
tick(150);
press("ArrowRight","ArrowRight",false);
tick(60);
console.log("[~295帧] 金币=",doc.getElementById("coins").textContent," fuel=",doc.getElementById("fuelTxt").textContent," speed=",doc.getElementById("speed").textContent);
// 长时间加速跑（含裂缝/跳台）
press("ArrowRight","ArrowRight",true);
tick(1500);
press("ArrowRight","ArrowRight",false);
tick(60);
console.log("[~1855帧] 金币=",doc.getElementById("coins").textContent," fuel=",doc.getElementById("fuelTxt").textContent," speed=",doc.getElementById("speed").textContent," 关卡=",doc.getElementById("lvl").textContent);
console.log("错误数:",errors.length, errors.slice(0,5));
if(errors.length===0)console.log("✅ 高难度关卡(第20关)模拟 1855 帧无异常！");
