// 诊断：打印指定关卡在指定 x 附近的局部坡度/高度，定位"爬不上去来回溜"的位置
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
let code=html.match(/<script>([\s\S]*)<\/script>/)[1];
// 注意：requestAnimationFrame(loop) 在 loop() 内部也出现一次，必须替换最后一处（脚本末尾）
const probeCode="globalThis.__probe={gi:x=>{const g=groundInfo(x);return{y:g.y,m:g.m,deg:Math.atan(g.m)*180/Math.PI};},lv:()=>lvIdx,setLv:i=>{buildLevel(i);},drive:()=>DRIVE,grav:()=>GRAV,maxv:()=>MAXV,slope:()=>LEVELS[lvIdx].maxSlope};";
const last=code.lastIndexOf("requestAnimationFrame(loop);");
code=code.slice(0,last)+probeCode+code.slice(last);
function makeEl(id){const self={id,style:{},_cls:new Set(["hidden"]),children:[],_handlers:{},
  classList:{add:c=>self._cls.add(c),remove:c=>self._cls.delete(c),toggle:(c,f)=>{if(f===undefined)self._cls.has(c)?self._cls.delete(c):self._cls.add(c);else f?self._cls.add(c):self._cls.delete(c);},contains:c=>self._cls.has(c)},
  textContent:"",innerHTML:"",width:0,height:0,addEventListener(){},appendChild(){},insertBefore(c){return c;},
  getContext(){return ctxStub;},disabled:false,dataset:{},parentNode:{style:{}}};return self;}
let ctxStub=new Proxy({canvas:{width:0,height:0},setTransform(){},scale(){},translate(){},rotate(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},arc(){},ellipse(){},fillRect(){},fillText(){},roundRect(){},clearRect(){},createLinearGradient:()=>({addColorStop(){}})},{get:(t,k)=>(k in t?t[k]:()=>{}),set:(t,k,v)=>{t[k]=v;return true;}});
const elements={};
const doc={getElementById:id=>elements[id]||(elements[id]=makeEl(id)),querySelector:s=>elements[s]||(elements[s]=makeEl(s)),querySelectorAll:()=>[],createElement:()=>makeEl(""),documentElement:makeEl("html"),body:makeEl("body"),fullscreenElement:null};
globalThis.document=doc;
globalThis.window={addEventListener(){},devicePixelRatio:1,innerWidth:1280,innerHeight:800,AudioContext:function(){},webkitAudioContext:function(){},requestAnimationFrame(){},setTimeout(){},matchMedia:()=>({matches:false})};
globalThis.navigator={maxTouchPoints:0};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.addEventListener=()=>{};
globalThis.CanvasRenderingContext2D={prototype:{}};
new Function("document","window","navigator","localStorage","requestAnimationFrame","addEventListener","innerWidth","innerHeight",code)(doc,globalThis.window,navigator,globalThis.localStorage,()=>{},()=>{},1280,800);
const P=()=>globalThis.__probe;
const lv=Number(process.argv[2]||9);
const range=(process.argv[3]||"2400,3300").split(",").map(Number);
P().setLv(lv);
console.log("第"+(lv+1)+"关 理论最大坡度 "+P().slope().toFixed(1)+"°  DRIVE="+P().drive().toFixed(0)+" GRAV="+P().grav()+" 静止爬坡极限 "+(Math.atan(P().drive()/P().grav())*180/Math.PI).toFixed(1)+"°");
if(process.argv[4]==="profile"){
  console.log("\n地形纵剖面（x / 高度y / 坡度）：");
  let xs="",ys="",ms="";
  for(let x=range[0];x<=range[1];x+=50){const g=P().gi(x);
    xs+=String(x).padStart(7);ys+=String(Math.round(g.y)).padStart(7);ms+=(g.deg.toFixed(0)+"°").padStart(7);}
  console.log(xs);console.log(ys);console.log(ms);
  let worst=0,wx=0;for(let x=range[0];x<=range[1];x+=2){const g=P().gi(x);if(g.deg>worst){worst=g.deg;wx=x;}}
  console.log("区间最陡 "+worst.toFixed(1)+"° @ x="+wx+"（>爬坡极限则必然卡死）");
  process.exit(0);
}
const centers=range;
for(const c of centers){
  console.log("\n--- x="+c+" 附近 ---");
  let line1="x    ",line2="坡度 ";
  for(let d=-120;d<=120;d+=20){
    const g=P().gi(c+d);
    line1+=String(c+d).padStart(6);
    line2+=(g.deg.toFixed(1)+"°").padStart(6);
  }
  console.log(line1);console.log(line2);
  // 找这一段最陡的坡度
  let worst=0,wx=0;
  for(let d=-160;d<=160;d+=2){const g=P().gi(c+d);if(g.deg>worst){worst=g.deg;wx=c+d;}}
  console.log("最陡 "+worst.toFixed(1)+"° @ x="+wx);
}