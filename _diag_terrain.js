// 诊断：关卡地形剖面 + 卡死点处的地面坡度与车身姿态
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const code0=html.match(/<script>([\s\S]*)<\/script>/)[1];
const code=code0.replace("requestAnimationFrame(loop);",
"requestAnimationFrame(loop);globalThis.__probe={bike:()=>({x:bike.rear.x,speed:bike.speed,grounded:bike.grounded,rearY:bike.rear.y,frontY:bike.front.y}),gy:x=>groundY(x),gi:x=>groundInfo(x),len:()=>LEVELS[lvIdx].len,steps:()=>LEVELS[lvIdx].steps,waves:()=>LEVELS[lvIdx].waves};");
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
let rafCb=null;
new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,globalThis.window,navigator,globalThis.localStorage,fn=>{rafCb=fn;},(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);},1280,800);
const ev=(c,k)=>({code:c,key:k||"",preventDefault(){}});
const press=(c,k,d)=>{for(const f of (listeners[d?"keydown":"keyup"]||[]))f(ev(c,k));};
const enterLevel=lv=>{doc.getElementById("btnLevels").fire("click");doc.getElementById("lvGrid").fire("click",{target:{closest:s=>s===".lvCell"?{dataset:{lv:String(lv)}}:null}});};
let t=0;
const tick=n=>{for(let i=0;i<n;i++){t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;cb(t);}}};
const P=()=>globalThis.__probe;

for(const lv of [9,14]){
  enterLevel(lv);tick(3);
  console.log("===== 第"+(lv+1)+"关 len="+P().len()+" =====");
  console.log("  steps:",JSON.stringify(P().steps()));
  console.log("  坡度剖面(每100px取最大|slope|):");
  let line="";
  for(let x=600;x<=2200;x+=100){
    let mx=0;
    for(let d=-40;d<=40;d+=2)mx=Math.max(mx,Math.abs(P().gi(x+d).m));
    const deg=Math.atan(mx)*180/Math.PI;
    line+="x"+x+":"+deg.toFixed(0)+"° ";
  }
  console.log("  "+line);
  // 一直给油跑，记录卡死区间
  press("ArrowRight","ArrowRight",true);
  let last=null;
  for(let i=0;i<6000;i++){
    tick(1);const b=P().bike();
    if(i%600===0||(i>0&&i%600===599))console.log("   t="+(i/60).toFixed(1)+"s x="+Math.round(b.x)+" speed="+Math.round(b.speed)+" grounded="+b.grounded+" 地面坡度="+(Math.atan(P().gi(b.x).m)*180/Math.PI).toFixed(1)+"°");
    if(b.x>=P().len()-20){console.log("   ✅ 通关于 "+(i/60).toFixed(1)+"s");break;}
    last=b;
  }
  press("ArrowRight","ArrowRight",false);
  console.log("   最终 x="+Math.round(last.x));
}