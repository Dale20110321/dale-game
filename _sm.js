// 实测过坡顶的平滑度
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const G=1000,SUB=6,DT=1/60,WHEEL_R=12,WHEELBASE=38,SEAT_H=26;
let DRIVE=400,MAXV=130,crashMargin=2,susAbsorb=0.25,susClimb=5,susRot=0.70;
function ground(x){const d=Math.abs(x-500);if(d<60)return 300-(80*Math.cos(d/60*Math.PI/2));return 300;}
function groundInfo(x){const e=2,y0=ground(x),yL=ground(x-e),yR=ground(x+e),m=(yR-yL)/(2*e);return{y:y0,m};}
const bike={rear:{x:0,y:0,px:0,py:0},front:{x:0,y:0,px:0,py:0},head:{x:0,y:0,px:0,py:0},grounded:0,frontGr:false,rearGr:false,squash:0,airT:0,lastAng:0};
function reset(x){const L=WHEELBASE;
  const yR=ground(x)-WHEEL_R,yF=ground(x+L)-WHEEL_R;
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
      if(p.y>srf-12){
        const depth=p.y-srf;
        if(depth>8){p.y=Math.max(srf,p.y-susClimb);const vy=p.y-p.py;if(vy>0)p.py=p.y-vy*susAbsorb;}
        else if(depth<-8){p.y=Math.min(srf,p.y+susClimb);const vy=p.y-p.py;if(vy>0)p.py=p.y-vy*susAbsorb;}
        else{const vy=p.y-p.py;if(vy>0)p.py=p.y-vy*susAbsorb;p.y=srf;}
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
    let dA=angN-bike.lastAng;
    while(dA>Math.PI)dA-=2*Math.PI;
    while(dA<-Math.PI)dA+=2*Math.PI;
    const MAXDA=0.08;
    if(Math.abs(dA)>MAXDA){
      const back=angN-Math.sign(dA)*(Math.abs(dA)-MAXDA)*0.85;
      const rot=back-angN,c=Math.cos(rot),s=Math.sin(rot);
      for(const p of [bike.front,bike.head]){
        const dx=p.x-bike.rear.x,dy=p.y-bike.rear.y;
        p.x=bike.rear.x+dx*c-dy*s;p.y=bike.rear.y+dx*s+dy*c;
      }
      bike.lastAng=back;
    }else{bike.lastAng=angN;}
    const mxh=(bike.rear.x+bike.front.x)/2,myh=(bike.rear.y+bike.front.y)/2;
    const dxh=bike.head.x-mxh,dyh=bike.head.y-myh;
    const disth=Math.hypot(dxh,dyh)||1e-4;
    const txx=-dyh/disth,tyy=dxh/disth;
    const hvx=bike.head.x-bike.head.px,hvy=bike.head.y-bike.head.py;
    const vt=hvx*txx+hvy*tyy;
    const vr=vt*susRot;
    bike.head.px=bike.head.x-(hvx-(vt-vr)*txx);
    bike.head.py=bike.head.y-(hvy-(vt-vr)*tyy);
  }
  if(!aDrive&&bike.grounded>0){
    const dec=0.12;
    bike.rear.px+=(bike.rear.x-bike.rear.px)*dec;
    bike.front.px+=(bike.front.x-bike.front.px)*dec;
    bike.head.px+=(bike.head.x-bike.head.px)*dec;
  }
  let vh=(bike.front.x-bike.front.px)/DT;
  if(vh>MAXV){vh=MAXV;}else if(vh<-MAXV){vh=-MAXV;}
  if(vh!==(bike.front.x-bike.front.px)/DT){bike.front.px=bike.front.x-vh*DT;bike.rear.px=bike.rear.x-vh*DT;bike.head.px=bike.head.x-vh*DT;}
}

reset(40);
console.log("过坡顶观测（坡在x=440~560, 高80宽120余弦）");
let lastAng=null;
for(let f=0;f<400;f++){
  step(400);
  const fx=bike.front.x;
  if(fx>420&&fx<580){
    const ang=Math.atan2(bike.front.y-bike.rear.y,bike.front.x-bike.rear.x);
    let dA=0;
    if(lastAng!==null){dA=Math.abs(ang-lastAng);if(dA>Math.PI)dA=2*Math.PI-dA;}
    lastAng=ang;
    const surfF=groundInfo(fx).y-WHEEL_R,surfR=groundInfo(bike.rear.x).y-WHEEL_R;
    const depthF=(bike.front.y-surfF).toFixed(1),depthR=(bike.rear.y-surfR).toFixed(1);
    console.log(`f=${f} frontX=${fx.toFixed(0)} 角度=${(ang*180/Math.PI).toFixed(1)}° 角变=${(dA*180/Math.PI).toFixed(1)}° frontDepth=${depthF} rearDepth=${depthR} grd=${bike.grounded} 前轮离地=${(surfF-bike.front.y).toFixed(0)}`);
  }
}