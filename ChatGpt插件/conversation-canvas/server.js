import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeConversation, VERSION } from "./core.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, "app.html"), "utf8");
const resourceUri = `ui://conversation-canvas/map-${VERSION}.html`;
const inputSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Optional title for this conversation." },
    conversationId: { type: "string", description: "Stable conversation ID when known. Reuse on refresh; do not invent a new ID for each render." },
    messages: {
      type: "array",
      description: "Visible conversation turns in chronological order. Include user questions and assistant answers.",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["user", "assistant"] },
          text: { type: "string" },
          id: { type: "string", description: "Stable source message ID, when known." },
          relationship: { type: "string", enum: ["main", "branch"], description: "Explicitly mark a main continuation or a side branch when the relation is clear. For branches provide parentQuestion. This is a display relationship, not a native ChatGPT fork." },
          parentQuestion: { type: "integer", minimum: 1, description: "For a follow-up branch, the displayed Q number of the source question." }
        },
        required: ["role", "text"]
      }
    }
  },
  required: ["messages"]
};

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function response(id, result) {
  write({ jsonrpc: "2.0", id, result });
}

function error(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(message) {
  if (!message || typeof message !== "object") return;
  const { id, method, params = {} } = message;
  if (!method) return;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "initialize") {
    response(id, {
      protocolVersion: params.protocolVersion || "2025-11-25",
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      serverInfo: { name: "conversation-canvas", title: "对话便笺画布", version: VERSION }
    });
    return;
  }
  if (method === "ping") { response(id, {}); return; }
  if (method === "tools/list") {
    response(id, { tools: [{
      name: "show_conversation_map",
      title: "显示对话便笺画布",
      description: "Display the visible conversation as a horizontal tree of combined Q/A cards. Preserve full user and assistant text in chronological order; never fabricate or merge source turns. Mark clear main continuations with relationship=main; use parentQuestion for clear side branches. The map cannot read unseen chat history or create native forks.",
      inputSchema,
      _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
      annotations: { readOnlyHint: true, openWorldHint: false }
    }] });
    return;
  }
  if (method === "resources/list") {
    response(id, { resources: [{ uri: resourceUri, name: "Conversation Canvas", mimeType: "text/html;profile=mcp-app" }] });
    return;
  }
  if (method === "resources/read") {
    if (params.uri !== resourceUri) { error(id, -32002, "Resource not found"); return; }
    response(id, { contents: [{ uri: resourceUri, mimeType: "text/html;profile=mcp-app", text: html }] });
    return;
  }
  if (method === "tools/call") {
    if (params.name !== "show_conversation_map") { error(id, -32602, "Unknown tool"); return; }
    let data;
    try { data = normalizeConversation(params.arguments); }
    catch (err) { error(id, -32602, err.message); return; }
    response(id, {
      content: [{ type: "text", text: `已整理 ${data.messages.length} 条对话消息。` }],
      structuredContent: data
    });
    return;
  }
  if (typeof id === "number" || typeof id === "string") error(id, -32601, `Method not found: ${method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const end = buffer.indexOf("\n");
    if (end < 0) break;
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); }
    catch (err) { process.stderr.write(`Conversation Canvas MCP error: ${err?.stack || err}\n`); }
  }
});
