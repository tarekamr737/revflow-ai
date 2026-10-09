# PRODUCT.md

# RevFlow AI

## Product
A production-style **AI Lead-to-Revenue Orchestrator** that captures inbound leads, normalizes/enriches them, extracts buying signals with AI, scores/routs them deterministically, syncs HubSpot, drafts personalized outreach, handles replies, books meetings, and keeps a complete audit/evaluation trail.

## Problem
Sales teams lose time and revenue through manual lead triage, duplicate CRM entries, slow first responses, inconsistent qualification, missed follow-ups, and disconnected email/calendar/CRM systems.

## Users
- Sales/RevOps team
- Sales reps
- Sales manager/approver
- System operator

## Primary flow
`Lead source -> ingest -> validate/dedupe -> enrich -> AI signal extraction -> deterministic score -> route -> HubSpot -> outreach -> HITL if needed -> reply intelligence -> calendar -> CRM lifecycle -> analytics/evals`

## Inputs
MVP:
- Website/generic webhook
- Gmail inbound/replies
Later:
- Meta/other lead sources

## Outputs
- Canonical lead + audit events
- Qualification signals + confidence/evidence
- Deterministic 0-100 lead score
- HubSpot contact/company/deal
- Personalized approved email
- Follow-up tasks
- Meeting booking
- Ops/HITL alerts
- Evaluation/operational metrics

## Lead classes
- `HOT`: 80-100
- `WARM`: 60-79
- `NURTURE`: 40-59
- `LOW`: 0-39
- `REJECT`: spam/invalid/policy failure
Thresholds are config/versioned and later calibrated from evaluation data.

## AI responsibilities
Allowed:
- intent/use-case/pain-point extraction
- urgency/purchase-intent classification
- bounded reply classification
- safe email drafting
- bounded tool selection

Not allowed:
- calculating business score
- deciding permissions
- inventing prices/discounts/claims
- destructive CRM actions
- sending protected communication without policy/HITL

## Required business rules
- No marketing outreach without valid consent.
- Exact duplicate events create no duplicate side effect.
- Existing open deal => update, not duplicate.
- Low AI confidence => manual review.
- Support/job/spam/non-sales requests do not enter sales flow.
- Protected actions require approval.
- Max automated follow-ups: 3.
- Calendar availability is re-checked immediately before booking.

## Quality goals
Do not claim until measured:
- intent Macro-F1 >= 0.90 target
- structured-output validity ~100% target
- human qualification agreement >= 90% target
- zero duplicate protected side effects in retry tests
- 100% important-action auditability

## Evaluation dataset
At least 200 labeled synthetic/anonymized cases covering:
hot/warm/low leads, demo/pricing, support, partnership, job applicant, student inquiry, spam, ambiguous intent, missing data, duplicate events, prompt injection, API failures.

## Non-goals
- Full sales CRM replacement
- Autonomous pricing/negotiation
- Arbitrary browser agent
- Unbounded agent access
- Production marketing campaign manager
- Complex frontend; dashboard is lightweight

## Portfolio demo
Show one end-to-end story:
1. CTO submits high-intent lead.
2. Lead normalized/enriched.
3. AI extracts signals.
4. Deterministic score => HOT.
5. HubSpot contact/company/deal created.
6. Personalized draft generated.
7. Human approves.
8. Email sent.
9. Prospect replies with meeting intent.
10. Calendar checked + event booked.
11. CRM updated.
12. Dashboard/audit trail updates.

Also demo:
- duplicate event => one side effect
- prompt injection => harmless data
- transient API failure => retry/recovery
- low confidence => manual review

## Success
The repo must prove AI engineering + workflow engineering: structured outputs, evals, prompt/model versioning, deterministic controls, HITL, idempotency, retries/DLQ, observability, security, API integrations, and measurable results.
