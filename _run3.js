const fs=require("fs");
const html=fs.readFileSync("C:/1/index.html","utf8");
const m=html.match(/<script>([\s\S]*)<\/script>/);
const code=m[1];
function makeEl(id){return {id,style:{},_cls:new Set(["hidden"]),children:[],
  classList:{add:c=>this._cls.add(c),remove:c=>this._cls.delete(c),toggle:(c,f)=>{if(f===undefined)this._cls.has(c)?this._cls.delete(c):this._cls.add(c);else f?this._cls.add(c):this._cls.delete(c);},contains:c=>this._cls.has(c)},
  textContent:"",innerHTML:"",width:0,height:0,addEventListener(){},appendChild(){},getContext(){return ctxStub;},disabled:false,dataset:{},styleObj:{}};}
let ctxStub={canvas:{width:0,height:0},setTransform(){},scale(){},translate(){},rotate(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},ellipse(){},fillRect(){},fillText(){},fillStyle:"",strokeStyle:"",lineWidth:1,font:"",textAlign:"",globalAlpha:1,roundRect(){},quadraticCurveTo(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}}),clearRect(){}};
ctxStub=new Proxy(ctxStub,{get:(t,k)=>{if(k in t)return t[k];return ()=>{};},set:(t,k,v)=>{t[k]=v;return true;}});
const elements={};
const doc={getElementById:id=>{if(!elements[id])elements[id]=makeEl(id);return elements[id];},
  querySelector:sel=>{if(!elements[sel])elements[sel]=makeEl(sel);return elements[sel];},
  querySelectorAll:()=>[],
  createElement:()=>makeEl(""),documentElement:makeEl("html"),body:makeEl("body"),fullscreenElement:null,exitFullscreen(){},webkitExitFullscreen(){}};
const win={addEventListener(){},devicePixelRatio:1,innerWidth:1280,innerHeight:800,AudioContext:function(){},webkitAudioContext:function(){},requestAnimationFrame(){},setTimeout(){},matchMedia:()=>({matches:false})};
globalThis.document=doc;globalThis.window=win;globalThis.navigator={maxTouchPoints:0};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.requestAnimationFrame=()=>{};
globalThis.addEventListener=()=>{};
globalThis.CanvasRenderingContext2D={prototype:{}};
try{
  new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,win,navigator,globalThis.localStorage,(fn)=>{},()=>{},1280,800);
  console.log("✅ 脚本完整执行无错误！");
}catch(e){
  console.log("❌ 运行时错误:",e.message);
  console.log((e.stack||"").split("\n").slice(0,4).join("\n"));
}