# Conversation Design

Status: Ordered implementation plan; start with the foundation contract-closure work
Date: 2026-03-16
Audience: Product and engineering

## Purpose

Define a first-class conversation system for Paperclip and the ordered implementation work needed to land it cleanly, including the foundation contract-closure work that should be implemented first so the later feature steps rest on stable runtime and shared contracts.

This document is intentionally clean and implementation-oriented.

- Do not build conversations as hidden issues.
- Do not depend on plugins for core conversation behavior.
- Do not preserve raw-text mention fallbacks for conversations.
- Do not share one adapter session across conversations and issue/goal/project work.
- Do not add conversation data to company portability/export-import in this rollout.

Current use of this document:

- start with the foundation workstreams below and implement them first
- then continue through the later conversation schema/runtime/API/UI steps in order
- the governing docs are aligned on direction, but the current repo still has older heartbeat, live-delivery, task-key, and route-mount behavior in code, and the foundation workstreams below are the instructions for closing that implementation drift before building on top of it

## Implementation Foundations

The core governing docs this rollout depends on are aligned on the intended direction: first-class conversations, participant-scoped conversation visibility for agents, coarse multi-user board access, `conversation_message` as a heartbeat source, and published conversation surfaces. The implementation baseline is not yet fully aligned with that contract, so the foundation work below closes the remaining runtime/shared/server/ui drift. Where the repo still has multiple route notations, this plan makes the implementation route model explicit below.

This is no longer a "rewrite the product/spec docs" problem. The work here is implementation foundation work: eliminate leftover spec/runtime/shared/UI drift, finish legacy alias cleanup, and keep superseded conversation directions explicitly closed out so the later implementation steps can build on one consistent contract.

To keep the implementation directly followable and consistent with `AGENTS.md`, this foundation bundle comes first in the rollout order.
The implementation order is: land the foundation work below first, then continue into the later conversation schema/runtime/API/UI stages.

### Governing-doc baseline aligned

The documents below provide the governing baseline this plan relies on.
That baseline alignment does not mean the current runtime/shared/server/ui implementation is already aligned; the foundation work in this plan is what brings the repo up to that contract.
If the conversation design changes, these docs must be kept in sync before implementation proceeds.

`doc/SPEC-implementation.md` now explicitly allows first-class conversations:

- communication is no longer defined as tasks/comments only
- authenticated deployments may support coarse multi-user board access
- bounded lightweight conversation work is allowed without redefining the whole system as untracked chat
- the spec publishes the canonical `heartbeat_runs.invocation_source = timer | assignment | on_demand | automation | conversation_message`
- conversations are part of the concrete scope, runtime, and API model where relevant
- the concrete V1 data model publishes the conversation tables and the `cost_events.conversation_id` dimension this rollout depends on
- the concrete V1 data model also publishes the persisted `agent_wakeup_requests` conversation fields this rollout depends on: `conversation_id`, `conversation_message_id`, `conversation_message_sequence`, and `response_mode`
- the concrete V1 REST section publishes conversation CRUD, participant, message, read-state, target-link, and linked-conversation routes, plus the base conversation list/detail/message retrieval contract and embedded `costSummary` shape this rollout depends on
- the concrete V1 UI section publishes the company-prefixed board route contract, including conversation pages under `/:companyPrefix/conversations`
- company-rooted conversations may exist before any issue, goal, or project link exists
- lightweight direct conversation work is a bounded exception for small work
- substantial, durable, or org-visible work still flows into tracked issue/goal/project objects
- conversations remain a control-plane feature, not a consumer chat product
- conversations are participant-scoped for agents rather than inheriting full same-company visibility
- V1 company portability remains limited to company metadata and agents; first-class conversations and conversation-derived operational state are intentionally out of scope for export/import in this rollout
- the human-auth contract matches the live auth schema by documenting `users.id` and user-attribution columns as plain `text`
- new conversation user-attribution columns follow the same live plain-text, non-FK pattern as existing issue/comment/approval attribution, so they remain compatible with auth-derived board actor ids such as `local-board`
- per-user board attribution and read-state behavior keyed by board actor `userId` text is allowed, while fine-grained human RBAC remains out of scope for V1

`doc/PRODUCT.md` now positions the feature correctly:

- richer chat for this feature area is no longer framed as plugin-only
- Paperclip now has a first-class conversation system
- company-rooted conversations and lightweight direct conversation work are allowed without pretending all work immediately traces to a goal
- CEO and strategy conversations may start company-rooted and later resolve to issues, goals, or projects
- lightweight direct conversation work is a bounded exception for small tasks
- durable organizational work still traces back into goals through the normal issue/project/goal model
- Paperclip is still not a generic consumer chatbot

`doc/SPEC.md` now reflects the long-horizon product model this rollout relies on:

- the V1 board-governance section no longer says "Single human Board. One human operator."
- the inter-agent communication section distinguishes work objects from conversation objects
- conversation-to-target linking is described as part of the control plane
- company-rooted exploratory conversations and bounded lightweight direct conversation work can exist before tracked work objects are created
- conversations are no longer covered by the older "all agents can see everything" assumption

Older conflicting plan docs are now part of the baseline supersession story:

- `doc/plans/2026-02-20-issue-run-orchestration-plan.md`
- `doc/plans/2026-03-11-agent-chat-ui-and-issue-backed-conversations.md`
- `doc/plans/2026-03-13-features.md`

Those plan docs must remain in one of these states:

- be updated to point at this document as the active direction, or
- be marked superseded where they recommend issue-backed or command-composer-only conversation designs

For `doc/plans/2026-02-20-issue-run-orchestration-plan.md`, only the true issue-run orchestration rules survive:

- issue execution locking/coalescing still applies to canonical issue-scoped runs with `taskKey = issue:<issueId>`
- it must not be read as "any wake carrying issue context enters issue execution locking/coalescing"
- conversation-scoped runs that carry issue target context remain governed by this document's conversation-run boundary rules instead

The primary runtime/spec docs that this rollout depends on are aligned on the main feature direction. For board routing, `doc/spec/ui.md` already publishes the intended company-prefixed conversation URLs, while `ui/src/App.tsx` is the current router implementation surface that later steps must bring into sync with that published target:

- `doc/spec/ui.md`
- `doc/spec/agents-runtime.md`
- `doc/spec/agent-runs.md`

Board route model for this rollout:

- treat `doc/spec/ui.md` as the published target route contract for conversation pages
- treat `ui/src/App.tsx` as the current implementation surface that must be updated to match that published contract as the route work lands
- do not regress the published `/:companyPrefix/conversations` route contract to match pre-conversation router state
- conversation pages must mount under the existing `/:companyPrefix/...` board route tree
- inside that prefixed board tree, do not add new absolute `/conversations...` navigates or redirects; use company-relative routing so navigation stays anchored under the current `:companyPrefix`
- the canonical board URLs for this rollout are:
  - `/:companyPrefix/conversations`
  - `/:companyPrefix/conversations/:conversationId`
- if unprefixed `/conversations` forms remain anywhere during transition, treat them only as top-level redirect or documentation shims, not as the primary routing contract implementers should build against

Early prerequisite for structured mentions:

- before implementing structured `goal://` or `project://` mention picking, add `q` support through the full goal/project route-service-client chain
- use the existing company-scoped list endpoints; do not add separate `/search` endpoints for this rollout:
  - `GET /api/companies/:companyId/goals?q=...&limit=...`
  - `GET /api/companies/:companyId/projects?q=...&limit=...`
- preserve the existing response shapes:
  - goal search returns `Goal[]`
  - project search returns `Project[]`
- query behavior must be explicit:
  - `q` is optional, trimmed, and company-scoped
  - when `q` is absent, preserve current full-list behavior
  - when `q` is present, apply deterministic search ordering and then limit the result set
  - `limit` is optional, defaults to `20`, and caps at `20`
- search matching must be explicit:
  - goals match case-insensitively on `title`
  - projects match case-insensitively on `name` and `urlKey`
- search ordering when `q` is present must be:
  - case-insensitive prefix matches first
  - then remaining case-insensitive substring matches
  - ties sorted alphabetically by `title` for goals and `name` for projects
- shared contract updates for this prerequisite are required too:
  - add `listGoalsQuerySchema` in `packages/shared/src/validators/goal.ts`
  - add `listProjectsQuerySchema` in `packages/shared/src/validators/project.ts`
  - update `packages/shared/src/api.ts` with the shared company-scoped goal/project list path helpers/constants used by the composer chain
  - update `ui/src/api/goals.ts` and `ui/src/api/projects.ts` so `list(...)` accepts optional `{ q, limit }`
- required early files for that dependency are:
  - `packages/shared/src/api.ts`
  - `packages/shared/src/validators/goal.ts`
  - `packages/shared/src/validators/project.ts`
  - `server/src/routes/goals.ts`
  - `server/src/services/goals.ts`
  - `ui/src/api/goals.ts`
  - `server/src/routes/projects.ts`
  - `server/src/services/projects.ts`
  - `ui/src/api/projects.ts`
- treat that search-chain work as an explicit prerequisite for the structured mention UI, not as follow-up polish after the mention picker exists

### Foundation contract-closure scope

The foundation work here closes the repo-wide contract and rollout surfaces that still need explicit cutover before conversation features are layered on top:

- `packages/shared/src/constants.ts`
- `packages/shared/src/types/heartbeat.ts`
- `packages/shared/src/validators/agent.ts`
- `server/src/services/heartbeat.ts`
- `server/src/adapters/registry.ts`
- `ui/src/adapters/registry.ts`
- `ui/src/components/AgentConfigForm.tsx`
- `ui/src/components/OnboardingWizard.tsx`
- `ui/src/pages/NewAgent.tsx`
- `ui/src/components/NewAgentDialog.tsx`
- `ui/src/pages/InviteLanding.tsx`
- `server/src/adapters/process/execute.ts`
- `server/src/adapters/http/execute.ts`
- `packages/adapters/claude-local/src/server/execute.ts`
- `packages/adapters/codex-local/src/server/execute.ts`
- `packages/adapters/cursor-local/src/server/execute.ts`
- `packages/adapters/gemini-local/src/server/execute.ts`
- `packages/adapters/opencode-local/src/server/execute.ts`
- `packages/adapters/pi-local/src/server/execute.ts`
- `packages/adapters/openclaw-gateway/src/server/execute.ts`

### Foundation implementation work

Proceed with the foundation workstreams below in the same order used by the numbered sequence. They are the starting implementation instructions for this plan:

- Workstream 1 feeds implementation-sequence step 1.
- Workstream 3 feeds implementation-sequence steps 2 through 4.
- Workstream 2 feeds implementation-sequence step 9, and step 11 only hooks conversation publishers onto that already-landed filtering foundation.

#### Workstream 1: Normalize heartbeat source and wake-policy contracts

Implement the canonical heartbeat contract end to end:

- add `conversation_message` to `packages/shared/src/constants.ts` and any shared heartbeat source exports/types
- add `conversation_message` to `packages/shared/src/validators/agent.ts` so wakeup requests accept the canonical source vocabulary
- change `server/src/services/heartbeat.ts` so canonical `wakeOnSignal` is the forward contract and legacy `wakeOnDemand` / `wakeOnOnDemand` are read-time compatibility aliases only
- change `server/src/services/heartbeat.ts` so older persisted/imported `wakeOnAssignment` and `wakeOnAutomation` values are also treated as legacy aliases that normalize to `wakeOnSignal`
- change `server/src/services/company-portability.ts` so new defaults and normalized exports emit only `wakeOnSignal`, while older imported `wakeOnDemand`, `wakeOnOnDemand`, `wakeOnAssignment`, and `wakeOnAutomation` values are rewritten to `wakeOnSignal`
- change `server/src/routes/agents.ts` and `server/src/services/agents.ts` so agent create/patch/hire paths normalize legacy wake-policy keys before persisting `runtimeConfig` or approval payload snapshots
- change `ui/src/components/AgentConfigForm.tsx`, `ui/src/components/OnboardingWizard.tsx`, and `ui/src/pages/NewAgent.tsx` so UI writers emit only `wakeOnSignal`
- change `ui/src/pages/Inbox.tsx`, `ui/src/pages/AgentDetail.tsx`, `ui/src/api/agents.ts`, and `ui/src/components/agent-config-primitives.tsx` so labels, request types, and help text all use the canonical source/policy vocabulary
- keep `docs/agents-runtime.md`, `docs/guides/agent-developer/how-agents-work.md`, `docs/guides/agent-developer/heartbeat-protocol.md`, `skills/paperclip-create-agent/SKILL.md`, and `skills/paperclip-create-agent/references/api-reference.md` aligned in the same first foundation PR bundle so the repo does not regress back to legacy wake-policy/source guidance while the code-path normalization is landing

#### Workstream 2: Land participant-scoped live-event transport and filtering foundation

Implement the reusable realtime/privacy foundation before any conversation event emission:

- add the dedicated `conversation.*` live-event types to `packages/shared/src/constants.ts` and extend `packages/shared/src/types/live.ts` so the base `LiveEvent` envelope carries explicit audience metadata
- define that audience metadata on the transport envelope, not inside per-event payloads:
  - `audience.scope = "company" | "conversationParticipants"`
  - `audience.conversationId = string | null`
  - `audience.participantAgentIds = string[] | null`
- update `server/src/services/live-events.ts` so it becomes the authoritative owner of audience-aware filtering:
  - publishers pass audience metadata into the transport layer there
  - the service exposes the filtered actor-aware subscription path used by delivery consumers
  - raw company fanout remains a low-level internal primitive and must not be the delivery path for participant-scoped conversation events
- update `server/src/middleware/auth.ts` and `server/src/realtime/live-events-ws.ts` so board actor identity is normalized across HTTP and websocket paths; in `local_trusted`, websocket board upgrades must use the same board actor `userId` text contract as request middleware, with canonical sentinel value `local-board`, instead of a separate placeholder id
- update `server/src/routes/authz.ts`, `server/src/routes/approvals.ts`, `server/src/routes/access.ts`, `server/src/routes/costs.ts`, `server/src/routes/companies.ts`, `server/src/routes/secrets.ts`, `server/src/routes/agents.ts`, `server/src/services/company-portability.ts`, and `packages/shared/src/validators/approval.ts` so actor helpers, approval decision defaults, company-membership writers, board-authored mutation paths, import/export membership defaults, and other board-user fallbacks also normalize to that same board actor `userId` text contract, with canonical sentinel `local-board` in `local_trusted`, instead of emitting separate `"board"` placeholders
- for board-authored writes, require authoritative auth-derived attribution rather than placeholder substitution:
  - derive board actor ids from `req.actor.userId` when authenticated, or canonical `local-board` in `local_trusted`
  - ignore or remove client-supplied board-attribution fields such as `decidedByUserId` rather than trusting them as the source of truth
  - keep `getActorInfo(...)` and route/service write paths aligned so activity rows, approvals, memberships, costs, and conversation records all use the same authoritative actor derivation
- update `server/src/realtime/live-events-ws.ts` so websocket delivery subscribes through the filtered actor-aware path and does not fan out private conversation events to same-company non-participants
- update direct non-websocket subscribers such as `server/src/services/plugin-host-services.ts` so they also consume the filtered actor-aware path instead of raw company fanout whenever forwarded events may reach end users or plugins
- add the transport-level rollout guard that keeps conversation activity/live emission disabled until the filtered delivery path is live; the later conversation publisher step will attach concrete conversation publishers and UI consumers to this foundation

#### Workstream 3: Migrate the repo to canonical task-key scope

Make canonical `taskKey` the real forward contract before conversation feature work starts:

Ordering rule for this workstream:

- update all forward writers, clone paths, adapter payload builders, and config/default emitters first so new runtime state is written in canonical form
- then migrate stored issue-scoped session rows from bare issue UUID keys to `issue:<issueId>`
- only after writers and stored rows are aligned, remove legacy fallback behavior and make canonical `taskKey` the sole forward contract for readers and runtime helpers

- update `server/src/routes/issues.ts` so issue create/assign/comment/reopen wakeup producers seed canonical `taskKey` values instead of relying on raw `issueId` / `taskId`
- update `server/src/routes/approvals.ts` so approval-triggered wakeups and cloned run scope stop emitting raw `taskId` / `issueId`
- update `server/src/services/issues.ts` so issue-service wakeup paths, including issue-mention wakeups, stop emitting raw `taskId` / `issueId`
- update `server/src/services/heartbeat.ts` so task classification and session lookup treat canonical `taskKey` as the source of truth rather than legacy fallbacks
- reconcile the shipped adapter identifier set across `packages/shared/src/constants.ts`, `server/src/adapters/registry.ts`, `ui/src/adapters/registry.ts`, `ui/src/components/AgentConfigForm.tsx`, `ui/src/components/OnboardingWizard.tsx`, `ui/src/pages/NewAgent.tsx`, `ui/src/components/NewAgentDialog.tsx`, `ui/src/pages/InviteLanding.tsx`, `ui/src/pages/Agents.tsx`, `ui/src/pages/OrgChart.tsx`, `ui/src/components/AgentProperties.tsx`, `ui/src/adapters/gemini-local/index.ts`, and `packages/adapters/gemini-local/src/index.ts` before claiming adapter-contract closure; existing shared/server/UI/package drift such as `gemini_local` must be removed in the same rollout bundle
- adapter-set decision for this rollout: treat `hermes_local` as internal/server-only rather than a public shipped adapter option. Keep its server-registry integration in scope for task-key/conversation-context verification, but do not expose it through public shared adapter enums, the UI adapter registry, create-agent surfaces, or invite flows until a separate rollout intentionally adds full public/UI support
- update the shared adapter invoke/env layer in `packages/adapter-utils/src/types.ts` and `packages/adapter-utils/src/server-utils.ts` so built-in adapter payloads and Paperclip env shaping carry canonical task-key scope instead of legacy `taskId` / `issueId` assumptions
- define the canonical task-scope env contract in the same cutover: `PAPERCLIP_TASK_KEY` is the forward env var for any scoped run, while `PAPERCLIP_TASK_ID` remains only a temporary issue-only compatibility alias during migration; true issue-scoped runs may set both, but conversation-, goal-, and project-scoped runs must not set `PAPERCLIP_TASK_ID`
- update the built-in adapter execute paths in `server/src/adapters/process/execute.ts` and `server/src/adapters/http/execute.ts` so the shipped server adapters also prefer canonical `taskKey` over legacy scope fields
- keep `docs/adapters/http.md` aligned in that same built-in HTTP adapter cutover so the published payload example uses canonical `context.taskKey` instead of the older `context.taskId` contract
- update local adapter execute paths in `packages/adapters/claude-local/src/server/execute.ts`, `packages/adapters/codex-local/src/server/execute.ts`, `packages/adapters/cursor-local/src/server/execute.ts`, `packages/adapters/gemini-local/src/server/execute.ts`, `packages/adapters/opencode-local/src/server/execute.ts`, and `packages/adapters/pi-local/src/server/execute.ts`, plus the internal/server-only `hermes_local` integration registered in `server/src/adapters/registry.ts`, so they prefer canonical `taskKey` over legacy `taskId` / `issueId`
- update `packages/adapters/openclaw-gateway/src/server/execute.ts` so session routing and wake payloads are task-key-driven rather than issue-key-driven
- update `packages/adapters/openclaw-gateway/src/index.ts`, `packages/adapters/openclaw-gateway/src/ui/build-config.ts`, and `server/src/routes/access.ts` so OpenClaw defaults, onboarding payloads, and generated configs stop emitting `sessionKeyStrategy = issue`
- keep `packages/adapters/openclaw-gateway/README.md` and `packages/adapters/openclaw-gateway/doc/ONBOARDING_AND_TEST_PLAN.md` aligned in that same early task-key writer/default cutover so the repo does not regress to deprecated `sessionKeyStrategy = issue` examples while the migration lands
- update `docs/agents-runtime.md` in the task-key/session-model cutover so the public runtime guide describes resumable session state per `(agent, taskKey, adapterType)` instead of the older generic stored-session-id wording
- keep `docs/deploy/environment-variables.md`, `docs/guides/agent-developer/how-agents-work.md`, `docs/guides/agent-developer/heartbeat-protocol.md`, `skills/paperclip/SKILL.md`, and `docs/adapters/creating-an-adapter.md` aligned in that same task-key/env cutover so the repo teaches `PAPERCLIP_TASK_KEY` as the canonical injected task-scope env var and describes `PAPERCLIP_TASK_ID` only as an issue-only compatibility alias
- update `ui/src/pages/AgentDetail.tsx` and `ui/src/pages/Inbox.tsx` so retry/resume and run-scope inference clone or read canonical `taskKey` first
- update issue-scoped readers and issue-live consumers so they do not misclassify runs from legacy scope fallbacks once canonical `taskKey` becomes authoritative
- keep the later task-key migration section below as the detailed cutover procedure for session-row migration and final canonical-only enforcement

Later sections of this document assume the relevant foundation work has already landed in sequence order:

- steps 5 through 8 and step 10 assume Workstreams 1 and 3 are already implemented
- steps 11 through 23 that emit or consume conversation live events also assume Workstream 2 has landed via step 9

Required foundation runtime-contract decisions:

- choose one canonical heartbeat invocation-source vocabulary and use it everywhere
- the canonical source vocabulary for this plan is:
  - `timer`
  - `assignment`
  - `on_demand`
  - `automation`
  - `conversation_message`
- this source-vocabulary cleanup applies only to heartbeat `invocationSource` / wakeup `source`
- it does not change the existing `triggerDetail` vocabulary in this plan; `manual | ping | callback | system` remain valid `triggerDetail` values unless a separate plan changes them
- `packages/shared/src/constants.ts` and `packages/shared/src/types/heartbeat.ts` are the shared source-of-truth pair for that vocabulary
- docs, validators, service-local types, adapter-facing contracts, and runtime code must mirror that exact vocabulary
- remove older source vocabularies such as `scheduler | manual | callback` only from `invocationSource` / wakeup `source` positions before feature work starts
- add `conversation_message` as a first-class heartbeat invocation source everywhere the source enum is documented or validated
- do not add a separate `wakeOnConversationMessage` heartbeat-policy flag in this plan
- the canonical heartbeat policy key for non-timer wakes in this plan is `heartbeat.wakeOnSignal`
- `heartbeat.wakeOnDemand`, `heartbeat.wakeOnOnDemand`, `heartbeat.wakeOnAssignment`, and `heartbeat.wakeOnAutomation` are legacy input aliases only and must not remain as forward-contract keys after the foundation work lands
- the persisted and public config contract must use only `heartbeat.wakeOnSignal`
- map `conversation_message` wake permission to the canonical `wakeOnSignal` policy flag
- make that mapping executable in heartbeat runtime code, not only in enum/docs text:
  - `conversation_message` must enter the existing non-timer wake gate intentionally
  - the runtime's non-timer gate remains the source of truth for `conversation_message` wake permission in this plan
  - this rollout must update policy parsing, source handling, and docs together so `conversation_message` is explicitly covered by the canonical `wakeOnSignal` behavior rather than only inheriting it implicitly from `source !== timer`
- Foundation ownership for the key migration is:
  - shared validators, docs, and public examples publish only `wakeOnSignal`
  - UI writers and new runtime-config defaults emit only `wakeOnSignal`
  - portability/import-export/default-normalization code accepts legacy aliases only as migration input and rewrites them to `wakeOnSignal`
  - runtime parsing may accept legacy aliases only as a temporary compatibility read path after normalization
- if temporary alias support remains during migration:
  - shared/runtime contracts must document only `wakeOnSignal` as canonical
  - UI writers and new defaults must emit only `wakeOnSignal`
  - import/export and portability/default-normalization paths may accept legacy `wakeOnDemand`, `wakeOnOnDemand`, `wakeOnAssignment`, and `wakeOnAutomation`, but they must rewrite them to `wakeOnSignal`
  - `server/src/services/heartbeat.ts` may accept `wakeOnDemand`, `wakeOnOnDemand`, `wakeOnAssignment`, and `wakeOnAutomation` as read-time compatibility backstops, but it must not be the only normalization layer
- update runtime docs so canonical conversation task keys are documented directly and legacy `taskId` / `issueId` fallback wording is removed from the future contract

### Foundation completion checks

The foundation work is complete only when all are true:

The governing-doc baseline above should already satisfy the first validation checks below.
The foundation work is done only when that remains true and the remaining repo-wide contract work also lands.

- `doc/SPEC-implementation.md` no longer says "tasks + comments only" as the communication contract
- `doc/SPEC-implementation.md` no longer says all work must be tracked only through tasks/comments with no bounded conversation exception
- `doc/SPEC-implementation.md` no longer says "Single human board operator per deployment" in a way that conflicts with coarse multi-user board access in authenticated mode
- `doc/SPEC-implementation.md` documents auth `users.id` as `text` and no longer documents human-attribution columns as `uuid` fks to `users.id`
- `doc/SPEC-implementation.md` no longer documents legacy `heartbeat_runs.invocation_source = scheduler | manual | callback`
- `doc/PRODUCT.md` no longer says richer chat belongs only at the plugin edge for this feature area
- `doc/PRODUCT.md` no longer says all work must immediately trace to the goal in a way that excludes company-rooted conversations or lightweight direct conversation work
- `doc/SPEC.md` no longer says there is no separate messaging or chat system
- `doc/SPEC.md` no longer says "Single human Board. One human operator." in the V1 board-governance section
- governing docs explicitly allow company-rooted conversations that may begin before any issue, goal, or project link exists
- governing docs explicitly define lightweight direct conversation work as a bounded exception and preserve that substantial or durable work still enters tracked issue/project/goal flows
- governing docs explicitly define conversation visibility as participant-scoped for agents
- governing docs explicitly allow per-user board attribution and read-state semantics keyed by board actor `userId` text, while still treating fine-grained human RBAC as out of scope for V1
- the runtime board-actor identity contract uses board actor `userId` text consistently across HTTP and websocket contexts, including `local_trusted`, where the canonical board-user sentinel is `local-board`
- `doc/SPEC-implementation.md` publishes the concrete conversation data model and the `cost_events.conversation_id` extension this rollout depends on
- `doc/SPEC-implementation.md` publishes `agent_wakeup_requests.conversation_id`, `conversation_message_id`, `conversation_message_sequence`, and `response_mode` before schema/runtime work depends on them
- `doc/SPEC-implementation.md` publishes the concrete conversation REST surface rather than omitting conversation CRUD, participant, message, read-state, target-link, and linked-conversation routes, and it includes the base conversation list/detail/message retrieval contract plus embedded `costSummary` fields before UI/server work depends on them
- `doc/spec/agents-runtime.md` and `doc/spec/agent-runs.md` document `conversation_message` as a heartbeat source and no longer describe legacy task-key fallback as the forward contract
- `doc/spec/agent-runs.md` also publishes the persisted conversation wakeup fields on `agent_wakeup_requests`
- `doc/spec/agent-runs.md` publishes the audience-aware `LiveEvent` envelope and canonical realtime event families used by this rollout, including `conversation.*`
- `docs/agents-runtime.md`, `docs/guides/agent-developer/how-agents-work.md`, `docs/guides/agent-developer/heartbeat-protocol.md`, `skills/paperclip-create-agent/SKILL.md`, and `skills/paperclip-create-agent/references/api-reference.md` no longer publish legacy wake-policy/source or issue-only wake-context language after the `wakeOnSignal` and `conversation_message` cutovers, and `docs/agents-runtime.md` uses the canonical task-key session-resume model instead of the older stored-session-id wording
- `doc/spec/ui.md` publishes the target board routing model the conversation UI will use: company-prefixed board routes under `/:companyPrefix/...`, with any unprefixed `/conversations` forms treated only as redirects if they remain
- `ui/src/App.tsx` is updated in the route-delivery step to match that published conversation route contract rather than forcing the spec backward to current pre-conversation router state
- `packages/shared/src/constants.ts`, `packages/shared/src/types/heartbeat.ts`, `packages/shared/src/validators/agent.ts`, and `server/src/services/heartbeat.ts` all use the same canonical invocation-source vocabulary and accept `conversation_message`
- `doc/SPEC-implementation.md` and `doc/spec/agent-runs.md` both publish `agent_wakeup_requests.conversation_id`, `conversation_message_id`, `conversation_message_sequence`, and `response_mode` before steps 7 and 10 depend on them
- `packages/shared/src/types/live.ts` defines audience metadata on the base `LiveEvent` envelope and the shared `conversation.*` payload unions
- no runtime/spec/shared file still uses `scheduler | manual | callback` or any other conflicting legacy source vocabulary in places that define heartbeat invocation sources
- the existing `triggerDetail = manual | ping | callback | system` vocabulary remains intact unless a separate plan changes it
- `conversation_message` is governed by canonical `wakeOnSignal` everywhere that source-policy mapping is documented or validated
- `wakeOnDemand`, `wakeOnOnDemand`, `wakeOnAssignment`, and `wakeOnAutomation` no longer appear as forward-contract keys in shared validators, docs, UI writers, or new defaults
- the persisted runtime-config shape and public API/examples use only `heartbeat.wakeOnSignal`
- server-side agent create/patch/hire flows normalize legacy wake-policy keys before persisting `runtimeConfig` or approval payload snapshots
- `doc/spec/agent-runs.md` no longer describes separate persisted wake-policy fields such as wake-on-assignment, wake-on-on-demand, or wake-on-automation after adopting canonical `wakeOnSignal`
- if read-time alias support for `wakeOnDemand`, `wakeOnOnDemand`, `wakeOnAssignment`, or `wakeOnAutomation` remains temporarily, portability/import-export defaults normalize them to `wakeOnSignal` before runtime use
- `server/src/routes/agents.ts`, `server/src/services/agents.ts`, `server/src/services/company-portability.ts`, `ui/src/components/AgentConfigForm.tsx`, `ui/src/components/OnboardingWizard.tsx`, and `ui/src/pages/NewAgent.tsx` emit or persist only `wakeOnSignal`
- `doc/spec/ui.md`, `ui/src/components/agent-config-primitives.tsx`, `ui/src/api/heartbeats.ts`, `ui/src/api/activity.ts`, `ui/src/pages/AgentDetail.tsx`, and `ui/src/pages/Inbox.tsx` consume only the canonical invocation-source vocabulary and heartbeat policy naming
- `server/src/services/heartbeat.ts` explicitly routes `conversation_message` through the intended non-timer wake policy path; this must not be left as an accidental side effect of a generic `source !== timer` branch
- `server/src/services/live-events.ts` owns audience-aware filtering and exposes the filtered actor-aware subscription path used by delivery consumers
- `server/src/middleware/auth.ts`, `server/src/realtime/live-events-ws.ts`, `server/src/routes/authz.ts`, `server/src/routes/approvals.ts`, `server/src/routes/access.ts`, `server/src/routes/costs.ts`, `server/src/routes/companies.ts`, `server/src/routes/secrets.ts`, `server/src/routes/agents.ts`, `server/src/services/company-portability.ts`, and `packages/shared/src/validators/approval.ts` use the same board actor identity contract in `local_trusted`, keyed by board actor `userId` text with canonical sentinel `local-board` rather than split placeholder ids
- board-authored writes derive actor ids from auth state (`req.actor.userId` or canonical `local-board`), not from client-supplied board-user-id fields; request schemas such as approval resolution must ignore or remove `decidedByUserId`-style fields instead of treating them as authoritative input
- `server/src/realtime/live-events-ws.ts` and `server/src/services/plugin-host-services.ts` no longer forward raw company fanout for participant-scoped conversation events
- all shipped adapter paths are explicitly listed and updated in the rollout scope for canonical task-key and conversation-context support, including `server/src/adapters/registry.ts`, `server/src/adapters/process/execute.ts`, `server/src/adapters/http/execute.ts`, `packages/adapter-utils/src/types.ts`, and `packages/adapter-utils/src/server-utils.ts`
- `PAPERCLIP_TASK_KEY` is the canonical injected task-scope env var in runtime docs, adapter-author guidance, and agent/operator skill docs, and `PAPERCLIP_TASK_ID` only appears as a legacy issue-only compatibility alias
- conversation-scoped and other non-issue runs are not documented or implemented as setting `PAPERCLIP_TASK_ID`
- shared/server/UI/package surfaces also publish the same shipped adapter identifier set before the adapter rollout is considered complete; existing drift such as `gemini_local` being first-class in the registry and UI but absent from shared `AGENT_ADAPTER_TYPES` must be closed rather than carried forward
- `hermes_local` is treated consistently with the rollout decision above: internal/server-only unless and until a separate public/UI rollout adds it to the UI adapter registry, create-agent chooser flows, invite flow, and public shared adapter contract together
- conflicting older plans are explicitly superseded or aligned
- this document can be followed without violating `AGENTS.md` done criteria about matching `doc/SPEC-implementation.md` and updating docs with behavior changes

After the foundation contract-closure items land, the remaining sections of this document become the next implementation steps in this rollout.

## Critical File Checklist

The file lists in the foundation section cover contract-closure work only.
The implementation also has additional cross-layer files on the critical path.
They are listed here so the rollout does not depend on rediscovering hidden work.
This checklist is intended to be exhaustive for the currently known rollout-critical files.
Listing a file here means it is part of the rollout-critical scope and must stay aligned with the plan; it does not necessarily mean that file is still stale at the moment you read this.
If implementation uncovers another producer, consumer, config surface, or doc that is still stale, or that becomes a new rollout-critical dependency, add it here before continuing the rollout.

### Shared cost and runtime types

- `packages/shared/src/validators/cost.ts`
- `packages/shared/src/types/cost.ts`
- `packages/shared/src/types/heartbeat.ts`
- `packages/shared/src/types/live.ts`

### Shared conversation request/response contract critical path

- `packages/shared/src/types/conversation.ts`
- `packages/shared/src/validators/conversation.ts`

### Core new conversation module critical path

- `server/src/routes/conversations.ts`
- `server/src/services/conversations.ts`
- `server/src/services/conversation-memory.ts`
- `server/src/services/index.ts`
- `ui/src/api/conversations.ts`
- `ui/src/pages/Conversations.tsx`
- `ui/src/pages/ConversationDetail.tsx`
- `docs/api/conversations.md`

If implementation extracts additional conversation-specific UI modules, add them here as concrete files rather than leaving them implicit under generic page wiring.

### DB schema extension critical path

- `packages/db/src/schema/conversations.ts`
- `packages/db/src/schema/conversation_participants.ts`
- `packages/db/src/schema/conversation_messages.ts`
- `packages/db/src/schema/conversation_message_refs.ts`
- `packages/db/src/schema/conversation_target_links.ts`
- `packages/db/src/schema/conversation_target_suppressions.ts`
- `packages/db/src/schema/agent_target_conversation_memory.ts`
- `packages/db/src/schema/conversation_read_states.ts`
- `packages/db/src/schema/agent_wakeup_requests.ts`
- `packages/db/src/schema/cost_events.ts`
- `packages/db/src/schema/index.ts`

### Heartbeat policy-key normalization critical path

- `packages/shared/src/validators/agent.ts`
- `server/src/routes/agents.ts`
- `server/src/services/agents.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/company-portability.ts`
- `docs/agents-runtime.md`
- `docs/deploy/environment-variables.md`
- `skills/paperclip-create-agent/SKILL.md`
- `skills/paperclip-create-agent/references/api-reference.md`
- `ui/src/components/AgentConfigForm.tsx`
- `ui/src/components/OnboardingWizard.tsx`
- `ui/src/pages/NewAgent.tsx`

### Invocation-source and policy consumer critical path

- `doc/spec/ui.md`
- `ui/src/api/agents.ts`
- `ui/src/components/agent-config-primitives.tsx`
- `ui/src/api/heartbeats.ts`
- `ui/src/api/activity.ts`
- `ui/src/pages/AgentDetail.tsx`
- `ui/src/pages/Inbox.tsx`

### Shared API path and composer-search critical path

- `packages/shared/src/api.ts`
- `packages/shared/src/validators/goal.ts`
- `packages/shared/src/validators/project.ts`
- `server/src/routes/goals.ts`
- `server/src/routes/projects.ts`
- `server/src/services/goals.ts`
- `server/src/services/projects.ts`
- `ui/src/api/goals.ts`
- `ui/src/api/projects.ts`
- `docs/api/goals-and-projects.md`

### Agent-facing skill and communication-doc critical path

- `skills/paperclip/SKILL.md`
- `skills/paperclip/references/api-reference.md`
- `docs/guides/agent-developer/comments-and-communication.md`
- `docs/guides/agent-developer/how-agents-work.md`
- `docs/guides/agent-developer/heartbeat-protocol.md`
- `docs/api/issues.md`
- `docs/api/conversations.md`

### Docs-site publication and board-operator guide critical path

- `docs/docs.json`
- `docs/guides/board-operator/dashboard.md`
- `docs/guides/board-operator/managing-tasks.md`
- `docs/guides/board-operator/conversations.md`

### Human auth and actor contract critical path

- `packages/db/src/schema/auth.ts`
- `packages/shared/src/validators/approval.ts`
- `server/src/middleware/auth.ts`
- `server/src/routes/authz.ts`
- `server/src/routes/approvals.ts`
- `server/src/routes/access.ts`
- `server/src/routes/companies.ts`
- `server/src/routes/secrets.ts`
- `server/src/routes/agents.ts`
- `server/src/routes/costs.ts`
- `server/src/services/company-portability.ts`

### Server route-mount and access wiring critical path

- `server/src/app.ts`

### Agent and company removal critical path

- `server/src/services/agents.ts`
- `server/src/services/companies.ts`

### Task-key migration critical path

- `server/src/routes/issues.ts`
- `server/src/routes/agents.ts`
- `server/src/routes/approvals.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/issues.ts`
- `server/src/services/workspace-runtime.ts`
- `ui/src/pages/AgentDetail.tsx`
- `ui/src/pages/Inbox.tsx`
- `docs/agents-runtime.md`
- `docs/deploy/environment-variables.md`
- `docs/guides/agent-developer/how-agents-work.md`
- `docs/guides/agent-developer/heartbeat-protocol.md`
- `skills/paperclip/SKILL.md`
- `docs/adapters/creating-an-adapter.md`
- `packages/adapter-utils/src/types.ts`
- `packages/adapter-utils/src/server-utils.ts`
- `server/src/adapters/registry.ts`
- `server/src/adapters/process/execute.ts`
- `server/src/adapters/http/execute.ts`
- `packages/adapters/claude-local/src/server/execute.ts`
- `packages/adapters/codex-local/src/server/execute.ts`
- `packages/adapters/cursor-local/src/server/execute.ts`
- `packages/adapters/gemini-local/src/server/execute.ts`
- `packages/adapters/opencode-local/src/server/execute.ts`
- `packages/adapters/pi-local/src/server/execute.ts`
- `packages/adapters/openclaw-gateway/src/server/execute.ts`

### Shipped adapter identifier contract critical path

- `doc/SPEC.md`
- `docs/adapters/creating-an-adapter.md`
- `packages/shared/src/constants.ts`
- `server/src/adapters/registry.ts`
- `ui/src/adapters/registry.ts`
- `ui/src/adapters/gemini-local/index.ts`
- `packages/adapters/gemini-local/src/index.ts`
- `ui/src/components/AgentConfigForm.tsx`
- `ui/src/components/OnboardingWizard.tsx`
- `ui/src/pages/NewAgent.tsx`
- `ui/src/components/NewAgentDialog.tsx`
- `ui/src/pages/InviteLanding.tsx`
- `ui/src/pages/Agents.tsx`
- `ui/src/pages/OrgChart.tsx`
- `ui/src/components/AgentProperties.tsx`

### Issue and company live-run consumer critical path

- `server/src/routes/agents.ts`
- `ui/src/api/heartbeats.ts`
- `ui/src/components/ActiveAgentsPanel.tsx`
- `ui/src/components/SidebarAgents.tsx`
- `ui/src/components/CompanyRail.tsx`
- `ui/src/components/LiveRunWidget.tsx`
- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/pages/Issues.tsx`
- `ui/src/pages/IssueDetail.tsx`

### Target-page linked-conversation critical path

- `ui/src/api/issues.ts`
- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/GoalDetail.tsx`
- `ui/src/pages/ProjectDetail.tsx`
- `docs/api/goals-and-projects.md`

### OpenClaw onboarding and config critical path

- `server/src/routes/access.ts`
- `packages/adapters/openclaw-gateway/src/index.ts`
- `packages/adapters/openclaw-gateway/src/ui/build-config.ts`
- `ui/src/adapters/openclaw-gateway/config-fields.tsx`
- `packages/adapters/openclaw-gateway/README.md`
- `packages/adapters/openclaw-gateway/doc/ONBOARDING_AND_TEST_PLAN.md`

### Server cost path

- `server/src/routes/costs.ts`
- `server/src/services/costs.ts`

### Server activity and realtime path

- `doc/spec/agent-runs.md`
- `server/src/routes/activity.ts`
- `server/src/services/activity.ts`
- `server/src/services/activity-log.ts`
- `server/src/services/live-events.ts`
- `server/src/realtime/live-events-ws.ts`
- `server/src/services/plugin-host-services.ts`

### UI live-event consumer critical path

- `ui/src/context/LiveUpdatesProvider.tsx`
- `ui/src/pages/AgentDetail.tsx`
- `ui/src/components/transcript/useLiveRunTranscripts.ts`

### Inbox and global-sidebar badge critical path

- `server/src/routes/sidebar-badges.ts`
- `server/src/services/sidebar-badges.ts`
- `ui/src/api/sidebarBadges.ts`
- `ui/src/hooks/useInboxBadge.ts`
- `ui/src/context/LiveUpdatesProvider.tsx`
- `ui/src/components/CompanyRail.tsx`

### UI route, nav, and cache wiring critical path

- `doc/spec/ui.md`
- `packages/shared/src/constants.ts`
- `ui/src/App.tsx`
- `ui/src/components/CommandPalette.tsx`
- `ui/src/components/MobileBottomNav.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/lib/company-routes.ts`
- `ui/src/lib/company-page-memory.ts`
- `ui/src/hooks/useCompanyPageMemory.ts`
- `ui/src/lib/queryKeys.ts`

### Frontend mention and markdown-rendering critical path

- `ui/src/components/MarkdownEditor.tsx`
- `ui/src/components/MarkdownBody.tsx`
- `packages/shared/src/project-mentions.ts`
- `ui/src/index.css`

### Existing issue-mention coexistence critical path

- `server/src/services/issues.ts`

### Shared export-barrel critical path

- `packages/shared/src/index.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/validators/index.ts`

### Why these files are in scope

- conversation cost attribution adds `conversation_id` to the existing cost pipeline, so shared cost validators plus cost routes/services must be updated together
- current project cost rollups still derive from `heartbeat_runs` plus issue activity rather than authoritative `cost_events` target dimensions, so the cost service rollout must also align existing project rollups with stamped `cost_events` before conversation target-attribution rules are trustworthy
- that project-rollup alignment does not exist in the live repo today; step 10 is the point in this plan where it is created before later target-cost assumptions can be relied on
- rollout steps 5-7 add new conversation tables through explicit schema modules under `packages/db/src/schema/*.ts`, so the new conversation schema files plus `packages/db/src/schema/agent_wakeup_requests.ts`, `packages/db/src/schema/cost_events.ts`, and `packages/db/src/schema/index.ts` are part of the critical path rather than optional follow-up cleanup
- the repo's DB workflow is file-based, so the rollout must create the new conversation schema modules first, export them from `packages/db/src/schema/index.ts`, and only then generate the migration that adds those tables plus the dependent FK-backed extensions
- the exported shared `CostEvent` type must also gain `conversationId` so db/shared/server/ui cost contracts do not drift
- conversation routes need concrete shared request/response contracts in the same style as goals and projects, so `packages/shared/src/types/conversation.ts` and `packages/shared/src/validators/conversation.ts` are part of the critical path rather than optional cleanup after routes already exist
- this repo adds resource features through explicit route/service/api/page modules plus central exports, so the rollout must also own the new conversation modules directly: `server/src/routes/conversations.ts`, `server/src/services/conversations.ts`, `server/src/services/conversation-memory.ts`, `server/src/services/index.ts`, `ui/src/api/conversations.ts`, and the new conversation page files
- because this rollout gives agents first-class conversation read/post/manual-link permissions, the main `paperclip` skill, its linked detailed API reference, the generic agent-runtime guides, the agent communication guide, and the public API docs must stop reading as issue-only in the same rollout bundle; otherwise the repo keeps shipping conflicting operator/agent instructions after the route and auth work lands
- those agent-facing docs may keep issue-focused examples where they still help explain current workflows, but they must not describe issue-only wake context, issue-only communication, or issue-only API usage as the exclusive forward contract once conversation routes and permissions are added
- because conversations become a first-class board page and public API surface, the docs-site navigation contract in `docs/docs.json` and the board-operator guides must publish that surface in the same rollout bundle; otherwise the docs site keeps hiding a shipped board feature or routing operators back to stale issue-only guidance
- `docs/guides/board-operator/conversations.md` is the concrete board-operator guide target for this rollout, and `docs/guides/board-operator/dashboard.md` plus `docs/guides/board-operator/managing-tasks.md` must stay aligned with it where they summarize board navigation or communication/task workflow
- conversation activity must remain participant-scoped for agents, so activity routes/services and live-event delivery paths must be updated before conversation event emission is enabled
- `doc/spec/agent-runs.md` is part of that same realtime contract surface, because it must stop publishing the older websocket envelope and older event names once the audience-aware `LiveEvent` transport and `conversation.*` event family become the forward contract
- if audience-aware filtering is implemented below the websocket layer, every direct `subscribeCompanyLiveEvents(...)` consumer must also be in scope, including `server/src/services/plugin-host-services.ts`
- shared heartbeat and live-event types must reflect the new invocation source and conversation event payloads so runtime, transport, and UI-facing contracts stay synchronized
- the existing plugin event bus forwards only actions present in `PLUGIN_EVENT_TYPES`, so `packages/shared/src/constants.ts` and `server/src/services/activity-log.ts` are also part of the rollout decision about whether conversation actions should ever leave the participant-scoped activity/live path
- `ui/src/api/agents.ts` consumes the wakeup source vocabulary and agent run-control contract, so it must stay aligned with the canonical source/policy rollout
- shared API path constants and company-scoped goal/project search routes must be updated together because the conversation composer depends on those existing resource-search surfaces after prefix selection
- goal/project composer search is not just a route concern: the route, service, and UI API client layers must all support `q` consistently or typed mention picking will drift between server and board UI behavior
- `docs/api/goals-and-projects.md` is part of that same public contract surface, because this rollout changes the published goal/project list query contract with `q` and `limit` and adds linked-conversation routes on those resource pages
- that goal/project `q` search path does not exist in the live repo today; it is an early prerequisite for structured mentions and step 8 is the point in this plan where the route/service/client chain is added before typed mention picking can be implemented safely
- conversation read states, board-authored conversation rows, and per-user board visibility depend on the live human-auth contract using auth user id `text` values and the existing board/agent actor mapping, so `packages/db/src/schema/auth.ts` and `server/src/routes/authz.ts` must stay aligned with the governing docs
- the real board actor identity source also lives in `server/src/middleware/auth.ts`, and the local-trusted websocket upgrade path in `server/src/realtime/live-events-ws.ts` must normalize to that same board actor `userId` text contract, with canonical sentinel `local-board`, instead of using a separate placeholder like `"board"`
- board-authored approval decisions, access/join-request activity writes, company budget writes, company creation writes, secret mutation writes, agent runtime/session mutation writes, company-portability membership defaults, and shared approval request/response defaults must normalize to that same contract too, or board attribution will keep drifting between `"board"` and `local-board` across approvals, activity, costs, membership, agent operations, and conversation read-state flows
- that normalization is auth-derived, not body-derived: route/service code must source board actor ids from `req.actor.userId` (or canonical `local-board` in `local_trusted`) and ignore/remove client-supplied board attribution fields such as `decidedByUserId`
- company portability is only in scope here for wake-policy normalization and board-actor normalization; this rollout intentionally does not add conversation export/import payloads, preview data, or restore behavior
- server route mounting is part of the rollout-critical path because new conversation routes are not reachable until `server/src/app.ts` mounts them under `/api`
- the UI live-event consumer scope is not limited to `LiveUpdatesProvider`: `ui/src/pages/AgentDetail.tsx` and `ui/src/components/transcript/useLiveRunTranscripts.ts` also open `/events/ws` directly and deserialize the base `LiveEvent` envelope for live run transcripts, so the transport rollout must keep those consumers aligned with the new websocket delivery and envelope contract too
- the shared transcript websocket hook feeds downstream transcript consumers such as `ui/src/components/ActiveAgentsPanel.tsx` and `ui/src/components/LiveRunWidget.tsx`, so keeping `ui/src/components/transcript/useLiveRunTranscripts.ts` aligned is required to avoid dashboard and issue-detail transcript regressions during the Workstream 2 transport change
- the shared UI live-event consumer must also recognize and route the new `conversation.*` events, or the realtime contract will be defined but unused
- the conversation unread non-goal is enforced through the existing inbox/global sidebar badge pipeline, so `server/src/routes/sidebar-badges.ts`, `server/src/services/sidebar-badges.ts`, `ui/src/api/sidebarBadges.ts`, `ui/src/hooks/useInboxBadge.ts`, `ui/src/context/LiveUpdatesProvider.tsx`, and `ui/src/components/CompanyRail.tsx` must stay explicit about excluding conversation unread from inbox/global badge derivation and invalidation in this rollout
- the published UI spec is the route target for conversation pages, and `ui/src/App.tsx` must be brought into sync with it during the route rollout, so `doc/spec/ui.md` is part of the same critical path as `ui/src/App.tsx`, `ui/src/components/Sidebar.tsx`, and `ui/src/lib/queryKeys.ts`
- the routing model implementers should land in `ui/src/App.tsx` is the published company-prefixed board route contract, so conversation pages must mount under `/:companyPrefix/conversations` and `/:companyPrefix/conversations/:conversationId`; any unprefixed `/conversations` paths are redirect-only if retained
- within the prefixed board tree itself, new route entries, redirects, and navigation helpers should stay company-relative rather than introducing new absolute `/conversations...` destinations; absolute unprefixed conversation paths are allowed only for transitional shim routes outside that tree
- `ui/src/lib/company-routes.ts` is the shared board-route-root helper behind company-prefixed routing and remembered-page behavior, so it must reserve `conversations` as a board route root in the same rollout bundle as `ui/src/App.tsx`
- because remembered-page restoration depends on that same route-root contract, `ui/src/lib/company-page-memory.ts` and `ui/src/hooks/useCompanyPageMemory.ts` must also recognize conversation pages as valid company-relative remembered paths rather than inheriting pre-conversation fallback behavior
- because `conversations` becomes a first-class host page under `/:companyPrefix/...`, the existing `PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS` in `packages/shared/src/constants.ts` must be extended to include the `conversations` segment so plugins cannot claim it
- UI route registration, command-palette navigation, mobile-nav affordances, sidebar navigation, and query-key definitions are part of the critical path because conversation pages are not fully discoverable, cacheable, or invalidatable until those surfaces are updated together
- conversation mention UX must extend the existing markdown editor, markdown renderer, shared mention-parser, and mention styling path instead of creating a second conversation-only mention stack
- reusing that shared markdown stack does not mean identical mention behavior on every surface: the shared components must support a conversation structured-only mode and a legacy issue-comment mode so conversation UIs can suppress raw `@word` fallback/highlighting without regressing existing issue-comment behavior
- the conversation mention rollout must coexist with the current issue-comment mention behavior: conversation writes are structured-only, while existing issue comment raw `@` parsing, wakeups, and notifications remain unchanged unless a separate issue-mention migration plan replaces them
- shared root, type, and validator barrel exports must include the new conversation contracts so downstream server and UI imports do not silently drift or force deep-import one-offs
- the heartbeat policy-key migration must treat `wakeOnSignal` as canonical across shared validators, runtime parsing, UI writers, and portability/import-export defaults so the repo does not keep two near-duplicate forward-contract keys alive
- the heartbeat policy-key migration also has to cover server-side agent create/patch/hire persistence, or legacy `wakeOnDemand` keys will remain stored in agent `runtimeConfig` rows and approval payload snapshots even after the UI and portability layers are normalized
- older published guidance needs to stay aligned in lockstep, including `docs/agents-runtime.md`, `docs/deploy/environment-variables.md`, and the `paperclip-create-agent` skill/reference files, or the repo can drift back into conflicting wake-policy, session-resume, and injected-env instructions after the runtime cutover
- canonical task scope now has two public faces that must stay aligned together: structured `taskKey` in adapter payloads/session scope and `PAPERCLIP_TASK_KEY` in env-based adapters; the repo must also document exactly when the legacy `PAPERCLIP_TASK_ID` issue-only alias may still appear and when it must be absent
- invocation-source and policy alignment also touches UI help text, UI source labels, API consumer types, and UI docs, so those consumer surfaces must be updated together with the shared/runtime contract
- new conversation tables add company- and agent-scoped foreign-keyed rows, so the existing agent/company removal services must be extended explicitly; otherwise delete flows will drift or fail even if the conversation feature itself lands correctly
- task-key migration touches producer, clone, adapter, and UI resume/retry surfaces that still emit or interpret raw `issueId` / `taskId`, so those files must be updated together before canonical-only task keys are safe
- issue live-run and company live-run readers are part of the rollout-critical path too, because single-target conversation runs may carry issue context and these readers/consumers must continue treating only true issue-scoped runs as issue live-run state
- `ui/src/components/LiveRunWidget.tsx` is part of that same issue-live critical path because it directly queries `/issues/:issueId/live-runs` and `/issues/:issueId/active-run`, so it must not surface conversation-scoped runs as issue-live state
- step 21 attaches linked-conversation panels and actions to existing issue, goal, and project detail surfaces, so the target-page pages, the issue API client, and the published goals/projects API doc must be on the explicit checklist rather than left to implication through other sections
- built-in `process` and `http` adapters are part of the shipped adapter surface too, and the shared Paperclip env builder in `packages/adapter-utils/src/server-utils.ts` must learn the canonical conversation env/context shape so those built-in adapters do not lag behind the package adapters
- shipped-adapter coverage is not just execute-path coverage: the public shared enum, server registry, UI adapter registry, create-agent chooser flows, and invite flow all have to agree on which adapters are public. This rollout treats `hermes_local` as internal/server-only, so those public surfaces must not advertise it until a separate UI/public rollout adds full support
- the long-horizon public product/spec docs are part of that same adapter-contract surface too: `doc/SPEC.md` must not keep advertising `hermes_local` as a public initial adapter once this rollout defines it as internal/server-only
- `docs/adapters/creating-an-adapter.md` is part of that same public adapter contract because it tells adapter authors which registries define a public adapter and how Paperclip env/context is constructed; it must stay aligned with canonical task-key/conversation env guidance and the `hermes_local` internal/server-only decision
- OpenClaw migration also touches onboarding payload builders, config defaults, UI config fields, and adapter docs, because those surfaces are part of the same public contract and must stay aligned with the `task_key` direction during the rollout

## Product Goals

1. A board user can create a conversation with one or more agents.
2. A conversation can cover more than one topic over time.
3. Agents can decide whether to respond to general conversation messages.
4. `@agent` explicitly targets one or more agents and suppresses replies from unmentioned agents.
5. `@issue-id` and similar mentions link conversation context to concrete target objects.
6. A conversation may start as a company-rooted strategy or CEO conversation before it links to any concrete target object.
7. One conversation can link to many target objects.
8. One target object can receive context from many conversations.
9. Links are agent-scoped so two agents can map the same conversation to different work.
10. When an agent works on an issue, goal, or project, Paperclip can inject derived conversation memory built from linked conversations for that target.
11. Conversations remain company-scoped and auditable.
12. Conversation runs may perform small direct work without forcing a full issue workflow.
13. Conversation runs may explicitly create a new issue when the user asks to turn conversation work into tracked work.

## Non-Goals

- No issue-backed conversation mode.
- No conversation implementation that reuses `issue_comments`.
- No plugin-owned conversation persistence.
- No automatic server-side parsing of arbitrary raw `@text` mentions.
- No semantic auto-linking that creates work links without an explicit user action.
- No loading of full conversation transcripts into work prompts by default.
- No multi-provider or cross-task session sharing.
- No conversation-linked approval targets in this version.
- No conversation-linked agent targets in this version.
- No issue-lifecycle replacement inside conversations.
- No conversation-specific issue-creation API when the existing issue-create API is sufficient.

## Core Design Stance

Conversations and work are separate session domains.

In this version, conversation-linked targets are limited to:

- `issue`
- `goal`
- `project`

- Conversation continuity lives in per-conversation task sessions.
- Work continuity lives in target task sessions.
- Conversations enrich work through explicit target stamping, conversation-to-target links, and derived agent-target conversation memory.
- Linked conversations remain available for deeper inspection when the agent needs raw details.
- Conversation runs may still perform lightweight direct work as a bounded exception for small tasks, but they do not replace the tracked issue workflow for substantial, durable, or org-visible work.
- When conversation work should become tracked work, the conversation run may create an issue through the normal issue flow instead of inventing a conversation-only task system.

The conversation may be noisy.
The derived target memory must not be noisy.

## Canonical Terminology

- Use `conversation` as the only durable discussion object name.
- Use `conversation_id` as the only foreign-key field name for that object.
- Use `conversation:<conversationId>` as the only task-key format for that object.
- Use `target` as the generic name for linked issues, goals, and projects.
- Do not use `chat`, `room`, or `thread` in new code or docs for this feature.

## Core Concepts

### Conversation

A durable multi-party conversation container scoped to one company.

### Conversation participant

An agent invited into a conversation.
Board users can author messages but are not stored as participants.

### Company-rooted conversation

A conversation that exists at company scope without any target links yet.

This supports dashboard, CEO, strategy, and exploratory discussions before they resolve into issues, goals, or projects.
Company-rooted is a conversation state, not a mention target.

### Conversation message

A durable markdown message authored by a user, agent, or system.

### Structured mention

A markdown link token selected from the composer mention picker.
Examples:

- `[@agent Alex](agent://<agentId>)`
- `[@issue PAP-123](issue://<issueId>)`
- `[@goal Growth Goal](goal://<goalId>)`
- `[@project Mobile App](project://<projectId>)`

Structured mentions are the only mentions with routing or linking behavior.
Plain raw text beginning with `@` is only text.

### Active context

The set of linked target objects that the user wants subsequent conversation messages to stay associated with until changed.

### Conversation message ref

A normalized typed association stored for a message.

Examples:

- message M references agent A
- message M references issue I
- message M references project P

Message refs are the durable routing and linking source of truth.

### Conversation target link

A directional, agent-scoped link from a conversation to a target.

Examples:

- agent A, conversation C -> issue I
- agent B, conversation C -> goal G
- agent A, conversation C -> project P

Conversation target links tell Paperclip which conversations contain relevant context for a target from a specific agent's point of view.

### Conversation task session

A normal runtime task session stored per `agent + conversation`.

Examples:

- agent A has session memory for `conversation:1`
- agent A has session memory for `conversation:2`
- agent B has a different session memory for `conversation:1`

This is separate from derived `agent_target_conversation_memory`.

### Agent-target conversation memory

A compiled markdown memory for one agent and one target.

It is built from all target-stamped messages across all linked conversations for that agent and target.
This is the default conversation-derived artifact injected into a target run.

### Conversation run target scope

A conversation run may optionally resolve one current target from its triggering conversation message.

Source of truth:

- the triggering `conversation_message_id` on the wakeup request
- the persisted `conversation_message_refs` rows for that message after active-context normalization

Single-target rules:

- a conversation run is `single-target` only when the triggering message resolves to exactly one target-object ref
- valid target-object refs are `issue`, `goal`, and `project`
- `issue` and `project` are workspace-bearing targets
- `goal` is a context-bearing target but not a workspace-bearing target in this version

Runtime use:

- if a conversation run is `single-target`, heartbeat may promote that target into run context for existing workspace and cost attribution paths
- if a conversation run has zero target-object refs or more than one target-object ref, it remains conversation-scoped only
- the system must not guess one target from older conversation history, linked targets, or free-form text
- a promoted single-target on a conversation run is context, not task scope
- `taskKey = conversation:<conversationId>` remains the only task-scope key for that run
- `issue:<issueId>` task semantics are reserved for true issue runs, not conversation runs that happen to have one issue target
- project and goal targets in conversation messages are supported target objects, but they do not imply that the current repo already has standalone `project:<projectId>` or `goal:<goalId>` wakeup-driven runtime flows

## Invariants

1. Every conversation record is company-scoped.
2. Every conversation and conversation-derived row must carry `company_id`, even when the conversation is linked to an issue, goal, or project target.
3. Conversation sessions and work sessions use different canonical task keys.
4. A work run never resumes a conversation adapter session.
5. A message may mention multiple agents and multiple target objects.
6. A conversation may contain messages about multiple target objects.
7. A conversation may also remain valid with no target links as a company-rooted conversation.
8. All participants, messages, read states, refs, target links, and derived memories must belong to the same `company_id` as the conversation.
9. All work links are explicit and durable.
10. The same conversation can be linked differently for different agents.
11. Message routing and work linking are separate concerns.
12. The default work-time target context is derived agent-target conversation memory, not raw transcript slices.
13. Audit logs are required for conversation creation, participant changes, message creation, and link mutations.
14. A conversation run may do small direct work, but only a triggering message with one explicit target may make that run target-scoped.

## Canonical Task Keys

Use explicit canonical task keys everywhere.
Do not rely on raw `issueId` or similar implicit fallbacks.

- `conversation:<conversationId>`
- `issue:<issueId>`
- `goal:<goalId>`
- `project:<projectId>`

Implementation rule:

- Add a shared task-key helper.
- Use that helper at all conversation and work wakeup sites.
- Persist `agent_task_sessions.taskKey` only in canonical form.

Current runtime note:

- in the live repo today, only issue-scoped work has concrete wakeup producers and issue-run lifecycle semantics
- `goal:<goalId>` and `project:<projectId>` are canonical task-key forms reserved for explicit target-linked work and future parity, but this conversation rollout does not depend on existing standalone goal/project wakeup producers because those do not exist yet
- in this version, conversations may link to goals and projects, and single-target conversation runs may reuse existing project workspace selection, without implying that the repo already has first-class goal/project work-run producers

## Canonical Task-Scope Env Contract

`taskKey` is the canonical scope field in persisted run context, adapter context, session scope, and public adapter examples.

If an adapter uses environment variables, the forward contract is:

- `PAPERCLIP_TASK_KEY = <taskKey>`

Temporary compatibility rule during the task-key migration:

- true issue-scoped runs may also set `PAPERCLIP_TASK_ID = <issueId>`
- `PAPERCLIP_TASK_ID` is a legacy issue-only alias, not a second canonical scope field
- conversation-, goal-, and project-scoped runs must not set `PAPERCLIP_TASK_ID`
- new adapter code, operator docs, and agent-facing docs must branch on `taskKey` / `PAPERCLIP_TASK_KEY`, not on `PAPERCLIP_TASK_ID`

## Task-Key Migration

This proposal is not safe to roll out by only changing new writes.

The current runtime still derives task scope from bare `taskId` and `issueId`, and current issue wakeups still seed `taskId` with the raw issue UUID.
Existing session history also already lives in the old issue-key space.
If the system starts writing canonical keys without a migration, existing issue session history will split into two unrelated key spaces.

Current repo status:

- the canonical task-key migration is still open in the live repo
- issue wake producers, heartbeat scope derivation, issue-scoped readers, adapter execute paths, OpenClaw config/default surfaces, and retry/resume UI surfaces still emit or interpret legacy `issueId` / `taskId` scope
- later rollout steps assume these surfaces have already been migrated together, so implement them in this section before depending on canonical task keys elsewhere in the plan

Required migration rule:

- do one coordinated migration from legacy issue keys to canonical issue keys before enabling canonical-only task keys in production

Migration scope:

1. Update all issue wakeup producers, manual clone paths, adapter payload builders, onboarding/config defaults, and other forward writers so new runtime state is emitted with canonical `taskKey` values instead of bare `taskId` or `issueId`.
2. Keep temporary compatibility reads only where required during the migration window; do not leave any forward writer on the legacy key shape once step 1 is done.
3. Rewrite existing issue-scoped `agent_task_sessions.taskKey` rows from bare issue UUIDs to `issue:<issueId>`.
4. Update heartbeat callers, runtime helpers, issue-scoped readers, and UI issue-run consumers so canonical `taskKey` is the source of truth and legacy fallback inference is removed.
5. Update adapter documentation and configuration that still describe issue-scoped sessions in legacy terms.
6. Only after writers, stored rows, and readers are aligned, enforce canonical-only task keys for new conversation code and new issue code.

Concrete migration surfaces that must be updated before the cutover is considered complete:

- issue comment / reopen wakeup producers in `server/src/routes/issues.ts`
- issue creation / assignment wakeup producers in `server/src/routes/issues.ts`
- approval wakeup producers that still clone raw `taskId` / `issueId` scope in `server/src/routes/approvals.ts`
- issue mention wakeup producers in `server/src/services/issues.ts`
- manual wakeup and run-clone entry points in `server/src/routes/agents.ts`
- heartbeat scope derivation in `server/src/services/heartbeat.ts`
- issue live-run and active-run readers in `server/src/routes/agents.ts` that still infer issue scope from `contextSnapshot.issueId`
- retry / resume payload builders in `ui/src/pages/AgentDetail.tsx`
- issue-link inference and run presentation that still falls back from `taskId` to `issueId` in `ui/src/pages/Inbox.tsx`
- issue live-run API consumers in `ui/src/api/heartbeats.ts` and `ui/src/pages/IssueDetail.tsx`
- adapter runtime types that still describe legacy task/session scope in `packages/adapter-utils/src/types.ts`
- workspace runtime env/prompt helpers that still expose issue-centric scope in `server/src/services/workspace-runtime.ts`
- local adapter execute paths that still prefer raw `taskId` / `issueId`, including `packages/adapters/claude-local/src/server/execute.ts` and `packages/adapters/codex-local/src/server/execute.ts`
- OpenClaw session and wake payload types in `packages/adapters/openclaw-gateway/src/server/execute.ts` that still describe issue-keyed routing in legacy terms
- all other shipped adapter execute paths that still prefer or emit raw `taskId` / `issueId`

Cutover rule:

- do not declare the issue task-key migration complete while any producer, clone path, adapter type, workspace helper, or UI surface above still creates or depends on bare issue UUID task scope as the forward contract

Operational rule:

- do not keep permanent dual-read or dual-write task-key behavior after migration
- if a zero-downtime migration is not practical, use a maintenance window and migrate session rows before switching runtime behavior

## Data Model

### Tables

### `conversations`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `title` text not null
- `status` enum: `active | archived`
- `last_message_sequence` bigint not null default `0`
- `created_by_user_id` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Creator identity rules:

- conversation creation is board-user initiated only in this version
- `created_by_user_id` must be the board actor `userId` text for the actor who created the conversation
- system-created conversation rows are not allowed in this table shape

Message-sequence allocator rules:

- `conversations.last_message_sequence` is the only allocator source of truth for `conversation_messages.sequence`
- do not derive the next message sequence from `max(sequence) + 1`
- allocate the next message sequence by atomically updating the conversation row:
  - `update conversations`
  - `set last_message_sequence = last_message_sequence + 1`
  - `where id = ? and company_id = ?`
  - `returning last_message_sequence`
- use the returned `last_message_sequence` value as the new message's `sequence`
- perform the allocator update and the `conversation_messages` insert in the same transaction
- if the transaction rolls back, the sequence allocation rolls back with it
- `(conversation_id, sequence)` remains a uniqueness backstop, not the primary allocator

### `conversation_participants`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `conversation_id` uuid fk `conversations.id` not null
- `agent_id` uuid fk `agents.id` not null
- `joined_at` timestamptz not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Unique constraint:

- `(company_id, conversation_id, agent_id)`

### `conversation_messages`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `conversation_id` uuid fk `conversations.id` not null
- `sequence` bigint not null
- `author_type` enum: `user | agent | system`
- `author_user_id` text null
- `author_agent_id` uuid fk `agents.id` null
- `run_id` uuid fk `heartbeat_runs.id` null
- `body_markdown` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Unique constraint:

- `(conversation_id, sequence)`

Write rule:

- message creation must use the atomic allocator defined on `conversations.last_message_sequence`

Author identity rules:

- if `author_type = user`, then `author_user_id` is required and `author_agent_id` must be null
- if `author_type = agent`, then `author_agent_id` is required and `author_user_id` must be null
- if `author_type = system`, then both `author_user_id` and `author_agent_id` must be null
- no message row may identify more than one concrete author

Run-link rules:

- `run_id` is the source of truth for whether a conversation message was produced by a specific heartbeat run
- if `run_id` is set, `author_type` must be `agent`
- if `run_id` is set, `author_agent_id` must match the agent on that heartbeat run
- board-authored messages must leave `run_id` null
- system-authored messages must leave `run_id` null in this design

### `conversation_message_refs`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `message_id` uuid fk `conversation_messages.id` not null
- `ref_kind` enum: `agent | issue | goal | project`
- `target_id` uuid not null
- `display_text` text not null
- `ref_origin` enum: `inline_mention | active_context`
- `created_at` timestamptz not null

Index requirements:

- `(company_id, ref_kind, target_id)`
- `(message_id)`

Unique constraint:

- `(message_id, ref_kind, target_id)`

Dedup rules:

- persist at most one `conversation_message_refs` row per `(message_id, ref_kind, target_id)`
- if the same target appears from both inline mention and active context on one message, persist one row only
- when deduping mixed origins for the same target, `ref_origin = inline_mention` wins

### `conversation_target_links`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `agent_id` uuid fk `agents.id` not null
- `conversation_id` uuid fk `conversations.id` not null
- `target_kind` enum: `issue | goal | project`
- `target_id` uuid not null
- `link_origin` enum: `message_ref | manual | system`
- `latest_linked_message_id` uuid fk `conversation_messages.id` not null
- `latest_linked_message_sequence` bigint not null
- `created_by_actor_type` enum: `user | agent | system`
- `created_by_actor_id` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Unique constraint:

- `(agent_id, conversation_id, target_kind, target_id)`

Link-creator rules:

- if `created_by_actor_type = user`, `created_by_actor_id` must be that board actor's `userId` text
- if `created_by_actor_type = agent`, `created_by_actor_id` must be the agent id encoded as text
- if `created_by_actor_type = system`, `created_by_actor_id` must be a non-empty stable conversation-link writer id, not a user id and not an agent id
- this stricter rule is scoped to `conversation_target_links` attribution in this plan and does not require a repo-wide shared system-actor constant family
- conversation-link system actor ids must be deterministic write-path identifiers such as:
  - `conversation_target_stamper`
  - `conversation_manual_linker`
  - `conversation_participant_cleanup`
- `created_by_actor_id` must always match `created_by_actor_type`; the pair must never be ambiguous

Upsert audit rules:

- `link_origin`, `created_by_actor_type`, `created_by_actor_id`, and `created_at` are first-write metadata on the link row
- later upserts must not rewrite those fields
- later upserts may update only:
  - `latest_linked_message_id`
  - `latest_linked_message_sequence`
  - `updated_at`
- if a manual link is later reinforced by message refs, keep `link_origin = manual`
- if a message-created link is later touched by a manual link action, keep the original `link_origin` and creator fields unless the old row is explicitly deleted and recreated
- this table records first creation provenance, not latest-touch provenance

### `conversation_target_suppressions`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `agent_id` uuid fk `agents.id` not null
- `conversation_id` uuid fk `conversations.id` not null
- `target_kind` enum: `issue | goal | project`
- `target_id` uuid not null
- `suppressed_through_message_sequence` bigint not null
- `suppressed_by_actor_type` enum: `user | agent | system`
- `suppressed_by_actor_id` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Unique constraint:

- `(agent_id, conversation_id, target_kind, target_id)`

Suppression rules:

- manual unlink must upsert one suppression row per selected `(agent_id, conversation_id, target_kind, target_id)`
- `suppressed_through_message_sequence` must be the highest matching historical `conversation_messages.sequence` for that target in that conversation at unlink time
- suppression rows are durable audit records for "do not recreate this historical context from old messages"
- derived-memory compilation must ignore matching target-stamped messages with `sequence <= suppressed_through_message_sequence`
- a future new target-stamped message with `sequence > suppressed_through_message_sequence` may recreate an active link while the suppression row still preserves the historical cutoff
- an explicit manual relink for that same `(agent_id, conversation_id, target_kind, target_id)` must delete the suppression row as part of the relink write

Suppression-creator rules:

- if `suppressed_by_actor_type = user`, `suppressed_by_actor_id` must be that board actor's `userId` text
- if `suppressed_by_actor_type = agent`, `suppressed_by_actor_id` must be the agent id encoded as text
- if `suppressed_by_actor_type = system`, `suppressed_by_actor_id` must be a non-empty stable suppression-writer id such as `conversation_manual_unlinker`
- `suppressed_by_actor_id` must always match `suppressed_by_actor_type`; the pair must never be ambiguous

### `agent_target_conversation_memory`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `agent_id` uuid fk `agents.id` not null
- `target_kind` enum: `issue | goal | project`
- `target_id` uuid not null
- `memory_markdown` text not null
- `build_status` enum: `ready | rebuilding | failed`
- `linked_conversation_count` int not null
- `linked_message_count` int not null
- `source_message_count` int not null
- `last_source_message_sequence` bigint not null
- `latest_source_message_at` timestamptz null
- `last_build_error` text null
- `last_rebuilt_at` timestamptz not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Counter definitions:

- `linked_conversation_count` = the number of distinct conversations currently linked for `(agent_id, target_kind, target_id)` via `conversation_target_links`
- `linked_message_count` = the number of distinct source messages discovered from matching `conversation_message_refs` for that `(agent_id, target_kind, target_id)` before empty-body filtering
- `source_message_count` = the number of distinct source messages actually used as compiler input after whitespace normalization and empty-body filtering, before prompt-size truncation
- `last_source_message_sequence` and `latest_source_message_at` are derived from the `source_message_count` set, not from omitted or excluded rows

Unique constraint:

- `(agent_id, target_kind, target_id)`

### `conversation_read_states`

- `id` uuid pk
- `company_id` uuid fk `companies.id` not null
- `conversation_id` uuid fk `conversations.id` not null
- `user_id` text null
- `agent_id` uuid fk `agents.id` null
- `last_read_sequence` bigint not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Exactly one of `user_id` or `agent_id` must be set.

Index requirements:

- `(company_id, conversation_id)`
- `(company_id, user_id)` where `user_id is not null`
- `(company_id, agent_id)` where `agent_id is not null`

Unique requirements:

- `(company_id, conversation_id, user_id)` where `user_id is not null`
- `(company_id, conversation_id, agent_id)` where `agent_id is not null`

Write rules:

- mark-read operations must upsert, not insert blindly
- user-scoped reads must upsert on the user unique key
- agent-scoped reads must upsert on the agent unique key
- `last_read_sequence` must be monotonic and never move backward
- `updated_at` must advance on every successful mark-read write

Query rules:

- conversation list queries must join read state by `(company_id, user_id)` for board users or `(company_id, agent_id)` for agents
- unread state is true when there is no matching read-state row or when `last_read_sequence` is lower than the conversation's latest message sequence
- `ConversationSummary.unreadCount` is a numeric unread-message count, not a `0/1` unread flag
- `ConversationSummary.unreadCount` must be computed as the number of visible conversation messages with `sequence > last_read_sequence` for that actor-scoped join shape; when no matching read-state row exists, it equals the current visible message count for that conversation
- unread counts must be computed from the actor-scoped join shape above, not by scanning duplicate rows
- read-state joins must preserve one row per `(conversation, actor)` so conversation latest-activity ordering is stable
- conversation unread affects conversation list/detail read-state only in this rollout; it must not be merged into the inbox unresolved-count badge or any other global sidebar badge unless a separate design explicitly adds that behavior
- the existing inbox/global badge pipeline in `server/src/routes/sidebar-badges.ts`, `server/src/services/sidebar-badges.ts`, `ui/src/api/sidebarBadges.ts`, `ui/src/hooks/useInboxBadge.ts`, `ui/src/context/LiveUpdatesProvider.tsx`, and `ui/src/components/CompanyRail.tsx` must remain issue/approval/join/failure-driven and must not start counting or invalidating on conversation unread alone

### Delete semantics

This version does not add a standalone hard-delete route for conversations.
Conversations are archived in normal product flows and are hard-deleted only through existing company-removal paths.

Foreign-key behavior required for the new conversation tables:

- child rows keyed by `conversation_id` must use `onDelete: cascade` where the row has no meaning without the parent conversation:
  - `conversation_participants.conversation_id`
  - `conversation_messages.conversation_id`
  - `conversation_target_links.conversation_id`
  - `conversation_target_suppressions.conversation_id`
  - `conversation_read_states.conversation_id`
- child rows keyed by `message_id` must use `onDelete: cascade`:
  - `conversation_message_refs.message_id`
- `conversation_messages.run_id` must use `onDelete: set null` so existing heartbeat-run cleanup does not block message retention
- agent-scoped operational rows may use `onDelete: cascade` on `agent_id` because they represent live participation or derived state, not durable authorship:
  - `conversation_participants.agent_id`
  - `conversation_target_links.agent_id`
  - `conversation_target_suppressions.agent_id`
  - `agent_target_conversation_memory.agent_id`
  - `conversation_read_states.agent_id`
- durable historical authorship refs must not be silently cascaded away:
  - `conversation_messages.author_agent_id` remains a retained historical reference

Service-cleanup contract required in addition to FK behavior:

- `server/src/services/companies.ts` must explicitly delete the new conversation tables in dependency order during company removal, matching the repo's existing manual child-table cleanup pattern instead of relying only on FK cascades
- `server/src/services/agents.ts` must explicitly delete agent-scoped operational conversation rows during agent removal:
  - `conversation_participants`
  - `conversation_target_links`
  - `conversation_target_suppressions`
  - `agent_target_conversation_memory`
  - `conversation_read_states`
- `server/src/services/agents.ts` must reject hard agent deletion with a conflict if the agent is still referenced by retained historical conversation authorship in `conversation_messages.author_agent_id`
- agent termination remains the supported path for agents that still have durable conversation history in this version

### `cost_events` changes

This proposal requires extending the existing `cost_events` table.

Migration-order rule:

- create `conversations` before adding `cost_events.conversation_id`
- do not schedule this FK-backed column before the referenced conversation table exists

Add:

- `conversation_id` uuid fk `conversations.id` null

Keep existing fields:

- `issue_id`
- `project_id`
- `goal_id`
- `billing_code`

### `agent_wakeup_requests` changes

This proposal requires extending the existing `agent_wakeup_requests` table.

Migration-order rule:

- create `conversations` and `conversation_messages` before adding `agent_wakeup_requests.conversation_id` or `agent_wakeup_requests.conversation_message_id`
- do not schedule these FK-backed columns before the referenced conversation tables exist

Add:

- `conversation_id` uuid fk `conversations.id` null
- `conversation_message_id` uuid fk `conversation_messages.id` null
- `conversation_message_sequence` bigint null
- `response_mode` enum: `optional | required` null

`response_mode` is a first-class runtime contract field.
It must not live only in prose or only in adapter prompt text.

Constraint rules:

- `response_mode`, `conversation_message_id`, and `conversation_message_sequence` are required when `conversation_id` is set for a reply wake.
- non-conversation wakes must leave these fields null.

## Schema Notes

- create the eight new conversation tables as explicit schema modules in `packages/db/src/schema/*.ts`, following the repo's normal one-resource-per-file pattern rather than hiding them inside migration-only code
- Export all new tables from `packages/db/src/schema/index.ts`.
- Add shared enums and validators in `packages/shared`.
- Keep all query helpers company-scoped.
- Require same-company validation for conversation participants, linked targets, and read-state actors on every write path.
- Match the live schema's ID conventions: auth user ids and generic actor ids are `text`, not `uuid`.
- Extend `cost_events` instead of creating a second cost pipeline.
- Enforce creator and author truth tables with DB check constraints, not only in route or service code.
- Request-scoped writes must derive actor identity from the same `user | agent` mapping used by `getActorInfo(...)`.
- Activity-log writes for conversation mutations must use the same actor identity as the mutated row or write action.

## Shared API Contract

Conversation rollout must add concrete shared request/response contracts in the same style as existing goal and project resources.
Tables and routes alone are not sufficient for this plan.

Required shared files:

- `packages/shared/src/types/conversation.ts`
- `packages/shared/src/validators/conversation.ts`

Required shared type exports:

- `CreateConversation`
- `UpdateConversation`
- `AddConversationParticipant`
- `RemoveConversationParticipantParams`
- `ConversationActiveContextTarget`
- `CreateConversationMessage`
- `MarkConversationRead`
- `CreateConversationTargetLink`
- `DeleteConversationTargetLinkQuery`
- `DeleteConversationParticipantResult`
- `DeleteConversationTargetLinkResult`
- `ConversationParticipant`
- `ConversationReadState`
- `ConversationMessageRef`
- `ConversationMessage`
- `ConversationTargetLink`
- `LinkedConversationSummary`
- `ConversationCostSummary`
- `ConversationSummary`
- `ConversationDetail`
- `ConversationMessagePage`

Required shared validator exports:

- `createConversationSchema`
- `updateConversationSchema`
- `listConversationsQuerySchema`
- `addConversationParticipantSchema`
- `removeConversationParticipantParamsSchema`
- `createConversationMessageSchema`
- `listConversationMessagesQuerySchema`
- `markConversationReadSchema`
- `createConversationTargetLinkSchema`
- `deleteConversationTargetLinkQuerySchema`

Shared request/response rules:

- `GET /api/companies/:companyId/conversations` returns `ConversationSummary[]`
- `POST /api/companies/:companyId/conversations` accepts `CreateConversation` and returns `ConversationDetail`
- `GET /api/conversations/:conversationId` returns `ConversationDetail`
- `PATCH /api/conversations/:conversationId` accepts `UpdateConversation` and returns `ConversationDetail`
- `POST /api/conversations/:conversationId/participants` accepts `AddConversationParticipant` and returns `ConversationParticipant`
- `DELETE /api/conversations/:conversationId/participants/:agentId` validates `RemoveConversationParticipantParams` and returns `DeleteConversationParticipantResult`
- `GET /api/conversations/:conversationId/messages` returns `ConversationMessagePage`
- `POST /api/conversations/:conversationId/messages` accepts `CreateConversationMessage` and returns `ConversationMessage`
- `POST /api/conversations/:conversationId/read` accepts `MarkConversationRead` and returns `ConversationReadState`
- `POST /api/conversations/:conversationId/targets` accepts `CreateConversationTargetLink` and returns `ConversationTargetLink[]`
- `DELETE /api/conversations/:conversationId/targets?targetKind=...&targetId=...&agentIds=...` validates `DeleteConversationTargetLinkQuery` from query params and returns `DeleteConversationTargetLinkResult`
- target detail routes such as `GET /api/issues/:issueId/linked-conversations` return `LinkedConversationSummary[]`

Base retrieval query rules:

- `listConversationsQuerySchema` must define the base conversation-list query contract:
  - `status?: "active" | "archived" | "all"`
  - `limit?: number`
  - default `status = "active"`
  - default `limit = 50`
  - maximum `limit = 100`
  - server returns the list ordered by latest activity descending using the same stable ordering contract the UI list depends on:
    - primary sort `updatedAt desc`
    - tie-break `id desc`
- `listConversationMessagesQuerySchema` must define the base step-11 message-list contract separately from the step-22 deep-inspection modes:
  - `beforeSequence?: number`
  - `limit?: number`
  - default `limit = 50`
  - maximum `limit = 100`
  - `beforeSequence` is an exclusive upper bound for backward pagination
  - when `beforeSequence` is absent, the route returns the latest visible window of up to `limit` messages
  - returned `messages` are always sorted by `sequence asc` so the timeline can render without client-side reversal

Shared shape rules:

- `ConversationActiveContextTarget` must include:
  - `targetKind`
  - `targetId`
  - `displayText`
  - `targetKind` is limited to `issue | goal | project`
- `ConversationSummary` must include the fields the list UI depends on:
  - `id`
  - `companyId`
  - `title`
  - `status`
  - `participants`
  - `latestMessageSequence`
  - `latestMessageAt`
  - `unreadCount`
  - `createdAt`
  - `updatedAt`
  - `unreadCount` is the unread visible-message count for the requesting actor, not a boolean
- `ConversationDetail` must extend the list shape with:
  - `costSummary`
  - `viewerReadState`
  - `latestMessageSequence`
- `ConversationMessage` must include:
  - author identity fields
  - `runId`
  - normalized `refs`
  - `sequence`
  - `bodyMarkdown`
- `CreateConversationMessage` must include:
  - `bodyMarkdown`
  - `activeContextTargets`
  - `activeContextTargets` is required and may be an empty array
  - `activeContextTargets` is `ConversationActiveContextTarget[]`
  - `activeContextTargets` carries only target objects currently pinned in the active-context bar; agent-routing refs remain inline-only structured mentions in `bodyMarkdown`
- `ConversationMessagePage` must include:
  - `conversationId`
  - `messages`
  - `hasMoreBefore`
  - `hasMoreAfter`
  - `messages` sorted by `sequence asc`
  - `hasMoreBefore = true` when older visible messages exist before the first returned row
  - `hasMoreAfter = true` when newer visible messages exist after the last returned row
- `LinkedConversationSummary` must include the fields target pages use:
  - `id`
  - `title`
  - `participants`
  - `latestLinkedMessageId`
  - `latestLinkedMessageSequence`
  - `latestLinkedAt`
- `DeleteConversationParticipantResult` must include:
  - `removedParticipantId`
- `DeleteConversationTargetLinkResult` must include:
  - `removedCount`

Validator rules:

- validator input must be company-safe and concrete; do not use ad-hoc `Record<string, unknown>` request bodies for conversation routes once shared validators exist
- follow the current shared UI client convention for deletes: conversation delete routes in this rollout must use path params and query params, not JSON request bodies, unless the client layer is intentionally extended first
- `createConversationSchema` must reject creator-identity input fields and rely on authenticated actor derivation instead
- `createConversationMessageSchema` must validate:
  - `bodyMarkdown`
  - `activeContextTargets`
  - each `activeContextTargets[]` item as `{ targetKind, targetId, displayText }`
  - no duplicate active-context targets after normalization by `(targetKind, targetId)`
- `listConversationMessagesQuerySchema` is phased:
  - base delivery in step 11 must support only the default conversation message list route shape:
    - `beforeSequence`
    - `limit`
  - deep-inspection query modes are added in step 22
  - step-22 query modes are:
    - by target
    - by text search
    - by around-message window
- conversation request validators must use camelCase field names in the public API contract, matching existing shared validator style
- list/query validators must be shared between server routes and UI API clients where the repo already follows that pattern

## Mention Syntax and Parsing

### Supported structured mention schemes

- `agent://<agentId>`
- `issue://<issueId>`
- `goal://<goalId>`
- `project://<projectId>`

### Rules

1. Mentions are prefix-scoped. Valid prefixes are `@agent`, `@issue`, `@goal`, and `@project`.
2. The composer must emit structured markdown links after an item is selected.
3. The server must parse structured links on write and persist normalized message refs.
4. Routing and link creation must only use persisted message refs.
5. In conversations, raw text `@foo` has no routing, linking, notification, or wakeup side effects.
6. There is no `@company` mention because the conversation is already company-scoped.
7. `@agent` mentions are reply-routing refs only and never create conversation target links.
8. For issues, the UI can search by display identifier such as `PAP-123`, but the persisted mention target is the canonical UUID.
9. Reusing the shared markdown stack must remain surface-aware:
   - conversation surfaces run in structured-only mode
   - legacy issue-comment surfaces may keep their existing raw-mention behavior until a separate migration changes them

### Coexistence with existing issue mentions

The structured-mention requirement in this plan is scoped to conversations only.

- conversation routes, services, and UI flows must treat structured mentions and explicit manual-link actions as the only state-changing mention inputs
- conversation `MarkdownEditor` flows must not fall back to raw `@name` insertion for unselected agent/issue/goal/project mentions
- conversation `MarkdownBody` rendering must treat raw `@word` as plain text with no mention-chip or mention-highlight semantics
- the shared markdown editor/renderer/parser path must expose surface-aware behavior so conversation views can disable raw-mention fallback/highlighting while issue-comment views keep the current legacy behavior
- existing issue and issue-comment mention behavior remains unchanged in this rollout, including server-side raw `@` parsing in `server/src/services/issues.ts`
- existing issue mention wakeups and notifications must keep working during conversation rollout
- extending `MarkdownEditor`, `MarkdownBody`, and the shared mention parser for conversation tokens must not remove or reinterpret the current raw `@word` issue-comment rendering behavior unless a separate issue-mention migration plan explicitly replaces it
- if the repo later wants a unified structured-mention system for issues too, that must be a separate migration with its own compatibility plan

### Composer UX

The composer uses a two-stage mention flow:

1. Typing `@` opens a kind picker with:
   - `agent`
   - `issue`
   - `goal`
   - `project`
2. Selecting a kind, or typing a full prefix such as `@issue`, enters mention mode for that kind.
3. The second dropdown shows candidates for the selected kind.
4. Selecting a candidate inserts a structured mention token.

Each selected mention becomes both:

- an inline markdown token in the message body
- a typed chip in the active-context bar when it is a target-object mention

Target-object mention kinds are:

- `issue`
- `goal`
- `project`

Candidate sources:

- `@agent` uses current conversation participants only
- `@issue` uses company issue search
- `@goal` uses company goal search
- `@project` uses company project search

Frontend implementation rule:

- extend the existing markdown mention path used by `MarkdownEditor`, `MarkdownBody`, `packages/shared/src/project-mentions.ts`, and the existing mention styles in `ui/src/index.css`
- do not create a separate conversation-only markdown tokenizer, renderer, or mention-styling pipeline

### Manual target-link actions

Some links are created outside inline mention text.

Manual target-link actions are required for:

- optional explicit linking of existing conversations to issues, goals, or projects

Manual-link rules:

- `@agent` mentions never create conversation target links
- a manual link write must specify:
  - `targetKind`
  - `targetId`
  - `anchorMessageId`
  - `agentIds`
- `anchorMessageId` must belong to the same conversation and provides the initial `latest_linked_message_id` and `latest_linked_message_sequence`
- `agentIds` must be an explicit non-empty set of current conversation participants
- there is no implicit "all participants" server default for manual links
- a "link for all participants" UI action must expand to explicit `agentIds` before submitting
- one manual link write upserts one `conversation_target_links` row per selected `agent_id`
- a manual relink write must also delete any matching `conversation_target_suppressions` row for the same `(agent, conversation, target)`

Manual-unlink rules:

- a manual unlink write must specify:
  - `targetKind`
  - `targetId`
  - `agentIds`
- the unlink API carries those fields as query params on `DELETE /api/conversations/:conversationId/targets`, with repeated `agentIds` entries for multi-agent unlink
- unlink removes only the selected agent-scoped links
- unlink must also upsert one `conversation_target_suppressions` row per selected `agent_id`
- each suppression row must store `suppressed_through_message_sequence` as the highest matching historical target-stamped message sequence in that conversation at unlink time
- later derived-memory rebuilds must not recreate historical link context from suppressed messages
- a later manual relink for the same `(agent, conversation, target)` must clear the suppression row
- there is no implicit "unlink for all participants" server default

UI entry points:

- conversation detail page action: `Link target`
- target detail page action: `Link conversation`

## Message Routing

### General message

If a message contains no `agent://` mentions:

- all conversation participants are eligible responders
- each agent receives an optional-response wakeup
- each agent may respond or stay silent

### Targeted message

If a message contains one or more `agent://` mentions:

- only the mentioned agents are eligible responders
- each mentioned agent receives a required-response wakeup
- unmentioned participants are not woken for response

### Mixed mentions

If a message contains both agent mentions and target-object mentions:

- routing is determined only by `agent://` mentions
- conversation-to-target links and derived memory updates are created only for the routed agents

If a message contains target-object mentions but no agent mentions:

- conversation-to-target links and derived memory updates are created for all current conversation participants

## Conversation Reply Contract

Conversation reply behavior must be encoded in persisted wakeup data and promoted run context.
It must not be inferred only from prose, prompt wording, or adapter-specific heuristics.

### Wakeup write contract

For every conversation message that wakes an agent for reply, write an `agent_wakeup_requests` row with:

- `source = conversation_message`
- `reason = conversation_message`
- `conversation_id`
- `conversation_message_id`
- `conversation_message_sequence`
- `response_mode`
- `taskKey = conversation:<conversationId>` in the promoted run context

Reply-mode rules:

- general conversation wake -> `response_mode = optional`
- targeted `agent://` wake -> `response_mode = required`

Heartbeat source and policy rule:

- `conversation_message` is a first-class heartbeat invocation source
- `conversation_message` does not get its own heartbeat-policy flag in this plan
- conversation-message wakes are governed by the canonical `wakeOnSignal` policy flag
- `wakeOnDemand` and `wakeOnOnDemand` may remain only as temporary read-time aliases during migration and must not stay in the forward contract
- runtime docs, shared constants, validators, heartbeat service types, UI writers, and portability/import-export defaults must all agree on that mapping before feature implementation begins

### Wakeup coalescing contract

Conversation wakeups coalesce only within the same `(agent_id, conversation_id, taskKey)` scope.

When multiple queued or running conversation wakeups are merged:

- `required` wins over `optional`
- `conversation_message_sequence` advances to the newest triggering message
- `conversation_message_id` advances with that newest sequence
- `reason` stays `conversation_message`
- `conversationTargetKind` and `conversationTargetId` must be refreshed from the newest triggering message's `single-target` result
- if the newest triggering message is not `single-target`, clear `conversationTargetKind` and `conversationTargetId`
- the surviving queued or running conversation wake state becomes the only active reply-obligation state for that scope
- heartbeat must update that surviving active state so finalization reads:
  - newest `conversation_message_id`
  - newest `conversation_message_sequence`
  - merged `response_mode`
  - current `conversationTargetKind`
  - current `conversationTargetId`
- any separately inserted `coalesced` wakeup rows are audit records for the merged triggers and must not be treated as the active reply-obligation source at finalization time

### Promoted run context contract

When a conversation wakeup becomes a run, heartbeat must copy the persisted wakeup contract into `heartbeat_runs.contextSnapshot` using these fields:

- `taskKey`
- `wakeReason`
- `conversationId`
- `conversationMessageId`
- `conversationMessageSequence`
- `conversationResponseMode`
- `conversationTargetKind` when the triggering message is `single-target`
- `conversationTargetId` when the triggering message is `single-target`

`wakeReason` remains the generic trigger reason.
`conversationResponseMode` is the explicit reply-obligation field.
`conversationTargetKind` and `conversationTargetId` carry conversation-scoped target context and must not change task classification by themselves.

### Adapter context contract for conversation replies

Conversation reply runs must expose dedicated adapter context fields:

- `paperclipConversationId`
- `paperclipConversationMessageId`
- `paperclipConversationMessageSequence`
- `paperclipConversationResponseMode`
- `paperclipConversationTargetKind` when present
- `paperclipConversationTargetId` when present

If the adapter also uses environment variables, it must mirror those fields as:

- `PAPERCLIP_CONVERSATION_ID`
- `PAPERCLIP_CONVERSATION_MESSAGE_ID`
- `PAPERCLIP_CONVERSATION_MESSAGE_SEQUENCE`
- `PAPERCLIP_CONVERSATION_RESPONSE_MODE`
- `PAPERCLIP_CONVERSATION_TARGET_KIND` when present
- `PAPERCLIP_CONVERSATION_TARGET_ID` when present

### Reply completion contract

`required` means the run owes the conversation a direct reply.

Source of truth:

- required-reply satisfaction is derived from `conversation_messages.run_id`
- activity-log entries are audit mirrors and must not be the satisfaction source

A required conversation wake is only satisfied when one of these happens:

- the agent posts at least one new `conversation_messages` row with:
  - matching `conversation_id`
  - `author_type = agent`
  - `author_agent_id = run.agent_id`
  - `run_id = run.id`
  - `sequence > active required-trigger sequence`
- the run ends in a non-success terminal state such as `failed`, `cancelled`, or `timed_out`

Sequence rule:

- the `active required-trigger sequence` is the newest `conversation_message_sequence` from the surviving coalesced conversation wake state at finalization time
- a same-run agent reply only counts if it was posted after that active required-trigger sequence
- an earlier reply from the same run must not satisfy a later required trigger that was coalesced into the run afterward

Budget-enforcement rule:

- budget enforcement may pause the agent, but `paused` is an agent state, not a heartbeat-run terminal status
- this plan must only use the runtime's actual heartbeat run outcomes when defining reply completion behavior

`optional` allows a successful run to post no conversation reply.

### Required-reply execution contract

The executor must evaluate required-reply satisfaction before writing the final wakeup-request status.

Finalization rules:

- if `response_mode = optional` and the run outcome is `succeeded`, write wakeup status `completed`
- if `response_mode = required` and the run outcome is `succeeded` and the reply-satisfaction rule is met, write wakeup status `completed`
- if `response_mode = required` and the run outcome is `succeeded` but no matching reply row exists:
  - keep the heartbeat run status as `succeeded`
  - write the wakeup-request status as `failed`
  - write wakeup error text `required_reply_missing`
  - append a system run event explaining that the run succeeded without satisfying a required reply
  - do not auto-enqueue a retry from the same finalization path
- if the run outcome is `failed`, `cancelled`, or `timed_out`, reuse the existing non-success wakeup finalization path

Remediation rule:

- a `required_reply_missing` wakeup failure is surfaced for operator/manual follow-up
- the next user message or a manual retry may create a new wakeup, but the executor must not silently convert a success-without-reply into `completed`
- finalization must evaluate the latest surviving coalesced trigger state, not only the original wakeup request values from when the run first started

## Active Context and Target Stamping

### Active context rules

1. Target-object mentions add chips to the active-context bar.
2. Active context persists for subsequent messages until the user changes it.
3. The user can clear one chip or clear all chips.
4. Sending a message with active context but no inline entity mention still stamps that message with the active target set.
5. Message refs for target objects are the union of:
   - inline structured target-object mentions
   - active-context target objects in effect at send time
6. Agent refs only come from inline agent mentions and are routing-only refs.
7. The union above is distinct by `(message_id, ref_kind, target_id)` after normalization.

### Target-stamping rules

When a message is created:

1. Treat `CreateConversationMessage.activeContextTargets` as the explicit active-context target set in effect at send time.
2. Persist normalized and deduplicated `conversation_message_refs` rows.
3. Determine affected agents:
   - mentioned agents if any `agent://` refs exist
   - otherwise all current conversation participants
4. For each target-object ref and each affected agent:
   - upsert `conversation_target_links`
   - update `latest_linked_message_id`
   - update `latest_linked_message_sequence`
   - preserve first-write audit fields on existing rows
4. Rebuild `agent_target_conversation_memory` for each affected `(agent, target)` pair.

### Participant-add history rules

When an agent is added to an existing conversation:

1. Insert the `conversation_participants` row first.
2. Grant the added agent normal read access to the existing conversation history after the membership change commits.
3. Do not create `conversation_target_links` or rebuild `agent_target_conversation_memory` from pre-add historical messages automatically.

History-linking guardrails:

- participant add is a visibility change, not an automatic historical target-linking operation
- historical target-stamped messages must not create agent-scoped links for a newly added participant unless a later explicit manual link/relink action selects that agent
- future messages sent after the participant is added may create normal routed target links for that agent under the standard message-routing rules
- manual links created before the agent was added must not be replayed onto the newly added agent automatically
- participant add must not enqueue retroactive reply wakes for old messages
- participant add must not recreate historical required-reply obligations
- if an agent is removed and later re-added, the re-add follows the same rule: historical target links are not recreated automatically
- retained `conversation_target_suppressions` rows must still be honored if a later manual relink or future message creates a fresh active link

## De-noising Strategy

Conversations are allowed to be multi-topic.
De-noising comes from explicit target stamping and derived agent-target conversation memory.

### Derived memory compiler contract

Named sets:

- `linked conversation set` = distinct conversations from `conversation_target_links` for `(agent = A, target = T)`
- `linked message set` = distinct messages reached by matching `conversation_message_refs` for target `T` within the linked conversation set after applying any matching `conversation_target_suppressions` cutoff for `(agent = A, conversation, target = T)`
- `source message set` = linked message set after whitespace normalization and empty-body filtering, ordered for compilation

For agent `A` and target `T`:

1. Load the `linked conversation set` from `conversation_target_links` for `(agent = A, target = T)`.
2. Within those conversations, load all distinct `conversation_message_refs` for target `T`, apply any matching suppression cutoff for `(A, conversation, T)`, and derive the `linked message set`.
3. From those refs, collect the corresponding `source message set` in stable order by:
   - `created_at`
   - `conversation_id`
   - `sequence`
4. Drop empty message bodies after whitespace normalization to finalize the `source message set`.
5. Compile one deterministic markdown memory for `(agent = A, target = T)`.
6. Persist that result in `agent_target_conversation_memory`.

Persistence rules:

- persist `linked_conversation_count = size(linked conversation set)`
- persist `linked_message_count = size(linked message set)`
- persist `source_message_count = size(source message set)`
- derive `last_source_message_sequence` from the highest sequence in the source message set
- derive `latest_source_message_at` from the newest timestamp in the source message set
- if the source message set is empty, persist zero counts and clear `latest_source_message_at`

Initial implementation rule for this proposal:

- rebuild the full compiled memory for the affected `(agent, target)` on each relevant new message
- use a deterministic server-side compiler, not an adapter-side or model-side summarizer
- do not introduce incremental segment maintenance
- do not introduce transcript chunking or ranking as the default path

### Derived memory output contract

In this proposal, derived memory is not a free-form model summary.
It is a deterministic compiled artifact with a fixed shape.

Each `agent_target_conversation_memory.memory_markdown` must render these sections in this order:

1. `Linked conversations`
2. `Relevant target-stamped messages`
3. `Overflow`

Section rules:

- `Linked conversations` lists every linked conversation for `(agent, target)` with:
  - conversation title
  - conversation id
  - latest linked message sequence
  - latest linked activity timestamp when available
- `Relevant target-stamped messages` includes normalized excerpts from source messages with:
  - conversation title
  - message sequence
  - author label
  - timestamp
  - body excerpt
- `Overflow` states how many older source messages were omitted from the default compiled memory, if any

Compiler rules:

- only target-stamped source messages for `(agent, target)` are eligible input
- messages unrelated to target `T` are excluded even if they are in a linked conversation
- ref-based counts and compiler input must treat refs as distinct by `(message_id, ref_kind, target_id)`
- `linked_message_count` must count distinct messages before empty-body filtering
- `source_message_count` must count distinct messages after empty-body filtering and before prompt-size truncation
- preserve stable ordering so rebuilds are deterministic for the same source set
- cap `memory_markdown` to a fixed prompt-safe size and report omitted-message count in `Overflow`
- stored counters must be derived from the named sets above, not only from the rendered excerpt set

### Target-run retrieval rules

When agent `A` runs on target `T`:

1. Resolve the canonical target key and target kind.
2. Load `agent_target_conversation_memory` for `(agent = A, target = T)`.
3. Load linked conversation metadata from `conversation_target_links` for `(agent = A, target = T)`.
4. Inject derived memory into the target run context.
5. Expose linked conversation ids and titles so the agent can inspect raw conversation detail only when needed.

### Prompt-budget rules

- Inject only derived conversation memory by default.
- Never inject raw full-conversation transcript by default.
- Include linked conversation metadata, not transcript excerpts, in the default target context.

### Detailed inspection rules

If the agent needs exact raw context:

1. The agent inspects one of the linked conversations.
2. The agent can filter conversation messages by target.
3. The agent can search within the conversation by text.
4. The agent can request a window of messages around a matched message.

## Cost Attribution

Conversation runs must participate in the existing Paperclip cost pipeline.
They must not create a parallel budgeting or accounting system.

### Cost-event dimension

Add `cost_events.conversation_id` as the reporting dimension for conversation-scoped runs.

Conversation-run cost attribution rules:

1. Every conversation-scoped run writes a normal `cost_events` row.
2. That row must always include:
   - `company_id`
   - `agent_id`
   - `conversation_id`
3. That row may also include one or more existing target dimensions when the run is explicitly target-scoped:
   - `issue_id`
   - `project_id`
   - `goal_id`
4. If a conversation run is general and not scoped to one concrete target, `conversation_id` is the only work-context dimension on the cost event.

### Budget-control rule

Budget enforcement remains unchanged in shape:

- company and agent budgets still apply to all usage
- conversation runs count fully toward those budgets

`conversation_id` is a reporting dimension, not a budget silo.

### Reporting rule

Conversation costs must be visible in:

- per-agent cost views
- company cost views
- conversation detail views

Conversation detail API rule:

- this plan uses an embedded conversation cost summary on `GET /api/conversations/:conversationId`
- do not add a separate conversation-cost endpoint in this version
- the embedded summary must be derived from `cost_events` rows where `conversation_id = :conversationId`
- the embedded summary must include at least:
  - `spendCents`
  - `inputTokens`
  - `outputTokens`
  - `runCount`
  - `lastOccurredAt`

Existing cost-rollup alignment rule:

- target-dimension-stamped `cost_events` are the authoritative reporting model for this plan
- because the current `byProject` rollup still derives from `heartbeat_runs` plus issue activity instead of `cost_events.project_id`, the rollout must update the existing cost service and any dependent project cost views to use authoritative stamped `cost_events` dimensions
- do not treat conversation cost support as complete if `GET /api/conversations/:conversationId` uses `cost_events` but existing project target rollups still bypass them

Target rollups only include conversation-run cost when the cost event is explicitly stamped with that target's existing dimension.

### Target attribution rule

Do not guess target attribution for a multi-topic conversation run.

Only stamp existing target dimensions on a conversation-run cost event when the run is `single-target` by the conversation-run target-scope contract, for example:

- replying to a triggering message whose persisted refs resolve to exactly one `issue`

If the run is not single-target, do not populate `issue_id`, `project_id`, or `goal_id`.

### Derived-memory rebuild cost

The initial derived-memory compiler is a deterministic local transform.
It does not create model-usage cost events.

If a later proposal replaces the compiler with a model-backed transform, that proposal must define its own cost contract before implementation.

### Runtime writer changes

Heartbeat cost writing must be updated so conversation-scoped runs pass conversation context into `costService.createEvent(...)`.
The runtime must not drop conversation context when recording token usage.

## Runtime Integration

### Conversation runs

When a conversation message wakes agents for reply:

- use `taskKey = conversation:<conversationId>`
- conversation runs read and update the conversation task session for that agent
- propagate the conversation reply contract into run context and adapter context

### Direct work from conversation runs

Conversation runs may perform lightweight direct work without forcing issue creation first.

Allowed conversation-run work:

- read files
- edit files
- run commands
- generate artifacts
- create a new issue through the existing company-scoped issue-create API
- reply with results in the conversation

Conversation-run guardrails:

- conversation runs keep cost, run history, and session continuity on the conversation
- conversation runs must not implicitly check out issues, transition issue status, or otherwise replace issue-lifecycle flows
- lightweight direct conversation work is a bounded exception, not a second general-purpose tracked-work system
- if the work becomes substantial, long-running, or should be tracked across the org, the agent should recommend or create an issue instead of continuing only in the conversation

Target-scope source of truth:

- determine conversation-run target scope only from the triggering `conversation_message_id`
- load that message's persisted `conversation_message_refs`
- apply the `Conversation run target scope` rules above
- do not infer target scope from older messages, conversation-level links, or raw markdown text

Issue-target safety rule:

- a conversation-scoped run with one issue target may promote that issue only as conversation target context for workspace and cost purposes
- it must not enter the issue execution-lock path, issue-scoped coalescing path, or issue lifecycle path that the runtime uses for true issue task runs
- the executor must continue to classify the run by `taskKey = conversation:<conversationId>`, not by the presence of a promoted issue target
- conversation runs must never advertise top-level issue scope in generic run context
- conversation runs must not set top-level `issueId`, `taskId`, or `issueIds` solely because the triggering message is a single-target issue conversation
- top-level `issueId`, `taskId`, and `issueIds` remain reserved for true issue-task run context in this plan
- implementation must not rely on top-level `context.issueId` as the pre-lock signal for conversation runs
- if heartbeat needs an issue id to reuse workspace resolution, it must use `conversationTargetKind = issue` plus `conversationTargetId = <issueId>` and apply that only after conversation-vs-issue task classification has already been decided
- generic run listings, inboxes, activity joins, and retry/resume payload builders must treat `conversationTargetKind` / `conversationTargetId` as conversation-only context and must not reinterpret them as issue-run scope

Workspace-selection rule for conversation runs:

- reuse the existing workspace-resolution path in heartbeat
- if the conversation run is `single-target` and the target is an `issue`, reuse the existing issue/project workspace resolution from a conversation-target-specific issue field without converting the run into issue execution scope
- if the conversation run is `single-target` and the target is a `project`, set `context.projectId` and reuse the existing project workspace resolution for that conversation run only; this does not introduce a standalone project-run producer
- if the conversation run is `single-target` and the target is a `goal`, keep that target only as context and do not select a workspace from it; this plan does not introduce a standalone goal-run producer
- if the conversation run is not `single-target`, use the existing agent-default or prior-session fallback workspace path
- do not invent a new conversation-specific workspace model in this version

Output rule:

- direct work performed from a conversation is reported back into the conversation
- issue comments, issue checkout, and issue status transitions remain issue-run behaviors, not default conversation-run behaviors
- conversation runs may still produce files, diffs, commands, or artifacts without creating an issue first
- issue execution lock, issue-run coalescing, and issue lifecycle mutations remain reserved for `issue:<issueId>` task runs
- conversation runs must not appear in issue-run lists or issue-driven inbox surfaces only because they have a promoted conversation issue target

### Issue creation from conversation runs

Conversation runs may explicitly create a new issue when the user asks to turn conversation work into tracked work.

Route rule:

- reuse the existing issue-create route: `POST /api/companies/:companyId/issues`
- do not add a conversation-specific issue-create route in this plan

State-change rule:

- raw conversation text such as `create a new issue for this` may guide the model to call the issue-create API
- that raw text alone does not create any durable Paperclip link state
- the durable conversation-to-issue link is created only when the created issue is later referenced through the normal structured-mention path

Conversation follow-up rule:

- after a conversation-scoped run creates an issue, it should post a conversation reply that includes a structured mention of the created issue
- that reply reuses the normal `conversation_message_refs` and `conversation_target_links` path
- this plan intentionally reuses structured-mention linking instead of adding a second hidden auto-link path on issue creation

Lifecycle rule:

- once created, the new issue follows the normal issue lifecycle, assignment, checkout, approval, and activity rules
- conversation creation of an issue is an entry point into the existing issue system, not a parallel issue model

### Work runs

When an agent runs on an issue, goal, or project:

- use the canonical target task key
- load derived `agent_target_conversation_memory` for that agent and target
- load linked conversation metadata for that agent and target
- inject derived conversation memory into the adapter context
- do not resume the conversation session

### Manual retry and resume contract

Manual retry and resume flows must preserve conversation scope when the source run was conversation-scoped.

Carry-forward rules for cloning a prior run:

- always carry forward `taskKey` when present
- if the source run context is conversation-scoped, also carry forward:
  - `conversationId`
  - `conversationMessageId`
  - `conversationMessageSequence`
  - `conversationResponseMode`
- if the source run context is not conversation-scoped, do not invent conversation fields

Implementation note:

- update the current run-detail retry and resume payload builders to preserve the conversation fields above in addition to existing issue/task/comment context

### Adapter context contract

Conversation reply runs use dedicated reply-contract fields:

- `paperclipConversationId`
- `paperclipConversationMessageId`
- `paperclipConversationMessageSequence`
- `paperclipConversationResponseMode`

Tracked-work runs use dedicated linked-conversation context fields:

- `paperclipLinkedConversationMemoryMarkdown`
- `paperclipLinkedConversationRefs`

Current runtime note:

- in the current repo, this applies concretely to issue-scoped work runs
- goal/project-linked context is part of the shared contract so future explicit work-run producers can reuse it, but this plan does not assume existing standalone goal/project wakeup flows

These fields are separate from any session-rotation handoff and must not be overloaded for the other run type.

Prompt order should be:

1. adapter bootstrap/instructions
2. session handoff if present
3. linked conversation memory if present
4. core run prompt

### Adapter rollout contract

Conversation support requires code changes in every shipped adapter execute path, not only shared heartbeat code or adapter docs.

Required adapter files in scope:

- `server/src/adapters/registry.ts`
- `server/src/adapters/process/execute.ts`
- `server/src/adapters/http/execute.ts`
- `docs/adapters/http.md`
- `packages/adapter-utils/src/server-utils.ts`
- `packages/adapters/claude-local/src/server/execute.ts`
- `packages/adapters/codex-local/src/server/execute.ts`
- `packages/adapters/cursor-local/src/server/execute.ts`
- `packages/adapters/gemini-local/src/server/execute.ts`
- `packages/adapters/opencode-local/src/server/execute.ts`
- `packages/adapters/pi-local/src/server/execute.ts`
- `packages/adapters/openclaw-gateway/src/server/execute.ts`

The `hermes_local` adapter is registered through `server/src/adapters/registry.ts` from an external package, and this rollout treats it as internal/server-only. Its registry integration still must be updated and verified here, but it is not part of the public shared/UI adapter option set or the public `doc/SPEC.md` adapter list unless a separate rollout adds full UI/public support.

Each adapter must:

- treat canonical `taskKey` as the primary scope field
- stop describing bare `taskId` and `issueId` fallback as the forward contract after migration
- pass through conversation reply env/context fields
- pass through linked conversation memory/context fields for issue, goal, and project runs
- preserve manual retry/resume carried-forward conversation scope when present

Built-in adapter-specific rules:

- the built-in `process` adapter rollout includes updating `packages/adapter-utils/src/server-utils.ts` so canonical conversation env vars are available through the standard Paperclip env builder rather than only through local-adapter prompt shaping
- the built-in `http` adapter rollout includes forwarding canonical conversation context fields in the serialized `context` payload so HTTP adapters receive the same conversation contract as other shipped adapters
- public adapter-set cleanup in the same rollout must also keep UI page/property displays and adapter-package metadata aligned with the shared/server identifier contract, including `ui/src/pages/Agents.tsx`, `ui/src/pages/OrgChart.tsx`, `ui/src/components/AgentProperties.tsx`, `ui/src/adapters/gemini-local/index.ts`, and `packages/adapters/gemini-local/src/index.ts`

OpenClaw-specific rule:

- replace the current `fixed | issue | run` session-key strategy contract with `fixed | task_key | run`
- extend the OpenClaw wake payload so `taskKey` is carried explicitly as the canonical scope field
- make `task_key` the forward-contract strategy for task-scoped sessions
- resolve OpenClaw task-key session keys as `paperclip:${taskKey}`
- after the issue task-key migration, that mapping preserves existing issue-scoped OpenClaw session keys because:
  - canonical issue task key = `issue:<issueId>`
  - OpenClaw task-key session key = `paperclip:${taskKey}`
  - resulting issue session key = `paperclip:issue:<issueId>`, which matches the existing issue-scoped key shape
- conversation task keys then map naturally to `paperclip:conversation:<conversationId>`
- stop using `issueId` as the session-routing source for OpenClaw once the task-key migration lands
- migrate existing OpenClaw adapter config values that still say `sessionKeyStrategy = issue` to `task_key` as part of the adapter rollout
- update OpenClaw onboarding and config-generation surfaces so they stop producing `sessionKeyStrategy = issue` after the migration:
  - exported adapter configuration docs and defaults in the OpenClaw adapter package entrypoint
  - access-route payload builders and examples
  - OpenClaw UI create-config builder defaults
  - OpenClaw adapter config fields and dropdown/default values
  - OpenClaw README examples and setup docs
  - OpenClaw onboarding and test-plan docs
- rewrite OpenClaw wake text and standard payload generation so task behavior branches by canonical `taskKey` prefix instead of assuming issue work from `taskId` or `issueId`
- only `issue:<issueId>` task runs may use issue checkout/comment/status instructions by default
- `conversation:<conversationId>` runs must use conversation routes and must not imply issue checkout or issue status mutation
- OpenClaw rollout is not complete while any supported onboarding, adapter-doc, or config UI surface still emits `sessionKeyStrategy = issue`

## API Surface

### Board-facing routes

- `GET /api/companies/:companyId/conversations`
- `POST /api/companies/:companyId/conversations`
- `GET /api/conversations/:conversationId`
- `PATCH /api/conversations/:conversationId`
- `POST /api/conversations/:conversationId/participants`
- `DELETE /api/conversations/:conversationId/participants/:agentId`
- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/read`

Conversation detail route contract:

- `GET /api/conversations/:conversationId` must embed `costSummary`
- `costSummary` is the conversation-detail reporting surface for this plan
- do not add a separate `GET /api/conversations/:conversationId/costs` route in this version

Conversation creation route contract:

- `POST /api/companies/:companyId/conversations` is board-only in this version
- the create payload does not accept creator identity fields; the server derives conversation creator identity from the current board actor's `userId` text
- agent callers must receive a permission error if they attempt to create conversations directly

Participant route contract:

- `POST /api/conversations/:conversationId/participants` must add membership without auto-linking historical target context
- adding a participant grants conversation-history visibility only; it must not create `conversation_target_links` or `agent_target_conversation_memory` from older messages automatically
- historical target context for the added agent may be attached later only by future routed messages or an explicit manual link/relink action
- participant add must not enqueue retroactive reply wakes for older messages
- `DELETE /api/conversations/:conversationId/participants/:agentId` must revoke reply obligations by cancelling outstanding conversation-scoped wakeups and runs for that same `(agent, conversation)` scope

### Target routes

Expose linked conversation metadata on target detail pages.

Examples:

- `GET /api/issues/:issueId/linked-conversations`
- `GET /api/goals/:goalId/linked-conversations`
- `GET /api/projects/:projectId/linked-conversations`

Visibility rule:

- target-linked conversation routes must return only conversations visible to the requesting actor
- board users may see all same-company linked conversations
- agents may see only linked conversations where:
  - they are participants, and
  - `conversation_target_links.agent_id = requesting_agent_id`
- these routes must not leak hidden conversation ids, titles, or activity metadata through target pages

### Conversation detail routes

Expose detailed linked-conversation inspection without making it the default work path.

Base route delivery for step 11:

- `GET /api/conversations/:conversationId/messages`
- `POST /api/conversations/:conversationId/targets`
- `DELETE /api/conversations/:conversationId/targets?targetKind=...&targetId=...&agentIds=...`

Base message-route contract for step 11:

- `GET /api/conversations/:conversationId/messages` accepts only:
  - `limit`
  - `beforeSequence`
- default behavior with no query params:
  - return the latest visible window of up to `50` messages
  - order returned `messages` by `sequence asc`
  - set `hasMoreBefore` if older visible messages exist
  - set `hasMoreAfter = false`
- backward pagination behavior:
  - `beforeSequence` pages older messages using an exclusive upper bound
  - still return `messages` ordered by `sequence asc`
  - set `hasMoreBefore` if still older visible messages remain
  - set `hasMoreAfter` if newer visible messages exist after the returned window
- maximum `limit = 100`

Deep-inspection extensions delivered in step 22:

- `GET /api/conversations/:conversationId/messages?targetKind=issue&targetId=...`
- `GET /api/conversations/:conversationId/messages?q=...`
- `GET /api/conversations/:conversationId/messages?aroundMessageId=...&before=...&after=...`

Manual target-link route contract:

- `POST /api/conversations/:conversationId/targets` must require:
  - `targetKind`
  - `targetId`
  - `anchorMessageId`
  - `agentIds`
- `DELETE /api/conversations/:conversationId/targets` must require query params:
  - `targetKind`
  - `targetId`
  - `agentIds`
- for multi-agent unlink, `agentIds` must be encoded as repeated query params rather than a JSON delete body
- these routes operate only on the selected agent-scoped links; they must not apply to unspecified participants

### Realtime contract

Conversation realtime uses the existing company live-event transport.
It does not add a second websocket system.

- continue using the existing company live websocket path
- add dedicated `conversation.*` live event types to that transport
- keep `activity.logged` as the generic company activity-feed event after filtering is in place
- do not use filtered `activity.logged` as the primary realtime contract for conversation list/detail views

Audience metadata contract:

- the base `LiveEvent` envelope in `packages/shared/src/types/live.ts` must gain an `audience` object
- `audience.scope` is:
  - `"company"` for company-visible events
  - `"conversationParticipants"` for participant-scoped conversation events
- `audience.conversationId` is:
  - `null` for company-visible events
  - the relevant `conversationId` for participant-scoped conversation events
- `audience.participantAgentIds` is:
  - `null` for company-visible events
  - the committed participant agent id set for participant-scoped conversation events
- audience metadata lives on the transport envelope, not inside event-specific payloads, so all delivery paths can filter before inspecting event-specific payload fields

### Existing resource routes used by the composer

The conversation composer does not use a generic lookup route.
It uses type-specific routes after the user selects a mention prefix.

- `GET /api/companies/:companyId/issues?q=...`
- `GET /api/companies/:companyId/goals?q=...`
- `GET /api/companies/:companyId/projects?q=...`

### Existing work routes reused by conversation actions

Conversation actions should reuse existing work-object routes when they need to create tracked work.

- `POST /api/companies/:companyId/issues`

Route changes required:

- add `q` support to goals list
- add `q` support to projects list

Route rule:

- list and create routes must be company-scoped under `/api/companies/:companyId/...`
- direct object routes may stay on `/api/<resource>/:id` when the object id is globally unique and company access is still enforced after lookup
- `assertCompanyAccess` alone is not sufficient for any route that returns conversation metadata
- add a conversation-visibility check for direct conversation routes and linked-conversation target routes
- add an agent-link-scope check for agent-facing linked-conversation target routes
- generic company activity routes must filter conversation activity by conversation participation for agent callers

## Service Responsibilities

### Conversation service

- conversation CRUD
- participant membership
- derive `conversations.created_by_user_id` from the current board actor's `userId` text on create
- reject agent-authenticated conversation creation in this version
- participant add grants history visibility without auto-linking historical target context
- message creation
- atomic per-conversation message sequence allocation using `conversations.last_message_sequence`
- attach `run_id` to agent-authored messages created from a heartbeat run
- message-ref extraction
- target-link upserts
- manual target-link creation and removal
- suppression-row upserts and clears for manual unlink/relink flows
- read state updates
- participant-removal cleanup for links, read state, sessions, and derived memory
- do not create retroactive reply wakes or required-reply obligations during participant add
- reject any participant, target, or actor that does not belong to the conversation's `company_id`
- enforce actor-visible conversation filtering for conversation lookups and linked-conversation route responses
- enforce `conversation_target_links.agent_id = requesting_agent_id` on agent-facing linked-conversation target responses
- validate that manual link `agentIds` are explicit, non-empty, unique, current conversation participants
- upsert or delete manual links only for the selected `agentIds`
- clear matching suppression rows on manual relink writes
- support conversation replies that mention newly created issues so linking reuses the normal structured-mention path
- load embedded conversation detail cost summary for `GET /api/conversations/:conversationId`

### Issue service integration

- reuse the existing issue create service and route for issue creation initiated from a conversation run
- preserve normal issue actor attribution, activity logging, and assignment checks
- do not add a separate conversation-only issue persistence path

### Conversation memory service

- rebuild `agent_target_conversation_memory`
- compile deterministic memory markdown from target-stamped source messages
- apply `conversation_target_suppressions` cutoffs before compiling linked/source message sets
- list linked conversations for a target filtered to:
  - the requesting actor's conversation visibility, and
  - `conversation_target_links.agent_id = requesting_agent_id` for agent callers
- fetch detailed conversation context for a target
- fetch message windows around an anchor or search match
- delete or rebuild agent-target memory when participant removal or manual unlink removes the last relevant link
- keep suppression rows intact across participant removal so later manual relink or future target-stamped messages still respect prior manual unlinks until the suppression row is cleared

### Heartbeat service

- wake agents for conversation messages
- persist and coalesce `response_mode` and conversation trigger-message fields
- use canonical task keys
- accept and preserve carried-forward conversation scope on manual retry and resume wakeups
- keep conversation-scoped runs out of the issue execution-lock and issue-run coalescing paths even when a single-target issue is promoted for workspace context
- cancel queued or running conversation-scoped wakeups/runs when participant removal revokes that agent's access to the conversation
- load derived conversation memory and linked conversation metadata during work runs
- inject `paperclipLinkedConversationMemoryMarkdown`
- propagate conversation reply fields into run context and adapter context
- enforce the `required_reply_missing` wakeup-failure path for succeeded runs that owed a required reply

### Activity and live-delivery services

- store conversation activity in the existing `activity_log` table
- filter company activity queries so agent callers only see conversation activity for conversations they currently participate in
- attach audience metadata to the base `LiveEvent` envelope for conversation-scoped events
- own the actor-aware live-event filtering rule in `server/src/services/live-events.ts`
- expose a filtered actor-aware subscription path for board, agent, websocket, and direct-subscriber delivery
- filter company live-event delivery so agent subscribers only receive conversation-scoped events for conversations they currently participate in
- keep board delivery company-wide
- publish dedicated `conversation.*` live events with the typed payload contract above
- keep `activity.logged` as the generic company activity-feed event, not the primary conversation realtime contract
- `server/src/realtime/live-events-ws.ts` and direct live-event subscribers such as `server/src/services/plugin-host-services.ts` must consume that filtered actor-aware stream or apply equivalent audience checks before forwarding events
- keep conversation actions out of the plugin event bus in this rollout; do not add `conversation.*` actions to `PLUGIN_EVENT_TYPES` or forward them from `logActivity` until a separate plugin audience/privacy contract exists for participant-scoped conversation events

### Cost service integration

- extend the existing cost service with conversation-summary aggregation from `cost_events`
- align existing target rollups that this plan relies on, especially project rollups, so they derive from authoritative stamped `cost_events` dimensions rather than bypassing them through `heartbeat_runs` plus activity joins
- support embedding that summary into `GET /api/conversations/:conversationId`
- do not add a separate conversation-only cost pipeline or conversation-only cost route in this version

## UI Requirements

### Conversation list

- show conversation title
- show participant agents
- show unread count as unread visible-message count for that conversation
- show latest activity time
- realtime updates from dedicated `conversation.*` live events
- do not treat conversation unread as part of the inbox/sidebar unresolved badge in this rollout

### Conversation detail

- message timeline
- message author identity
- structured mention chips
- active-context bar
- link-target action
- participant list
- cost summary section
- realtime updates from dedicated `conversation.*` live events
- loading and error states

### Composer

- typed mention picker
- mixed search results with type badges
- active-context chips
- clear-context controls
- submit disabled only on actual invalid state

### Target pages

- show linked conversations section
- show only actor-visible linked conversation ids, titles, and latest linked activity
- for agent viewers, show only links created for that same agent
- allow navigation from issue/goal/project views to linked conversations
- include link-conversation action for manual target linking

## Auth and Permissions

- Board users can create conversations and manage participants within their company.
- Agents cannot create conversations directly in this version.
- Board users retain company-scoped visibility across conversations in their company.
- Agents can read conversations only if they are participants and in the same company.
- Agents can post only in conversations where they are participants.
- Board users may create or remove manual target links for any selected participant set in the same conversation and company.
- Agents may create or remove manual target links only for themselves and only in conversations where they are participants.
- Participant-scoped conversation access is an intentional exception to any broader same-company visibility rules that still apply to other object types.
- Target pages and linked-conversation APIs must apply both:
  - participant-scoped conversation visibility, and
  - `conversation_target_links.agent_id = requesting_agent_id` for agent-facing target queries
- Cross-company conversation access is forbidden.
- Cross-company mention targets are forbidden.
- All routes must enforce company access before returning metadata.

## Participant Removal Cleanup

Removing a participant must revoke both direct conversation access and any future target-context injection that came from that conversation for that agent.

Cleanup rules on participant removal:

1. Delete the participant row from `conversation_participants`.
2. Delete that agent's `conversation_read_states` row for the conversation.
3. Delete that agent's `conversation_target_links` rows for the conversation.
4. Cancel outstanding conversation-scoped `agent_wakeup_requests` and heartbeat runs for that same `(agent, conversation)` scope.
5. Clear that agent's conversation task session for `conversation:<conversationId>` using the existing task-session clearing path.
6. Collect affected `(agent, target)` pairs from the deleted links.
7. For each affected `(agent, target)` pair:
   - rebuild `agent_target_conversation_memory` from remaining links, or
   - delete the memory row if no links remain

Suppression-retention rule:

- participant removal must not delete `conversation_target_suppressions`
- if that agent is later re-added, any later manual relink or future target-stamped messages must still honor the retained suppression cutoffs until the suppression row is explicitly cleared

Wake and run cancellation rules:

- queued `agent_wakeup_requests` for that `(agent, conversation)` scope must be marked `cancelled`
- queued `heartbeat_runs` for `taskKey = conversation:<conversationId>` and that agent must be cancelled before start
- running conversation-scoped runs for that `(agent, conversation)` scope must be cancelled through the existing run-cancel path
- cancellation reason should be recorded as `conversation_participant_removed`
- any outstanding required-reply obligation for that `(agent, conversation)` scope is extinguished by this cancellation path and must not later finalize as `required_reply_missing`
- after participant removal commits, any conversation message write attempted by that run must be rejected even if the process has not fully stopped yet
- this cancellation rule applies only to conversation-scoped runs for that conversation, not to unrelated issue/goal/project runs that merely used past conversation context

Read-path safety rule:

- work-run retrieval must treat current `conversation_target_links` as the source of truth
- stale derived-memory rows with no current links must not be injected into future target runs

Access rule after removal:

- a removed agent immediately loses conversation detail access
- a removed agent must no longer see that conversation on linked-conversation target pages
- a removed agent must no longer receive conversation-scoped live events or activity rows

## Activity Logging

Write activity log entries for:

- conversation created
- conversation archived
- participant added
- participant removed
- message posted
- context link created
- context link removed

Activity-log linkage rule:

- when a conversation message is created from a heartbeat run, the matching `conversation.message_posted` activity row must copy that same `run_id`
- this mirrors the message source for auditability, but required-reply satisfaction still reads from `conversation_messages.run_id`

Conversation activity visibility rule:

- conversation activity remains stored in `activity_log`, but it is not implicitly company-public
- board users may see all same-company conversation activity
- agents may see conversation activity only when they are current participants in that conversation
- generic company activity feeds must filter conversation activity rows by participation before returning them to agents

Conversation live-delivery rule:

- conversation activity and conversation-scoped live events must not be blindly broadcast to all same-company subscribers
- delivery must be audience-aware:
  - board subscribers may receive all same-company conversation events
  - agent subscribers may receive conversation events only when they are current participants in that conversation
- extend the existing company live-event path with conversation-aware filtering rather than creating a second realtime transport
- generic `activity.logged` fanout is forbidden for conversation events until audience-aware filtering is in place

Filtering ownership rule:

- `server/src/services/live-events.ts` is the authoritative filtering layer for live delivery in this rollout
- publishers must attach audience metadata there after the underlying mutation commits and after the final participant set is known
- delivery consumers must not implement their own ad-hoc conversation visibility rules as the primary contract; they must consume the filtered actor-aware subscription path defined by the live-event service
- raw company fanout may remain as a low-level internal primitive for company-visible events and trusted internal observers, but it must not be the forwarding path for participant-scoped conversation events

Conversation live-event type rule:

- conversation list/detail realtime must use dedicated `conversation.*` live event types
- `activity.logged` remains the generic company activity-feed event after filtering is in place
- filtered `activity.logged` is not the primary contract for conversation message, participant, or context-link updates

Canonical conversation live event types:

- `conversation.created`
- `conversation.updated`
- `conversation.participant_added`
- `conversation.participant_removed`
- `conversation.message_posted`
- `conversation.context_linked`
- `conversation.context_unlinked`

Shared-contract rule:

- `packages/shared/src/constants.ts` must add the canonical `conversation.*` live event types
- `packages/shared/src/types/live.ts` must define the base `LiveEvent.audience` metadata plus typed payload unions for the `conversation.*` event types on top of the existing transport shape
- server publishers and delivery consumers must use that single transport shape without adding a second realtime channel

Payload contracts:

- `conversation.created`
  - `conversationId`
  - `title`
  - `status`
  - `participantAgentIds`
  - `latestMessageSequence`
  - `latestActivityAt`
- `conversation.updated`
  - `conversationId`
  - `title`
  - `status`
  - `participantAgentIds`
  - `latestMessageSequence`
  - `latestActivityAt`
- `conversation.participant_added`
  - `conversationId`
  - `agentId`
  - `participantAgentIds`
  - `latestActivityAt`
- `conversation.participant_removed`
  - `conversationId`
  - `agentId`
  - `participantAgentIds`
  - `latestActivityAt`
- `conversation.message_posted`
  - `conversationId`
  - `message`
  - `message.id`
  - `message.sequence`
  - `message.authorType`
  - `message.authorUserId`
  - `message.authorAgentId`
  - `message.runId`
  - `message.bodyMarkdown`
  - `message.createdAt`
  - `message.refs`
  - `latestMessageSequence`
  - `latestActivityAt`
- `conversation.context_linked`
  - `conversationId`
  - `targetKind`
  - `targetId`
  - `agentIds`
  - `anchorMessageId`
  - `latestLinkedMessageId`
  - `latestLinkedMessageSequence`
- `conversation.context_unlinked`
  - `conversationId`
  - `targetKind`
  - `targetId`
  - `agentIds`

Audience-evaluation rule:

- conversation live-event visibility is evaluated after the underlying mutation commits
- newly added participants may receive `conversation.participant_added` and later `conversation.*` events
- removed participants must not receive `conversation.participant_removed` or any later `conversation.*` events after removal commits

Subscriber rule:

- websocket delivery in `server/src/realtime/live-events-ws.ts` must subscribe through the filtered actor-aware live-event path using the connected board or agent actor context
- direct subscribers that may forward events beyond the current process, including `server/src/services/plugin-host-services.ts`, must also use that filtered actor-aware path or apply equivalent filtering before forwarding
- direct subscribers that are only used for trusted internal company-visible observation may continue to use low-level company fanout, but they must not forward participant-scoped conversation events without equivalent audience checks
- the plan does not require a second websocket or second event bus; it requires one transport plus one authoritative audience-aware filtering contract

Publishing rule:

- `conversation.*` live events are the primary realtime surface for conversation views
- `activity.logged` may still be published for conversation actions only after the activity/live filtering gate is live
- conversation views must not depend on `activity.logged` payloads for message, participant, or context-link updates

Plugin event-bus rule:

- conversation activity rows are still written through `logActivity`, but conversation actions do not flow through the plugin event bus in this rollout
- do not add conversation action names to `PLUGIN_EVENT_TYPES` during this rollout
- do not rely on the plugin event bus as a second delivery path for conversation created, participant, message, or context-link events
- a separate future design may add plugin-facing conversation events only after it defines a participant-scoped audience/privacy contract for plugin subscribers

Rollout safety gate:

- no conversation activity rows may be emitted into generic company activity feeds until conversation-aware activity filtering is live
- no conversation live events may be published onto the generic company live-event path until audience-aware conversation delivery is live
- conversation CRUD, messaging, and participant-removal code must treat conversation activity/live emission as disabled until that gate is satisfied
- implementation sequence must land this gate before enabling any route or service path that emits conversation activity or live events

Suggested action names:

- `conversation.created`
- `conversation.updated`
- `conversation.participant_added`
- `conversation.participant_removed`
- `conversation.message_posted`
- `conversation.context_linked`
- `conversation.context_unlinked`

## Implementation Sequence

Execution rule:

- follow these steps in order
- steps 1 through 4 establish the shared source/policy and task-scope foundation used by the later feature steps
- step 9 establishes the reusable participant-scoped realtime transport/filtering foundation before conversation publishers are attached in step 11
- some prerequisites are intentionally created by earlier steps, rather than already existing in the repo today
- current repo state that these first steps are meant to fix includes:
  - `packages/shared/src/constants.ts` and `packages/shared/src/validators/agent.ts` still omit `conversation_message`
  - `server/src/services/heartbeat.ts` still uses `wakeOnDemand`-based policy parsing
  - `ui/src/components/AgentConfigForm.tsx`, `ui/src/components/OnboardingWizard.tsx`, and `ui/src/pages/NewAgent.tsx` still persist `wakeOnDemand`
  - `packages/shared/src/types/live.ts` still lacks the `LiveEvent.audience` transport contract needed for participant-scoped conversation events
  - `server/src/services/activity-log.ts` still emits generic `activity.logged` on every mutation
  - `server/src/services/live-events.ts` still publishes company live events without participant-aware filtering
  - `server/src/realtime/live-events-ws.ts` still forwards every company event to every same-company websocket subscriber
  - `server/src/services/plugin-host-services.ts` still subscribes to raw company live events
  - `server/src/routes/issues.ts` and `server/src/services/heartbeat.ts` still seed or derive legacy `issueId` / `taskId` task scope
  - `ui/src/pages/AgentDetail.tsx` and `ui/src/pages/Inbox.tsx` still clone or infer legacy run scope
  - shipped local adapters still prefer legacy `taskId` / `issueId`, and OpenClaw still defaults to issue-keyed session routing in `packages/adapters/openclaw-gateway/src/index.ts`, `packages/adapters/openclaw-gateway/src/ui/build-config.ts`, and `server/src/routes/access.ts`
  - goal/project composer `q` search is not implemented yet in the goal/project route, service, and UI client chain
  - project cost rollups still use the older `heartbeat_runs` plus activity derivation path rather than authoritative stamped `cost_events.project_id`

1. Implement the foundation contract/spec-sync and heartbeat normalization bundle: land the canonical `conversation_message` source and `wakeOnSignal` policy contract, normalize legacy wake-policy aliases on write/import/read paths, update the shipped runtime/env docs in `docs/agents-runtime.md` and `docs/deploy/environment-variables.md`, and finish any remaining concrete `doc/SPEC-implementation.md` / `doc/spec/agent-runs.md` contract sync needed for the data model, persisted `agent_wakeup_requests` conversation fields, REST surface, or explicit V1 portability exclusion before later code changes start depending on those contracts.
2. Introduce canonical task-key helpers and update all forward writers, clone paths, adapter payload builders, adapter env builders, onboarding/config emitters, and new conversation flow so they write canonical `taskKey` values first and expose `PAPERCLIP_TASK_KEY` as the forward env contract.
3. Prepare and run the issue task-key migration from bare issue UUIDs to `issue:<issueId>` only after those writers have been switched.
4. Remove legacy task-scope fallback reads and finish the reader/runtime cutover by updating issue wakeups, heartbeat producers, adapter/session/env docs, adapter execute paths, workspace-runtime helpers, issue-run readers, and UI/manual-run clone surfaces to treat canonical `taskKey` and `PAPERCLIP_TASK_KEY` as the sole forward contract, with `PAPERCLIP_TASK_ID` reduced to an issue-only compatibility alias during migration.
5. Add the base conversation DB schema modules `packages/db/src/schema/conversations.ts`, `packages/db/src/schema/conversation_participants.ts`, and `packages/db/src/schema/conversation_messages.ts`.
6. Add the dependent conversation DB schema modules `packages/db/src/schema/conversation_message_refs.ts`, `packages/db/src/schema/conversation_target_links.ts`, `packages/db/src/schema/conversation_target_suppressions.ts`, `packages/db/src/schema/agent_target_conversation_memory.ts`, and `packages/db/src/schema/conversation_read_states.ts`, and export all eight new conversation schema files from `packages/db/src/schema/index.ts`.
7. Extend existing `packages/db/src/schema/cost_events.ts` and `packages/db/src/schema/agent_wakeup_requests.ts` only after the referenced conversation tables exist, then generate the migration from the live schema files rather than treating those changes as implicit migration-only work.
8. Export schema and add shared types, validators, and API path constants, including `packages/shared/src/types/conversation.ts`, `packages/shared/src/validators/conversation.ts`, the shared heartbeat, live-event, cost-validator, shared `CostEvent` contracts, shared root/type/validator barrel exports, and the currently missing goal/project composer-search route-service-client chain that structured mention picking depends on; complete that goal/project `q` search chain before starting the structured mention UI work in step 13, keep `docs/api/goals-and-projects.md` synchronized in the same change as the public goal/project query-contract update, and keep `doc/SPEC-implementation.md` synchronized in the same change if this step expands the public contract further.
9. Implement Workstream 2's live-event transport/filtering foundation as a single ordered block: add conversation-aware company-activity filtering, `activity-log` publisher gating, the `LiveEvent.audience` envelope contract, board-actor normalization on the live/auth attribution path, the filtered actor-aware live-event subscription path, the explicit plugin-event-bus no-forward rule for conversation actions, and any direct-subscriber filtering changes; update `doc/spec/agent-runs.md` in that same bundle so its realtime section publishes the audience-aware `LiveEvent` envelope and canonical `conversation.*` event family instead of the older websocket/event contract; update `ui/src/context/LiveUpdatesProvider.tsx` plus the direct `/events/ws` consumers in `ui/src/pages/AgentDetail.tsx` and `ui/src/components/transcript/useLiveRunTranscripts.ts` so the evolved websocket envelope/delivery contract stays consistent for transcript streaming and conversation events; keep the existing inbox/global sidebar badge pipeline (`server/src/routes/sidebar-badges.ts`, `server/src/services/sidebar-badges.ts`, `ui/src/api/sidebarBadges.ts`, `ui/src/hooks/useInboxBadge.ts`, and `ui/src/components/CompanyRail.tsx`) on its current non-conversation badge semantics while this transport work lands; and keep the rollout guard in place so conversation CRUD/messaging still cannot emit conversation events yet.
10. Extend heartbeat run context, wakeup persistence, and cost writing so conversation-scoped runs can safely use `agent_wakeup_requests` and `cost_events`, updating the existing shared cost types, cost validators, routes, and services instead of creating a parallel path, and replace the currently missing authoritative project target rollup path so project cost views use stamped `cost_events` dimensions rather than the older `heartbeat_runs`-plus-activity derivation path.
11. Build the core server conversation modules, centered on `server/src/routes/conversations.ts`, `server/src/services/conversations.ts`, `server/src/services/conversation-memory.ts`, and the matching `server/src/services/index.ts` export updates, covering conversation CRUD, participant membership, base messaging routes, message refs, target linking, suppression-aware unlink/relink handling, deterministic derived-memory compilation, actor-visible conversation filtering, participant-removal cleanup, read-state updates, activity logging, embedded conversation-detail `costSummary`, the required agent/company delete-path cleanup, and route mounting in `server/src/app.ts`, using the shared conversation request/response validators instead of ad-hoc payload shapes; this step includes the default `GET /api/conversations/:conversationId/messages` route shape but not the deep-inspection query modes from step 22. In the same rollout bundle, update `skills/paperclip/SKILL.md`, `skills/paperclip/references/api-reference.md`, `docs/guides/agent-developer/comments-and-communication.md`, `docs/guides/agent-developer/how-agents-work.md`, `docs/guides/agent-developer/heartbeat-protocol.md`, `docs/api/issues.md`, and the new `docs/api/conversations.md` so the published agent/operator contract no longer reads as issue-only once agents can read, post, and self-manage conversation target links; issue-focused examples may remain, but they must not be written as the exclusive contract anymore. After those server modules exist, hook their conversation publishers onto the filtered live-event foundation by attaching committed participant audiences to `conversation.*` and any forwarded conversation-derived `activity.logged` events, then remove the rollout guard so conversation CRUD/messaging can emit through the filtered path.
12. Build the core UI conversation modules, centered on `ui/src/api/conversations.ts`, `ui/src/pages/Conversations.tsx`, and `ui/src/pages/ConversationDetail.tsx`, on top of the already-landed unread-state and embedded-cost-summary route contract; extend the existing `PLUGIN_RESERVED_COMPANY_ROUTE_SEGMENTS` in `packages/shared/src/constants.ts` to include `conversations`, add `conversations` to the board-route-root helper in `ui/src/lib/company-routes.ts`, wire the routes into `ui/src/App.tsx` under the existing `/:companyPrefix/...` board route tree, keep navigates and redirects inside that prefixed tree company-relative rather than introducing new absolute `/conversations...` destinations, treat any unprefixed `/conversations` route as redirect-only if retained, update `ui/src/lib/company-page-memory.ts` and `ui/src/hooks/useCompanyPageMemory.ts` so remembered company pages can round-trip conversation routes safely, add sidebar, command-palette, and mobile-nav entry-point updates as appropriate, add query-key coverage for conversation list/detail/message/read-state data, wire the UI live-event consumer for the new conversation events, and publish the new board surface in the docs site by updating `docs/docs.json`, the new `docs/guides/board-operator/conversations.md`, and the existing board-operator guide summaries in `docs/guides/board-operator/dashboard.md` and `docs/guides/board-operator/managing-tasks.md`. If the UI extracts dedicated conversation components, add those concrete files to the critical checklist at the same time.
13. Extend the existing markdown mention stack with prefix-based mention mode, kind picker, type-specific entity selection, shared mention parsing, renderer updates, mention-chip styling, and surface-aware markdown behavior flags, so conversation surfaces run in structured-only mode while existing issue-comment raw `@` parsing, wakeup, notification, and rendering behavior remains unchanged.
14. Add active-context bar and target-stamping logic in message submission flow.
15. Extend heartbeat finalization so when a required conversation wake succeeds without a matching reply, the run still finishes `succeeded` but the wakeup request is written `failed` with `required_reply_missing` instead of `completed`.
16. Update manual run retry and resume flows, including the current run-detail UI payload builders, so conversation-scoped runs preserve `taskKey` and conversation reply-context fields when cloned.
17. Update all shipped public adapter execute paths, plus the internal/server-only `hermes_local` integration path and the shared Paperclip env builder, to consume canonical task keys and conversation context fields, and keep `docs/adapters/creating-an-adapter.md`, the active adapter UI/property surfaces, and adapter-package metadata aligned in the same bundle so adapter-author guidance and the published shared/server/UI/package adapter set stay on one contract.
18. Migrate OpenClaw session routing from `issue` strategy to `task_key`, including adapter-config normalization, onboarding/config-surface defaults, and task-key-prefixed wake-text behavior.
19. Extend heartbeat conversation-run preparation so triggering-message refs can resolve `single-target` scope and reuse existing issue/project workspace resolution when safe, without entering issue execution-lock or issue-run coalescing semantics, and update issue/company live-run readers plus downstream UI consumers so they keep treating only true issue-scoped runs as issue-run state.
20. Extend heartbeat work-run preparation to load `agent_target_conversation_memory`, linked conversation metadata, and inject `paperclipLinkedConversationMemoryMarkdown`.
21. Add linked-conversations panels and manual target-link actions on issue, goal, and project pages, and keep `docs/api/goals-and-projects.md` synchronized when the published goal/project API surface gains linked-conversation routes.
22. Add the deep-inspection conversation message query modes on top of the base message route: `q`, `targetKind` / `targetId`, and `aroundMessageId` window retrieval, and keep `doc/SPEC-implementation.md` synchronized in the same change because this step expands the public conversation REST contract.
23. Add conversation-list/detail UX polish, per-conversation unread-badge invalidation, and follow-up query invalidation paths on top of the already-landed read-state, activity, and embedded-cost contract, without merging conversation unread into the inbox/sidebar unresolved badge; keep `server/src/routes/sidebar-badges.ts`, `server/src/services/sidebar-badges.ts`, `ui/src/api/sidebarBadges.ts`, `ui/src/hooks/useInboxBadge.ts`, `ui/src/context/LiveUpdatesProvider.tsx`, and `ui/src/components/CompanyRail.tsx` aligned to that non-goal.
24. Complete migrations, tests, typecheck, and build verification.

## Testing Requirements

### Database and service tests

- conversation creation is company-scoped
- conversation creation is board-user-only and rejects agent callers
- shared conversation request/response types and validators are exported from `@paperclipai/shared`
- conversation route handlers use shared conversation validators instead of ad-hoc `Record<string, unknown>` payload parsing
- goal and project composer-search surfaces support `q` consistently across route, service, and board UI API client layers
- participant add/remove is company-scoped
- participant add grants history visibility but does not create `conversation_target_links` or `agent_target_conversation_memory` from pre-add messages automatically
- historical target context for an added participant can be attached only by future routed messages or an explicit manual link/relink action
- sequence assignment is monotonic per conversation
- concurrent message creation for the same conversation allocates distinct sequences without `max(sequence) + 1` races
- agent-authored conversation messages created from a run persist `run_id`
- structured mention parsing persists correct typed message refs
- raw `@foo` text in a conversation message creates no mention refs, wakeups, or target links
- inline mention plus matching active-context target persists one deduplicated message ref with `ref_origin = inline_mention`
- existing issue comment raw `@` parsing and mention wakeups continue to work unchanged while conversation structured mentions roll out
- target-link creation respects targeted-agent rules
- conversation target-link upserts preserve first-write `link_origin` and `created_by_actor_*` while updating only latest-linked message fields
- manual target-link create requires explicit `agentIds` and writes one link per selected participant only
- manual target-link delete requires explicit `agentIds`, removes only the selected participant links, and writes one suppression row per selected participant
- manual relink for the same `(agent, conversation, target)` clears the suppression row
- a future new target-stamped message after manual unlink may recreate an active link but must not restore suppressed historical messages at or before the stored cutoff
- explicit manual relink after a prior unlink clears the suppression row and restores full target history for that agent/conversation/target
- active-context messages create target refs even without inline target-object mention
- derived conversation memory rebuilds for `(agent, target)` after relevant messages
- derived conversation memory compilation excludes target-stamped messages at or before `conversation_target_suppressions.suppressed_through_message_sequence`
- derived conversation memory persists `linked_message_count` before empty-body filtering and `source_message_count` after empty-body filtering
- derived conversation memory counters are derived from the named compiler sets, not only the rendered excerpt set
- linked-conversation target queries for agents exclude links created for other participants in the same conversation
- participant removal deletes that agent's read state and conversation-target links for the conversation
- participant removal rebuilds or deletes affected `agent_target_conversation_memory` rows
- participant removal clears that agent's `conversation:<conversationId>` task session
- participant removal cancels queued conversation wakeups and queued/running conversation-scoped runs for that same `(agent, conversation)` scope with reason `conversation_participant_removed`
- participant removal extinguishes outstanding required-reply obligations for that `(agent, conversation)` scope and never finalizes them later as `required_reply_missing`
- participant removal retains `conversation_target_suppressions` so later manual relink or future messages still honor prior manual unlinks
- company removal explicitly deletes conversation rows in dependency order and leaves no stranded conversation children behind
- agent removal explicitly deletes agent-scoped operational conversation rows and succeeds only when no retained historical conversation author refs still point at that agent
- deleting heartbeat runs does not block retained conversation messages because `conversation_messages.run_id` uses `onDelete: set null`
- company portability export/import and preview remain limited to their existing company/agent package contract and do not include conversation rows, conversation-derived memory, conversation read state, conversation target links, conversation-scoped wakeups, or conversation cost data in this rollout
- conversation runs emit `cost_events` with `conversation_id`
- target-scoped conversation maintenance runs stamp existing target cost dimensions only when explicitly single-target
- project cost rollups used by the existing cost service derive from authoritative stamped `cost_events.project_id` after this rollout, not from the older `heartbeat_runs` plus issue-activity linkage path
- conversation run with a triggering message that resolves to one `issue` target reuses existing issue/project workspace resolution
- conversation run with a triggering message that resolves to one `issue` target still keeps `taskKey = conversation:<conversationId>` and bypasses issue execution-lock and issue-run coalescing paths
- single-target issue conversation run does not populate top-level `issueId`, `taskId`, or `issueIds` in generic run context
- conversation run with a triggering message that resolves to one `project` target reuses existing project workspace resolution
- conversation run with a triggering message that resolves to one `goal` target remains workspace-unscoped
- conversation run with zero or multiple target-object refs remains conversation-scoped and does not auto-populate `issue_id` or `project_id`
- conversation direct-work runs do not implicitly check out issues, post issue comments, or transition issue status
- conversation run may create an issue through the existing issue-create route
- created issue becomes linked to the conversation only when the follow-up conversation reply includes a structured issue mention
- raw text asking to create an issue does not create a conversation-to-issue link until that structured mention is posted
- `GET /api/conversations/:conversationId` returns embedded `costSummary` aggregated from `cost_events.conversation_id`
- embedded `costSummary` includes `spendCents`, `inputTokens`, `outputTokens`, `runCount`, and `lastOccurredAt`

### Routing and heartbeat tests

- server app mounts the conversation route tree under `/api`
- shared package root, type, and validator barrels export the conversation contracts added by this rollout
- DB schema export surface includes the extended `cost_events` and `agent_wakeup_requests` contracts required by this rollout
- general conversation message writes `response_mode = optional`
- targeted conversation message wakes only mentioned agents and writes `response_mode = required`
- `conversation_message` wake permission is enforced through the intended non-timer `wakeOnSignal` policy path, not by accidental enum fallthrough
- legacy `heartbeat.wakeOnDemand` and `heartbeat.wakeOnOnDemand` inputs are normalized to canonical `heartbeat.wakeOnSignal` by portability/import-export paths before runtime use
- promoted conversation runs carry `conversationId`, `conversationMessageId`, `conversationMessageSequence`, and `conversationResponseMode`
- promoted single-target conversation runs also carry `conversationTargetKind` and `conversationTargetId` without changing task classification
- conversation wakeup coalescing promotes mixed reply modes to `required`
- conversation wakeup coalescing updates the surviving active conversation wake state to the newest `conversationMessageId`, `conversationMessageSequence`, and merged `conversationResponseMode`
- conversation wakeup coalescing also updates or clears `conversationTargetKind` and `conversationTargetId` from the newest triggering message
- required conversation wake is only satisfied after a matching agent-authored `conversation_messages.run_id = run.id` reply or a non-success terminal run
- an earlier same-run reply does not satisfy a later required trigger that was coalesced into the run
- succeeded required-reply run without a matching reply keeps run status `succeeded` but marks the wakeup request `failed` with `required_reply_missing`
- manual retry and resume of a conversation-scoped run preserve `taskKey`, `conversationId`, `conversationMessageId`, `conversationMessageSequence`, and `conversationResponseMode`
- manual retry and resume of a non-conversation run do not add conversation fields
- work run loads derived conversation memory only for the current agent and target
- work run includes linked conversation metadata for the current agent and target
- work run never resumes conversation session
- participant removal cancels queued conversation wakeups/runs and requests cancellation of any running conversation-scoped run for that agent/conversation
- conversation message posting is rejected after participant removal commits even if the cancelled process has not exited yet
- re-adding an agent to a conversation restores history visibility but does not recreate historical target links or old wakeup obligations automatically
- re-adding an agent to a conversation still respects retained suppression cutoffs from prior manual unlinks
- explicit manual relink after a prior unlink clears the suppression cutoff before the next derived-memory rebuild
- agent hard-delete path returns conflict while retained conversation message-author history still references that agent
- single-target issue conversation run reuses issue workspace resolution without entering issue execution-lock handling, issue-run coalescing, issue checkout, or issue status-mutation defaults
- single-target issue conversation run is excluded from issue-run lists, issue-driven inbox grouping, and other generic issue-scope readers that key off top-level `issueId`
- issue live-run and active-run endpoints ignore conversation-scoped runs even when those runs carry `conversationTargetKind = issue` and `conversationTargetId = <issueId>`
- company live-run consumers only derive issue-linked badges, highlights, and issue associations from true top-level `issueId` fields; conversation-scoped runs must not create synthetic issue-live state in dashboard, sidebar, project, or issue-list views
- linked-conversation target routes return only actor-visible conversations and do not leak private conversation metadata to same-company non-participants
- agent-facing linked-conversation target routes return only rows where `conversation_target_links.agent_id = requesting_agent_id`
- agent callers cannot create or delete manual target links for other participants
- company activity feed hides conversation activity from agent non-participants
- company websocket/live delivery hides conversation activity and conversation-scoped events from agent non-participants
- participant-scoped conversation live events carry the required audience metadata on the base `LiveEvent` envelope
- in `local_trusted`, websocket board upgrades use the same board actor `userId` text contract as `server/src/middleware/auth.ts`, with canonical sentinel `local-board`, rather than a separate placeholder actor id
- websocket delivery uses the filtered actor-aware live-event subscription path rather than raw company fanout for participant-scoped conversation events
- direct subscribers that may forward events externally, including the plugin host, do not forward participant-scoped conversation events without the same actor-aware filtering
- conversation activity writes do not emit plugin event bus events in this rollout, and `PLUGIN_EVENT_TYPES` remains unchanged for conversation actions
- conversation activity/live emission stays disabled until audience-aware filtering is enabled
- conversation list/detail realtime uses dedicated `conversation.*` live events rather than `activity.logged`
- `conversation.message_posted` emits the typed message payload required for detail-view append/update behavior
- participant add/remove live delivery is evaluated after the membership mutation commits
- embedded conversation detail cost summary is filtered by the same conversation visibility check as the rest of `GET /api/conversations/:conversationId`
- `GET /api/conversations/:conversationId` returns embedded `costSummary` with the required fields
- sidebar-badge route/service responses remain driven by approvals, failed runs, join requests, and existing issue/inbox signals rather than conversation unread
- derived conversation memory compiler excludes unrelated messages from the same conversation
- derived conversation memory output follows the fixed section order and deterministic source ordering
- derived conversation memory output reports omitted-message count when the prompt-safe cap is reached
- budget enforcement still counts conversation-run cost through normal company and agent totals

### Adapter tests

- each shipped adapter execute path prefers canonical `taskKey` over legacy `taskId` / `issueId` fallback after migration
- each shipped adapter execute path exposes conversation reply env/context fields when present
- each shipped adapter execute path exposes `paperclipConversationTargetKind` and `paperclipConversationTargetId` when a conversation run is `single-target`
- each shipped adapter execute path exposes linked conversation memory/context fields for issue, goal, and project runs
- each shipped adapter execute path preserves conversation-scoped direct-work execution when only `conversationId` is present and no issue is implied
- built-in `process` adapter injects canonical conversation env vars through the shared Paperclip env builder
- built-in `http` adapter forwards canonical conversation context fields in the serialized invoke payload
- OpenClaw replaces `sessionKeyStrategy = issue` with `sessionKeyStrategy = task_key`
- OpenClaw `task_key` strategy resolves session key as `paperclip:${taskKey}`
- OpenClaw canonical issue task keys still map to the existing issue session-key shape `paperclip:issue:<issueId>`
- OpenClaw conversation task keys map to `paperclip:conversation:<conversationId>`
- OpenClaw wake payload and wake text branch by canonical `taskKey` prefix instead of deriving session or workflow behavior from `issueId`
- OpenClaw onboarding payload builders, create-config defaults, config-field UI, and README examples no longer emit `sessionKeyStrategy = issue`

### UI tests

- board router mounts conversation list/detail routes
- command palette exposes conversation navigation alongside the other primary board pages
- mobile navigation behavior for conversations is updated intentionally and stays aligned with the published UI spec for this version
- sidebar exposes conversation navigation for board users
- UI API clients consume the shared conversation request/response contracts instead of duplicating ad-hoc page-local shapes
- dashboard, sidebar, company rail, project issue list, and issue list views do not create issue-live badges or issue associations from conversation-scoped runs
- `ui/src/components/LiveRunWidget.tsx` does not surface conversation-scoped runs through the issue live-run or active-run UI
- existing project cost views stay aligned with the updated authoritative `cost_events`-based project rollup after the conversation cost rollout
- query keys include stable conversation list/detail/message/read-state keys used by the new pages
- mention picker inserts structured mention markdown
- typing `@` opens kind picker before any entity results are shown
- typing `@issue` enters issue mention mode directly
- agent config and onboarding writers emit canonical `heartbeat.wakeOnSignal` and do not write legacy `heartbeat.wakeOnDemand` or `heartbeat.wakeOnOnDemand`
- the shared markdown mention parser accepts `agent://`, `issue://`, `goal://`, and `project://` conversation mentions
- `MarkdownEditor` and `MarkdownBody` both use the same shared structured-mention parsing/rendering rules for conversation mentions
- conversation detail renders raw `@word` text as plain text rather than mention-highlighted legacy issue-comment syntax
- existing raw `@word` issue-comment rendering remains unchanged during the conversation mention rollout
- active-context chips persist across messages until cleared
- conversation timeline renders structured mention chips
- conversation mention chips reuse the shared mention styling path rather than introducing a second conversation-only style contract
- conversation detail renders the embedded cost summary section from `GET /api/conversations/:conversationId`
- conversation list/detail react to dedicated `conversation.*` live events
- conversation unread does not increment the sidebar/inbox badge path served by `sidebar-badges`, consumed by `useInboxBadge`, or rendered in `CompanyRail`
- `LiveUpdatesProvider` does not invalidate the sidebar badge pipeline solely because conversation read state or `conversation.*` events changed
- linked-conversations section renders linked-conversation metadata and navigation
- manual link-target UI can create an issue/goal/project target link without relying on inline mention text
- manual link-target UI supports explicit participant selection and never implies an unscoped "all participants" write

## Verification

Before shipping:

- `pnpm db:generate`
- `pnpm -r typecheck`
- `pnpm test:run`
- `pnpm build`

## Explicitly Rejected Shortcuts

- Do not store conversations in `issue_comments`.
- Do not treat raw `@foo` text in conversations as a real mention.
- Do not inject entire conversation transcript into work prompts.
- Do not create links without a structured mention or explicit UI action.
- Do not route `@issue-id` as if it were `@agent`.
- Do not add a generic mention lookup route for conversation mentions.
- Do not build or depend on `conversation_segments`.
- Do not use plugins as the core persistence or wakeup layer.
- Do not switch to canonical task keys without migrating existing issue-scoped session rows.
- Do not keep permanent legacy task-key fallbacks after migration completes.
