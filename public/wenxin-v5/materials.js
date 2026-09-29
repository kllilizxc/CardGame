/* Rendering adapter only. The original v4 drives every timer, pose parameter,
 * camera, attack, effect, transition, and control. Artwork stays in assets/.
 */
(() => {
  'use strict';
  const names=['girl','girl-expressions','elder','elder-expressions','disciple-reference-v2','fox','eagle','ghost','talisman','sword'];
  const images={},cache=new Map();
  const meta={fox:{asset:'fox',w:120,h:96,ax:60,ay:92,flip:false},mistfox:{asset:'fox',w:120,h:96,ax:60,ay:92,flip:false},eagle:{asset:'eagle',w:120,h:104,ax:56,ay:100,flip:false},sage:{asset:'elder',w:136,h:156,ax:64,ay:150,flip:false},disc:{asset:'disciple-reference-v2',w:120,h:136,ax:56,ay:132,flip:false},ghost:{asset:'ghost',w:128,h:144,ax:70,ay:136,flip:true}};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingEnabled=false;return[c,x];}
  function bounds(image){
    const[c,x]=surface(image.width,image.height);x.drawImage(image,0,0);
    try{const data=x.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0;
      for(let y=0;y<c.height;y+=3)for(let px=0;px<c.width;px+=3)if(data[(y*c.width+px)*4+3]>128){l=Math.min(l,px);t=Math.min(t,y);r=Math.max(r,px);b=Math.max(b,y);}
      return{x:Math.max(0,l-3),y:Math.max(0,t-3),w:Math.min(c.width-l,r-l+7),h:Math.min(c.height-t,b-t+7)};
    }catch{return{x:0,y:0,w:image.width,h:image.height};}
  }
  function fit(x,image,w,h,ax,ay,flip=false,box=null){
    const b=box||bounds(image),scale=Math.min(w/b.w,h/b.h),dw=b.w*scale,dh=b.h*scale;
    x.save();x.translate(ax,ay);if(flip)x.scale(-1,1);x.drawImage(image,b.x,b.y,b.w,b.h,Math.round(-dw/2),Math.round(-dh),Math.round(dw),Math.round(dh));x.restore();
  }
  function baseUnit(key){
    if(cache.has(key))return cache.get(key);
    const m=meta[key],[c,x]=surface(m.w,m.h);
    if(key==='disc'){
      // Fixed 2× pixel grid; the existing v4 dimensions and foot anchor stay intact.
      const[small,sx]=surface(m.w/2,m.h/2);
      fit(sx,images[m.asset],(m.w-8)/2,(m.ay-3)/2,m.ax/2,m.ay/2,m.flip);
      const pixels=sx.getImageData(0,0,small.width,small.height);
      for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>160?255:0;
      sx.putImageData(pixels,0,0);x.drawImage(small,0,0,m.w,m.h);
      cache.set(key,c);return c;
    }
    if(key==='mistfox')x.filter='hue-rotate(95deg) saturate(.55) brightness(.83)';
    fit(x,images[m.asset],m.w-8,m.ay-3,m.ax,m.ay,m.flip);
    cache.set(key,c);return c;
  }
  function reset(px){const x=px.ox;x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.clearRect(0,0,px.w,px.h);x.imageSmoothingEnabled=false;return x;}
  function monster(px,key,a){
    const x=reset(px),m=meta[key],base=baseUnit(key),t=a.t||0;
    // Reuse v4 pose channels: run 16, wingbeat 7/18, breathing 2/3,
    // robe sway 1.3/1.5, enemy reach, and sword-casting raise.
    if(key==='fox'||key==='mistfox'){
      const stride=Math.sin(t*16)*(a.run||0),br=Math.sin(t*3)*.5;
      for(let y=0;y<m.h;y+=2){const low=clamp((y-m.h*.6)/(m.h*.4),0,1),dx=Math.round(stride*2.5*low),dy=Math.round(y+br*(1-low)-Math.abs(stride)*2),tail=Math.round(Math.sin(t*2.2)*2.4*(1-y/m.h)),sh=Math.min(3,m.h-y);x.drawImage(base,0,y,42,sh,dx+tail,dy,42,sh);x.drawImage(base,42,y,m.w-42,sh,42+dx,dy,m.w-42,sh);}
    }else if(key==='eagle'){
      const flap=Math.sin(t*(a.fast?18:7)),bob=Math.sin(t*4)*1.5;
      for(let sx=0;sx<m.w;sx+=2){const distance=Math.abs(sx-m.ax)/m.w,dy=Math.round(flap*distance*14+bob),height=m.h-Math.round(flap*distance*8);x.drawImage(base,sx,0,2,m.h,sx,dy,2,height);}
    }else{
      const br=Math.sin(t*2)*(key==='disc'?1.25:.5),sw=Math.sin(t*(key==='disc'?1.5:1.3))*(key==='ghost'?1.6:1.2);
      for(let y=0;y<m.h;y+=2){const q=y/m.h,cloth=clamp((q-.25)/.75,0,1),reach=(a.reach||0)*Math.sin(q*Math.PI)*4,raise=(a.raise||0)*Math.sin(q*Math.PI)*2;
        const grounded=key==='disc'?clamp((m.ay-y)/16,0,1):1;
        const sh=Math.min(3,m.h-y);x.drawImage(base,0,y,m.w,sh,Math.round(sw*cloth*grounded+reach),Math.round(y+br*grounded-raise),m.w,sh);}
    }
    return px.o;
  }
  function portraitBase(kind,expression){
    const key=`portrait-${kind}-${expression}`;if(cache.has(key))return cache.get(key);
    const[c,x]=surface(192,264);
    if(images[kind==='girl'?'girl-expressions':'elder-expressions']){
      const im=images[kind==='girl'?'girl-expressions':'elder-expressions'],w=im.width/2,h=im.height/2,i={neutral:0,happy:1,raised:1,worried:2,talk:2,blink:3}[expression]||0;
      x.drawImage(im,(i%2)*w,Math.floor(i/2)*h,w,h,0,0,192,264);
    }else{
      const im=images[kind==='girl'?'girl':'elder'],s=.28;
      x.drawImage(im,Math.round(96-im.width*.45*s),-3,Math.round(im.width*s),Math.round(im.height*s));
    }
    cache.set(key,c);return c;
  }
  function portrait(px,kind,a){
    const x=reset(px),girl=kind==='girl',expression=girl?(a.expr.eyes==='smile'?'happy':a.blink?'blink':a.expr.brow==='worried'||a.expr.eyes==='half'?'worried':'neutral'):(a.blink?'blink':a.mouth==='a'?'talk':a.expr.eyes==='wide'||a.expr.brow==='raised'?'raised':'neutral');
    const base=portraitBase(kind,expression),br=a.br||0,sw=a.sw||0;
    for(let y=0;y<264;y+=2){const cloth=clamp((y-80)/184,0,1),sh=Math.min(3,264-y);x.drawImage(base,0,y,192,sh,Math.round(sw*cloth*.65),Math.round(y+br*(.6+cloth*.4)),192,sh);}
    if(girl&&(a.mouth==='a'||a.mouth==='o')&&expression!=='happy'){
      const my=80+Math.round(br*.6);x.fillStyle='#e7bcae';x.fillRect(86,my-2,6,5);x.fillStyle='#895767';x.fillRect(87,my,3,a.mouth==='o'?3:2);x.fillStyle='#c9828c';x.fillRect(88,my+2,2,1);
    }
    // Bell stays on the original effect anchor; v4 owns ripples and flash.
    if(girl&&Math.abs(a.bell||0)>.03){const angle=a.bell,bx=114+Math.sin(angle)*4,by=178+br+Math.cos(angle)*10;x.strokeStyle='#987779';x.lineWidth=1;x.beginPath();x.moveTo(110,172+br);x.lineTo(bx,by-3);x.stroke();x.fillStyle='#355c58';x.fillRect(Math.round(bx-3),Math.round(by-2),6,5);x.fillStyle='#a4c9b0';x.fillRect(Math.round(bx-2),Math.round(by-2),3,2);}
    return px.o;
  }
  function item(x,key){const image=images[key==='talis'?'talisman':'sword'];fit(x,image,102,94,56,98);}
  function cardGround(x,key){
    if(key!=='disc')return false;
    x.fillStyle='#e8e0d6';x.fillRect(0,0,112,100);
    // Give the face enough source pixels inside the original small art window.
    const[c,sx]=surface(56,50);
    fit(sx,images['disciple-reference-v2'],52,92,28,93);
    const p=sx.getImageData(0,0,56,50);
    for(let i=3;i<p.data.length;i+=4)p.data[i]=p.data[i]>160?255:0;
    sx.putImageData(p,0,0);x.drawImage(c,0,0,112,100);return true;
  }
  const api={portrait,monster,item,cardGround};
  const ready=Promise.all(names.map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[name]=img;resolve();};img.onerror=()=>reject(new Error(`素材载入失败：${name}`));img.src=`assets/${name}.png`;}))).then(()=>api);
  ready.catch(error=>{const now=document.getElementById('now');if(now)now.textContent=error.message+'；请保留 assets 文件夹并刷新。';});
  window.WenxinMaterials={ready};
})();
