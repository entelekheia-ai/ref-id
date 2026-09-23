---
vibe-ops-template: adr@2
---

<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0005: The `ai-model` locator opens on the provider

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-09-23 |
| Deciders | Danilo Borges |

---

## Context

`ai-model` was registered with one locator: the id a model is served under, verbatim —
`ref:ai-model:claude-opus-5`, `ref:ai-model:llama3:8b`. That string names what a caller sends to a serving
process, and nothing about which process. Three things a consumer needs to tell apart therefore mint the
same identifier:

- **one model through two channels** — the same served id called on its publisher's own API and through a
  cloud reseller's endpoint;
- **two unrelated models under one name** — nothing obliges a served id to carry a publisher namespace, so
  a short name is claimable by anyone who serves a model;
- **a local runtime and a hosted API** — the difference shows only by accident of spelling (an Ollama
  `:tag`, a hub-style `/`), never as a declared part.

The research that registered the type had already found the missing axis and not carried it forward:
OpenTelemetry's GenAI conventions keep the model name (`gen_ai.request.model`, free text) and the provider
(`gen_ai.provider.name`, a list of well-known values: `anthropic`, `aws.bedrock`, `azure.ai.inference`,
`azure.ai.openai`, `gcp.vertex_ai`, `openai`, …) as **two separate attributes**. Their own rule is that a
well-known value MUST be used when one applies and a custom value MAY be used otherwise. `gen_ai.system`,
the attribute the original research read, has since been deprecated in favour of `gen_ai.provider.name`.

The scheme already solves the same shape once: an `email` locator is the addr-spec as its first segment
and nothing else, with each item served under that mailbox as the following segments, and `#` left free to
cut inside the item.

## Decision

We will make the first segment of an `ai-model` locator **the provider serving the model**, and every
following segment **the id the model is served under, verbatim**:

```text
ref:ai-model:anthropic/claude-opus-5-5
ref:ai-model:azure.ai.inference/claude-opus-5-5
ref:ai-model:omlx/mlx-community/Qwen3-1.7B-4bit
ref:ai-model:ollama/llama3:8b
ref:ai-model:anthropic/claude-opus-5-5;effort=low
```

- The provider is an OpenTelemetry `gen_ai.provider.name` well-known value where one applies, and the name
  of the serving runtime otherwise (`omlx`, `ollama`, `lm-studio`). Its segment admits lowercase letters,
  digits, `.`, `_` and `-` — every well-known value fits, and no served id's `:` tag or `@` key can open
  the locator.
- The served id keeps the grammar it had: every segment opens on an alphanumeric and admits `.`, `_`, `:`,
  `@` and `-`.
- A locator of one segment names the provider alone, so `ref:ai-model:omlx` covers every model served by
  that runtime.
- The machine a local runtime runs on is not part of the identity. It travels as a qualifier (for example
  `;endpoint=`), which the scheme carries through without a registry entry.

## Options considered

- **Option A — keep the served id alone, move the provider to a qualifier (`;provider=`)** — no identifier
  already written changes meaning / identity ignores qualifiers only by convention, so two channels still
  compare as one thing wherever a consumer drops the qualifier, and `covers` cannot select a provider.
  Rejected: the provider is part of *which* model answered, not a condition of the call.
- **Option B — provider as the locator, served id as the fragment (`anthropic#claude-opus-5-5`)** — parses
  today and `covers` selects a provider / the fragment is the one part no type validates, so
  `omlx#../../etc` is admitted and the traversal guard the served-id pattern gives a weights cache is lost;
  and `#` is then spent on the model, leaving no way to cut inside one. Rejected for the guard.
- **Option C — a type per provider (`ref:anthropic:…`, `ref:ollama:…`)** — each authority owns its token /
  fails the type-admissibility test: a vendor's name is exactly the contested token a type must not be,
  and a consumer would need one registry entry per provider it meets. Rejected.
- **Option D (chosen) — provider as the first locator segment, served id after it** — mirrors `email`,
  keeps the served-id pattern (and its traversal guard) on every segment after the first, leaves `#` free,
  and `covers` selects a provider with no new operation / changes what an identifier already written
  means, accepted below.

## Consequences

- **An identifier written under the old grammar changes meaning without failing.** `ref:ai-model:claude-opus-5`
  still parses `ok`, now as the provider `claude-opus-5` alone. The lowercase first segment catches part of
  the old population loudly — an uppercase served id (`Qwen3-4B-Instruct-2507-4bit`) and an Ollama tag
  (`llama3:8b`) are now `malformed` — but a lowercase one without a colon is indistinguishable from a
  provider. A consumer that stored identifiers of this type MUST rewrite them to `<provider>/<served id>`;
  no parser can do it for them, because the provider was never recorded.
- **The package changes no code.** The locator pattern and the dispatch text are data; the three
  implementations read them from the specification, so the change is a minor release of the specification
  and its vectors.
- **"The same model on any provider" is a query on the locator's tail, not an operation.** Neither
  `samePackage` nor `covers` expresses it; a store that needs it compares the segments after the first.
- **The provider list is not copied into the specification.** OpenTelemetry owns it and marks it
  `development`; the specification names the source and the fallback rule, and a value it does not list is
  admitted by the pattern like any runtime name.

## Related

- ADR-0001 — the specification is one data file the package consumes, which is why no code changes here.
- OpenTelemetry GenAI attribute registry, `gen_ai.provider.name`:
  <https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/>
