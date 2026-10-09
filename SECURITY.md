# Security

## Reporting a vulnerability

Use this repository's **Security → Report a vulnerability** feature to submit a private report. Include the affected revision, reproducible steps using synthetic data, and the expected impact. Do not post credentials, tokens, private lead data, or exploitable account details in public issues.

If private reporting is unavailable, open an issue requesting a private contact without including vulnerability details.

## Supported scope

The current `main` branch is maintained. This repository provides a local synthetic demo and reference workflows; operators are responsible for validating their own connected deployment. Historical test evidence does not establish the security of another account or configuration.

## Configuration boundaries

- Never commit `.env`, `config/n8n.json`, `config/personal.json`, or `config/connected.local.json`.
- Keep provider credentials in n8n credential storage and internal secrets in the deployment environment.
- Use separate workspace and approver credentials. Production requires strong secrets and authenticated entry points.
- Local unauthenticated development is intended for loopback access only. Do not expose that development mode publicly.
- Preserve consent, opt-out, exact-payload approval, and uncertain-write reconciliation controls.
- Disable synthetic execution tracing before opting into personal data; minimize model inputs and execution retention.
- Back up PostgreSQL and the n8n encryption key separately. Rotate database passwords through a deliberate migration of both runtime configuration and database roles.

`npm run check` scans publishable text files for common secret patterns. It complements review; it is not a certification that all possible sensitive data has been detected.
