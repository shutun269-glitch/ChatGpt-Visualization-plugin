const $ = s => document.querySelector(s);
const workspace = $('.workspace'), space = $('.space'), canvas = $('.canvas');
let data = { title:'当前对话', messages:[] }, key = '', nodes = [], visible = [], geometry = {points:{},width:500,height:450};
let state = { positions:{}, overrides:{}, collapsed:{}, zoom:0.85, selected:null }, drafts = {}, view = 'tree';
let matches = [], matchIndex = -1, history = [], cards = new Map(), dragging = null, busy = new Set(), bridgeReady = false, selectionCapture = null, signature = '', requestId = 0;
let offsetX=0,offsetY=0;
const pending = new Map();
function status(text) { $('#status').textContent = text; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function loadState() {
  state = {positions:{},overrides:{},collapsed:{},zoom:0.85,selected:null}; drafts = {}; history=[];
  try { const saved = JSON.parse(localStorage.getItem(key)||'{}'); for(const name of ['positions','overrides','collapsed']) state[name]=object(saved[name]); if(Number.isFinite(saved.zoom))state.zoom=Math.max(.1,Math.min(1.7,saved.zoom)); }
  catch { /* Storage is optional in sandboxed hosts. */ }
  try { drafts=object(JSON.parse(sessionStorage.getItem(key+':drafts')||'{}')); } catch {}
  const widget=window.openai?.widgetState?.privateContent;
  if(widget?.key===key) { drafts={...drafts,...object(widget.drafts)}; }
}
function save() {
  if(!key)return;
  try { localStorage.setItem(key,JSON.stringify(state)); sessionStorage.setItem(key+':drafts',JSON.stringify(drafts)); } catch {}
  try { window.openai?.setWidgetState?.({privateContent:{key,drafts}}); } catch {}
}
function draftFor(id) {
  if(!Object.hasOwn(drafts,id) || !drafts[id] || typeof drafts[id]!=='object') drafts[id]={text:'',quote:''};
  return drafts[id];
}
function receive(value) {
  const candidate=value?.structuredContent || value?.data || value;
  if(!Array.isArray(candidate?.messages))return;
  try {
    const next=normalizeConversation(candidate), nextSignature=JSON.stringify(next);
    if(nextSignature===signature)return;
    const nextKey=conversationKey(next), first=key!==nextKey;
    data=next;signature=nextSignature;
    if(first){key=nextKey;loadState();$('#search').value='';matchIndex=-1;}
    rebuild();
    if(first)requestAnimationFrame(()=>nodes.length<=3?fit():focusNode(nodes.find(n=>n.q)?.id||nodes[0]?.id));
    status(`${data.messages.length} 条消息已载入。画布只显示本次传入的内容。`);
  } catch(error){status('无法读取对话：'+error.message);}
}
function rebuild() {
  nodes=resolveLinks(buildNodes(data.messages),state.overrides);
  visible=visibleTree(nodes,state.collapsed);
  geometry=layoutTree(visible,state.positions);
  matches=searchNodes(nodes,$('#search').value);
  if(matchIndex>=matches.length)matchIndex=matches.length-1;
  $('#count').textContent=`${nodes.filter(n=>n.q).length} 个问题 · ${visible.length}/${nodes.length} 张卡片`;
  $('#title').textContent=data.title; $('#undo').disabled=!history.length;
  $('#fit').disabled=view!=='tree';$('#zoom').disabled=view!=='tree';
  $('#tree-view').classList.toggle('active',view==='tree');$('#list-view').classList.toggle('active',view==='list');
  $('#search-count').textContent=matches.length?`${matchIndex>=0?matchIndex+1:0}/${matches.length}`:'0 项';
  $('#previous-match').disabled=$('#next-match').disabled=!matches.length;
  canvas.replaceChildren();cards.clear();canvas.classList.toggle('list-view',view==='list');
  if(view==='tree') {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('edges');canvas.append(svg);resizeWorld();renderVisible();drawEdges();
  } else {
    canvas.style.cssText='position:relative;width:100%;height:auto;transform:none';space.style.cssText='width:100%;height:auto';
    for(const n of visible){const card=createCard(n);canvas.append(card);cards.set(n.id,card);}
  }
  if(!nodes.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='调用“对话便笺画布”，即可把当前对话整理到这里。';canvas.append(empty);}
}
function resizeWorld() {
  if(view!=='tree')return;
  offsetX=Math.max(0,(workspace.clientWidth-geometry.width*state.zoom)/2);offsetY=Math.max(0,(workspace.clientHeight-geometry.height*state.zoom)/2);
  canvas.style.position='absolute';canvas.style.left=offsetX+'px';canvas.style.top=offsetY+'px';canvas.style.width=geometry.width+'px';canvas.style.height=geometry.height+'px';canvas.style.transform=`scale(${state.zoom})`;
  space.style.overflow='hidden';
  space.style.width=Math.max(workspace.clientWidth,geometry.width*state.zoom)+'px';space.style.height=Math.max(workspace.clientHeight,geometry.height*state.zoom)+'px';
  const svg=canvas.querySelector('svg');if(svg){svg.setAttribute('width',geometry.width);svg.setAttribute('height',geometry.height);}
  $('#zoom').value=Math.round(state.zoom*100);$('#zoom-value').textContent=Math.round(state.zoom*100)+'%';
}
function renderVisible() {
  if(view!=='tree')return;
  const rect={x:(workspace.scrollLeft-offsetX)/state.zoom,y:(workspace.scrollTop-offsetY)/state.zoom,w:workspace.clientWidth/state.zoom,h:workspace.clientHeight/state.zoom};
  const focused=document.activeElement?.closest('.note')?.dataset.id;const wanted=new Set();
  for(const n of visible){const p=geometry.points[n.id];
    if(n.id!==focused&&n.id!==dragging?.id&&(p.x+CARD_WIDTH<rect.x-450||p.x>rect.x+rect.w+450||p.y+CARD_HEIGHT<rect.y-450||p.y>rect.y+rect.h+450))continue;
    wanted.add(n.id);
    if(!cards.has(n.id)){const card=createCard(n);canvas.append(card);cards.set(n.id,card);}
    const card=cards.get(n.id);card.style.left=p.x+'px';card.style.top=p.y+'px';
  }
  for(const [id,card] of cards)if(!wanted.has(id)){card.remove();cards.delete(id);}
}
function drawEdges() {
  if(view!=='tree')return;
  const svg=canvas.querySelector('svg');if(!svg)return;svg.replaceChildren();
  const pathIds=new Set([state.selected,...ancestors(nodes,state.selected)]);
  for(const n of visible){const a=geometry.points[n.parentId],b=geometry.points[n.id];if(!a||!b)continue;
    const x1=a.x+CARD_WIDTH,y1=a.y+CARD_HEIGHT/2,x2=b.x,y2=b.y+CARD_HEIGHT/2,mid=(x1+x2)/2;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',`M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`);
    path.setAttribute('class',`edge ${n.kind==='branch'?'branch':''} ${pathIds.has(n.id)&&pathIds.has(n.parentId)?'focused':''}`);svg.append(path);
  }
}
function highlight(el,text) {
  const query=$('#search').value.trim();el.replaceChildren();
  if(!query){el.textContent=text;return;}
  const lower=text.toLocaleLowerCase(),needle=query.toLocaleLowerCase();let cursor=0,index;
  while((index=lower.indexOf(needle,cursor))!==-1){el.append(document.createTextNode(text.slice(cursor,index)));const mark=document.createElement('mark');mark.textContent=text.slice(index,index+query.length);el.append(mark);cursor=index+query.length;}
  el.append(document.createTextNode(text.slice(cursor)));
}
function button(label,action,title) {const el=document.createElement('button');el.type='button';el.textContent=label;if(title)el.title=title;el.addEventListener('click',e=>{e.stopPropagation();action(e);});return el;}
function createCard(n) {
  const card=document.createElement('article');card.className=`note ${n.kind==='branch'?'branch':''}`;card.dataset.id=n.id;card.dataset.q=n.q||'';
  card.classList.toggle('selected',state.selected===n.id);card.classList.toggle('match',matches.includes(n.id));
  const head=document.createElement('header');head.className='note-top';
  const label=document.createElement('span');label.className='node-label';label.textContent=n.q?'Q'+n.q:'开场回答';
  const kind=document.createElement('span');kind.className='kind';const parent=nodes.find(p=>p.id===n.parentId);
  kind.textContent=n.kind==='branch'?`${n.source==='inferred'?'推断分支':'分支'} ← Q${parent?.q}`:n.kind==='note'?'补充内容':'主线';kind.title=n.reason;
  head.append(label,kind);card.append(head);
  const controls=document.createElement('div');controls.className='note-tools';
  if(n.q){const rel=button('调整关系',()=>editRelation(n));rel.setAttribute('aria-label',`调整 Q${n.q} 的关系`);controls.append(rel);}
  if(n.children.length)controls.append(button(state.collapsed[n.id]?'展开后续':'收起后续',()=>{state.collapsed[n.id]=!state.collapsed[n.id];save();rebuild();}));
  card.append(controls);
  if(n.q){const q=document.createElement('div');q.className='node-text question-text';q.dataset.section='question';highlight(q,n.text);card.append(q);}
  const al=document.createElement('div');al.className='answer-label';al.textContent=n.answers.length?`回答${n.answers.length>1?' · '+n.answers.length+' 段':''}`:'尚无回答';card.append(al);
  const answer=document.createElement('div');answer.className='node-text answer-text';answer.dataset.section='answer';highlight(answer,n.answers.map(a=>a.text).join('\n\n'));card.append(answer);
  if(n.q) {
    const draft=draftFor(n.id),form=document.createElement('form');form.className='composer';
    const quote=document.createElement('div');quote.className='quote';quote.hidden=!draft.quote;
    const quoteText=document.createElement('span');quoteText.textContent='引用：'+(draft.quote||'');quoteText.title=draft.quote||'';
    quote.append(quoteText,button('×',()=>{draft.quote='';save();quote.hidden=true;},'移除引用'));
    const input=document.createElement('textarea');input.placeholder='围绕这个问题继续追问…';input.setAttribute('aria-label',`Q${n.q} 的追问`);input.value=typeof draft.text==='string'?draft.text:'';
    input.addEventListener('input',()=>{draft.text=input.value;save();send.disabled=!bridgeReady||busy.has(n.id)||!input.value.trim();});
    const actions=document.createElement('div');actions.className='actions';
    const copy=button('复制追问',()=>{if(!input.value.trim()){input.focus();return;}copyText(followupText(n,draft));});
    const send=document.createElement('button');send.type='submit';send.className='primary';send.textContent=busy.has(n.id)?'发送中…':'发送追问';send.disabled=!bridgeReady||busy.has(n.id)||!input.value.trim();send.title=bridgeReady?'提交到当前 ChatGPT 对话':'等待连接；也可以复制追问';
    actions.append(copy,send);form.append(quote,input,actions);
    form.addEventListener('submit',e=>{e.preventDefault();sendFollowup(n,input,send);});form.addEventListener('click',e=>e.stopPropagation());card.append(form);
  }
  card.addEventListener('click',()=>selectNode(n.id));
  head.addEventListener('pointerdown',e=>{
    if(e.button!==0||view!=='tree')return;e.preventDefault();selectNode(n.id);
    dragging={id:n.id,x:e.clientX,y:e.clientY,left:geometry.points[n.id].x,top:geometry.points[n.id].y,scrollX:workspace.scrollLeft,scrollY:workspace.scrollTop};head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove',e=>{
    if(dragging?.id!==n.id)return;
    const p={x:Math.max(8,dragging.left+(e.clientX-dragging.x+workspace.scrollLeft-dragging.scrollX)/state.zoom),y:Math.max(8,dragging.top+(e.clientY-dragging.y+workspace.scrollTop-dragging.scrollY)/state.zoom)};
    geometry.points[n.id]=p;state.positions[n.id]=p;card.style.left=p.x+'px';card.style.top=p.y+'px';
    geometry.width=Math.max(geometry.width,p.x+CARD_WIDTH+40);geometry.height=Math.max(geometry.height,p.y+CARD_HEIGHT+32);resizeWorld();drawEdges();
  });
  const finish=()=>{if(dragging?.id===n.id){dragging=null;save();renderVisible();}};
  head.addEventListener('pointerup',finish);head.addEventListener('pointercancel',finish);head.addEventListener('lostpointercapture',finish);
  return card;
}
function selectNode(id){state.selected=id;for(const [key,card] of cards)card.classList.toggle('selected',key===id);drawEdges();}
function focusNode(id) {
  if(!id)return;
  for(const a of ancestors(nodes,id))delete state.collapsed[a];selectNode(id);rebuild();
  if(view==='list'){cards.get(id)?.scrollIntoView({block:'center'});return;}
  const p=geometry.points[id];if(!p)return;
  workspace.scrollLeft=Math.max(0,offsetX+(p.x+CARD_WIDTH/2)*state.zoom-workspace.clientWidth/2);workspace.scrollTop=Math.max(0,offsetY+(p.y+CARD_HEIGHT/2)*state.zoom-workspace.clientHeight/2);renderVisible();save();
}
function zoomTo(value) {
  const cx=(workspace.scrollLeft+workspace.clientWidth/2-offsetX)/state.zoom,cy=(workspace.scrollTop+workspace.clientHeight/2-offsetY)/state.zoom;
  state.zoom=Math.max(.1,Math.min(1.7,value));resizeWorld();workspace.scrollLeft=offsetX+cx*state.zoom-workspace.clientWidth/2;workspace.scrollTop=offsetY+cy*state.zoom-workspace.clientHeight/2;renderVisible();save();
}
function fit() {
  if(view!=='tree'||!visible.length)return;
  const points=Object.values(geometry.points),minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));
  const maxX=Math.max(...points.map(p=>p.x+CARD_WIDTH)),maxY=Math.max(...points.map(p=>p.y+CARD_HEIGHT));
  state.zoom=Math.max(.1,Math.min(1,(workspace.clientWidth-40)/(maxX-minX),(workspace.clientHeight-40)/(maxY-minY)));resizeWorld();
  workspace.scrollLeft=Math.max(0,offsetX+(minX+maxX)/2*state.zoom-workspace.clientWidth/2);workspace.scrollTop=Math.max(0,offsetY+(minY+maxY)/2*state.zoom-workspace.clientHeight/2);renderVisible();save();
}
let pan=null;
workspace.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.note')||view!=='tree')return;pan={x:e.clientX,y:e.clientY,left:workspace.scrollLeft,top:workspace.scrollTop};workspace.setPointerCapture(e.pointerId);e.preventDefault();});
workspace.addEventListener('pointermove',e=>{if(pan){workspace.scrollLeft=pan.left+pan.x-e.clientX;workspace.scrollTop=pan.top+pan.y-e.clientY;}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])workspace.addEventListener(event,()=>pan=null);
workspace.addEventListener('scroll',()=>{renderVisible();$('#quote-action').hidden=true;},{passive:true});
workspace.addEventListener('wheel',e=>{if((e.ctrlKey||e.metaKey)&&view==='tree'){e.preventDefault();zoomTo(state.zoom*Math.exp(-e.deltaY*.003));}},{passive:false});
new ResizeObserver(()=>{resizeWorld();renderVisible();}).observe(workspace);
$('#zoom').addEventListener('input',e=>zoomTo(Number(e.target.value)/100));$('#fit').onclick=fit;
$('#latest').onclick=()=>focusNode(nodes.at(-1)?.id);
$('#expand').onclick=()=>{state.collapsed={};save();rebuild();};
$('#arrange').onclick=()=>{state.positions={};save();rebuild();fit();};
$('#tree-view').onclick=()=>{view='tree';rebuild();focusNode(state.selected||visible[0]?.id);};
$('#list-view').onclick=()=>{view='list';rebuild();};
function nextMatch(delta){if(!matches.length)return;matchIndex=(matchIndex+delta+matches.length)%matches.length;const id=matches[matchIndex];focusNode(id);cards.get(id)?.querySelector('mark')?.scrollIntoView({block:'center',inline:'nearest'});}
$('#search').addEventListener('input',()=>{matchIndex=-1;rebuild();});
$('#search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nextMatch(e.shiftKey?-1:1);}});
$('#previous-match').onclick=()=>nextMatch(-1);$('#next-match').onclick=()=>nextMatch(1);
let relationNode=null;
function editRelation(n) {
  relationNode=n;$('#relation-description').textContent=`Q${n.q}：${n.reason}。`;
  $('#relation-kind').value=n.kind==='branch'?'branch':'main';const select=$('#relation-parent');select.replaceChildren();
  for(const prior of nodes.filter(p=>p.q&&p.q<n.q)){const option=document.createElement('option');option.value=prior.id;option.textContent=`Q${prior.q} · ${prior.text.slice(0,44)}`;select.append(option);}
  if(n.parentId)select.value=n.parentId;
  $('#relation-kind').querySelector('[value="branch"]').disabled=n.q===1;
  select.disabled=$('#relation-kind').value!=='branch';$('#relation-dialog').showModal();
}
$('#relation-kind').onchange=()=>$('#relation-parent').disabled=$('#relation-kind').value!=='branch';
$('#relation-cancel').onclick=()=>$('#relation-dialog').close();
function changeRelation(reset=false) {
  if(!relationNode)return;
  history.push(JSON.parse(JSON.stringify(state.overrides)));if(history.length>20)history.shift();
  if(reset)delete state.overrides[relationNode.id];
  else state.overrides[relationNode.id]={kind:$('#relation-kind').value,parentId:$('#relation-parent').value};
  state.positions={};save();$('#relation-dialog').close();rebuild();focusNode(relationNode.id);status('画布关系已更新，可撤销；原对话不受影响。');
}
$('#relation-save').onclick=()=>changeRelation();$('#relation-reset').onclick=()=>changeRelation(true);
$('#undo').onclick=()=>{if(history.length){state.overrides=history.pop();state.positions={};save();rebuild();status('已撤销上一次关系修改。');}};
function selectionAction() {
  const selection=window.getSelection();if(!selection?.rangeCount||!selection.toString().trim()){$('#quote-action').hidden=true;return;}
  const range=selection.getRangeAt(0),element=node=>node.nodeType===1?node:node.parentElement;
  const start=element(range.startContainer)?.closest('.node-text'),end=element(range.endContainer)?.closest('.node-text');
  if(!start||start!==end){$('#quote-action').hidden=true;return;}
  const card=start.closest('.note'),n=nodes.find(n=>n.id===card?.dataset.id);if(!n?.q)return;
  selectionCapture={id:n.id,text:selection.toString().trim()};const rect=range.getBoundingClientRect(),action=$('#quote-action');action.hidden=false;
  action.style.left=Math.max(6,Math.min(rect.left,window.innerWidth-action.offsetWidth-6))+'px';action.style.top=Math.max(6,Math.min(rect.top-action.offsetHeight-6,window.innerHeight-action.offsetHeight-6))+'px';
}
document.addEventListener('pointerup',()=>setTimeout(selectionAction,0));document.addEventListener('keyup',e=>{if(e.key==='Shift'||e.key.startsWith('Arrow'))selectionAction();});
$('#quote-action').addEventListener('pointerdown',e=>e.preventDefault());
$('#quote-action').onclick=()=>{if(!selectionCapture)return;const {id,text}=selectionCapture;draftFor(id).quote=text;save();$('#quote-action').hidden=true;window.getSelection()?.removeAllRanges();focusNode(id);cards.get(id)?.querySelector('textarea')?.focus();};
let exportValue='',exportName='',copyMode=false;
function setExport() {
  const format=$('#export-format').value;
  exportValue=format==='md'?exportMarkdown(data,nodes):JSON.stringify({schemaVersion:1,pluginVersion:VERSION,...data,relationships:nodes.filter(n=>n.q).map(n=>({id:n.id,q:n.q,parentId:n.parentId,kind:n.kind,source:n.source,reason:n.reason})),layout:state.positions},null,2);
  exportName='conversation-canvas.'+format;$('#export-content').value=exportValue;
}
function showCopy(text) {
  copyMode=true;exportValue=text;exportName='followup.txt';$('#export-title').textContent='复制追问';$('#export-description').textContent='可以选择并复制下方完整内容，粘贴到 ChatGPT。';$('#export-format').hidden=true;$('#export-content').value=text;$('#export-dialog').showModal();$('#export-content').select();
}
async function copyText(text) {
  try {await navigator.clipboard.writeText(text);status('内容已复制。');}catch{showCopy(text);}
}
$('#export').onclick=()=>{copyMode=false;$('#export-title').textContent='导出对话';$('#export-description').textContent='仅导出本次传入的内容与展示关系，不含未发送的追问。';$('#export-format').hidden=false;setExport();$('#export-dialog').showModal();};
$('#export-format').onchange=setExport;$('#export-close').onclick=()=>$('#export-dialog').close();
$('#export-copy').onclick=async()=>{try{await navigator.clipboard.writeText(exportValue);status('内容已复制。');}catch{$('#export-content').focus();$('#export-content').select();status('请选择并复制弹窗中的内容。');}};
$('#export-download').onclick=()=>{const blob=new Blob([exportValue],{type:copyMode?'text/plain;charset=utf-8':$('#export-format').value==='json'?'application/json;charset=utf-8':'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=exportName;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('已请求下载；若宿主拦截下载，可使用“复制内容”。');};
function rpc(method,params,timeout=12000) {
  return new Promise((resolve,reject)=>{const id=++requestId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('没有收到确认'));},timeout);pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');});
}
async function sendFollowup(n,input,send) {
  const draft=draftFor(n.id);if(!draft.text?.trim()||busy.has(n.id)||!bridgeReady)return;
  busy.add(n.id);send.disabled=true;send.textContent='发送中…';const sentText=draft.text,sentQuote=draft.quote;
  try {
    const result=await rpc('ui/message',{role:'user',content:[{type:'text',text:followupText(n,draft)}]});
    if(result?.isError)throw new Error('宿主未接受消息');
    if(draft.text===sentText&&draft.quote===sentQuote){draft.text='';draft.quote='';input.value='';}
    save();status(`Q${n.q} 的追问已交给 ChatGPT。回答后再次调用插件更新画布。`);
  } catch {status('未收到发送确认，输入已保留。请先检查聊天是否已发送；也可复制追问。');}
  finally{busy.delete(n.id);send.textContent='发送追问';send.disabled=!draft.text?.trim();const card=cards.get(n.id);if(card){const quote=card.querySelector('.quote');if(quote)quote.hidden=!draft.quote;}}
}
window.addEventListener('message',event=>{
  if(event.source!==window.parent)return;const m=event.data;if(!m||m.jsonrpc!=='2.0')return;
  if(pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);return;}
  if(m.method==='ui/notifications/tool-result')receive(m.params);
  if(m.method==='ui/notifications/tool-input')receive(m.params?.arguments);
});
window.addEventListener('beforeunload',save);
rebuild();
try {
  await rpc('ui/initialize',{appInfo:{name:'conversation-canvas',version:VERSION},appCapabilities:{},protocolVersion:'2025-11-25'});
  bridgeReady=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');
  receive(window.openai?.toolOutput || window.openai?.toolResponse);rebuild();
} catch {status('未连接聊天宿主，仍可浏览、导出和复制追问。');}
