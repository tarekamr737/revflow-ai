# Connected credential setup

A new checkout needs its own n8n instance and authorized provider accounts. Copy [config/n8n.example.json](../config/n8n.example.json) to ignored `config/n8n.json` and set your deployed instance and workflow ID. Recorded workflow IDs and provider bindings belong to the development environment.

Create the following credentials in your n8n project. The names match the workflow source references; bind credentials through n8n MCP and run fixtures before activation.

| Credential name | n8n type | Purpose |
|---|---|---|
| `RevFlow OpenRouter Test` | `openRouterApi` | Model calls; current source selects `nvidia/nemotron-3-super-120b-a12b:free` |
| `RevFlow HubSpot Test` | `hubspotOAuth2Api` | Company/contact/deal reads and writes, associated notes and tasks |
| `RevFlow Gmail Test` | `gmailOAuth2` | Dedicated test inbox; read and send permissions |
| `RevFlow Calendar Test` | `googleCalendarOAuth2Api` | Dedicated calendar; event creation and free/busy access |
| `RevFlow Slack Test` | `slackOAuth2Api` | Notifications in an authorized test channel |
| `RevFlow Policy API` | `httpTemplatedCustomAuth` | Internal policy calls authenticated with the policy API token |
| `RevFlow Inbound Token` | `httpHeaderAuth` | Authenticated business entry triggers |
| `RevFlow Gateway Token` | `httpHeaderAuth` | Authenticated provider and AI gateways |

## Internal authentication

Run the Docker smoke setup first. It generates development tokens in process/container environment. The credential helper copies a selected token to the clipboard without printing it:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name API_TOKEN
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name N8N_INBOUND_TOKEN -Bearer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/copy-credential.ps1 -Name N8N_GATEWAY_TOKEN -Bearer
```

Run each command separately and paste immediately into the intended field; the next command replaces the clipboard. Clear it after use with `Set-Clipboard -Value ''`.

For the policy credential, use this template and keep `api_key` secret:

```json
{"headers":{"Authorization":"Bearer {{api_key}}"}}
```

Paste the raw policy token into the generated API-key field. If the UI presents a **Placeholder Values** JSON field, use the helper's `-PlaceholderJson` switch instead.

For inbound and gateway credentials, set the header name to `Authorization` and paste the corresponding `-Bearer` value. Keep these tokens separate from the policy token and human approver token. `APPROVAL_TOKEN` belongs only to the approver; never bind it to ordinary workflow stages.

## Provider configuration

Authorize a dedicated synthetic test environment. Gmail needs read/send access; Calendar needs event/free-busy access. HubSpot needs company, contact, and deal read/write access plus the ability to create associated notes/tasks. Slack needs posting access and membership in the selected test channel.

Set your calendar, CRM pipeline/stage, sender, recipient, and Slack routing locally. Provider keys remain in n8n credential storage. The recorded synthetic guard and session helper include a fixed development Slack channel; adapt the source guard, local routing, and native gateway together through MCP and verify the authorization fixtures before using another channel. Do not broadly permit arbitrary channels or URLs.

The Windows session helper also requires `cloudflared.exe` in ignored `.tools/`. It opens an expiring stage-only HTTPS endpoint; the machine and session must remain running. Private recipient overrides can be passed with `-TestRecipient` or stored in ignored `config/connected.local.json`.

## Verify before activation

1. Validate the deployed workflow with n8n MCP and pass happy, malformed, injection, and unauthorized fixtures.
2. Confirm that policy calls write canonical PostgreSQL state and correlation-ID events.
3. Run the native synthetic lead-to-approval path, then review and explicitly approve one email.
4. Process its reply, approve one booking, and verify the calendar event and CRM records.
5. Repeat protected requests and confirm that sends/bookings remain singular.
6. Keep polling and scheduled triggers paused until their own fixtures pass.

The [presentation guide](presentation-guide.md) describes the walkthrough. [Historical migration evidence](account-migration.json) and [CRM recovery evidence](crm-recovery-fix.json) record scoped checks in the development environment.
