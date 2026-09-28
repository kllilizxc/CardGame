import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {Lifecycle} from './lifecycle.mjs';

function read(path){try{return JSON.parse(readFileSync(path,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}}
function write(path,value){const temp=path+'.'+process.pid;writeFileSync(temp,JSON.stringify(value));renameSync(temp,path);}
async function free(port){return new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
/** Serializes managed allocations. External port races must still fail at strict bind. */
export async function reservePorts(dir,owner,names,{base,size}){
 if(!owner||new Set(names).size!==names.length||!Number.isInteger(base)||!Number.isInteger(size)||base<1024||size<1||base+size>65536)throw Error('Invalid preview port allocation');
 mkdirSync(dir,{recursive:true});
 return new Lifecycle(dir,'port-registry').locked(async()=>{
  const path=join(dir,'ports.json'),state=read(path),reserved=new Set(Object.values(state).flatMap(ports=>Object.values(ports)));
  const ports={...state[owner]};
  for(const name of names){
   if(ports[name])continue;
   let port;
   for(let p=base;p<base+size;p++)if(!reserved.has(p)&&await free(p)){port=p;break;}
   if(!port)throw Error(`预览端口段 ${base}–${base+size-1} 已用尽`);
   ports[name]=port;reserved.add(port);
  }
  state[owner]=ports;write(path,state);return ports;
 });
}
/** Call only after the lifecycle manager has confirmed all resources are stopped. */
export async function releasePorts(dir,owner){
 return new Lifecycle(dir,'port-registry').locked(async()=>{const path=join(dir,'ports.json'),state=read(path);delete state[owner];write(path,state);});
}
