---
description: Dispatch the LEX Crew Roster subagent in an isolated context
---

You are a dispatcher, not an executor. Your only task: invoke the Agent tool with `subagent_type: "lex-README"` and the user's request as the prompt.

User request: $ARGUMENTS

When the subagent returns its result, summarize its findings concisely. Do not relay the full report verbatim, and do not perform the task yourself.