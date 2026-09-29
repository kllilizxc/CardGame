/** Material-only adapter: keep the supplied v4 engine and animation orchestration. */
const input = Bun.argv[2];
if (!input) throw new Error('Pass the original v4 HTML path.');
const original = await Bun.file(input).text();
const section = (start: string, end: string) => {
  const a = original.indexOf(start), b = original.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Missing source section: ' + start);
  return original.slice(a, b);
};
const replacements: Array<[string, string]> = [
  ["<script>\n(()=>{\n'use strict';", "<script src=\"materials-series.js\"></script>\n<script>\n(async()=>{\n'use strict';\nconst MATERIALS = await window.WenxinMaterials.ready;"],
  ["const out=P.px.run(x=>(girl?drawGirl:drawDeacon)(x,{t,br,sw,bell:P.bell,expr:P.expr,blink:P.blink>0&&P.expr.eyes!=='smile',mouth},girl?GIRL.c:DEA.c),girl?GIRL:DEA,PL);",
    "const out=MATERIALS.portrait(P.px,P.kind,{t,br,sw,bell:P.bell,expr:P.expr,blink:P.blink>0&&P.expr.eyes!=='smile',mouth});"],
  ['function renderMon(px,key,a,L){const M=MON[key];return px.run(x=>M.draw(x,a,M.ms.c),M.ms,L);}',
    'function renderMon(px,key,a,L){return MATERIALS.monster(px,key,a);}'],
  ['function buildArt(cd){', 'function buildArt(cd){return MATERIALS.cardArt(cd);'],
  ['const[c,x]=mk(128,184);x.drawImage(o,0,0);x.drawImage(cd.art,8,30);',
    'const[c,x]=mk(128,184);x.drawImage(MATERIALS.native(o),0,0);x.drawImage(cd.art,8,30);'],
  ['},M,FLATL);const[c,x]=mk(128,184);x.drawImage(o,0,0);return c;}',
    '},M,FLATL);const[c,x]=mk(128,184);x.drawImage(MATERIALS.native(o),0,0);return c;}'],
  ...[
    ['function buildStoryBG(){', "return MATERIALS.background('story',W,H);"],
    ['function buildBattleSky(){', "return MATERIALS.background('sky',W,120);"],
    ['function buildSea(){', 'return MATERIALS.sea(W*2,100);'],
    ['function buildFloor(){', 'return MATERIALS.floor(SLOTS);'],
    ['function buildBell(){', "return MATERIALS.prop('bell',96,88);"],
    ['function isleSprite(w,seed){', "return MATERIALS.prop('island',w,Math.round(w*.9),seed);"],
    ['function cloudSprite(w,h,seed){', "return MATERIALS.prop('cloud',w,h,seed);"],
    ['function buildGalleryBG(){', "return MATERIALS.background('gallery',W,H);"],
  ].map(([entry, hook]) => [entry, entry+hook] as [string,string]),
  [section('  for(const m of CROWD){', '  for(let i=0;i<4;i++){const x=((t*20'),
    '  for(const m of CROWD){const bob=Math.sin(t*1.5+m.ph)>.6?1:0;MATERIALS.crowd(c,m,bob);}\n'],
  ["const g=c.createRadialGradient(320,200,8,320,200,420);g.addColorStop(0,'#3a2a5e');g.addColorStop(1,'#07050e');c.fillStyle=g;c.fillRect(0,0,W,H);",
    "c.drawImage(GAL_BG,0,0);c.fillStyle='rgba(24,33,34,.25)';c.fillRect(0,0,W,H);"],
  ['const o=CK.px.run(x=>drawCasket(x,easeOut(open),CKM.c),CKM,FLATL);',
    'const o=MATERIALS.casket(CK.px,easeOut(open));'],
  ["c.fillStyle='#302662';c.fillRect(0,Math.round(cam.hy),W,H);",
    "c.fillStyle='#72857d';c.fillRect(0,Math.round(cam.hy),W,H);"],
  ["const bx=x+114*S,by=y+(178+Math.cos(PORT.girl.bell)*10)*S", "const bx=x+108*S,by=y+(208+Math.cos(PORT.girl.bell)*10)*S"],
  ["pellipse(c,320,200,q*380,q*240,'#8a6ab8',1-q)", "pellipse(c,320,200,q*380,q*240,'#849a8d',1-q)"],
  ["c.fillStyle='#fff6d0';c.fillRect(x-1,y-18,2,18);c.fillStyle='#f2c24a';c.fillRect(x-2,y-18,1,14);c.fillRect(x+1,y-18,1,14);c.fillStyle='#d8b050';c.fillRect(x-4,y-20,9,2);c.fillStyle='#6a4ab8';c.fillRect(x-1,y-26,2,6);",
    'MATERIALS.flyingSword(c,x,y);'],
  ["c.fillStyle='#f2d45a';c.fillRect(x-(w>>1),y-6,w,12);c.fillStyle='#c0342a';c.fillRect(x,y-4,1,2);c.fillRect(x,y,1,4);",
    "c.drawImage(MATERIALS.prop('talisman',6,12),x-(w>>1),y-6,w,12);"],
  [section("  for(const u of B.units)if(u.vis&&u.key==='ghost'){const[sx,sy]=uScreen(u),oy=", '  for(const P of B.pillars){const[sx,sy]=proj(P.x,0'),
    "  for(const u of B.units)if(u.vis&&u.key==='ghost'){const[sx,sy]=uScreen(u);MATERIALS.ghostEyes(c,sx,sy,u.t);}\n"],
  ['--bg:#12101a;--panel:#1a1725;--panel2:#231f31;--line:#352f47;--ink:#efe8d8;--muted:#9f97b0;',
    '--bg:#1c2427;--panel:#252f31;--panel2:#303a3c;--line:#52615e;--ink:#e8dfcf;--muted:#a1aaa0;'],
  ['--gold:#f0c35a;--gold-ink:#1f1606;--jade:#6fd6c0;--rose:#ef6a7a;--violet:#b48aff;',
    '--gold:#bfa071;--gold-ink:#1f211e;--jade:#91b3a2;--rose:#b6797b;--violet:#899d96;'],
  ['第四版：去掉全部后期光照，人物、卡面与怪物按参考图重新造型。',
    '整套素材重绘：人物、卡图、背景与场景物件统一为粗像素画风，沿用第四版的交互、战斗视角、运镜与演出时序。'],
  ['192 × 264 px 半身；大眼星形高光、腮红、成片发束、呆毛与披帛',
    '192 × 264 px 半身；约 6–6.5 头身，粗像素立绘；固定身体底图，局部切换表情'],
  ["resize();setView('story');requestAnimationFrame(frame);",
    "resize();setView('story');if(new URLSearchParams(location.search).get('card')==='disc'){G.auto=false;$('auto').checked=false;setView('cards');GAL.i=GAL.list.findIndex(cd=>cd.key==='disc');G.now='卡面鉴赏 · '+GAL.list[GAL.i].name;}requestAnimationFrame(frame);"],
];
let output = original;
for (const [before, after] of replacements) {
  if (output.split(before).length !== 2) throw new Error('Expected one patch site: ' + before.slice(0, 100));
  output = output.replace(before, after);
}
let restored = output;
for (const [before, after] of [...replacements].reverse()) restored = restored.replace(after, before);
if (restored !== original) throw new Error('Unintended changes outside material entry points.');
const sha = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
const protectedSections = [
  ['combat sequences', 'function* aSummon(', 'function unitLight('],
  ['battle state and camera updates', 'function updBattle(', 'function floorQuad('],
  ['projection and slot positions', 'const F=240;', 'let FLOOR=null'],
  ['card layout, tilt and flip', 'function drawCard(', '// ================================================================ STORY BACKGROUND'],
  ['story interactions', 'function updStory(', 'function drawStoryPixel('],
  ['casket timing and flight', 'function updCasket(', 'function drawCasketPixel('],
].map(([name, start, end]) => {
  const text = section(start, end);
  if (!output.includes(text)) throw new Error('Protected engine section changed: '+name);
  return {name, sha256: sha(text), unchanged: true};
});
await Bun.write('public/wenxin-v5/index.html', output);
await Bun.write('public/wenxin-v5/source-check.json', JSON.stringify({
  sourceFile:input, sourceSha256:sha(original),
  verification:'Reversing all '+replacements.length+' explicit material/copy/preview substitutions restores the original HTML byte-for-byte.',
  protectedSections, patches:replacements.map(([before,after])=>({before,after}))
},null,2)+'\n');
console.log('Full-series material preview created; original source round-trip and six engine sections verified.');
