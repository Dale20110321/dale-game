// 实测：第20关全油门推进的实际平均地速 / 实际所需油量 vs 可用油量
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const code0=html.match(/<script>([\s\S]*)<\/script>/)[1];
const code=code0.replace("requestAnimationFrame(loop);",
"requestAnimationFrame(loop);globalThis.__probe={bike:()=>({x:bike.rear.x,speed:bike.speed,grounded:bike.grounded,stunned:bike.stunned}),fuel:()=>fuel,fuelMax:()=>fuelMax,can:()=>canisters.map(c=>({x:Math.round(c.x),taken:c.taken})),len:()=>LEVELS[lvIdx].len,state:()=>state,crashed:()=>crashed};");
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
const ev=(code,key)=>({code,key:key||"",preventDefault(){}});
const press=(c,k,d)=>{for(const f of (listeners[d?"keydown":"keyup"]||[]))f(ev(c,k));};
const enterLevel=lv=>{doc.getElementById("btnLevels").fire("click");doc.getElementById("lvGrid").fire("click",{target:{closest:s=>s===".lvCell"?{dataset:{lv:String(lv)}}:null}});};
let t=0;
const tick=n=>{for(let i=0;i<n;i++){t+=16.7;if(rafCb){const cb=rafCb;rafCb=null;cb(t);}}};

const STRATEGY=process.argv[2]||"gas";   // gas=一直给油 | smart=后溜时点刹 | air=空中松油(会玩的人)
for(const lv of [0,4,9,14,19]){
  enterLevel(lv);tick(5);
  const L=globalThis.__probe.len(),n=globalThis.__probe.can().length;
  const x0=globalThis.__probe.bike().x;
  let frames=0,respawn=0,lastX=x0,stun=0,maxX=x0,mode="gas";
  press("ArrowRight","ArrowRight",true);
  const f0=globalThis.__probe.fuel();
  for(let i=0;i<9000;i++){
    tick(1);frames++;
    const b=globalThis.__probe.bike();
    if(STRATEGY==="smart"){
      if(b.speed<-25)mode="brake";else if(b.speed>-5)mode="gas";
      if(mode==="gas"){press("ArrowRight","ArrowRight",true);press("ArrowLeft","ArrowLeft",false);}
      else{press("ArrowRight","ArrowRight",false);press("ArrowLeft","ArrowLeft",true);}
    }else if(STRATEGY==="air"){
      // 腾空时松开油门（避免空中被"右=顺时针"带得翻车），落地再给油
      if(b.grounded===0){press("ArrowRight","ArrowRight",false);}
      else{press("ArrowRight","ArrowRight",true);}
    }
    if(b.stunned>0)stun++;
    if(b.x<lastX-200)respawn++;
    lastX=b.x;if(b.x>maxX)maxX=b.x;
    if(b.x>=L-20)break;
    if(frames%1200===0)console.log("   t="+(frames/60)+"s x="+Math.round(b.x)+" 最远="+Math.round(maxX)+" speed="+Math.round(b.speed)+" crashed="+globalThis.__probe.crashed());
  }
  press("ArrowRight","ArrowRight",false);press("ArrowLeft","ArrowLeft",false);
  const b=globalThis.__probe.bike();
  const dist=b.x-x0, secs=frames/60;
  const usedTanks=(f0-globalThis.__probe.fuel());
  const avail=1+0.45*n;
  console.log("第"+(lv+1)+"关 len="+L+"px 罐数="+n+" | 推进 "+Math.round(dist)+"px / "+secs.toFixed(1)+"s → 平均 "+(dist/secs).toFixed(1)+"px/s ("+(dist/secs*0.12).toFixed(1)+"km/h)");
  console.log("   实际到达: "+(b.x>=L-20?"✅ 通关":"❌ 未到")+" 最远到 "+Math.round(maxX)+"px ("+(maxX/L*100).toFixed(0)+"%) 净耗油 "+usedTanks.toFixed(2)+"箱 可用 "+avail.toFixed(2)+"箱 昏迷帧="+stun+" 燃料重生="+respawn);
}