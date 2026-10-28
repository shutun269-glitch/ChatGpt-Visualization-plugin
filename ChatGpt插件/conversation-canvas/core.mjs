// Pure data and layout functions; also bundled into app.html for the isolated host iframe.
export const VERSION = '0.5.0';
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 408;

export function fingerprint(value) {
  let a = 2166136261, b = 5381;
  for (const ch of String(value)) { const c = ch.codePointAt(0); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
  return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
}
export function normalizeConversation(args = {}) {
  if (!Array.isArray(args.messages)) throw new Error('messages 必须是消息数组');
  const messages = args.messages.map((m, index) => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string') throw new Error(`第 ${index + 1} 条消息格式无效`);
    return { role: m.role, text: m.text,
      ...(typeof m.id === 'string' && m.id ? { id: m.id } : {}),
      ...(Number.isInteger(m.parentQuestion) && m.parentQuestion > 0 ? { parentQuestion: m.parentQuestion } : {}),
      ...(['main', 'branch'].includes(m.relationship) ? { relationship: m.relationship } : {}) };
  });
  return { title: typeof args.title === 'string' ? args.title : '当前对话',
    ...(typeof args.conversationId === 'string' && args.conversationId ? { conversationId: args.conversationId } : {}), messages };
}
export function conversationKey(data) {
  return 'conversation-canvas:v5:' + fingerprint(data.conversationId || `${data.title}\n${data.messages.find(m => m.role === 'user')?.text || data.messages[0]?.text || ''}`);
}
export function buildNodes(messages) {
  const nodes = [], occurrences = new Map(); let active = null, q = 0;
  const key = m => {
    const base = m.id ? 'id:' + m.id : `${m.role}:${fingerprint(m.text)}`;
    const count = (occurrences.get(base) || 0) + 1; occurrences.set(base, count);
    return base + ':' + count;
  };
  for (const [index, m] of messages.entries()) {
    if (m.role === 'user') {
      active = { id: key(m), q: ++q, text: m.text, answers: [], sourceIndex: index, parentQuestion: m.parentQuestion, relationship: m.relationship };
      nodes.push(active);
    } else if (active) active.answers.push({ text: m.text, sourceIndex: index });
    else nodes.push({ id: key(m), q: null, text: '', answers: [{ text: m.text, sourceIndex: index }], sourceIndex: index });
  }
  return nodes;
}
function tokens(text) {
  const stop = new Set(['这个','什么','如何','可以','问题','请问','一下','我们','需要','然后','what','this','that','please','with']);
  try { return new Set([...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text.toLowerCase())].filter(x => x.isWordLike && x.segment.length > 1 && !stop.has(x.segment)).map(x => x.segment)); }
  catch { return new Set(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []); }
}
function similarity(a, b) {
  const aa = tokens(a), bb = tokens(b); let matches = 0;
  for (const token of aa) if (bb.has(token)) matches++;
  return matches / Math.max(1, new Set([...aa, ...bb]).size);
}
export function resolveLinks(input, overrides = {}) {
  const nodes = input.map(n => ({ ...n, children: [], parentId: null, kind: n.q ? 'main' : 'note', source: 'sequence', reason: '按对话顺序连接' }));
  const byId = new Map(nodes.map(n => [n.id, n])), byQ = new Map(nodes.filter(n => n.q).map(n => [n.q, n]));
  let lastMain = null;
  for (const n of nodes) {
    if (!n.q) continue;
    const valid = p => p && p.q && p.q < n.q;
    const correction = Object.hasOwn(overrides, n.id) ? overrides[n.id] : null;
    const explicit = byQ.get(n.parentQuestion);
    const reference = n.text.match(/(?:基于当前对话中的|继续讨论|追问|针对)\s*Q\s*(\d+)/i);
    const referenced = reference && byQ.get(Number(reference[1]));
    let parent = null;
    if (correction?.kind === 'main') { n.source = 'manual'; n.reason = '已手动设为主线'; }
    else if (correction?.kind === 'branch' && valid(byId.get(correction.parentId))) { parent = byId.get(correction.parentId); n.source = 'manual'; n.reason = '已手动指定来源'; }
    else if (n.relationship === 'main') { n.source = 'provided'; n.reason = '传入的主线标记'; }
    else if (valid(explicit)) { parent = explicit; n.source = 'provided'; n.reason = '传入的分支标记'; }
    else if (valid(referenced)) { parent = referenced; n.source = 'reference'; n.reason = '追问中明确引用了问题编号'; }
    else if (/^(关于刚才|针对刚才|上述|前面提到|这段|其中|展开说|细说|再解释|继续解释)/.test(n.text.trim())) {
      let best = null, score = 0;
      for (const earlier of nodes) { if (!valid(earlier)) continue; const s = similarity(n.text, earlier.text); if (s >= score && s > 0) { best = earlier; score = s; } }
      // Similar words alone are insufficient evidence of a real branch.
      if (best && score >= 0.22) { parent = best; n.source = 'inferred'; n.reason = '根据追问措辞与内容关联推断，可修改'; }
    }
    if (parent) { n.kind = 'branch'; n.parentId = parent.id; }
    else { n.parentId = lastMain?.id || null; lastMain = n; }
  }
  for (const n of nodes) if (n.parentId) byId.get(n.parentId).children.push(n.id);
  for (const n of nodes) n.children.sort((a,b)=>(byId.get(a).kind==='main'?0:1)-(byId.get(b).kind==='main'?0:1));
  return nodes;
}
export function visibleTree(nodes, collapsed = {}) {
  const hidden = new Set(), byId = new Map(nodes.map(n => [n.id, n]));
  const hide = id => { if (hidden.has(id)) return; hidden.add(id); for (const child of byId.get(id)?.children || []) hide(child); };
  for (const n of nodes) if (collapsed[n.id]) for (const child of n.children) hide(child);
  return nodes.filter(n => !hidden.has(n.id));
}
export function ancestors(nodes, id) {
  const byId = new Map(nodes.map(n => [n.id, n])), result = []; let current = byId.get(id);
  while (current?.parentId && result.length < nodes.length) { result.push(current.parentId); current = byId.get(current.parentId); }
  return result;
}
export function layoutTree(nodes, positions = {}) {
  const visibleIds = new Set(nodes.map(n => n.id)); const byId = new Map(nodes.map(n => [n.id, n]));
  const spanCache = new Map(), points = {};
  const children = n => n.children.filter(id => visibleIds.has(id));
  function span(n) { if (!spanCache.has(n.id)) spanCache.set(n.id, Math.max(1, children(n).reduce((sum,id) => sum + span(byId.get(id)), 0))); return spanCache.get(n.id); }
  function place(n, depth, row) {
    // Keep the main continuation on one horizontal row; branch lanes are placed below it.
    points[n.id] = { x: 40 + depth * (CARD_WIDTH + 100), y: 32 + row * (CARD_HEIGHT + 44) };
    let next = row;
    for (const id of children(n)) { const child = byId.get(id); place(child, depth + 1, next); next += span(child); }
  }
  let row = 0;
  for (const root of nodes.filter(n => !n.parentId || !visibleIds.has(n.parentId))) { place(root,0,row); row += span(root) + 0.4; }
  for (const n of nodes) { const p = positions[n.id]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < 1e7 && p.y < 1e7) points[n.id] = {x:p.x,y:p.y}; }
  return { points, width: Math.max(500, ...Object.values(points).map(p => p.x + CARD_WIDTH + 40)), height: Math.max(450, ...Object.values(points).map(p => p.y + CARD_HEIGHT + 32)) };
}
export function searchNodes(nodes, query) {
  const needle = query.trim().toLocaleLowerCase(); if (!needle) return [];
  return nodes.filter(n => `${n.q ? 'Q' + n.q : ''}\n${n.text}\n${n.answers.map(a=>a.text).join('\n')}`.toLocaleLowerCase().includes(needle)).map(n=>n.id);
}
export function followupText(node, draft) {
  return `请基于当前对话中的 Q${node.q} 继续回答。\n原问题：${node.text}${draft.quote ? '\n选中的原文：' + draft.quote : ''}\n我的追问：${draft.text}`;
}
export function exportMarkdown(data, nodes) {
  const byId = new Map(nodes.map(n => [n.id,n]));
  const parts = [`# ${data.title}`, '', '> 本文件仅含本次传入画布的内容；主线/分支为画布展示关系，不代表新建原生会话。', ''];
  for (const n of nodes) {
    parts.push(`## ${n.q ? 'Q' + n.q : '开场回答'}${n.kind === 'branch' ? ' · 分支自 Q' + byId.get(n.parentId)?.q : ''}`, '', `关系来源：${n.reason}`, '');
    if (n.q) parts.push(n.text, '');
    for (const [i,a] of n.answers.entries()) parts.push(`### 回答 ${i+1}`, '', a.text, '');
  }
  return parts.join('\n');
}
