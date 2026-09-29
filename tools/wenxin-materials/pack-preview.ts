/** Pack the material-only preview into one offline HTML, like the original. */
const root = 'public/wenxin-v5';
const html = await Bun.file(`${root}/index.html`).text();
const rendererName = html.match(/<script src="(materials[^"/]*\.js)"><\/script>/)?.[1];
if (!rendererName) throw new Error('Material renderer entry not found.');
let renderer = await Bun.file(`${root}/${rendererName}`).text();
const names = [...renderer.matchAll(/const names=\[([^\]]+)\]/g)][0]?.[1].match(/'([^']+)'/g)?.map(s=>s.slice(1,-1));
if (!names) throw new Error('Material manifest not found.');
const embedded: Record<string,string> = {};
for (const name of names) {
  const data = await Bun.file(`${root}/assets/${name}.png`).arrayBuffer();
  embedded[name] = `data:image/png;base64,${Buffer.from(data).toString('base64')}`;
}
const marker = 'img.src=`assets/${name}.png`;';
if (renderer.split(marker).length !== 2) throw new Error('Expected one asset loader.');
renderer=renderer.replace(marker,'img.src=EMBEDDED_MATERIALS[name];');
const script = `const EMBEDDED_MATERIALS=${JSON.stringify(embedded)};\n${renderer}`;
let output=html.replace(`<script src="${rendererName}"></script>`,`<script>\n${script}\n</script>`);
if (Bun.argv.includes('--disciple')) {
  const start="new URLSearchParams(location.search).get('card')==='disc'";
  if (output.split(start).length!==2) throw new Error('Single-card preview entry not found.');
  output=output.replace(start,'true');
}
const path = `${root}/${Bun.argv[2] || 'v7-卡匣问心-整套重绘.html'}`;
await Bun.write(path,output);
console.log(`Standalone material preview saved: ${path}`);
