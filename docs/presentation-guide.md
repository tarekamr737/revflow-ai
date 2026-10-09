# Present RevFlow on one n8n canvas

The consolidated workflow is [revflow_lead_to_revenue](https://tarek1new.app.n8n.cloud/workflow/9edsFvbor95eIqtM): 85 validated nodes, 29 credential bindings, and no Execute Sub-workflow calls. Its deterministic MCP fixtures pass, including execution 625. The connected synthetic session restarted successfully on 2026-10-09; the dashboard and authenticated n8n policy round trip pass. **Live cutover is pending:** former workflows remain available until the three native situations pass on this canvas. [Consolidation evidence](unified-workflow.json) records the earlier failure; current restart evidence is in TASKS.md.

Run the app beside n8n. The lead information is synthetic; orchestration, AI requests, HubSpot updates, Gmail delivery, and Calendar booking use the connected services. The **Connected · Synthetic data** badge identifies the data being processed.

Use **Leads → Open** to inspect a previously verified **Meeting booked** journey and its Activity records. Once the connected cutover passes, present a fresh journey with **Start workflow** and section 3. When it reaches **Qualified → Review the email**, review, approve and run the pending action.

## 1. Start the connected workspace

Start Docker Desktop, then open PowerShell:

```powershell
cd D:\revflow
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-connected.ps1 -TestRecipient '<your Gmail address>'
```

Wait for **Connected session ready**. Keep that terminal, Docker, and your PC running. If a session is already running, use it instead of starting another.

Open [RevFlow](http://127.0.0.1:3100). Copy the workspace token, paste into **Workspace access token**, and click **Connect**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name API_TOKEN
```

Click **Access**. Copy the approver token, paste into **Approver access token**, and click **Enable approvals**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name APPROVAL_TOKEN
```

These commands copy values without printing them. Reloading clears access from page memory; reconnect afterward. Confirm **Connected · Synthetic data** before starting.

## 2. Open the one workflow beside the app

Open [RevFlow's complete workflow](https://tarek1new.app.n8n.cloud/workflow/9edsFvbor95eIqtM). Its business rows show:

- **Lead received → Persist intake → Validate and deduplicate → Enrich company → Extract buying signals → Score and route → Sync HubSpot → Draft outreach and request approval.**
- **Approved email action → Send approved email.**
- **Reply received → Classify reply and route next action**, with meeting, question and unsubscribe outcomes.
- **Approved booking action → Check availability and book.**

The same canvas includes the native AI/provider nodes, session relay, owner-triggered utilities and failure audit. Expand a group to inspect its nodes. Approvals and replies create subsequent executions on this same workflow; a complete lead lifecycle is not one uninterrupted execution.

Use the app to start business runs once the connection is verified. n8n's Manual Trigger executes the isolated deterministic checks. Authenticated production payloads are not retained in n8n because they contain authorization headers; inspect business outcomes in RevFlow **Activity**, HubSpot, Gmail, Calendar and Slack. The earlier saved stage-execution links belong to the modular deployment and are historical evidence. Automatic schedules and Gmail polling remain off.

## 3. Show one complete journey

| Step | Action | What people can inspect |
|---|---|---|
| 1 | Click **Start workflow**. | A new synthetic CTO lead enters the single workflow’s inline intake-to-outreach sequence. |
| 2 | Wait for **Qualified** and its email review. Expand Extract buying signals on the workflow canvas and inspect the selected lead’s AI record in Activity. | Model output is schema-checked; deterministic rules compute the score. Low-confidence results go to manual review. |
| 3 | Expand Sync HubSpot and open the contact/deal in HubSpot. | Actual CRM writes, with persisted business state. |
| 4 | Read the exact email in **Review & approve**. Click **Approve**, then **Run approved action**. | Approval and execution are separate. Wait for **Email sent**, then show Gmail's inbox or Sent folder. |
| 5 | Click **Process reply**. | The supplied text, `Can we schedule a meeting?`, runs through the reply branch’s real classifier and calendar-availability path. This is supplied sample text, not mail fetched from Gmail. |
| 6 | Wait for **Meeting proposed**, then choose an available time. | Proposed calendar slots and a separate booking review. |
| 7 | Review the booking, click **Approve**, then **Run approved action**. | Wait for **Meeting booked** and show the actual event in Google Calendar. |
| 8 | Open **Activity → Selected journey only** and **Workspace insights**. | Auditable decisions, completed actions, and measured model records for this lead. |

After the connected cutover is verified, each **Start workflow** creates a fresh reserved example address so separate situations do not merge through email deduplication. Email delivery and future Calendar attendees use the inbox supplied with `-TestRecipient`; without that parameter, they use the connected sender's inbox. The approval review displays the actual delivery address. Restart the connected session after changing the inbox. Existing completed sends and bookings keep their receipts; use a new journey for a new delivery. HubSpot contacts/deals and Calendar events are real records containing synthetic information.

### Present all three situations

Keep RevFlow, n8n's Executions page, Gmail, HubSpot, Google Calendar, and Slack open. In Slack, open **all-revflow**. For each situation:

1. Select **Situation**, then click **Start workflow** once.
2. Wait for qualification and HubSpot sync. Copy the synthetic lead address shown in the app and search for it in HubSpot **Contacts**. Open the contact and its associated deal.
3. Review the exact email and its delivery address. Click **Approve**, then **Run approved action**. Show the delivered email in your chosen Gmail inbox.
4. Click **Process reply**. This submits the fixed text for that situation through the reply branch of the unified workflow. It does not fetch an incoming Gmail message; Gmail polling remains paused.
5. Follow the outcome below. Open **Activity** to inspect the selected lead's actions and correlation IDs, and match those IDs to Slack notifications.

| Situation | Fixed reply | Result to show |
|---|---|---|
| **Meeting request** | `Can we schedule a meeting?` | Calendar availability is checked across the next two weeks. Choose a proposed slot, approve the booking, then run it. Show **Meeting booked**, the Calendar event, the HubSpot meeting note, and Slack's `MEETING_BOOKED` notification. |
| **Product question** | `Please explain the product?` | The reply is classified and routed to human follow-up. Show **Reply received**, a task on the associated HubSpot contact, and Slack's `REPLY_REVIEW_REQUESTED` notification. The system does not invent a product answer or book a meeting. |
| **Unsubscribe** | `Please unsubscribe me.` | Show **Outreach stopped** and Slack's `OPTED_OUT` notification. Consent is withdrawn and scheduled follow-ups are cleared immediately. No task or Calendar booking is created. |

Slack also posts `APPROVAL_REQUESTED` when outreach or booking needs review. Notifications contain an event code and correlation ID; prospect details stay in the app and CRM.

Use **Leads → Open** to switch between the three completed situations without creating more records or sending more emails. [Connected scenario evidence](connected-scenarios.json) records one email per situation, one booking for the meeting case, one task for the question case, opt-out enforcement, native provider receipts, and audit checks. Every fresh run uses n8n executions.

The three previously completed records are ready to inspect; their linked executions belong to the former modular deployment:

| Situation | HubSpot contact | n8n qualification execution |
|---|---|---|
| Meeting request | [Open contact](https://app-eu1.hubspot.com/contacts/149462501/record/0-1/887011618012) | [Execution 383](https://tarek1new.app.n8n.cloud/workflow/m1dqLpTtqhwtLOZe/executions/383) |
| Product question | [Open contact and task](https://app-eu1.hubspot.com/contacts/149462501/record/0-1/887069429969) | [Execution 443](https://tarek1new.app.n8n.cloud/workflow/m1dqLpTtqhwtLOZe/executions/443) |
| Unsubscribe | [Open contact](https://app-eu1.hubspot.com/contacts/149462501/record/0-1/887069600994) | [Execution 480](https://tarek1new.app.n8n.cloud/workflow/m1dqLpTtqhwtLOZe/executions/480) |

In HubSpot, inspect the contact's associated deal and activity timeline. The unsubscribe decision is recorded in RevFlow's canonical database and Slack; it does not claim to change HubSpot's marketing-subscription settings.

Provider/model latency varies. **Preparing your email** means CRM sync or drafting is still running; **Review the email** appears when an approval exists. **Workflow needs attention** means a recorded failure has paused processing. Use the app’s **Refresh** button to update the queue without clearing session credentials. Pending approval is an intentional pause. If the lead enters manual review or an action fails, inspect its recorded reason before retrying. Do not clear an action key or create a duplicate lead to force an uncertain send.

The app's lead search lets you reopen a completed journey. Workspace totals include earlier tests; use the selected-journey Activity filter when explaining a specific run. Use [sample records](demo-data.json) for local input checks; connected synthetic operation accepts the built-in approved fixture content.

## 4. Explain the benefits

- **Connected handoffs:** intake, qualification, CRM, outreach, replies, and booking share one persisted lead journey.
- **Consistent routing:** AI extracts bounded signals; versioned deterministic rules determine scores and permissions.
- **Human control:** exact-content review and separate approvals govern email and booking.
- **Duplicate protection:** action reservations and saved receipts prevent repeated sends and bookings.
- **Traceable outcomes:** PostgreSQL events and saved provider receipts make decisions inspectable; n8n shows the orchestration on one canvas.
- **One inspectable canvas:** business stages, shared AI/provider services, utilities and error handling live in one workflow; PostgreSQL still owns business state.

Describe these as implemented capabilities. Do not claim revenue gains, hours saved, or real-world model accuracy without measuring them. The local suite passes 72 tests; [CRM recovery verification](crm-recovery-fix.json) includes the latest regression checks; [verification](verification.json) and [measured evaluation](../evaluation/results-recorded-live.json) record the evidence and its limits.

The current model is `nvidia/nemotron-3-super-120b-a12b:free`, with reasoning disabled and strict output validation. [Six native fixtures](model-current-smoke.json) pass, including injection cases that deterministic scoring routes to manual review. The older 112-request evaluation describes the previous model; it is not a benchmark of the current model.

## 5. Stop after showing it

Connected runs consume n8n executions and provider usage. The session also renews its connection every five minutes. Stop when finished:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-connected.ps1
```

This unregisters the session, closes its tunnel, and restores local processing. Existing records remain. Workflow publication means triggers are available; your dashboard remains accessible only on your PC.

Before using real contacts, follow [personal operation](personal-use.md#real-data-deliberate-opt-in). Synthetic execution tracing must first be disabled and verified through n8n MCP; personal startup blocks while it is enabled.
