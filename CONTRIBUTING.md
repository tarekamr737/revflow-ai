# Contributing

Use Node.js 22+ and start with the mock-only quick start in the README. Work on a branch and keep changes focused on one behavior.

Before opening a pull request, run:

```bash
npm ci
npm test
npm run check
npm run eval
npm run eval:replay
```

Describe the problem, resulting behavior, and relevant validation. Include a screenshot for interface changes and measured evidence for metric claims.

## Engineering constraints

- Keep scoring, validation, permissions, and side-effect decisions deterministic.
- Treat all lead text as untrusted data; validate structured model outputs independently.
- Preserve action idempotency, exact-content approvals, and correlation-ID audit events.
- Create, update, validate, and test deployed n8n workflows through n8n MCP. Workflow SDK files are source references, not a request to manually import JSON.
- Add a new versioned migration when the schema changes; never edit an applied migration.
- Keep tests synthetic and isolated. Do not send real email, book real meetings, or enable provider triggers as part of CI.
- Keep secrets and account-specific configuration out of commits. Follow [SECURITY.md](SECURITY.md) for sensitive reports.

Read [AGENTS.md](AGENTS.md), [PRODUCT.md](PRODUCT.md), and [ARCHITECTURE.md](ARCHITECTURE.md) before changing stage contracts. Record task evidence concisely in [TASKS.md](TASKS.md).
