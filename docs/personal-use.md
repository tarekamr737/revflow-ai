# Personal operation

RevFlow is a lead-to-meeting system operated from your Windows PC. PostgreSQL data and project caches stay under the checkout. Cloud hosting is optional; connected operation requires the PC, Docker, and the session terminal to stay running.

## Deployment scope

The public repository starts in local synthetic mock mode. Configure your own n8n account and provider credentials before connected operation; copy `config/n8n.example.json` to ignored `config/n8n.json`. The unified workflow is validated, but the development deployment's final three-scenario cutover and retirement of former workflows remain pending.

[Migration evidence](account-migration.json) records an earlier connected synthetic deployment. Those account IDs and activation records do not configure a new checkout. Real-data mode remains opt-in and is blocked while synthetic tracing is enabled.

## Local operation

Start Docker Desktop. Open PowerShell:

```powershell
# Run from the repository root.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/docker-smoke.ps1
```

Open `http://127.0.0.1:3100`. Copy the workspace token and paste it into the dashboard:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name API_TOKEN
```

Click **Connect** after pasting the workspace token. Then click **Access**, copy the approver token below, paste it into **Approver access token**, and click **Enable approvals**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name APPROVAL_TOKEN
```

Values go only to your clipboard and page memory. The per-command execution-policy setting avoids the earlier PowerShell script restriction without changing system policy.

Click **Start workflow**. Review the exact email, approve it, and click **Run approved action**. Click **Process reply**, select a proposed slot, then approve and run the booking. The local processing performs no external sends or bookings. Use **Leads → Open** to reopen progress, **Activity** for decisions, and **Workspace insights** for pipeline and AI records.

## Connected synthetic operation

Use your own tested and authorized deployment. The n8n host is read from `config/n8n.json`; provider secrets remain in n8n credentials. If a session is already running, use it instead of starting another.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-connected.ps1
```

Keep that terminal open. The session opens a stage-only HTTPS tunnel and registers its address through the authenticated n8n connector gateway. The gateway renews a ten-minute session lease every five minutes; the consolidated workflow’s trigger URLs remain stable across restarts. Closing with **Ctrl+C** removes the registered endpoint, stops that session's tunnel, and restores the local mock runtime. You can also run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-connected.ps1` in a second terminal. If a crash prevents cleanup, the lease expires. Do not start two sessions simultaneously.

The connected session uses the saved native HubSpot, Gmail, Calendar, Slack, and OpenRouter credentials. Emails go to the inbox passed with `-TestRecipient`; without that parameter, they go to the connected sender’s inbox. Calendar/CRM fixtures use reserved example addresses. Each journey creates a new synthetic lead; it does not delete or reset existing records. Model requests include only approved fixture text. Provider usage may incur charges; current results report only measured costs.

Records from both modes remain visible. Continue a lead in the mode that created it; cross-mode actions are blocked. Shared company reservations are separated by mode so mock CRM IDs cannot enter live requests.

## Real data: deliberate opt-in

1. Close any connected session. Verify through n8n MCP that the consolidated workflow retains no successful/error payloads, and that [workflow-tracing.json](workflow-tracing.json) has `enabled: false`. Personal startup checks this flag. Copy `config/personal.example.json` to ignored `config/personal.json`.
2. Enter the exact allowed contact emails and company domains. Begin with addresses you own. Populate account routing IDs from your connected accounts.
3. Write your actual product name, approved claims (`id` and `text`), CTA, and approved HTTPS links. Leave `pricing` null. Use a new `sales-personal-...` version for changes. Only set `knowledge.approved` after reviewing the content; the included portfolio knowledge cannot be used for personal outreach.
4. Review the selected OpenRouter model's current data terms. The configured model is `nvidia/nemotron-3-super-120b-a12b:free`; earlier model permissions covered synthetic fixtures only. Messages may contain identifying details even after emails/phones/tokens are redacted. Set `model_data_acknowledged` and `enabled` true only when you choose to send your allowed real data through n8n and that provider.
5. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-personal.ps1
```

The script validates the private configuration, installs immutable reviewed knowledge using the setup database role, and starts live personal mode. The application database role cannot change sales configuration. No recipient addresses or credentials are printed. n8n session configuration receives recipient/domain hashes rather than their plaintext values.

Submit a permitted lead using **Add a lead**. Consent is never inferred. Every personal outbound email, including WARM follow-ups, requires approval; the test-recipient override is prohibited. Paste an actual reply into the selected contact's reply form, select an available slot, and review the booking. Slot availability is checked again at booking time.

Gmail automatic intake is optional and remains inactive. If requested later, enable it through MCP only after personal mode and mailbox tests pass. Its filter reads only mail explicitly labeled **RevFlow**, excludes messages from your own account, and matches replies by both sender and persisted outbound thread. Unmatched inbound messages do not gain marketing consent.

## Data and recovery

Never commit `config/personal.json`, `.env`, `.data`, browser profiles, or backups. Copy the eight named credentials only into n8n or the local dashboard, never chat. The HTTPS proxy exposes only authenticated stage routes; the dashboard and approvals remain loopback-only.

Ambiguous HubSpot companies from early tests remain for manual review. The company-first creation path prevents new automatic-association races. Uncertain sends/writes are held for reconciliation rather than retried blindly. Human qualification agreement remains unmeasured; synthetic evaluation scores are not evidence of real-world accuracy.

Before changing or deleting real data, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/backup-postgres.ps1`. It saves and verifies a private archive under ignored `.data/backups` on D:. The project does not automatically delete fixture or account records.
