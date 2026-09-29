import {spawn,execFileSync} from 'node:child_process';
import {realpathSync,existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function alive(pid){try{process.kill(Number(pid),0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
export function cwdOf(pid){
  try{return execFileSync('lsof',['-nP','-p',String(pid),'-a','-d','cwd','-Fn'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).match(/^n(.*)$/m)?.[1];}catch{return undefined;}
}

function processInfo(pid){
  if(process.platform==='darwin'){
    // libproc's proc_bsdinfo: SDK sys/proc_info.h, PROC_PIDTBSDINFO=3.
    // Avoid ps, whose executable is denied in note action sandboxes.
    const script="import ctypes,struct,json,sys; b=ctypes.create_string_buffer(136); n=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True).proc_pidinfo(int(sys.argv[1]),3,0,b,136); assert n==136, 'proc_pidinfo failed: '+str(ctypes.get_errno()); ppid=struct.unpack_from('I',b.raw,16)[0]; sec,usec=struct.unpack_from('QQ',b.raw,120); print(json.dumps({'parent':ppid,'start':str(sec)+'.'+str(usec)}))";
    return JSON.parse(execFileSync('python3',['-c',script,String(pid)],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  }
  if(process.platform==='linux'){
    const stat=readFileSync('/proc/'+pid+'/stat','utf8').split(') ').at(-1).split(' ');
    return {parent:Number(stat[1]),start:stat[19]};
  }
  throw Error('预览生命周期暂不支持此平台');
}
export function startOf(pid){return alive(pid)?processInfo(pid).start:null;}

export function listenerAt(port){
  try{return Number(execFileSync('lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-t'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n')[0])||null;}catch{return null;}
}
function read(path,fallback){try{return JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function write(path,value){const temp=path+'.'+process.pid;writeFileSync(temp,JSON.stringify(value,null,2));renameSync(temp,path);}
export class Lifecycle {
  constructor(dir,key,{termMs=10000,killMs=5000}={}){this.dir=dir;this.key=key;this.termMs=termMs;this.killMs=killMs;this.path=join(dir,'resources.json');}
  read(){return read(this.path,{key:this.key,resources:[],surfaces:{}});}
  save(value){mkdirSync(this.dir,{recursive:true});write(this.path,value);}
  async locked(fn){
    mkdirSync(this.dir,{recursive:true});const lock=join(this.dir,'lifecycle.lock');const deadline=Date.now()+390000;const ownerIdentity={pid:process.pid,start:startOf(process.pid)};
    while(true){
      try{mkdirSync(lock);write(join(lock,'owner.json'),ownerIdentity);break;}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        const owner=read(join(lock,'owner.json'),null);
        if(owner&&(!alive(owner.pid)||startOf(owner.pid)!==owner.start)){rmSync(lock,{recursive:true,force:true});continue;}
        if(Date.now()>deadline)throw Error('预览资源正在被另一操作使用');
        await sleep(100);
      }
    }
    try{return await fn();}finally{rmSync(lock,{recursive:true,force:true});}
  }
  inspect(resource){
    const processes=resource.processes.filter(p=>alive(p.pid));
    for(const p of processes)if((p.start&&startOf(p.pid)!==p.start)||cwdOf(p.pid)!==realpathSync(resource.cwd))throw Error(`${resource.name}: 进程身份已变化 (${p.pid})`);
    const listener=resource.port?listenerAt(resource.port):null;
    if(listener&&!resource.processes.some(p=>p.pid===listener)){
      // A child can begin listening between readiness samples. Prove its ancestry
      // before cleanup instead of misclassifying our own late child as a stranger.
      this.recordListener(resource.name);
      resource.processes=this.read().resources.find(r=>r.name===resource.name).processes;
    }
    return resource.processes.filter(p=>alive(p.pid));
  }
  async acquire({name,cwd,port,revision,argv,env={},stdio='inherit'},surface){
    let state=this.read();let resource=state.resources.find(r=>r.name===name);
    if(resource){
      this.inspect(resource);
      if(resource.processes.some(p=>alive(p.pid))){
        if(resource.revision!==revision)throw Error(name+': 旧服务必须先停止');
        resource.users=[...new Set([...resource.users,surface])];this.save(state);return resource;
      }
      state.resources=state.resources.filter(r=>r!==resource);
    }
    if(port&&listenerAt(port))throw Error(name+': 端口由其他候选或未登记进程占用');
    const child=spawn(argv[0],argv.slice(1),{cwd,env:{...process.env,...env},detached:true,stdio});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    resource={name,cwd,port,revision,key:this.key,users:[surface],processes:[{pid:child.pid,start:startOf(child.pid),group:true}]};
    state.resources.push(resource);this.save(state);child.unref();
    return resource;
  }
  recordListener(name){
    const state=this.read();const r=state.resources.find(r=>r.name===name);
    if(!r)throw Error('未登记资源 '+name);
    const pid=listenerAt(r.port);if(!pid)return null;
    if(cwdOf(pid)!==realpathSync(r.cwd))throw Error(name+': 监听进程工作区不符');
    if(!r.processes.some(p=>p.pid===pid)){
      let parent=pid;
      const seen=new Set();
      while(parent>1&&!seen.has(parent)&&!r.processes.some(p=>p.pid===parent)){
        seen.add(parent);
        parent=processInfo(parent).parent;
      }
      if(!r.processes.some(p=>p.pid===parent))throw Error(name+': 监听进程不属于启动进程树');
      r.processes.push({pid,start:startOf(pid),group:false});this.save(state);}
    return pid;
  }
  registerSurface(name,pid=process.pid){
    const state=this.read();state.surfaces[name]={pid,start:startOf(pid),cwd:cwdOf(pid)};this.save(state);
  }
  activeSurfaces(){
    return Object.entries(this.read().surfaces).filter(([,p])=>alive(p.pid)&&startOf(p.pid)===p.start).map(([name])=>name);
  }
  /** Adopt only a legacy receipt already bound to this candidate and exact listener/cwd. */
  adoptLegacy(name,receipt,users,otherReceipts=[]){
    if(this.read().resources.some(r=>r.name===name))return;
    if(!receipt)return;
    const pid=listenerAt(receipt.port);
    if(!pid)return;
    if(pid!==receipt.listenerPid||cwdOf(pid)!==realpathSync(receipt.dir)||otherReceipts.some(r=>r.listenerPid===pid||r.port===receipt.port))throw Error(name+': 无法证明旧进程属于当前候选');
    const processes=[{pid,start:startOf(pid),group:false}];
    if(receipt.pid!==pid&&alive(receipt.pid)&&cwdOf(receipt.pid)===realpathSync(receipt.dir))processes.push({pid:receipt.pid,start:startOf(receipt.pid),group:true});
    const state=this.read();state.resources.push({name,key:this.key,cwd:receipt.dir,port:receipt.port,revision:receipt.revision,users,processes});this.save(state);
  }
  async terminate(resource){
    let processes=this.inspect(resource);
    const signal=kind=>{
      processes=this.inspect(resource);
      for(const p of processes){
        try{process.kill(p.pid,kind);}catch(e){if(e.code!=='ESRCH')throw e;}
        if(p.group){try{process.kill(-p.pid,kind);}catch(e){if(e.code!=='ESRCH')throw e;}}
      }
    };
    const exited=()=>!resource.processes.some(p=>alive(p.pid))&&(!resource.port||!listenerAt(resource.port));
    signal('SIGTERM');let until=Date.now()+this.termMs;
    while(!exited()&&Date.now()<until)await sleep(100);
    if(!exited()){signal('SIGKILL');until=Date.now()+this.killMs;while(!exited()&&Date.now()<until)await sleep(100);}
    if(!exited())throw Error(resource.name+': 进程或端口未释放');
  }

  async shutdown(surface,prepare=()=>{}){
    let wrappers=[];
    const result=await this.locked(async()=>{
      await prepare();
      wrappers=Object.entries(this.read().surfaces).filter(([name])=>!surface||name===surface).map(([,p])=>p);
      for(const p of wrappers)if(p.pid!==process.pid&&alive(p.pid)){
        if(startOf(p.pid)!==p.start)throw Error('预览启动进程身份已变化 '+p.pid);
        process.kill(p.pid,'SIGTERM');
      }
      return this.release(surface);
    });
    for(const p of wrappers){
      if(p.pid===process.pid)continue;
      let until=Date.now()+this.termMs;
      while(alive(p.pid)&&startOf(p.pid)===p.start&&Date.now()<until)await sleep(100);
      if(alive(p.pid)&&startOf(p.pid)===p.start){
        process.kill(p.pid,'SIGKILL');until=Date.now()+this.killMs;
        while(alive(p.pid)&&startOf(p.pid)===p.start&&Date.now()<until)await sleep(100);
      }
      if(alive(p.pid)&&startOf(p.pid)===p.start)result.errors.push('启动进程未退出 '+p.pid);
    }
    result.ok=result.errors.length===0;
    return result;
  }
  async release(surface){
    const state=this.read(),stopped=[],retained=[],errors=[];
    if(surface)delete state.surfaces[surface];else state.surfaces={};
    await Promise.all([...state.resources].map(async resource=>{
      resource.users=surface?resource.users.filter(user=>user!==surface):[];
      if(resource.users.length){retained.push(resource.name);return;}
      try{await this.terminate(resource);state.resources=state.resources.filter(r=>r!==resource);stopped.push(resource.name);}
      catch(error){errors.push(String(error));}
    }));
    this.save(state);
    return {ok:errors.length===0,stopped,retained,errors};
  }
}
