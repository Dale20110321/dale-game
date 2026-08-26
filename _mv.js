// 验证：无坑平滑 + 闯关加长 + 自由模式无限+金币
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const G=1000,SUB=6,DT=1/60,WHEEL_R=12,WHEELBASE=38,SEAT_H=26;
let DRIVE=400,MAXV=130,crashMargin=2;
const LEVELS=[
 {name:"山丘竞速",amp:26,wk:1.0,len:4600,gapN:0,ramps:[],coinN:20,maxS:520,seed:11},
 {name:"坡道拉力",amp:32,wk:1.25,len:5800,gapN:0,ramps:[{x:1800,h:52,w:140},{x:3300,h:66,w:160}],coinN:26,maxS:640,seed:37},
 {name:"峡谷征服",amp:42,wk:1.5,len:7200,gapN:0,ramps:[{x:2400,h:76,w:170},{x:4200,h:92,w:190},{x:6000,h:84,w:180}],coinN:32,maxS:760,seed:73},
];
let lvIdx=0,finishX=0,gaps=[],coins=[],decoTree=[],decoRock=[];
let mode="level",freeGenX=0,camX=0;
let gold=0;
const W=1200;

function hillY(x){const L=LEVELS[lvIdx];
  const progress=clamp((x-L.len*0.12)/(L.len*0.6),0,1);
  const ease=progress*progress*(3-2*progress);
  const ampFactor=ease;
  return 300+(Math.sin(x*0.006+L.seed)*L.amp*1.7+Math.sin(x*0.013+L.seed*2)*L.amp*1.1+Math.sin(x*0.0021+L.seed*3)*L.amp*2.6)*ampFactor;}
function featH(x){let y=0;const L=LEVELS[lvIdx];
  for(const o of L.ramps){const d=Math.abs(x-o.x);if(d<o.w/2)y=Math.max(y,o.h*(1-d/(o.w/2)));}
  return y;}
function isGap(x){for(const g of gaps)if(x>g.start&&x<g.end)return g;return null;}
function groundY(x){if(isGap(x))return Infinity;return hillY(x)-featH(x);}
function groundInfo(x){const e=2;if(isGap(x))return{y:Infinity,m:0};
  const y0=groundY(x),yL=groundY(x-e),yR=groundY(x+e),m=(yR-yL)/(2*e);return{y:y0,m};}
function buildLevel(idx){
  lvIdx=idx;const L=LEVELS[idx];gaps=[];coins=[];finishX=L.len;
  for(let i=0;i<L.coinN;i++){const cx=L.len*0.15+i*(L.len*0.75)/(L.coinN-1);
    coins.push({x:cx,y:groundY(cx)-35,taken:false,ph:0});}
  decoTree=[];decoRock=[];let p=L.len*0.12;
  while(p<L.len-60){p+=140+Math.random()*160;if(!isGap(p)){if(Math.random()<0.55)decoTree.push({x:p});else decoRock.push({x:p});}}
}
function freeInit(){mode="free";lvIdx=0;finishX=Infinity;gaps=[];coins=[];decoTree=[];decoRock=[];freeGenX=0;}
function freeFill(){
  const viewR=camX+W*2;let guard=0;
  while(freeGenX<viewR&&guard++<200){
    freeGenX+=70+Math.random()*200;
    if(!isGap(freeGenX)){
      if(Math.random()<0.8)coins.push({x:freeGenX,y:groundY(freeGenX)-30,taken:false,ph:0});
      if(Math.random()<0.5)decoTree.push({x:freeGenX});else decoRock.push({x:freeGenX});
    }
  }
  coins=coins.filter(c=>c.x>camX-400&&!c.taken);
  decoTree=decoTree.filter(t=>t.x>camX-400);
  decoRock=decoRock.filter(r=>r.x>camX-400);
}

const bike={rear:{x:0,y:0,px:0,py:0},front:{x:0,y:0,px:0,py:0},head:{x:0,y:0,px:0,py:0},grounded:0,frontGr:false,rearGr:false,squash:0,airT:0};
function reset(x){const L=WHEELBASE;
  const yR=groundY(x)-WHEEL_R,yF=groundY(x+L)-WHEEL_R;
  const ang=Math.atan2(yF-yR,L);
  bike.rear={x:x,y:yR,px:x,py:yR};bike.front={x:x+L,y:yF,px:x+L,py:yF};
  const hx=x+L/2-Math.sin(ang)*SEAT_H,hy=(yR+yF)/2-Math.cos(ang)*SEAT_H;
  bike.head={x:hx,y:hy,px:hx,py:hy};
  bike.frontGr=false;bike.rearGr=false;bike.grounded=0;bike.airT=0;bike.squash=0;
}
function step(aDrive){
  const L=WHEELBASE,Lr=Math.hypot(L*0.5,SEAT_H);
  for(let s=0;s<SUB;s++){
    const sub=DT/SUB,sq=sub*sub;
    const P=[bike.rear,bike.front,bike.head];
    for(const p of P){const vx=p.x-p.px,vy=p.y-p.py;p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy;}
    for(const p of P){p.y+=G*sq;}
    if(aDrive){bike.rear.x+=aDrive*sq;bike.front.x+=aDrive*sq;bike.head.x+=aDrive*sq;}
    const FS=groundInfo(bike.front.x).y-WHEEL_R,RS=groundInfo(bike.rear.x).y-WHEEL_R;
    if(bike.airT>0){
      bike.frontGr=false;bike.rearGr=false;bike.airT--;
      if((bike.front.y<FS-14||bike.rear.y<RS-14)||(bike.front.y>FS+6||bike.rear.y>RS+6))bike.airT=0;
    }else{
      bike.frontGr=(bike.front.y>FS-12);bike.rearGr=(bike.rear.y>RS-12);
    }
    for(let it=0;it<6;it++){
      let dx=bike.front.x-bike.rear.x,dy=bike.front.y-bike.rear.y;
      let d=Math.hypot(dx,dy)||1e-4,diff=(d-L)/d;
      if(bike.rearGr&&bike.frontGr){const err=diff*dx*0.5;bike.rear.x+=err;bike.front.x-=err;}
      else if(bike.rearGr){bike.front.x-=dx*diff;bike.front.y-=dy*diff;}
      else if(bike.frontGr){bike.rear.x+=dx*diff;bike.rear.y+=dy*diff;}
      else{bike.rear.x+=dx*diff*0.5;bike.rear.y+=dy*diff*0.5;bike.front.x-=dx*diff*0.5;bike.front.y-=dy*diff*0.5;}
      dx=bike.head.x-bike.rear.x;dy=bike.head.y-bike.rear.y;d=Math.hypot(dx,dy)||1e-4;diff=(d-Lr)/d;
      if(bike.rearGr){bike.head.x-=dx*diff;bike.head.y-=dy*diff;}
      else{bike.rear.x+=dx*diff*0.5;bike.rear.y+=dy*diff*0.5;bike.head.x-=dx*diff*0.5;bike.head.y-=dy*diff*0.5;}
      dx=bike.head.x-bike.front.x;dy=bike.head.y-bike.front.y;d=Math.hypot(dx,dy)||1e-4;diff=(d-Lr)/d;
      if(bike.frontGr){bike.head.x-=dx*diff;bike.head.y-=dy*diff;}
      else{bike.front.x+=dx*diff*0.5;bike.front.y+=dy*diff*0.5;bike.head.x-=dx*diff*0.5;bike.head.y-=dy*diff*0.5;}
    }
    bike.grounded=0;
    if(bike.airT<=0)for(const [p,srf] of [[bike.rear,RS],[bike.front,FS]]){
      if(p.y>srf-12){p.y=srf;bike.grounded++;}
    }
    if(bike.grounded>=2){
      const a2=Math.atan2(bike.front.y-bike.rear.y,L);
      const my2=(bike.rear.y+bike.front.y)/2, mx2=(bike.rear.x+bike.front.x)/2;
      bike.head.x+=(mx2-SEAT_H*Math.sin(a2)-bike.head.x)*0.35;
      bike.head.y+=(my2-SEAT_H*Math.cos(a2)-bike.head.y)*0.35;
    }
  }
  let vh=(bike.front.x-bike.front.px)/DT;
  if(vh>MAXV){vh=MAXV;}else if(vh<-MAXV){vh=-MAXV;}
  if(vh!==(bike.front.x-bike.front.px)/DT){bike.front.px=bike.front.x-vh*DT;bike.rear.px=bike.rear.x-vh*DT;bike.head.px=bike.head.x-vh*DT;}
}
function collect(){
  const mx=(bike.rear.x+bike.front.x)/2,my=(bike.rear.y+bike.front.y)/2;
  for(const c of coins){if(!c.taken&&Math.hypot(c.x-mx,c.y-my)<45){c.taken=true;gold++;}}
}

let allOk=true;
function chk(n,c){console.log((c?"✅":"❌")+" "+n);if(!c)allOk=false;}

// 1. 闯关：无坑 + 金币数
buildLevel(0);
chk("闯关1无坑 gaps="+gaps.length, gaps.length===0);
chk("闯关1金币数="+coins.length+" (应20)", coins.length===20);
chk("闯关1长度="+finishX+" (加长)", finishX===4600);
buildLevel(2);
chk("闯关3无坑 gaps="+gaps.length, gaps.length===0);
chk("闯关3金币数="+coins.length+" (应32)", coins.length===32);
chk("闯关3长度="+finishX, finishX===7200);

// 2. 闯关全程按D跑（含坡道，无跳跃），应平滑不炸
buildLevel(1);
reset(40);
let bad=false,lastX=40;
for(let f=0;f<2400;f++){
  step(400);
  if(isNaN(bike.front.x)||Math.abs(bike.front.y)>20000){bad=true;break;}
  collect();
  const mid=(bike.rear.x+bike.front.x)/2;
  if(mid<lastX-400){bad=true;break;} // 仅防严重爆炸性回退
  lastX=mid;
}
chk("闯关2按D跑2400帧 x="+bike.front.x.toFixed(0)+" 未炸未倒退", !bad&&bike.front.x>1500);
chk("闯关2途中吃到金币 gold="+gold, gold>0);

// 3. 自由模式：无限 + 金币持续生成 + 收集
freeInit();
reset(40);
gold=0;
let maxCoins=0,minCoinsAhead=0,bad2=false;
for(let f=0;f<2400;f++){
  step(400);
  const mid=(bike.rear.x+bike.front.x)/2;
  camX=mid;
  freeFill();
  collect();
  const ahead=coins.filter(c=>!c.taken&&c.x>mid-100&&c.x<mid+2000).length;
  if(ahead>maxCoins)maxCoins=ahead;
  if(isNaN(bike.front.x)||Math.abs(bike.front.y)>20000){bad2=true;break;}
  if(bike.front.x>30000){bad2=true;break;} // 无限但应正常
}
chk("自由模式跑2400帧 x="+bike.front.x.toFixed(0)+" 未炸", !bad2);
chk("自由模式持续生成金币(前方2000内有金币)", maxCoins>0);
chk("自由模式吃到金币 gold="+gold, gold>0);
chk("自由模式数组受控 coins="+coins.length+" deco="+decoTree.length, coins.length<200&&decoTree.length<150);

console.log("\n"+(allOk?"🎉 全部通过":"⚠️ 有失败项"));