// 复验：下坡加速 + 大坑 + 上坡 + 无小丘
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const G=1000,SUB=6,DT=1/60,WHEEL_R=12,WHEELBASE=38,SEAT_H=26;
let DRIVE=400,MAXV=130,crashMargin=2,susAbsorb=0.25,susClimb=5,susRot=0.70;
const LEVELS=[{amp:26,len:4600,seed:11}];
function hillY(x){const L=LEVELS[0];
  const progress=clamp((x-L.len*0.12)/(L.len*0.6),0,1);
  const ease=progress*progress*(3-2*progress);
  return 300+(Math.sin(x*0.0028+L.seed)*L.amp*1.2+Math.sin(x*0.0011+L.seed*2)*L.amp*1.8+Math.sin(x*0.0007+L.seed*3)*L.amp*2.6)*ease;}
function groundInfo(fn,x){const e=2,y0=fn(x),yL=fn(x-e),yR=fn(x+e),m=(yR-yL)/(2*e);return{y:y0,m};}
function mg(kind){if(kind==="down")return x=>300+0.25*(x-60);if(kind==="up")return x=>300-0.12*(x-60);if(kind==="pit")return x=>300-150*Math.cos((x-400)/300*Math.PI);return hillY;}
const bike={rear:{x:0,y:0,px:0,py:0},front:{x:0,y:0,px:0,py:0},head:{x:0,y:0,px:0,py:0},grounded:0,frontGr:false,rearGr:false,squash:0,airT:0,lastAng:0};
function reset(fn,x){const L=WHEELBASE;
  const yR=fn(x)-WHEEL_R,yF=fn(x+L)-WHEEL_R;
  const ang=Math.atan2(yF-yR,L);
  bike.rear={x:x,y:yR,px:x,py:yR};bike.front={x:x+L,y:yF,px:x+L,py:yF};
  const hx=x+L/2-Math.sin(ang)*SEAT_H,hy=(yR+yF)/2-Math.cos(ang)*SEAT_H;
  bike.head={x:hx,y:hy,px:hx,py:hy};
  bike.frontGr=false;bike.rearGr=false;bike.grounded=0;bike.airT=0;bike.squash=0;
  bike.lastAng=Math.atan2(bike.front.y-bike.rear.y,bike.front.x-bike.rear.x);
}
function step(fn,aDrive){
  const L=WHEELBASE,Lr=Math.hypot(L*0.5,SEAT_H);
  for(let s=0;s<SUB;s++){
    const sub=DT/SUB,sq=sub*sub;
    const P=[bike.rear,bike.front,bike.head];
    for(const p of P){const vx=p.x-p.px,vy=p.y-p.py;p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy;}
    for(const p of P){p.y+=G*sq;}
    if(aDrive){bike.rear.x+=aDrive*sq;bike.front.x+=aDrive*sq;bike.head.x+=aDrive*sq;}
    const FS=groundInfo(fn,bike.front.x).y-WHEEL_R,RS=groundInfo(fn,bike.rear.x).y-WHEEL_R;
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
      if(p.y>srf-12){
        const ginfo=groundInfo(fn,p.x);
        if(ginfo.y!==Infinity)p.x+=(G*ginfo.m/Math.hypot(1,ginfo.m))*0.7*sq;
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
    const vt=hvx*txx+hvy*tyy;const vr=vt*susRot;
    bike.head.px=bike.head.x-(hvx-(vt-vr)*txx);
    bike.head.py=bike.head.y-(hvy-(vt-vr)*tyy);
  }
  if(!aDrive&&bike.grounded>0&&groundInfo(fn,bike.front.x).m<=0.03){const dec=0.12;bike.rear.px+=(bike.rear.x-bike.rear.px)*dec;bike.front.px+=(bike.front.x-bike.front.px)*dec;bike.head.px+=(bike.head.x-bike.head.px)*dec;}
  let vh=(bike.front.x-bike.front.px)/DT;
  if(vh>MAXV){vh=MAXV;}else if(vh<-MAXV){vh=-MAXV;}
  if(vh!==(bike.front.x-bike.front.px)/DT){bike.front.px=bike.front.x-vh*DT;bike.rear.px=bike.rear.x-vh*DT;bike.head.px=bike.head.x-vh*DT;}
}
let allOk=true;
function chk(n,c){console.log((c?"✅":"❌")+" "+n);if(!c)allOk=false;}
let maxSlope=0,minWave=999999,lastX=-1;
for(let x=100;x<4500;x+=4){const m=groundInfo(hillY,x).m;if(Math.abs(m)>maxSlope)maxSlope=Math.abs(m);if(m>0&&groundInfo(hillY,x-4).m<=0){if(lastX>0)minWave=Math.min(minWave,x-lastX);lastX=x;}}
chk("地形无小丘 最大坡度="+maxSlope.toFixed(2)+" 最小波长="+minWave+"px", maxSlope<0.6&&minWave>800);

const down=mg("down");reset(down,60);
for(let f=0;f<240;f++)step(down,0);
const vDown=(bike.front.x-bike.front.px)/DT;
chk("25%下坡滑行 速度="+vDown.toFixed(1)+" (>40 重力加速)", vDown>40);

const up=mg("up");reset(up,60);
for(let f=0;f<360;f++)step(up,400);
chk("12%上坡+驱动 x="+bike.front.x.toFixed(0)+" (>700)", bike.front.x>700);

const pit=mg("pit");reset(pit,40);let bad=false;
for(let f=0;f<600;f++){step(pit,400);if(isNaN(bike.front.x)||Math.abs(bike.front.y)>20000){bad=true;break;}}
chk("大坑冲出 x="+bike.front.x.toFixed(0)+" (>700)", !bad&&bike.front.x>700);

const steep=x=>300-60*Math.cos((x-400)/40*Math.PI);
reset(steep,40);bad=false;let maxH=0;
for(let f=0;f<400;f++){step(steep,400);if(bike.head.y<maxH)maxH=bike.head.y;if(isNaN(bike.front.x)||Math.abs(bike.front.y)>20000){bad=true;break;}}
chk("陡坡不弹飞 波动="+(-maxH).toFixed(0)+"px", !bad&&maxH>-3000);

console.log("\n"+(allOk?"🎉 全部通过":"⚠️ 有失败项"));