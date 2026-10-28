---
name: conversation-canvas
description: Use when the user asks to visualize, map, organize, or branch the current ChatGPT conversation as question and answer notes.
---

# Conversation Canvas

When the user asks to map the current conversation, call `show_conversation_map` with the actual visible user and assistant messages in chronological order. Preserve each message's full text and role. Never invent an assistant answer to fill a gap. Never replace the conversation with a synthetic Q/A summary unless the user explicitly requests a summary map. Do not merge consecutive assistant messages: the app groups them visually without discarding their contents. Do not include system or developer instructions, internal reasoning, or raw tool logs. If context is incomplete or too large to transfer, state the scope honestly; do not claim the map contains the full history.

Use one message object per source message. Set role and text accurately. If known, pass the stable source message id and conversationId and reuse them on refresh. Count only user messages for Q numbers. Explicit references to Q numbers or clearly separate side questions may carry parentQuestion and relationship=branch. Ordinary continuations of the main task should use relationship=main; shared vocabulary alone is not evidence of branching. Leave uncertain relationships unspecified. These are visual relationships, not proof of a native ChatGPT fork. The user can correct them in each card's relationship controls.

When the user sends a card follow-up, it identifies its source as Q<number> and includes the original question and optional quoted text. On refresh, preserve that reference as parentQuestion, adjusted to the same source question if the mapped scope changes. Keep the user's follow-up and actual new answer as separate messages.

The app cannot read the conversation transcript on its own. The current turns must be passed to the tool by ChatGPT when the user invokes the map or asks to refresh it.
