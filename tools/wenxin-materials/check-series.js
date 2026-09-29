(async()=>{
  const M=await WenxinMaterials.ready;
  const make=(w,h)=>{const o=document.createElement('canvas');o.width=w;o.height=h;return {w,h,o,ox:o.getContext('2d',{willReadFrequently:true})};};
  const read=p=>p.ox.getImageData(0,0,p.w,p.h).data;
  const hash=d=>{let n=2166136261;for(const v of d)n=Math.imul(n^v,16777619);return (n>>>0).toString(16);};
  const extent=(d,w,h)=>{let left=w,top=h,right=0,bottom=0,n=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>127){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);n++;}return {left,top,right,bottom,pixels:n};};
  const units={fox:[120,96],mistfox:[120,96],eagle:[120,104],sage:[136,156],disc:[120,136],ghost:[128,144]};
  const report={loaded:M.inspect().assets.length,units:{},portraits:{},cards:[],errors:window.__artErrors||[]};
  const sheet=make(1152,800);sheet.ox.fillStyle='#d8d3c5';sheet.ox.fillRect(0,0,sheet.w,sheet.h);sheet.ox.imageSmoothingEnabled=false;sheet.ox.font='16px sans-serif';sheet.ox.fillStyle='#263b3a';
  let column=0;
  for(const [key,[w,h]] of Object.entries(units)){
    const p=make(w,h),frames=[];
    for(const t of [0,.35,.7,1.1,1.6,2.2,2.8]){M.monster(p,key,{t});const d=read(p);frames.push({hash:hash(d),bounds:extent(d,w,h)});}
    const unique=new Set(frames.map(f=>f.hash)).size;
    if(unique<3)throw Error('Frozen idle: '+key);
    report.units[key]={uniqueFrames:unique,feet:frames.map(f=>f.bounds.bottom)};
    M.monster(p,key,{t:.35});sheet.ox.drawImage(p.o,column*190+20,20);sheet.ox.fillText(key,column*190+20,190);column++;
  }
  for(const [idx,kind] of ['girl','deacon'].entries()){
    const p=make(192,264),states=[{eyes:'open',brow:'normal',mouth:'close'}, {eyes:'smile',brow:'normal',mouth:'smile'}, {eyes:'half',brow:'worried',mouth:'close'}, {eyes:'open',brow:'raised',mouth:'close'}];
    const frames=[];
    for(let s=0;s<6;s++){
      const expr=states[s<4?s:0],blink=s===4,mouth=s===5?'a':'close';
      M.portrait(p,kind,{t:0,br:0,sw:0,bell:0,expr,blink,mouth});const d=new Uint8ClampedArray(read(p));frames.push(d);
      sheet.ox.drawImage(p.o,s*192,idx*285+220);
      sheet.ox.fillStyle='#263b3a';sheet.ox.fillText(kind+' '+['neutral','smile','worried','raised','blink','talk'][s],s*192+8,idx*285+496);
    }
    const diffs=frames.slice(1).map(d=>{let count=0,body=0,left=192,top=264,right=-1,bottom=-1;for(let i=0;i<d.length;i+=4)if(d[i]!==frames[0][i]||d[i+1]!==frames[0][i+1]||d[i+2]!==frames[0][i+2]||d[i+3]!==frames[0][i+3]){const x=(i/4)%192,y=Math.floor(i/4/192);count++;if(y>=110)body++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}return {count,body,bounds:{left,top,right,bottom}};});
    if(diffs.some(d=>d.body>0))throw Error('Expression moved body: '+kind);
    if(!diffs[3].count)throw Error('Blink unchanged: '+kind);
    if(!diffs[4].count)throw Error('Speech unchanged: '+kind);
    report.portraits[kind]=diffs;
  }
  for(const [key,mon,theme] of [['fox','fox','forest'],['eagle','eagle','storm'],['disc','disc','sky'],['sage','sage','gold'],['talis',null,'storm'],['sword',null,'gold'],['ghost','ghost','void'],['mist','mistfox','void']]){const c=M.cardArt({key,mon,theme});report.cards.push({key,width:c.width,height:c.height,readable:c.getContext('2d').getImageData(0,0,c.width,c.height).data.length===44800});}
  return {report,sheet:sheet.o.toDataURL('image/png')};
})()
