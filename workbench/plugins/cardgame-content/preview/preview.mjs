#!/usr/bin/env node
import { Lifecycle, startOf, alive } from './lifecycle.mjs';
import { reservePorts, releasePorts } from './ports.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args[0];
const option = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const key = option('key');
const surface = option('surface') || 'web';
const projectHash = createHash('sha256').update(root).digest('hex');
const runtime = () => {
  if (!key || key.length > 512) throw Error('A bounded candidate key is required');
  return join(tmpdir(), 'cardgame-workbench-preview', projectHash.slice(0,16), createHash('sha256').update(key).digest('hex').slice(0,24));
};
const registry = join(tmpdir(), 'worka-preview-port-registry');
const planPath = () => join(runtime(), 'plan.json');
const output = value => console.log(JSON.stringify(value));
const progress = (stage, message) => output({type:'preview-progress',stage,message});
const readPlan = () => JSON.parse(readFileSync(planPath(), 'utf8'));

function revision() {
  const git = argv => execFileSync('git', ['-C', root, ...argv], { encoding:'utf8', maxBuffer:16*1024*1024 });
  const head = git(['rev-parse', 'HEAD']).trim();
  const scopes = ['src','public','vite','package.json','bun.lock','bun.lockb','index.html'];
  const changed = new Set([
    ...git(['diff','HEAD','--name-only','-z','--',...scopes]).split('\0'),
    ...git(['ls-files','--others','--exclude-standard','-z','--',...scopes]).split('\0'),
  ].filter(Boolean));
  if (!changed.size) return head;
  const digest = createHash('sha256').update(head);
  for (const path of [...changed].sort()) {
    digest.update('\0'+path+'\0');
    try { digest.update(readFileSync(resolve(root,path))); }
    catch (error) { if(error.code!=='ENOENT')throw error; digest.update('deleted'); }
  }
  return head + '+worktree.' + digest.digest('hex').slice(0,16);
}

function checks() {
  const checks = [
    {name:'game-entry',ok:existsSync(join(root,'src/GameApp.tsx')),detail:'React + Phaser 入口'},
    {name:'dependencies',ok:existsSync(join(root,'node_modules/vite/dist/node/index.js')),detail:'Vite 已安装',fix:'在候选目录运行 bun install --frozen-lockfile'},
    {name:'catalog',ok:existsSync(join(root,'public/data/content-catalog.json')),detail:'游戏内容目录'},
  ];
  try { startOf(process.pid); checks.push({name:'process-identity',ok:true,detail:'可核对进程归属'}); }
  catch(error) { checks.push({name:'process-identity',ok:false,detail:String(error)}); }
  return checks;
}

async function plan() {
  progress('plan','核对候选并分配独立端口');
  const report = checks();
  if (report.some(check=>!check.ok)) { output({ok:false,checks:report}); process.exitCode=1; return; }
  const ports = await reservePorts(registry, runtime(), ['web:main'], {base:6810,size:50});
  const port = ports['web:main'];
  const fingerprint = revision();
  const item = {
    name:'web',port,ports:[port],url:'http://127.0.0.1:'+port+'/',
    argv:[process.execPath,fileURLToPath(import.meta.url),'up','--key',key,'--surface','web'],
    readinessPath:'/__cardgame_workbench',readinessTimeoutMs:30000,
  };
  mkdirSync(runtime(),{recursive:true});
  writeFileSync(planPath(),JSON.stringify({key,cwd:root,revision:fingerprint,surfaces:[item]}));
  output({ok:true,lifecycleVersion:1,verification:true,configId:'cardgame-web-v1',surfaces:[item],checks:report});
}

async function up() {
  const plan = readPlan();
  if (plan.cwd!==root||plan.revision!==revision()) throw Error('候选源码已变化，请重新准备预览');
  const manager = new Lifecycle(runtime(),key);
  let stopping=false;
  const stop=async(failed=false)=>{if(stopping)return;stopping=true;const result=await manager.shutdown('web');output(result);process.exit(failed||!result.ok?1:0);};
  process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
  try {
    await manager.locked(async()=>{
      manager.registerSurface('web');
      await manager.acquire({
        name:'web:main',cwd:root,port:plan.surfaces[0].port,revision:plan.revision,
        argv:[process.execPath,join(here,'serve.mjs')],
        env:{PORT:String(plan.surfaces[0].port),WORKA_SOURCE_REVISION:plan.revision},
      },'web');
      const until=Date.now()+30000;
      while(!manager.recordListener('web:main')){
        if(stopping||Date.now()>until)throw Error('游戏端口未在期限内就绪');
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    });
    progress('ready','游戏服务已启动，正在核验运行版本');
    setInterval(()=>{if(manager.read().resources.some(r=>r.users.includes('web')&&!r.processes.some(p=>alive(p.pid))))void stop(true);},1000);
  } catch(error) { console.error(String(error));await stop(true); }
}

async function down() {
  const manager=new Lifecycle(runtime(),key);
  const result=await manager.shutdown(option('surface'));
  if(result.ok){await releasePorts(registry,runtime());rmSync(planPath(),{force:true});}
  output(result);if(!result.ok)process.exitCode=1;
}

async function verify() {
  progress('verify','核验运行实例、游戏入口和内容文件');
  const plan=readPlan(),base=plan.surfaces[0].url;
  const get=async path=>{const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error(path+': HTTP '+response.status);return response;};
  const identity=await (await get('/__cardgame_workbench')).json();
  const checks=[{name:'running-revision',ok:identity.revision===plan.revision&&identity.project===projectHash&&revision()===plan.revision,detail:'运行实例与候选源码一致'}];
  const html=await (await get('/')).text();
  checks.push({name:'game-shell',ok:html.includes('src/main.tsx')&&html.includes('root'),detail:'页面挂载游戏入口'});
  const module=await (await get('/src/GameApp.tsx')).text();
  checks.push({name:'game-module',ok:!module.includes('Internal Server Error')&&module.includes('StartGame'),detail:'游戏入口模块可加载'});
  const catalog=await (await get('/data/content-catalog.json')).json();
  checks.push({name:'content-catalog',ok:Boolean(catalog&&typeof catalog==='object'),detail:'内容目录可读取'});
  for(const name of ['units','artifacts','talismans','fields','skills','pills']){
    const cards=await (await get('/data/cards/'+name+'.json')).json();
    const values=Array.isArray(cards)?cards:Object.values(cards).find(Array.isArray);
    checks.push({name:'cards:'+name,ok:Array.isArray(values)&&values.every(card=>card&&typeof card.id==='string'),detail:name+' 卡牌定义可读取'});
  }
  const ok=checks.every(check=>check.ok);
  output({ok,configId:'cardgame-web-v1',checks,summary:ok?'运行版本、入口模块与内容文件核验通过；剧情和战斗体验在试玩中检查。':'候选核验失败',repairable:'manual'});
  if(!ok)process.exitCode=1;
}

try {
  if(surface!=='web')throw Error('未知预览端：'+surface);
  if(command==='capabilities')output({ok:true,describe:true,lifecycleVersion:1});
  else if(command==='describe')output({ok:true,surfaces:[{name:'web',url:'',argv:[]}]});
  else if(command==='revision')output({revision:revision()});
  else if(command==='doctor'){const report=checks();output({ok:report.every(c=>c.ok),checks:report});if(report.some(c=>!c.ok))process.exitCode=1;}
  else if(command==='plan')await plan();
  else if(command==='up')await up();
  else if(command==='down')await down();
  else if(command==='verify')await verify();
  else throw Error('doctor | revision | describe | plan | up | down | verify');
} catch(error) { output({ok:false,summary:String(error),repairable:'manual'});process.exitCode=1; }
