import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNodes,resolveLinks,visibleTree,layoutTree,searchNodes,normalizeConversation,exportMarkdown,ancestors,CARD_WIDTH,CARD_HEIGHT } from '../conversation-canvas/core.mjs';
test('preserves leading and consecutive assistant messages without inventing questions',()=>{
 const messages=[{role:'assistant',text:'开场'}, {role:'user',text:'问题'}, {role:'assistant',text:'第一段'}, {role:'assistant',text:'第二段'}, {role:'user',text:'未答'}];
 const n=buildNodes(messages);assert.equal(n.length,3);assert.equal(n[0].q,null);assert.deepEqual(n[1].answers.map(a=>a.text),['第一段','第二段']);assert.equal(n[2].answers.length,0);
});
test('normalization retains over 500 messages, long content and IDs; rejects bad roles',()=>{
 const messages=Array.from({length:1202},(_,i)=>({role:i%2?'assistant':'user',text:i===1?'长'.repeat(16000):String(i),id:'m'+i}));
 const d=normalizeConversation({conversationId:'c',messages});assert.equal(d.messages.length,1202);assert.equal(d.messages[1].text.length,16000);assert.equal(d.messages[1].id,'m1');assert.throws(()=>normalizeConversation({messages:[{role:'system',text:'x'}]}));
});
test('stable IDs survive appended answers and repeated question text',()=>{
 const messages=[{role:'user',text:'重复'}, {role:'assistant',text:'答'}, {role:'user',text:'重复'}];
 const old=buildNodes(messages),next=buildNodes([...messages,{role:'assistant',text:'新答'}]);assert.equal(old[0].id,next[0].id);assert.equal(old[1].id,next[1].id);assert.notEqual(old[0].id,old[1].id);
});
test('generic similar questions stay on main line; explicit and manual branches are distinct',()=>{
 const raw=buildNodes([{role:'user',text:'如何规划项目？'},{role:'user',text:'如何规划项目的进度？'},{role:'user',text:'细节',parentQuestion:1}]);
 let n=resolveLinks(raw);assert.equal(n[1].kind,'main');assert.equal(n[2].source,'provided');assert.equal(n[2].parentId,n[0].id);
 n=resolveLinks(raw,{[raw[2].id]:{kind:'main'}});assert.equal(n[2].kind,'main');assert.equal(n[2].source,'manual');assert.equal(n[2].parentId,n[1].id);
 n=resolveLinks(raw,{[raw[0].id]:{kind:'branch',parentId:raw[2].id}});assert.equal(n[0].parentId,null);
});
test('explicit Q reference works even without overlapping content',()=>{
 const n=resolveLinks(buildNodes([{role:'user',text:'题目一'},{role:'user',text:'第二题'},{role:'user',text:'请基于当前对话中的 Q1 继续回答。'}]));assert.equal(n[2].source,'reference');assert.equal(n[2].parentId,n[0].id);
});
test('main continuations share a horizontal lane and side branches have a separate lane',()=>{
 const n=resolveLinks(buildNodes([{role:'user',text:'main1'},{role:'user',text:'side',parentQuestion:1},{role:'user',text:'main2',relationship:'main'}]));
 const p=layoutTree(n).points;assert.equal(p[n[0].id].y,p[n[2].id].y);assert.ok(p[n[1].id].y>p[n[0].id].y);
});
test('tree layout does not overlap, collapsed content remains searchable and exportable',()=>{
 const messages=Array.from({length:80},(_,i)=>({role:'user',text:'任务 '+i,...(i>0&&i%3===0?{parentQuestion:1}:{relationship:'main'})}));
 const n=resolveLinks(buildNodes(messages)),layout=layoutTree(n),points=Object.values(layout.points);
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.abs(points[i].x-points[j].x)>=CARD_WIDTH || Math.abs(points[i].y-points[j].y)>=CARD_HEIGHT);
 assert.equal(visibleTree(n,{[n[0].id]:true}).length,1);assert.equal(searchNodes(n,'任务 79').length,1);assert.ok(ancestors(n,n.at(-1).id).length);assert.ok(exportMarkdown({title:'demo'},n).includes('任务 79'));
});
