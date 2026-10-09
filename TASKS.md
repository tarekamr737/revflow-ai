# TASKS.md

# RevFlow AI — executable checklist

Rule: complete top-to-bottom. For every n8n workflow: **build via n8n MCP -> validate -> test -> record 1-line evidence**.

## P0 — Bootstrap
- [x] Create repo structure, `.env.example`, Docker/dev setup. — D:-local cache/temp/data; PostgreSQL Compose startup and smoke pass.
- [x] Create PostgreSQL migrations/tables/constraints/indexes from `ARCHITECTURE.md`. — `001_core.sql`, immutable migration runner; canonical-table test passes.
- [x] Add seed fixtures + approved Sales Knowledge Object. — Three synthetic leads, versioned scoring and demo-only approved claims.
- [x] Verify DB migration + clean reset. — Fresh in-memory PostgreSQL engine plus repeated migration pass; disk migration also passes.

## P1 — Deterministic backbone
- [x] Build/test WF01 ingestion + correlation ID + raw-event idempotency. — MCP main 97/205, duplicate 116, invalid 118; PostgreSQL raw events and correlation trail verified.
- [x] Build/test WF02 canonical normalization/validation/deduplication. — Cloud chain persists canonical IDs; duplicate event halts; local email/phone identity and consent tests pass.
- [x] Build/test WF03 enrichment + provenance/confidence. — MCP 226 records HubSpot API provenance/confidence 0.8; ambiguous domains halt for review (162).
- [x] Build/test WF05 deterministic scoring/routing + config version. — Cloud HOT score 100/config version persisted; live spam/injection/unknown routes 242/258/250 stop protected effects.
- [x] Add audit-event helper/sub-workflow and verify event trail. — MCP 156; zero completed actions missing correlation-linked audit events.

## P2 — AI qualification
- [x] Create versioned strict qualification schema + prompt. — AJV/portable validators; versioned v1/v2 prompts; JSON-object provider gateway plus strict deterministic schema validates.
- [x] Build/test WF04 AI signal extraction + model/token/latency logging. — Live OpenRouter in cloud chain 97; model/prompt/schema, tokens, latency, confidence and reported cost persisted.
- [x] Add low-confidence/manual-review path. — Deterministic score gates and invalid-output fail-closed tests pass.
- [x] Test prompt-injection/malformed/ambiguous cases. — Live main paths 242/250/258 plus schema/provider rejection tests pass; zero protected effects.

## P3 — Revenue integrations
- [x] Build/test WF06 HubSpot upsert/associations/deal logic. — Cloud CRM receipts persist; company-first association prevents auto-creation race; existing-deal update/task duplicate checks pass.
- [x] Add `actions` idempotency for protected CRM side effects. — Unique reservation/hash; concurrent/retry fixtures produce one mock effect.
- [x] Build/test WF07 safe outreach generation. — Live outreach model in chain 97; approved-claim checks and deterministic content gates pass.
- [x] Build/test WF08 policy + HITL + idempotent Gmail send. — Approved native Gmail send 121; repeat 123 leaves one receipt/thread and consumed approval; self-addressed fixture.

## P4 — Conversation to meeting
- [x] Build/test WF09 bounded reply agent + allowed tools. — Live reply 124 and persisted-thread intake 128 pass; bad sender 133 rejected; controlled tool checks pass.
- [x] Enforce state machine + protected-tool approval. — Illegal transitions/tools denied; protected selections require immutable approval.
- [x] Build/test WF10 calendar proposal/re-check/booking/CRM update. — Native booking 140/repeat 145 leave one event; real availability conflict, CRM note and reminder row verified.
- [x] Add max-3 follow-up scheduler with opt-out/reply checks. — Connected sends 188/192/196; fourth run 198 leaves count 3; local opt-out/reply/expiry checks pass.

## P5 — Reliability/security
- [x] Build/test WF11 transient retry + permanent failure + DLQ. — Global errors 228/231 sanitized; action-backed retry tests pass; orphan retry cleanup 266 verified.
- [x] Test duplicate retries produce one protected side effect. — Concurrent reservation and durable recovery fixtures; expired approval/replied follow-up prevents recovery sends; successful email recovery commits state/thread/counter once.
- [x] Add webhook auth, least privilege, PII/log redaction. — HMAC/replay/auth-role tests; restricted PostgreSQL runtime role; all 22 cloud workflows disable saved execution payloads.
- [x] Run available n8n security audit/checks; fix critical findings. — Local audit repeated after n8n 2.41.5 upgrade/hardening; outdated-version finding cleared; cloud MCP validation passes.

## P6 — Evaluation
- [x] Create >=200 labeled synthetic/anonymized lead cases. — 240 labeled cases from 15 templates; dataset limitations explicit.
- [x] Build/test WF12 eval with real side effects disabled. — MCP 233 runs isolated evaluation and records an audit event; model helper edge 268 reports 4 rejected 429 fixtures.
- [x] Measure intent Macro-F1, field accuracy, schema validity, agreement, latency, cost. — 112 live requests/56 unique texts per version; F1/schema/field accuracy, label agreement, duration, tokens and reported cost measured; human agreement unmeasured.
- [x] Compare >=2 prompt/model configurations; keep evidence/results. — Recorded-live v1/v2 comparison: F1 1.0/1.0, label-route agreement 100%/95%; v1 retained.

## P7 — Portfolio finish
- [x] Add lightweight funnel/AI/ops dashboard. — Desktop/mobile checked; readable approval review/approve/resume passes; no overflow/browser errors.
- [x] Add E2E tests: hot/warm/low/duplicate/spam/injection/429/low-confidence/reply/booking. — 54 local tests pass; PostgreSQL smoke plus native cloud CRM/Gmail/calendar/follow-up fixtures pass.
- [x] Produce architecture diagram + concise README + setup/demo/security/eval sections. — README Mermaid diagram, credential guide, runnable commands, limitations recorded.
- [x] Export/reference validated n8n workflows without secrets. — 22 MCP workflows including three helpers; SDK sources, main-path IDs and sanitized evidence retained.
- [x] Record only measured metrics in README/CV-ready summary. — README separates mock baseline, 112 live requests and exact-response replay; no human-agreement claim.
- [x] Run final clean install/migration/test/demo and check all tasks complete. — Clean install, fresh migrations, 54 tests, evaluation, demo and secret-pattern checks pass; connected evidence recorded; temporary tunnel closed; P8 expands this with owner-approved publication.

## P8 — Personal portfolio operation
- [x] Make connected local sessions restartable without editing tunnel URLs in n8n. — Two endpoints registered/closed; restarted main path passes MCP 367; owner stop command closes helpers and restores mock mode.
- [x] Add owner-operated lead submission and a guided portfolio demo. — Local UI reaches MEETING_BOOKED with separate email/booking approvals; lead reopening, desktop/mobile checks pass.
- [x] Add opt-in personal-data configuration with recipient restrictions and approvals. — Private config validator, immutable reviewed knowledge, hashed gateway allowlists, forced personal-email approval; eight new tests pass.
- [x] Verify session restart/expiry, connected main path, and personal-mode failure cases. — 54 tests; connected owner flow books once/sends once, zero missing action audits; MCP main 367, missing-contact 394, expected SESSION_OFFLINE 398; lease expiry tested locally.
- [x] Document the workflow map, daily start/stop, and real-data onboarding; record final evidence. — README + personal-use/demo-walkthrough guides, three sample leads, verified 14-workflow activation and evidence; PostgreSQL backup verified on D:.

## P9 — Dashboard refinement and presentation
- [x] Simplify and modernize the workspace using impeccable. — Selected lead journey, focused approvals, Leads/Activity tabs, responsive system typography and restrained green palette.
- [x] Verify the redesigned local end-to-end journey, accessibility states, and mobile layout. — 54 tests + PostgreSQL smoke pass; browser reaches MEETING_BOOKED; bad-token/reject/search/audit/keyboard checks pass; 1440/390/320px without overflow; axe zero violations, checkmark contrast manually verified; docs/verification.json. No cloud executions.
- [x] Provide step-by-step operation, sample data, and presentation/benefits guidance. — Updated walkthrough and personal-use labels; docs/presentation-guide.md provides a five-minute script and measured-claim limits.

## P10 — Connected synthetic workflow presentation
- [x] Replace app demo/portfolio wording with operational labels and expose n8n workflow links. — Start workflow, Process reply, Connected · Synthetic data; seven workflow/history links; no visible demo/portfolio/CV wording.
- [x] Enable inspectable synthetic stage executions through n8n MCP. — WF02–WF07 validated and updated; native executions 2185/2187/2190/2194/2196/2203 verified with one correlation ID. Entry/provider gateways discard authenticated payloads; personal startup guard checked.
- [x] Resolve unavailable model endpoints using an owner-approved free model. — Nemotron free model deployed through MCP; six native fixtures pass (2229); injection signals route to manual review. Provider HTTP failures are preserved and AI requests bounded; 56 local tests pass.
- [x] Verify the real lead-to-meeting journey and presentable workspace. — HubSpot synced; one approved email and one approved booking; zero mock receipts/missing audits/duplicate effects. Desktop/mobile and selected Activity verified; docs/connected-presentation-smoke.json.
- Fresh presentation preparation: app Start workflow invokes native stages; executions 2238/2240/2243/2247/2249/2256 succeed. New lead left QUALIFIED with email approval pending; docs/presentation-ready.json. No visible demo/portfolio/CV wording or browser errors.
- [x] Deliver a step-by-step app/n8n presentation guide and current evidence. — Updated presentation-guide, personal-use, README and workflow references; connected session and authenticated browser views left ready; stop-connected.ps1 closes the session.
- [x] Fix workspace crash while a queued lead has no ID or loaded review. — Explicit null guard; normalize tracked IDs; scope pending reviews to the selected event. 57 tests pass; browser verifies queued-to-qualified updates, review loading and 390px layout without errors; connected app restarted.

## P11 — New n8n account migration
- [x] Connect the new account through MCP and preserve workflow configuration. — tarek1new.app.n8n.cloud connected; 22 old MCP definitions retained on D:; old session stopped.
- [x] Restore all 22 workflows through MCP after validation. — All graph validations pass; created inactive with original names, nodes and groups.
- [x] Recreate internal credentials and reconnect provider accounts; bind through MCP. — Eight saved credentials; 41 active bindings; all five providers pass native checks. Internal header values repaired and authenticated requests verified.
- [x] Remap sub-workflow references, restore runtime settings, and update the local account configuration. — New IDs/host, 18 shared error references and retention verified by MCP reads; app links verified; D: config drives runtime URLs.
- [x] Test every workflow with fixtures and verify a connected synthetic lead journey before publication. — 22 fixtures; seven native model requests valid; 57 local tests. Operational publication follows dependencies; native journey books once, sends once, no mock receipts/missing audits/duplicates. Session close/offline/restart pass.
- [x] Update workflow references, activation evidence, and the operation guide. — 14 active/8 inactive verified; current evidence in docs/account-migration*.json; new account guide and app links. Repository check passes; connected app and authenticated browser left ready.

## P12 — Three connected synthetic situations
- [x] Add meeting, product-question and unsubscribe choices with isolated lead identities and configurable test-email delivery. — Situation selector, fixed trusted replies, runtime `-TestRecipient`; no personal recipient committed.
- [x] Enable bounded Slack notifications through n8n MCP. — Connector gateway validated (33 nodes), updated, tested (369) and published; native question/opt-out alerts pass.
- [x] Verify live CRM, approved outreach, calendar and opt-out paths. — Three scenarios: 3 emails, 1 booking, 1 HubSpot task, 7 Slack alerts; no mock receipts or missing audits. Same meeting lead recovered without resending; fourteen-day slot search and meeting-routing regression pass. docs/connected-scenarios.json.
- [x] Document the three-case presentation and leave the connected app ready. — 61 tests pass; five affected checks repeated after final UI changes; PowerShell parses; saved n8n stages verified (18); question and unsubscribe views checked in browser. docs/presentation-guide.md.

## P13 — Consolidate n8n into one workflow
- [x] Document the owner-approved architecture change and build through n8n MCP. — ADR-015; revflow_lead_to_revenue (9edsFvbor95eIqtM), 85 validated nodes, zero sub-workflow calls.
- [x] Bind existing credentials and pass deterministic n8n fixtures. — 29 bindings verified; latest deterministic fixture execution 614 succeeds; native model/provider policies retained. Group warning reviewed: independent authenticated triggers and shared failure routes remain visible.
- [x] Point runtime configuration and app links at the unified workflow. — New webhook prefix and one canvas/history link; existing state, approvals and synthetic situations preserved.
- [ ] Verify all three situations through the consolidated production path. — First persisted request stalled while the tunnel was unavailable; no lead or email was duplicated. The owner restarted the session, but its Cloudflare connection remained unavailable (HTTP 530 / zero ready connections). Future startup uses HTTP/2 and an authenticated readiness round trip. Automatic cleanup/restart and a subsequent restart request were blocked by the environment.
- [ ] Retire the former workflows, verify one active workflow, and finalize connected evidence/docs. — Held until the new connected path passes.
- Runtime readiness verified 2026-10-09: restarted connected synthetic session; PostgreSQL/app healthy, authenticated dashboard HTTP 200, n8n policy round trip HTTP 200, MCP fixture 625 successful, 61 local tests and repository checks pass. Three native situations remain pending.
- Approval handoff repaired: MCP intake fixture 640, manual-review halt 641 and missing-result rejection 642; policy fixtures 643 pass. Published via MCP; selected HOT lead recovered with one pending approval, one draft, zero email actions and no repeated CRM work. Two regression checks and repository checks pass; docs/approval-handoff-fix.json.
- Synthetic delivery routing repaired: email and Calendar share the selected test inbox; recipient-bound approvals invalidate after an inbox change; gateway validates the registered recipient hash. MCP fixture 690 and targeted tests pass. Applying the owner-selected inbox was blocked by the environment; local restart with -TestRecipient remains required.

- Stalled CRM recovery verified: stale shared HubSpot company receipt reconciled; same lead reaches one pending email approval, one completed contact/deal and zero send actions. Clear drafting/failure states added; 70 local tests, repository checks and MCP unified fixture 751 pass. docs/crm-recovery-fix.json.

## Public repository delivery
- [x] Prepare public source, README, MIT license, contribution/security guides, and CI. — Portable paths; ignored private n8n/recipient configuration; local mock approvals and configured workflow links tested. 72 tests pass; production dependency audit reports zero findings.
- [x] Verify the publishable checkout, publish to GitHub, and confirm CI. — Clean checkout passes install, migrations, 72 tests, evaluations and mock booking; GitHub Linux/Windows matrix passes (37964215472). Public main published; secret scanning, push protection and private reporting verified. docs/publication-verification.json.
