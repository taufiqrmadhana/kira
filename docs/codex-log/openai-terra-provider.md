# OpenAI GPT-6.1 Terra integration

- Time: 2026-11-07, 15:07 WIB.
- Task: Configure KIRA chat and optional workflow AI for the explicitly requested OpenAI GPT-6.1 Terra model, ready for a key to be added later.
- Merged: no. No commits, pushes, or git operations performed; root owns integration.

Used OpenAI Docs guidance and fetched the [official GPT-6.1 Terra model page](https://developers.openai.com/api/docs/models/gpt-6.1-terra). It identifies the exact model as `gpt-6.1-terra`, requires Responses for tool calling, and supports reasoning effort `none`. Inspected the installed ADK and LiteLLM source before implementation; the existing LiteLLM version supports explicit `openai/responses/<model>` routing. No dependency upgrade was needed.

Added `kira/llm.py` as shared provider configuration. `KIRA_MODEL` now defaults to `openai/gpt-6.1-terra`, with the OpenAI key selected only for OpenAI. The internal LiteLLM Responses prefix is removed before the real API request, which uses `/v1/responses` and the exact requested model ID. Requests use `store=false` and no temperature, top-p, or logprobs settings. Terra uses supported reasoning effort `none`: the current ADK chat-shaped persisted history does not retain encrypted Responses reasoning items, so enabling reasoning would require additional history support. No model is substituted.

A small ADK LiteLLM client wrapper explicitly retains non-strict function schemas so optional/default arguments and open-ended mapping fields keep their existing meaning. This follows the [OpenAI function-calling schema guidance](https://developers.openai.com/api/docs/guides/function-calling). Tool execution, validation, approvals, conversation persistence, and client/user isolation remain in ADK. Provider response IDs are not shared or used for conversation state.

Chat checks the selected key before model execution and gives a clear missing-key message. Optional header/column proposals, cleaning suggestions, bank classification, and follow-up rewrites use the same selected provider and preserve deterministic fallbacks. `KIRA_AI=off` continues to disable optional suggestions. DeepSeek remains supported with its existing model ID and key; keys never substitute across providers. Added the settings OpenAI key to nested-response redaction and excluded both provider keys from settings representations.

Updated `backend/.env.example` and docs 03/04. The user needs these values in their local `backend/.env`, then a backend restart:

```dotenv
OPENAI_API_KEY=
KIRA_MODEL=openai/gpt-6.1-terra
KIRA_AI=on
```

Tests were written first. The initial focused run had seven expected missing-feature failures. Nine new tests now cover actual mocked HTTP requests to the Responses path, exact model/parameters and JSON format, provider-specific credential readiness, settings-key redaction, DeepSeek transport preservation, optional fallback behavior, follow-up rewrites, and real ADK approval/rejection through persisted chat sessions with exactly-once changes. Existing DeepSeek-specific tests now select DeepSeek explicitly instead of relying on the former default.

Final validation:

```text
.venv/Scripts/python.exe -m pytest -q --basetemp .venv/terra-provider-full-20261107 -p no:cacheprovider
214 passed, 19 skipped, 3 dependency warnings in 55.39s
```

Ruff lint and format checks passed for all eleven changed Python files. No paid API calls were made, the real `.env` was not edited, and no servers were restarted by this task. Account access, billing, and availability of this model for the user's future key remain unverified until an authorized live request.
