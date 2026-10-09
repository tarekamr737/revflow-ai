# ARCHITECTURE.md

# RevFlow AI Architecture

## Principles
`AI interprets -> code validates -> rules authorize -> n8n orchestrates -> humans approve risky actions.`

Canonical state lives in PostgreSQL/Supabase. n8n coordinates side effects. LLM memory is never business truth.

## Stack
- Orchestration: n8n
- DB: PostgreSQL/Supabase
- CRM: HubSpot
- Email: Gmail
- Scheduling: Google Calendar
- HITL/alerts: Slack or Telegram
- AI: provider supporting structured JSON; model routed by task complexity
- App/dashboard: minimal Next.js or equivalent
- Runtime: Docker Compose
- Repo: GitHub

## Workflows
The current owner-operated runtime uses one workflow, `revflow_lead_to_revenue`, with intake, approved-send, reply, meeting, AI and provider branches on one canvas. The WF01–WF12 descriptions below remain the logical stage contracts; their former workflows are retired after the consolidated workflow passes validation and connected tests.
Use these stable names:

### WF01 `revflow_01_lead_ingestion`
Triggers: webhook/Gmail/import.
Do: correlation ID, raw event persistence, source/source_event_id, event-level idempotency.
Then call WF02.

### WF02 `revflow_02_normalize_dedupe`
Normalize canonical lead. Deterministic validation. Exact duplicate by source-event/email/phone/CRM ID; optional fuzzy candidate review. Never auto-merge uncertain matches.

### WF03 `revflow_03_enrichment`
Enrich domain/company/contact from allowed public/API data. Store provenance + confidence separately from raw input.

### WF04 `revflow_04_ai_signal_extraction`
Strict schema:
`intent, needs[], pain_points[], buyer_role, urgency, budget_signal, authority_signal, purchase_intent, timeline, sentiment, risk_flags[], recommended_next_action, confidence, evidence[]`.
Input is untrusted data. Store model/prompt/schema version, tokens/cost, latency.

### WF05 `revflow_05_score_route`
Deterministic configurable score:
- fit 40
- intent 30
- urgency 15
- engagement/source 15
Rules override score. Route HOT/WARM/NURTURE/LOW/REJECT/MANUAL_REVIEW.

### WF06 `revflow_06_hubspot_sync`
Upsert contact/company; associate objects; create/update deal only when qualified. Persist HubSpot IDs, sync hash/status/time. All side effects use unique action keys.

### WF07 `revflow_07_outreach_generate`
Generate subject/body/CTA using approved Sales Knowledge Object only. No invented pricing/claims. Strict output schema.

### WF08 `revflow_08_outreach_policy_hitl_send`
Consent + PII + claim + URL + risk checks. Normal safe action may auto-send by policy; hot/sensitive/uncertain action pauses for HITL. Store original/edited/approved decision. Idempotent send.

### WF09 `revflow_09_reply_agent`
Classify reply and use bounded tools:
read: lead/company/deal/messages/product/calendar.
controlled: CRM note/task.
protected: external send, deal-stage change, discount, cancellation => approval.
Persist explicit state transitions.

### WF10 `revflow_10_meeting_lifecycle`
Detect meeting intent; fetch slots; propose; on selection re-check availability; create event idempotently; update CRM; notify rep; schedule reminder.

### WF11 `revflow_11_error_dlq`
Global error path. Classify transient/permanent/AI/policy. Exponential backoff for transient failures. Exhausted/permanent => DLQ/manual alert. Never retry unsafe side effects without idempotency key.

### WF12 `revflow_12_evaluation`
Run labeled fixtures through production qualification path with external side effects mocked/disabled. Compute intent precision/recall/Macro-F1, field accuracy, schema-validity, agreement, latency, cost. Compare prompt/model versions.

## State machine
`NEW -> QUALIFIED -> CONTACTED -> RESPONDED -> MEETING_PROPOSED -> MEETING_BOOKED -> OPPORTUNITY -> WON|LOST`
Side states: `NURTURE`, `MANUAL_REVIEW`, `DISQUALIFIED`, `SPAM`.

Only deterministic transition rules may update state.

## Canonical lead
Fields:
`id, source, source_event_id, name, email, phone, company_name, company_domain, job_title, country, message, consent, status, created_at, updated_at`.

## Database tables
- `leads`
- `raw_events`
- `lead_enrichment`
- `qualification_runs`
- `lead_scores`
- `crm_sync`
- `messages`
- `approval_requests`
- `ai_runs`
- `lead_events`
- `actions`
- `failed_events`
- `config_versions`

Required constraints:
- `raw_events(source, source_event_id)` UNIQUE
- `actions(action_key)` UNIQUE
- stable FK + timestamps
- indexes on lead email/domain/status, event correlation_id, due follow-ups

## Audit event examples
`LEAD_RECEIVED, LEAD_NORMALIZED, LEAD_ENRICHED, LEAD_QUALIFIED, SCORE_COMPUTED, CRM_SYNCED, EMAIL_DRAFTED, APPROVAL_REQUESTED, EMAIL_SENT, REPLY_RECEIVED, MEETING_BOOKED, WORKFLOW_FAILED`.

All carry `lead_id`, `correlation_id`, timestamp, small JSON payload.

## Side-effect idempotency
Before send/create/update requiring protection, reserve an action:
- `SEND_INITIAL_EMAIL:{lead_id}`
- `CREATE_DEAL:{lead_id}`
- `BOOK_MEETING:{lead_id}:{slot_hash}`
If completed, return existing result. If in-progress/stale, apply recovery policy.

## Reliability
Transient: timeout, 429, 5xx -> bounded exponential retry.
Permanent: invalid input/auth/policy -> no blind retry.
Retry example: 5s -> 30s -> 120s -> DLQ.
Store retry count + last error.

## AI/model routing
- cheap/small model: simple classification/extraction
- stronger model: ambiguous/complex cases
- agent-capable model: bounded reply/tool decisions
Persist selected model and reason code.
Never store chain-of-thought; store concise evidence/reason codes.

## Prompt security
Lead content is DATA, never instruction.
System policy defines allowed actions/tools.
No arbitrary HTTP/tool access from agent.
Validate structured output before use.
Low confidence/invalid schema => retry safely or manual review.

## Secrets/PII
Secrets only in n8n credentials/env.
Minimize PII sent to models.
Webhook auth: HMAC/token + timestamp/nonce where applicable.
Use least-privilege credentials.
Parameterized SQL only.
Redact sensitive logs/fixtures.
Run n8n security audit if available.

## n8n MCP build protocol
1. Inspect available MCP tool capabilities once.
2. Discover node details only as needed.
3. Build one workflow/sub-workflow at a time.
4. Validate before create/update.
5. Create/update via MCP.
6. Test with fixtures.
7. Read execution errors, patch minimally, revalidate, rerun.
8. Prefer partial/diff updates and minimal/structure fetches if supported.
9. Keep inactive until passing relevant tests.
10. Record workflow ID/name and concise evidence in TASKS.

## Tests
Unit-like: normalization, validation, scoring, routing, action keys.
Integration: mocked AI/HubSpot/Gmail/Calendar.
E2E: hot, warm, low, duplicate, spam, prompt injection, malformed payload, low confidence, API 429/5xx, reply, booking.
Evaluation workflow must disable real external side effects.

## Repo
`workflows/` exports or references
`database/migrations/`
`database/seed/`
`prompts/`
`evaluation/`
`dashboard/`
`tests/`
`docs/`
`.env.example`
`docker-compose.yml`

## Deployment
MVP: reverse proxy/HTTPS -> n8n -> PostgreSQL; dashboard separate.
Scale only if needed: n8n queue workers + Redis.
Use health checks, backups, execution retention policy, and environment-specific credentials.

## ADRs
Keep architecture decisions short here.
- ADR-001: deterministic scoring over LLM-generated score.
- ADR-002: DB state over agent memory.
- ADR-003: protected side effects require policy/HITL.
- ADR-004: modular workflows over monolith.
- ADR-005: A small Node.js policy API owns atomic PostgreSQL transactions, action reservations, and deterministic stage functions; n8n calls those stages and sequences sub-workflows. This keeps policy logic testable and prevents multi-node transaction races. Credentials remain in environment/n8n. Local single-process development uses PGlite (PostgreSQL WASM); deployed environments use PostgreSQL via pg.
- ADR-006: Mock adapters are explicit server configuration, never selected by an inbound payload. Production activation requires reachable policy API, provider credentials, and live smoke-test evidence. Uncertain non-idempotent writes are quarantined for reconciliation instead of blindly retried.
- ADR-007: Use the user-selected OpenRouter model `stealth/space-bunny-alpha` through the authenticated n8n AI gateway. Native strict-schema requests returned HTTP 404; JSON-object mode passed the schema gate in execution 51. Include the versioned schema in the system prompt, validate deterministically, and fail closed with no model fallback. The gateway accepts only exact approved synthetic fixtures under the current consent. HubSpot and Slack use native OAuth credentials; live activation requires main-path tests.
- ADR-009: Company action keys use the canonical domain across leads. Create/reuse the company before the contact and explicitly associate it during contact creation, avoiding HubSpot's automatic company creation race. Conflicting identity or ambiguous API enrichment goes to manual review. Synthetic email tests route to the connected sender's own inbox; real lead addresses cannot enable that override.
- ADR-008: The connected-account adapter uses the authenticated n8n provider gateway, with a shared synthetic-content gate before transfer and again in n8n. Exact duplicate evaluation text reuses recorded responses per prompt version in an explicitly labeled PostgreSQL replay; live request count, duration and cost remain separate from replay measurements.
- ADR-010: Personal portfolio operation runs PostgreSQL and the dashboard on D:. The existing connector gateway also relays policy stages to an authenticated, expiring local HTTPS session registered by the owner. Only connection metadata lives in n8n static data; business state stays in PostgreSQL. Registration accepts only HTTPS trycloudflare hosts, never caller-supplied stage URLs, and closing the session removes its endpoint. Cloud workflows use stable gateway URLs across local restarts.
- ADR-011: Synthetic mode remains the default. Personal data requires explicit local configuration, a recipient allowlist, reviewed versioned sales knowledge, and acknowledgment of the selected model's data handling. All personal outreach requires approval. Credentials remain external; arbitrary model tools, URLs, and inbound mode changes remain forbidden.
- ADR-012: Switching mock/live operation must not reuse mock provider receipts. Stamp the server-selected adapter mode in raw-event metadata, scope shared company reservations by adapter mode, and reject cross-mode lead execution or mock receipts in live actions. Historical records remain readable; inconsistent legacy receipts require review.

- ADR-013: Connected synthetic presentation uses the real n8n and provider paths. WF02–WF07 retain synthetic execution history for inspection; authenticated entry workflows and provider/AI gateways continue to discard payloads so authorization headers cannot enter traces. Personal-data startup is blocked while this trace policy is enabled. Disabling tracing requires n8n MCP verification before updating docs/workflow-tracing.json.
- ADR-014: The owner authorized an available free model after unavailable endpoints. `nvidia/nemotron-3-super-120b-a12b:free` passed a native n8n request and is the configured model; reasoning is disabled for these bounded extraction/drafting tasks. Preserve strict output validation and reject other model identities; the free routing suffix may be absent in the reported canonical model ID. AI requests have a single bounded attempt within the stage deadline; provider/schema errors preserve HTTP status instead of becoming retryable 500s. Historical evaluation artifacts retain their original model attribution.

### ADR — Guided synthetic reply scenarios
The app offers meeting, product-question and unsubscribe journeys. Each keeps a distinct reserved-domain lead identity; Gmail routes approved outreach to the configured test inbox. Replies remain fixed synthetic text and run through WF09. Confident product questions create one controlled CRM task and Slack alert; opt-out stops outreach immediately and emits an idempotent alert. No personal-data mode or new trigger is enabled.

- ADR-015: At the owner's request, replace the modular n8n deployment with one `revflow_lead_to_revenue` workflow. Reuse the tested PostgreSQL policy stages and native provider credentials; inline the business sequence, AI gateway, connector/session gateway and error handling, with no Execute Sub-workflow nodes. Approvals and replies resume through separate authenticated triggers on the same canvas. Only this workflow remains published; retire old definitions after connected tests pass. Preserve paused schedules/polling and execution privacy; multiple executions may still occur across human approval and provider callbacks.

- ADR-016: Revalidate shared live CRM company receipts by domain before associating a new contact. Missing synthetic fixtures may be reconciled through an auditable idempotent repair action; personal company deletion requires review. Preserve prior receipts and reject uncertain contact writes during recovery.
