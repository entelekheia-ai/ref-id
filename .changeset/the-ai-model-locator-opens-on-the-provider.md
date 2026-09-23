---
"@entelekheia/ref-id": minor
---

An `ai-model` locator opens on the provider serving the model, then carries the id it is served under:
`ref:ai-model:anthropic/claude-opus-5-5`, `ref:ai-model:azure.ai.inference/claude-opus-5-5`,
`ref:ai-model:ollama/llama3:8b`. One served id through two providers is now two models, and a locator of
one segment — `ref:ai-model:omlx` — names the provider alone and covers every model it serves. The provider
is an OpenTelemetry `gen_ai.provider.name` well-known value where one applies, and the name of the runtime
that executes the model otherwise — a server or a library linked in-process (`mlx`, `llama.cpp`); its
segment is lowercase and admits no `:` or `@`. With no server, the served id is the name the weights'
source declares (`ref:ai-model:llama.cpp/<org>/<repo>/<file>.gguf`), never a filesystem path.

**An identifier written under the previous grammar changes meaning.** An uppercase served id or an Ollama
tag (`ref:ai-model:llama3:8b`) is now `malformed`; a lowercase served id without a colon
(`ref:ai-model:claude-opus-5`) still parses, as a provider. A store holding identifiers of this type must
rewrite them to `<provider>/<served id>` — the provider was never recorded, so no parser can supply it.
No code changed: the three implementations read the pattern from the specification.
