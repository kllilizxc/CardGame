/* v4 owns scene state, camera, attack timing and effects.
 * This adapter only supplies art, expression patches and the original pose channels.
 */
(() => {
  'use strict';
  const names=['disciple-reference-v2','series-girl','series-elder','series-fox','series-eagle','series-ghost','series-talisman','series-sword','series-story','series-floor','series-sky','series-gallery','series-bell','series-island','series-cloud','series-casket'];
  const images={},cache=new Map(),boxes=new WeakMap(),faceBoxes=new WeakMap();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const meta={
    fox:{asset:'series-fox',w:120,h:96,ax:60,ay:92},
    mistfox:{asset:'series-fox',w:120,h:96,ax:60,ay:92},
    eagle:{asset:'series-eagle',w:120,h:104,ax:56,ay:100},
    sage:{asset:'series-elder',w:136,h:156,ax:64,ay:150,atlas:true},
    disc:{asset:'disciple-reference-v2',w:120,h:136,ax:56,ay:132},
    ghost:{asset:'series-ghost',w:128,h:144,ax:70,ay:136}
  };
  const palette=['#20282e','#303a42','#484642','#655b50','#88745c','#ac8c61','#c6aa7a','#dfc99f','#eee4d3','#c8c4b5','#a8afa4','#849a8d','#607b72','#425d57','#2b4440','#67505a','#957477','#b98e82','#e0b49a','#f1cead','#556577','#7d8c98','#a8b3b9','#d2d6cd'];
  const pal=palette.map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))),colorCache=new Map();
  function surface(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=false;return[c,x];}
  function hardAlpha(c,threshold=160){const x=c.getContext('2d'),p=x.getImageData(0,0,c.width,c.height);for(let i=3;i<p.data.length;i+=4)p.data[i]=p.data[i]>threshold?255:0;x.putImageData(p,0,0);return c;}
  function bounds(image){
    if(boxes.has(image))return boxes.get(image);
    const[c,x]=surface(image.width,image.height);x.drawImage(image,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
    let l=c.width,t=c.height,r=-1,b=-1;
    for(let y=0;y<c.height;y+=2)for(let px=0;px<c.width;px+=2)if(d[(y*c.width+px)*4+3]>160){l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,y);b=Math.max(b,y);}
    const out=r<0?{x:0,y:0,w:c.width,h:c.height}:{x:Math.max(0,l-2),y:Math.max(0,t-2),w:Math.min(c.width-l,r-l+5),h:Math.min(c.height-t,b-t+5)};
    boxes.set(image,out);return out;
  }
  function fit(x,image,w,h,ax,ay,flip=false,box){
    const b=box||bounds(image),s=Math.min(w/b.w,h/b.h),dw=Math.round(b.w*s),dh=Math.round(b.h*s);
    x.save();x.translate(ax,ay);if(flip)x.scale(-1,1);x.drawImage(image,b.x,b.y,b.w,b.h,Math.round(-dw/2),Math.round(-dh),dw,dh);x.restore();
  }
  function resized(image,w,h,block=2,box){
    const[s,x]=surface(w/block,h/block),b=box||{x:0,y:0,w:image.width,h:image.height};
    x.drawImage(image,b.x,b.y,b.w,b.h,0,0,s.width,s.height);
    const[c,cx]=surface(w,h);cx.drawImage(s,0,0,c.width,c.height);return c;
  }
  function native(image,block=1){
    const[s,x]=surface(image.width/block,image.height/block);x.drawImage(image,0,0,s.width,s.height);
    const p=x.getImageData(0,0,s.width,s.height),d=p.data;
    for(let i=0;i<d.length;i+=4){if(d[i+3]<140){d[i+3]=0;continue;}const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2];let q=colorCache.get(k);
      if(!q){let best=Infinity;for(const c of pal){const e=(d[i]-c[0])**2+(d[i+1]-c[1])**2+(d[i+2]-c[2])**2;if(e<best){best=e;q=c;}}colorCache.set(k,q);}
      d[i]=q[0];d[i+1]=q[1];d[i+2]=q[2];d[i+3]=255;}
    x.putImageData(p,0,0);const[c,cx]=surface(image.width,image.height);cx.drawImage(s,0,0,c.width,c.height);return c;
  }
  function cell(name,i,columns=2,rows=2){
    const key='cell-'+name+'-'+i+'-'+columns+'-'+rows;if(cache.has(key))return cache.get(key);
    const im=images[name],w=Math.floor(im.width/columns),h=Math.floor(im.height/rows),[c,x]=surface(w,h);
    x.drawImage(im,(i%columns)*w,Math.floor(i/columns)*h,w,h,0,0,w,h);hardAlpha(c);cache.set(key,c);return c;
  }
  function source(key){const m=meta[key];return m.atlas?cell(m.asset,0):images[m.asset];}
  function baseUnit(key){
    const id='unit-'+key;if(cache.has(id))return cache.get(id);
    const m=meta[key],[s,sx]=surface(m.w/2,m.h/2),[c,x]=surface(m.w,m.h);
    fit(sx,source(key),(m.w-8)/2,(m.ay-4)/2,m.ax/2,m.ay/2);
    hardAlpha(s);
    if(key==='mistfox'){const p=sx.getImageData(0,0,s.width,s.height),d=p.data;for(let i=0;i<d.length;i+=4){const v=(d[i]*.25+d[i+1]*.55+d[i+2]*.2)/255;d[i]=42+v*100;d[i+1]=58+v*124;d[i+2]=62+v*124;}sx.putImageData(p,0,0);}
    x.drawImage(s,0,0,m.w,m.h);cache.set(id,c);return c;
  }
  function reset(px){const x=px.ox;x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.clearRect(0,0,px.w,px.h);x.imageSmoothingEnabled=false;return x;}
  function monster(px,key,a){
    const x=reset(px),m=meta[key],base=baseUnit(key),t=a.t||0;
    // Sub-half-pixel breaths rounded to zero in v5. Keep the clock/frequency,
    // but allow a visible 1–2px excursion and pin grounded feet to the old anchor.
    if(key==='fox'||key==='mistfox'){
      const stride=Math.sin(t*16)*(a.run||0),br=Math.sin(t*3)*1.4,tail=Math.sin(t*2.2)*2.4;
      for(let y=0;y<m.h;y+=2){const q=y/m.ay,feet=clamp((m.ay-y)/14,0,1),low=clamp((q-.64)/.36,0,1),sh=Math.min(3,m.h-y),dx=Math.round(stride*2.5*low),dy=Math.round(y+br*feet-Math.abs(stride)*2);
        x.drawImage(base,0,y,42,sh,dx+Math.round(tail*(1-q)),dy,42,sh);x.drawImage(base,42,y,m.w-42,sh,42+dx,dy,m.w-42,sh);}
    }else if(key==='eagle'){
      const flap=Math.sin(t*(a.fast?18:7)),bob=Math.sin(t*4)*1.8;
      for(let sx=0;sx<m.w;sx+=2){const distance=Math.abs(sx-m.ax)/m.w,dy=Math.round(flap*distance*14+bob),h=m.h-Math.round(flap*distance*8);x.drawImage(base,sx,0,2,m.h,sx,dy,2,h);}
    }else{
      const br=Math.sin(t*2)*(key==='ghost'?2:1.4),sw=Math.sin(t*(key==='disc'?1.5:1.3))*(key==='ghost'?2:1.5);
      for(let y=0;y<m.h;y+=2){const q=y/m.h,cloth=clamp((q-.23)/.77,0,1),feet=key==='ghost'?1:clamp((m.ay-y)/16,0,1),reach=(a.reach||0)*Math.sin(q*Math.PI)*4,raise=(a.raise||0)*Math.sin(q*Math.PI)*2,sh=Math.min(3,m.h-y);
        x.drawImage(base,0,y,m.w,sh,Math.round(sw*cloth*feet+reach),Math.round(y+br*feet-raise),m.w,sh);}
    }
    return px.o;
  }
  function components(c,predicate,region){
    const x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height,seen=new Uint8Array(w*h),result=[];
    const r=region||{x:0,y:0,w,h},x0=Math.max(0,Math.floor(r.x)),x1=Math.min(w,Math.ceil(r.x+r.w)),y0=Math.max(0,Math.floor(r.y)),y1=Math.min(h,Math.ceil(r.y+r.h));
    for(let y=y0;y<y1;y++)for(let xx=x0;xx<x1;xx++){const start=y*w+xx;if(seen[start])continue;seen[start]=1;if(!predicate(d,start*4))continue;
      const queue=[start];let n=0,l=xx,t=y,rr=xx,b=y;
      for(let qi=0;qi<queue.length;qi++){const k=queue[qi],px=k%w,py=(k/w)|0;n++;l=Math.min(l,px);rr=Math.max(rr,px);t=Math.min(t,py);b=Math.max(b,py);
        for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=px+dx,ny=py+dy;if(nx<x0||nx>=x1||ny<y0||ny>=y1)continue;const p=ny*w+nx;if(seen[p])continue;seen[p]=1;if(predicate(d,p*4))queue.push(p);}}
      result.push({x:l,y:t,w:rr-l+1,h:b-t+1,n});}
    return result.sort((a,b)=>b.n-a.n);
  }
  function faceBox(im){
    if(faceBoxes.has(im))return faceBoxes.get(im);
    const[s,x]=surface(128,192);x.drawImage(im,0,0,128,192);
    const parts=components(s,(d,i)=>d[i+3]>160&&d[i]>140&&d[i+1]>90&&d[i]>d[i+1]*1.09&&d[i+1]>d[i+2]*1.045,{x:20,y:4,w:92,h:61});
    const f=parts.find(p=>p.n>=10&&p.w>=5&&p.h>=5&&p.y<48)||{x:52,y:21,w:22,h:25};
    const out={x:f.x*im.width/128,y:f.y*im.height/192,w:f.w*im.width/128,h:f.h*im.height/192};
    faceBoxes.set(im,out);return out;
  }
  function portraitSource(kind,expression,talking){
    const asset=kind==='girl'?'series-girl':'series-elder',key='expression-'+kind+'-'+expression+'-'+talking;
    if(cache.has(key))return cache.get(key);
    const neutral=cell(asset,0),b=faceBox(neutral),[c,x]=surface(neutral.width,neutral.height);x.drawImage(neutral,0,0);
    const patch=(index,mouthOnly=false)=>{
      const frame=cell(asset,index),f=faceBox(frame),inset=Math.max(2,b.w*.035),y=mouthOnly?b.y+b.h*.56:b.y+b.h*.08,h=mouthOnly?b.h*.35:b.h*.82;
      x.save();x.beginPath();x.rect(b.x+inset,y,b.w-inset*2,h);x.clip();
      x.drawImage(frame,f.x,f.y,f.w,f.h,b.x,b.y,b.w,b.h);x.restore();
    };
    if(expression)patch(expression);
    if(talking&&expression!==1&&expression!==3)patch(2,true);
    cache.set(key,c);return c;
  }
  function portraitBase(kind,expression,talking){
    const key='portrait-'+kind+'-'+expression+'-'+talking;if(cache.has(key))return cache.get(key);
    const asset=kind==='girl'?'series-girl':'series-elder',neutral=cell(asset,0),im=portraitSource(kind,expression,talking),b=bounds(neutral),f=faceBox(neutral),scale=182/b.h,[s,sx]=surface(96,132);
    // One fixed placement for every expression; never fit each frame separately.
    const ox=Math.round(48-(f.x+f.w*.5)*scale),oy=Math.round(2-b.y*scale);
    sx.drawImage(im,ox,oy,Math.round(im.width*scale),Math.round(im.height*scale));hardAlpha(s);
    const[c,x]=surface(192,264);x.drawImage(s,0,0,192,264);cache.set(key,c);return c;
  }
  function portrait(px,kind,a){
    const x=reset(px),girl=kind==='girl',talking=a.mouth==='a'||a.mouth==='o';
    const expr=girl?(a.expr.eyes==='smile'?1:a.blink?3:a.expr.brow==='worried'||a.expr.eyes==='half'?2:0):(a.blink?3:a.expr.eyes==='wide'||a.expr.brow==='raised'?1:0);
    const base=portraitBase(kind,expr,talking),br=a.br||0,sw=a.sw||0;
    for(let y=0;y<264;y+=2){const cloth=clamp((y-80)/184,0,1),sh=Math.min(3,264-y);x.drawImage(base,0,y,192,sh,Math.round(sw*cloth*.65),Math.round(y+br*(.6+cloth*.4)),192,sh);}
    if(girl&&Math.abs(a.bell||0)>.03){const bx=108+Math.sin(a.bell)*4,by=208+br+Math.cos(a.bell)*10;x.strokeStyle='#88745c';x.lineWidth=1;x.beginPath();x.moveTo(110,194+br);x.lineTo(bx,by-3);x.stroke();x.fillStyle='#425d57';x.fillRect(Math.round(bx-3),Math.round(by-2),6,5);x.fillStyle='#a8afa4';x.fillRect(Math.round(bx-2),Math.round(by-2),3,2);}
    return px.o;
  }
  function cardArt(cd){
    const[c,x]=surface(112,100),[s,sx]=surface(56,50);
    const grounds={forest:'#d5dacc',storm:'#c9d1cd',void:'#80948e',sky:'#e8e0d6',gold:'#ded2b8'};
    x.fillStyle=grounds[cd.theme]||'#e8e0d6';x.fillRect(0,0,112,100);
    if(cd.mon){const im=source(cd.mon);if(cd.mon==='disc'||cd.mon==='sage')fit(sx,im,52,92,28,93);
      else{fit(sx,im,53,47,28,49);if(cd.mon==='mistfox'){sx.globalCompositeOperation='source-atop';sx.fillStyle='rgba(68,103,96,.35)';sx.fillRect(0,0,56,50);sx.globalCompositeOperation='source-over';}}}
    else fit(sx,images[cd.key==='talis'?'series-talisman':'series-sword'],51,46,28,48);
    hardAlpha(s);x.drawImage(s,0,0,112,100);return c;
  }
  function prop(kind,w,h,seed=0){
    const key='prop-'+kind+'-'+w+'-'+h+'-'+seed;if(cache.has(key))return cache.get(key);
    const[s,x]=surface(Math.ceil(w/2),Math.ceil(h/2));fit(x,images['series-'+kind],s.width-2,s.height-2,s.width/2,s.height-1);hardAlpha(s);
    if(kind==='cloud'){x.globalCompositeOperation='source-in';x.globalAlpha=.46;x.fillStyle='#d2d6cd';x.fillRect(0,0,s.width,s.height);x.globalAlpha=1;x.globalCompositeOperation='source-over';}
    const[c,cx]=surface(w,h);cx.drawImage(s,0,0,w,h);cache.set(key,c);return c;
  }
  function background(kind,w,h){
    const key='background-'+kind+'-'+w+'-'+h;if(cache.has(key))return cache.get(key);
    const im=images['series-'+kind];
    const box=kind==='sky'?{x:0,y:im.height*.18,w:im.width,h:im.height*.56}:undefined;
    const c=resized(im,w,h,2,box);cache.set(key,c);return c;
  }
  function sea(w,h){
    const key='sea-'+w+'-'+h;if(cache.has(key))return cache.get(key);
    const im=images['series-sky'],[s,x]=surface(w/4,h/2);
    x.drawImage(im,0,im.height*.7,im.width,im.height*.3,0,0,s.width,s.height);
    const[c,cx]=surface(w,h);cx.drawImage(s,0,0,w/2,h);cx.save();cx.translate(w,0);cx.scale(-1,1);cx.drawImage(s,0,0,w/2,h);cx.restore();cache.set(key,c);return c;
  }
  function floor(slots){
    const[s,x]=surface(200,200),im=images['series-floor'];
    x.fillStyle='#72857d';x.fillRect(0,0,200,200);
    const cloud=prop('cloud',90,32),sky=images['series-sky'];
    x.drawImage(sky,0,sky.height*.64,sky.width,sky.height*.36,0,0,200,200);
    for(let i=0;i<20;i++){const px=(i*71)%240-40,py=(i*43)%210-10;x.drawImage(cloud,px,py,70+(i%3)*16,24+(i%4)*4);}
    // The original world circle is at (0,78), radius77; texture transform is4px/world-unit.
    x.fillStyle='#303e40';x.beginPath();x.arc(100,48,77,0,Math.PI*2);x.fill();
    x.fillStyle='#abb1a0';x.beginPath();x.arc(100,48,75,0,Math.PI*2);x.fill();
    x.save();x.beginPath();x.arc(100,48,73.5,0,Math.PI*2);x.clip();x.drawImage(im,0,0,im.width,im.height,14,-38,172,172);x.restore();
    const[c,cx]=surface(800,800);cx.drawImage(s,0,0,800,800);
    for(const side of['me','foe'])for(const[sx,sz]of slots[side]){const u=(sx-9+100)*4,v=(sz-11-30)*4,w=72,h=88;
      cx.fillStyle='#344442';cx.fillRect(u,v,w,h);cx.fillStyle='#4d6058';cx.fillRect(u+4,v+4,w-8,h-8);
      cx.fillStyle=side==='me'?'#94b8a2':'#bd8c83';cx.fillRect(u,v,w,3);cx.fillRect(u,v+h-3,w,3);cx.fillRect(u,v,3,h);cx.fillRect(u+w-3,v,3,h);
      cx.fillStyle='#e8dfcb';for(const[a,b]of[[0,0],[w-6,0],[0,h-6],[w-6,h-6]])cx.fillRect(u+a,v+b,6,6);}
    return c;
  }
  function crowd(x,m,bob){
    const h=Math.round(m.h),w=Math.round(h*.72),key='crowd-'+h+'-'+(Math.round(m.ph)%3);let c=cache.get(key);
    if(!c){const[s,sx]=surface(w,h);fit(sx,source('disc'),w-1,h,w/2,h);hardAlpha(s);sx.globalCompositeOperation='source-atop';sx.fillStyle=['rgba(39,59,54,.25)','rgba(92,77,61,.24)','rgba(33,44,53,.30)'][Math.round(m.ph)%3];sx.fillRect(0,0,w,h);c=s;cache.set(key,c);}
    const px=Math.round(m.x),py=Math.round(m.y)-bob;x.globalAlpha=.25;x.fillStyle='#303b39';x.fillRect(px-w/2-2,py-1,w,2);x.globalAlpha=1;x.drawImage(c,Math.round(px-w/2),py-h);
  }
  function casket(px,open){
    const x=reset(px),a=clamp(open,0,1)*1.9,body=cell('series-casket',0,2,1),lid=cell('series-casket',1,2,1);
    const id='casket-body';let bc=cache.get(id);if(!bc){const[s,sx]=surface(48,32),b=bounds(body);sx.drawImage(body,b.x,b.y,b.w,b.h,0,0,48,32);hardAlpha(s);bc=s;cache.set(id,bc);}
    x.drawImage(bc,24,56,96,64);
    if(a>.05){x.fillStyle='#20282e';x.beginPath();x.moveTo(32,72);x.lineTo(112,72);x.lineTo(108,56);x.lineTo(36,56);x.fill();x.fillStyle='#dfc99f';x.fillRect(42,63,61,7);}
    const fy=14+12*Math.cos(a)-15*Math.sin(a),back=56,front=(fy+16)*2,lb=bounds(lid),rows=Math.max(1,Math.ceil(Math.abs(front-back)));
    for(let j=0;j<rows;j++){const q=j/rows,y=Math.round(back+(front-back)*q),left=36-16*q,width=72+32*q,sy=lb.y+q*lb.h;
      x.drawImage(lid,lb.x,Math.floor(sy),lb.w,Math.max(1,Math.ceil(lb.h/rows)),Math.round(left),y,Math.round(width),2);}
    x.fillStyle='#65513e';x.fillRect(20,Math.round(front),104,10);x.fillStyle='#b79b6d';x.fillRect(20,Math.round(front),104,2);return px.o;
  }
  function ghostEyes(x,sx,sy,t){
    let pts=cache.get('ghost-eyes');
    if(!pts){const c=baseUnit('ghost'),bone=components(c,(d,i)=>d[i+3]>160&&d[i]>165&&d[i+1]>150&&d[i+2]>115&&d[i]>d[i+2],{x:20,y:8,w:105,h:65})[0];
      if(bone){const dark=components(c,(d,i)=>d[i+3]>160&&d[i]<90&&d[i+1]<100&&d[i+2]<105,{x:bone.x+2,y:bone.y+bone.h*.2,w:bone.w-4,h:bone.h*.55}).filter(p=>p.n>=2);pts=dark.slice(0,2).map(p=>[p.x+p.w*.55,p.y+p.h*.5]);}
      if(!pts||!pts.length)pts=[[92,42]];cache.set('ghost-eyes',pts);}
    x.fillStyle='#d6a277';for(const[ex,ey]of pts)x.fillRect(Math.round(sx-meta.ghost.ax+ex),Math.round(sy-meta.ghost.ay+ey+Math.sin(t*2)*2),2,2);
  }
  function flyingSword(x,px,py){
    let c=cache.get('flying-sword');if(!c){const[s,sx]=surface(80,80);sx.translate(40,40);sx.rotate(Math.PI*.76);fit(sx,images['series-sword'],48,48,0,24);sx.setTransform(1,0,0,1,0,0);const[o,ox]=surface(10,28);fit(ox,s,10,28,5,28);hardAlpha(o);c=o;cache.set('flying-sword',c);}x.drawImage(c,px-5,py-28);
  }
  const api={monster,portrait,cardArt,native,background,sea,floor,prop,crowd,casket,ghostEyes,flyingSword,
    inspect:()=>({assets:names,portraitFaces:{girl:[0,1,2,3].map(i=>faceBox(cell('series-girl',i))),elder:[0,1,2,3].map(i=>faceBox(cell('series-elder',i)))},eyePoints:cache.get('ghost-eyes')})};
  const ready=Promise.all(names.map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[name]=img;resolve();};img.onerror=()=>reject(new Error('素材载入失败：'+name));img.src=`assets/${name}.png`;}))).then(()=>api);
  ready.catch(error=>{const now=document.getElementById('now');if(now)now.textContent=error.message+'；请保留 assets 文件夹并刷新。';});
  window.WenxinMaterials={ready};
})();
