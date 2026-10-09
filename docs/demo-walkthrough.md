# Use RevFlow from lead to meeting

The 14 operational n8n workflows are published. Automatic schedules, Gmail polling, and real-data mode remain off. Local mode processes records without external effects. A connected session uses your saved test accounts and the selected OpenRouter model. For the app and n8n presentation, use [the connected guide](presentation-guide.md).

## 1. Start the local workspace

Start Docker Desktop. Open PowerShell and run:

```powershell
cd D:\revflow
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/docker-smoke.ps1
```

Open [the dashboard](http://127.0.0.1:3100). The badge should say **Local · Synthetic data**. This mode creates database records but sends no external email and creates no external calendar event.

## 2. Connect the dashboard

Run this command, then paste from the clipboard into **Workspace access token** and click **Connect**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name API_TOKEN
```

Click **Access** in the top-right corner. Run the next command, paste into **Approver access token**, then click **Enable approvals**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name APPROVAL_TOKEN
```

Each command copies its value without printing it. Tokens remain in page memory; enter them again after reloading the page. These commands handle the PowerShell restriction you encountered without changing system execution policy.

## 3. Run one complete journey

1. Click **Start workflow**. It supplies the CTO sample automatically, with a new event ID and email each time.
2. Wait for **Qualified**, with a **HOT** score and a pending email in **Review & approve**. Local scoring produces 100 for this fixture. Connected model output is checked before deterministic scoring; uncertain output goes to manual review.
3. Click the matching **Email review** item. Read its recipient, subject, and exact body.
4. Click **Approve**, then **Run approved action**. Approval alone does not execute the action. Wait for **Email sent**.
5. Click **Process reply**. This sends supplied sample text through the real reply-processing path in connected mode; it does not fetch mail from Gmail. The supplied reply is: `Can we schedule a meeting?`
6. Wait for **Meeting proposed**. Click one of the available date/time buttons.
7. Open the matching **Meeting booking** review item. Check its start/end times, then click **Approve** and **Run approved action**.
8. Wait for **Meeting booked**. Inspect **Activity**, select **Selected journey only**, and open **Workspace insights** for the pipeline and AI records. Use **Leads → Open** to revisit the result.

Read the selected lead's recipient before approving. The approval panel focuses on that lead; select **All leads** to see other pending reviews. Workspace totals include earlier test records. Expired reviews are excluded from the pending-approval count. **Needs attention** includes recorded failure fixtures; use Activity to inspect them. Records from another adapter mode are readable, but execution is blocked; start a new workflow when switching modes.

## 4. Try the sample leads

Use **Add a lead** in **Local · Synthetic data** mode. Copy these values into the fields. Full records are in [demo-data.json](demo-data.json); no import is required.

| Field | HOT lead | WARM lead | Rejected lead |
|---|---|---|---|
| Name | Synthetic CTO | Synthetic Operations Manager | Synthetic Student |
| Email | portfolio-hot@example.com | portfolio-warm@example.net | portfolio-student@example.org |
| Company | Example Labs | Example Operations | Leave empty |
| Company domain | example.com | example.net | example.org |
| Job title | CTO | Manager | Student |
| Consent checkbox | Checked | Checked | Unchecked |

**HOT request:**

```text
We need a demo of lead routing. I own the buying decision, have approved budget, and need to start this month.
```

**WARM request:**

```text
We are comparing lead automation tools for next quarter. Could you share pricing?
```

**Rejected request:**

```text
I am a student researching sales automation for a school assignment.
```

In mock mode, the HOT lead requires approval, the WARM lead can send its simulated outreach under policy, and the student is disqualified without outreach. These manually entered samples demonstrate qualification and outreach. Use **Start workflow** for the full supplied sample reply and booking journey. To repeat with a new lead, change its email's local part, for example `portfolio-hot-2@example.com`. Reusing an email exercises deduplication rather than creating another lead.

## 5. Run the connected version

Start a session in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-connected.ps1
```

Wait for **Connected session ready** and leave that terminal open. Refresh the dashboard; its badge should say **Connected · Synthetic data**. If you reload the browser, repeat the token steps.

Repeat the eight steps in section 3 using **Start workflow**. Custom lead entry is hidden in connected synthetic mode because the AI and provider gateways accept only approved fixture content. Use the built-in button here; use the table samples in mock mode.

You can inspect the connected outcome in:

- **HubSpot:** the new synthetic contact and deal, associated with Example Operations.
- **Gmail:** the approved email in the connected sender's own inbox and Sent folder. The example lead email shown in review is the stored contact; synthetic delivery is redirected to your test sender.
- **Google Calendar:** the approved discovery event. Its synthetic attendee uses an example address.
- **Slack:** approval/booking notifications in `all-revflow`.
- **Dashboard:** persisted state and audit events. WF02–WF07 retain successful synthetic stage executions. Open the app's n8n links to inspect actual runs; entry workflows and provider gateways discard payloads containing authentication headers.

Cloud runs consume your n8n execution allowance; model calls use the configured OpenRouter account. No subscription was purchased or upgraded by this project.

## 6. Stop connected operation

Press **Ctrl+C** in the session terminal, or open another PowerShell terminal at `D:\revflow` and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-connected.ps1
```

This unregisters the session, closes its tunnel/proxy, and restores mock mode. Cloud workflows remain published, but policy/AI requests fail closed while the local session is offline. The session lease also expires after ten minutes without renewal. Do not start two sessions at once.

## 7. Later, use real data

Follow [personal-use.md](personal-use.md#real-data-deliberate-opt-in): create the ignored private configuration, allow only chosen contacts/domains, approve your actual sales claims, acknowledge the model's data handling, and start `scripts/start-personal.ps1`. Never send the example addresses as real prospects. Every personal outbound email requires approval. Real inbox replies can be pasted into the selected contact's reply form; automatic Gmail intake remains off.

If a run goes to **MANUAL REVIEW** or **Needs attention** grows, inspect the audit trail before retrying. An uncertain send is held for reconciliation, so do not resubmit it as a new lead to force another email.
