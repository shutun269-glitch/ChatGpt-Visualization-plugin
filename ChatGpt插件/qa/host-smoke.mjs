import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const proc=spawn(process.execPath,['server.js'],{cwd:new URL('../conversation-canvas/',import.meta.url),stdio:['pipe','pipe','pipe']});
let buffer='',id=0;const pending=new Map();
proc.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const result=JSON.parse(line);pending.get(result.id)?.(result);pending.delete(result.id);}});
const call=(method,params={})=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});
const watchdog=setTimeout(()=>{proc.kill();process.exitCode=1;console.error('MCP smoke test timeout');},10000);
try{
 const init=await call('initialize',{protocolVersion:'2025-11-25'});assert.equal(init.result.serverInfo.version,'0.5.0');
 const tools=await call('tools/list');const uri=tools.result.tools[0]._meta.ui.resourceUri;assert.match(uri,/0.5.0/);
 const resource=await call('resources/read',{uri});assert.ok(resource.result.contents[0].text.includes('搜索问答'));
 const messages=Array.from({length:1002},(_,i)=>({role:i%2?'assistant':'user',text:'内容'+i}));
 const result=await call('tools/call',{name:'show_conversation_map',arguments:{title:'smoke',messages}});assert.equal(result.result.structuredContent.messages.length,1002);
 const invalid=await call('tools/call',{name:'show_conversation_map',arguments:{messages:[{role:'system',text:'bad'}]}});assert.equal(invalid.error.code,-32602);
 console.log('MCP: initialize, resource, tools, full content and invalid input checks passed.');
}finally{clearTimeout(watchdog);proc.kill();}
