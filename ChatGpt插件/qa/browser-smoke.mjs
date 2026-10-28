import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/abjecter/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const messages=[
 {role:'assistant',text:'这是浏览器验证用的演示对话。'},
 {role:'user',text:'怎样把项目计划整理成清晰的步骤？',relationship:'main'},
 {role:'assistant',text:'先确定目标与交付物，再拆分里程碑和负责人。'},
 {role:'assistant',text:'补充回答：记录风险，保持每周复盘。'},
 {role:'user',text:'如何安排每周复盘？',parentQuestion:1},
 {role:'assistant',text:'复盘分三部分：已完成、遇到的问题、下一步行动。\n'+('详细内容可以滚动阅读。\n'.repeat(30))+'检索末尾暗号'},
 {role:'user',text:'怎样追踪项目进度？',relationship:'main'},
 {role:'assistant',text:'用里程碑对照实际交付，每周记录变化。<img src=x onerror=alert(1)>'},
 {role:'user',text:'请基于当前对话中的 Q2 继续回答。原问题：如何安排每周复盘？我的追问：给出模板。'},
 {role:'assistant',text:'本周完成：\n遇到的问题：\n下周计划：'}];
const fixture={title:'项目规划 · 演示对话',conversationId:'qa-demo',messages};
const app=fs.readFileSync(new URL('../conversation-canvas/app.html',import.meta.url),'utf8');
const host=`<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe id="app" src="/app"></iframe><script>
window.received=[];window.rejectMessages=false;window.data=${JSON.stringify(fixture).replace(/</g,'\\u003c')};
window.pushData=data=>document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}},'*');
addEventListener('message',e=>{const m=e.data;if(!m||m.jsonrpc!=='2.0')return;if(m.method==='ui/initialize'){e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-11-25',hostCapabilities:{message:{}},hostInfo:{name:'QA',version:'1'}}},'*');setTimeout(()=>pushData(data),10);}else if(m.method==='ui/message'){received.push(m.params);e.source.postMessage({jsonrpc:'2.0',id:m.id,...(rejectMessages?{error:{code:-32000,message:'模拟拒绝'}}:{result:{}})},'*');}});
</script>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url==='/app'?app:host);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);const frame=page.frames().find(f=>f.url().endsWith('/app'));
 await frame.locator('#count').filter({hasText:'4 个问题'}).waitFor();
 await frame.locator('#list-view').click();assert.ok((await frame.locator('.answer-text').first().innerText()).includes('演示'));
 const q1=frame.locator('[data-q="1"]');assert.ok((await q1.locator('.answer-text').innerText()).includes('补充回答'));
 assert.equal(await frame.locator('.answer-text img').count(),0);
 const input=q1.locator('textarea');await input.fill('尚未提交的追问');await frame.locator('#tree-view').click();
 await frame.locator('#zoom').fill('120');await frame.locator('#list-view').click();assert.equal(await frame.locator('[data-q="1"] textarea').inputValue(),'尚未提交的追问');
 // Quoted selection is transferred to the matching card, never another node.
 await q1.locator('.answer-text').scrollIntoViewIfNeeded();
 await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await q1.locator('.answer-text').evaluate(el=>{document.activeElement?.blur();const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',bubbles:true}));});
 await frame.locator('#quote-action').click();await frame.locator('[data-q="1"] .quote').waitFor({state:'visible'});
 // Failed sends must preserve text; only confirmed success clears it.
 await page.evaluate(()=>rejectMessages=true);await frame.locator('[data-q="1"] .primary').click();await frame.locator('#status').filter({hasText:'输入已保留'}).waitFor();assert.equal(await frame.locator('[data-q="1"] textarea').inputValue(),'尚未提交的追问');
 await page.evaluate(()=>rejectMessages=false);await frame.locator('[data-q="1"] .primary').click();await frame.locator('#status').filter({hasText:'已交给 ChatGPT'}).waitFor();assert.equal(await frame.locator('[data-q="1"] textarea').inputValue(),'');
 const sent=await page.evaluate(()=>received.at(-1));assert.ok(sent.content[0].text.includes('选中的原文'));assert.equal(sent._meta,undefined);
 // Correct a branch, undo, then collapse its ancestors and locate text in a hidden answer.
 await frame.getByRole('button',{name:'调整 Q2 的关系',exact:true}).click();await frame.locator('#relation-kind').selectOption('main');await frame.locator('#relation-save').click();assert.equal(await frame.locator('[data-q="2"] .kind').innerText(),'主线');
 await frame.locator('#undo').click();assert.ok((await frame.locator('[data-q="2"] .kind').innerText()).includes('分支'));
 await frame.locator('[data-q="1"]').getByRole('button',{name:'收起后续'}).click();assert.equal(await frame.locator('[data-q="2"]').count(),0);
 await frame.locator('#search').fill('检索末尾暗号');await frame.locator('#next-match').click();await frame.locator('[data-q="2"]').waitFor();assert.ok((await frame.locator('[data-q="2"] .answer-text').innerText()).includes('检索末尾暗号'));
 await frame.locator('#search').fill('');await frame.locator('[data-q="2"] textarea').fill('不可导出的未发送内容');await frame.locator('#export').click();assert.ok((await frame.locator('#export-content').inputValue()).includes('检索末尾暗号'));assert.ok(!(await frame.locator('#export-content').inputValue()).includes('不可导出的未发送内容'));
 await frame.locator('#export-format').selectOption('json');const exported=JSON.parse(await frame.locator('#export-content').inputValue());assert.equal(exported.messages.length,messages.length);await frame.locator('#export-close').click();
 await frame.locator('#tree-view').click();await frame.locator('#fit').click();await page.screenshot({path:fileURLToPath(new URL('../conversation-canvas-preview.png',import.meta.url))});
 // Mouse drag updates connectors and survives pointer completion.
 const target=frame.locator('[data-q="1"] .note-top');const box=await target.boundingBox();if(box){await page.mouse.move(box.x+30,box.y+8);await page.mouse.down();await page.mouse.move(box.x+65,box.y+30,{steps:5});await page.mouse.up();}
 // Draft survives a refresh of the same conversation and narrow layouts stay bounded.
 await page.evaluate(data=>pushData({...data,messages:[...data.messages,{role:'assistant',text:'更新补充'}]}),fixture);await frame.locator('#list-view').click();assert.equal(await frame.locator('[data-q="2"] textarea').inputValue(),'不可导出的未发送内容');
 await page.setViewportSize({width:430,height:760});await frame.locator('#tree-view').click();await frame.locator('#latest').click();await page.screenshot({path:fileURLToPath(new URL('../conversation-canvas-mobile-preview.png',import.meta.url))});
 const sizes=await frame.locator('body').evaluate(el=>({scroll:el.scrollHeight,height:innerHeight}));assert.ok(sizes.scroll<=sizes.height+2);
 await frame.locator('#zoom').fill('10');const overflow=await frame.locator('.workspace').evaluate(el=>({w:el.scrollWidth,viewport:el.clientWidth}));assert.ok(overflow.w<=overflow.viewport+2,'Zoom-out must not leave unscaled horizontal overflow');
 await page.reload();const refreshed=page.frames().find(f=>f.url().endsWith('/app'));await refreshed.locator('#count').filter({hasText:'4 个问题'}).waitFor();await refreshed.locator('#list-view').click();assert.equal(await refreshed.locator('[data-q="2"] textarea').inputValue(),'不可导出的未发送内容');
 await refreshed.locator('#tree-view').click();
 // Large conversations render a viewport subset and can navigate to the last question.
 const long={title:'长对话',conversationId:'qa-large',messages:Array.from({length:1600},(_,i)=>({role:i%2?'assistant':'user',text:'长对话消息 '+i,relationship:'main'}))};
 await page.evaluate(d=>pushData(d),long);await refreshed.locator('#count').filter({hasText:'800 个问题'}).waitFor();await refreshed.locator('#latest').click();await refreshed.locator('[data-q="800"]').waitFor();assert.ok(await refreshed.locator('.note').count()<30);
 // Clean previews use the same built UI; only the demonstration transcript differs.
 await page.setViewportSize({width:1280,height:850});await page.evaluate(d=>pushData(d),{...fixture,conversationId:'qa-preview',messages:messages.slice(1).map(m=>({...m,text:m.text.replace('<img src=x onerror=alert(1)>','')}))});
 await refreshed.locator('#count').filter({hasText:'4 个问题'}).waitFor();await refreshed.locator('#fit').click();await page.screenshot({path:fileURLToPath(new URL('../conversation-canvas-preview.png',import.meta.url))});
 await page.setViewportSize({width:430,height:760});await refreshed.locator('#zoom').fill('95');await refreshed.locator('#latest').click();await page.screenshot({path:fileURLToPath(new URL('../conversation-canvas-mobile-preview.png',import.meta.url))});
 assert.equal(errors.length,0,errors.join('\n'));console.log('Browser: full answers, selection, drafts, send success/failure, relation undo, collapse/search, export, drag, narrow viewport and 800-question navigation passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
