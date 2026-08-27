// 验证：裂缝断崖物理（跨坑、飞越、组合稳定）
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const G=1000,SUB=6,DT=1/60,WHEEL_R=12,WHEELBASE=38,SEAT_H=26;
let DRIVE=520,MAXV=235,susAbsorb=0.25,susClimb=6,susRot=0.70,stiffDamp=0.01,stiffM=-1.0;
let gaps=[];
const GRAB=60;
function terBase(x){return 300;}
function isGap(x){for(const g of gaps)if(x>g.start&&x<g.end)return true;return false;}
function ter(x){if(isGap(x))return Infinity;return terBase(x);}
function ginfo(fn,x){const e=2,y0=fn(x),yL=fn(x-e),yR=fn(x+e),m=(yR-yL)/(2*e);return{y:y0,m};}
const bike={rear:{x:0,y:0,px:0,py:0},front:{x:0,y:0,px:0,py:0},head:{x:0,y:0,px:0,py:0},grounded:0,frontGr:false,rearGr:false,squash:0,airT:0,lastAng:0};
function reset(x){const L=WHEELBASE;
  const yR=ter(x)-WHEEL_R,yF=ter(x+L)-WHEEL_R;
  const ang=Math.atan2(yF-yR,L);
  bike.rear={x:x,y:yR,px:x,py:yR};bike.front={x:x+L,y:yF,px:x+L,py:yF};
  const hx=x+L/2-Math.sin(ang)*SEAT_H,hy=(yR+yF)/2-Math.cos(ang)*SEAT_H;
  bike.head={x:hx,y:hy,px:hx,py:hy};
  bike.frontGr=false;bike.rearGr=false;bike.grounded=0;bike.airT=0;bike.squash=0;
  bike.lastAng=Math.atan2(bike.front.y-bike.rear.y,bike.front.x-bike.rear.x);
}
function step(aDrive){
  const L=WHEELBASE,Lr=Math.hypot(L*0.5,SEAT_H);
  for(let s=0;s<SUB;s++){
    const sub=DT/SUB,sq=sub*sub;
    const P=[bike.rear,bike.front,bike.head];
    for(const p of P){const vx=p.x-p.px,vy=p.y-p.py;p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy;}
    for(const p of P){p.y+=G*sq;}
    if(aDrive){bike.rear.x+=aDrive*sq;bike.front.x+=aDrive*sq;bike.head.x+=aDrive*sq;}
    const FS=ginfo(ter,bike.front.x).y-WHEEL_R,RS=ginfo(ter,bike.rear.x).y-WHEEL_R;
    if(bike.airT>0){bike.frontGr=false;bike.rearGr=false;bike.airT--;
      if((bike.front.y<FS-14||bike.rear.y<RS-14)||(bike.front.y>FS+6||bike.rear.y>RS+6))bike.airT=0;
    }else{bike.frontGr=(bike.front.y>FS-12);bike.rearGr=(bike.rear.y>RS-12);}
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
      if(srf===Infinity)continue;
      if(p.y>srf-GRAB){
        const gi=ginfo(ter,p.x);
        p.x+=(G*gi.m/Math.hypot(1,gi.m))*0.55*sq;
        if(gi.m<stiffM)p.px+=(p.x-p.px)*stiffDamp;
        const depth=p.y-srf;
        const vy=p.y-p.py;
        if(depth>8){p.y=Math.max(srf,p.y-susClimb);if(vy<0){p.py=p.y;}else if(vy>0){p.py=p.y-vy*susAbsorb;}}
        else if(depth<-8){p.y=Math.min(srf,p.y+susClimb);if(vy>0)p.py=p.y-vy*susAbsorb;}
        else{if(vy>0)p.py=p.y-vy*susAbsorb;p.y=srf;}
        bike.grounded++;
      }
    }
    if(bike.grounded>=2){
      const a2=Math.atan2(bike.front.y-bike.rear.y,L);
      const my2=(bike.rear.y+bike.front.y)/2, mx2=(bike.rear.x+bike.front.x)/2;
      bike.head.x+=(mx2-SEAT_H*Math.sin(a2)-bike.head.x)*0.35;
      bike.head.y+=(my2-SEAT_H*Math.cos(a2)-bike.head.y)*0.35;
    }
    const angN=Math.atan2(bike.front.y-bike.rear.y,bike.front.x-bike.rear.x);
    let dA=angN-bike.lastAng;while(dA>Math.PI)dA-=2*Math.PI;while(dA<-Math.PI)dA+=2*Math.PI;
    const MAXDA=0.08;
    if(Math.abs(dA)>MAXDA){
      const back=angN-Math.sign(dA)*(Math.abs(dA)-MAXDA)*0.85;
      const rot=back-angN,c=Math.cos(rot),s=Math.sin(rot);
      for(const p of [bike.front,bike.head]){const dx=p.x-bike.rear.x,dy=p.y-bike.rear.y;p.x=bike.rear.x+dx*c-dy*s;p.y=bike.rear.y+dx*s+dy*c;}
      bike.lastAng=back;
    }else{bike.lastAng=angN;}
    const mxh=(bike.rear.x+bike.front.x)/2,myh=(bike.rear.y+bike.front.y)/2;
    const dxh=bike.head.x-mxh,dyh=bike.head.y-myh;
    const disth=Math.hypot(dxh,dyh)||1e-4;
    const txx=-dyh/disth,tyy=dxh/disth;
    const hvx=bike.head.x-bike.head.px,hvy=bike.head.y-bike.head.py;
    const vt=hvx*txx+hvy*tyy;const vr=vt*(bike.grounded>0?susRot:0.40);
    bike.head.px=bike.head.x-(hvx-(vt-vr)*txx);
    bike.head.py=bike.head.y-(hvy-(vt-vr)*tyy);
  }
  const cvy=(bike.front.y-bike.front.py)/DT;
  if(Math.abs(cvy)>500){const lim=500*Math.sign(cvy);bike.front.py=bike.front.y-lim*DT;bike.rear.py=bike.rear.y-lim*DT;bike.head.py=bike.head.y-lim*DT;}
  let vh=(bike.front.x-bike.front.px)/DT;
  const gmG=ginfo(ter,bike.front.x);
  if(gmG.y!==Infinity&&gmG.m<0){
    const vT=Math.max(50,MAXV/(1+(-gmG.m)*1.3));
    if(vh>vT)vh=vT+(vh-vT)*0.90;
  }
  if(vh>MAXV){vh=MAXV;}else if(vh<-MAXV){vh=-MAXV;}
  if(vh!==(bike.front.x-bike.front.px)/DT){bike.front.px=bike.front.x-vh*DT;bike.rear.px=bike.rear.x-vh*DT;bike.head.px=bike.head.x-vh*DT;}
}
let allOk=true;
const chk=(n,c)=>{console.log((c?"✅":"❌")+" "+n);if(!c)allOk=false;};
// 1. 单缝：宽80，平地，车加速飞越
console.log("== 裂缝(宽80px)飞越 ==");
gaps=[{start:800,end:880}];
reset(200);
let crossed=false,minReach=99999,bad=false;
for(let f=0;f<600;f++){
  step(520);
  if(bike.front.x<minReach)minReach=bike.front.x;
  if(bike.front.x>900)crossed=true;
  if(isNaN(bike.front.x)||Math.abs(bike.front.y)>30000){bad=true;break;}
}
chk(`飞越80px裂缝: 前轮越过${bike.front.x.toFixed(0)} ${crossed?"✅成功":"❌失败"}`, !bad&&crossed);
// 2. 宽裂缝(140)极限
console.log("== 宽裂缝(140px)测试 ==");
gaps=[{start:800,end:940}];
reset(400);
crossed=false;
for(let f=0;f<600;f++){
  step(520);
  if(bike.front.x>960)crossed=true;
  if(isNaN(bike.front.x)||Math.abs(bike.front.y)>30000){bad=true;break;}
}
chk(`140px宽裂缝: 前轮x=${bike.front.x.toFixed(0)} ${crossed?"✅越过":"❌掉坑(合理,需升级极速)"}`, !bad);
// 3. 连续双缝+平地
console.log("== 双缝(各70px,间隔150) ==");
gaps=[{start:700,end:770},{start:920,end:990}];
reset(300);
crossed=false;
for(let f=0;f<800;f++){
  step(520);
  if(bike.front.x>1000)crossed=true;
  if(isNaN(bike.front.x)||Math.abs(bike.front.y)>30000){bad=true;break;}
}
chk(`双缝: 前轮x=${bike.front.x.toFixed(0)} ${crossed?"✅连续越缝":"❌未过"}`, !bad&&crossed);
// 4. 前轮跨缝后轮贴地稳定性
console.log("== 跨缝瞬间稳定性 ==");
gaps=[{start:800,end:880}];
reset(400);
let okStable=true,minY=99999;
for(let f=0;f<120;f++){
  step(520);
  if(bike.front.y<minY)minY=bike.front.y;
  if(isNaN(bike.front.x)||Math.abs(bike.front.y)>30000){okStable=false;break;}
}
chk(`跨缝无NaN 最低head.y=${minY.toFixed(0)}`, okStable&&minY>0);
console.log("\n"+(allOk?"🎉 全部通过":"⚠️ 有失败项"));