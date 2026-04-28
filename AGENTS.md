# Darpan Docs instructions

## About this project

- This is the Mintlify documentation site for Darpan.
- Pages are MDX files with YAML frontmatter.
- Navigation, branding, and API generation live in `docs.json`.
- Run `mint dev` to preview locally.
- Run `mint broken-links` and `mint validate` before publishing broad changes.
- If the Mintlify CLI is not available, validate JSON with `jq empty docs.json api-reference/openapi.json`.

## Content boundaries

- Public product docs should explain Darpan workflows without exposing credentials, tenant data, private URLs, or customer-specific secrets.
- Engineering docs may explain repo structure, workflow rules, and implementation patterns, but must stay safe for a public repo.
- Do not publish copied customer data, API tokens, cookies, Postman environments, private Linear details, or live credentials.
- Prefer linking to public GitHub repositories over pasting long source excerpts.
- Keep API docs honest: document the current JSON-RPC service shape until a fuller generated OpenAPI catalog exists.
- Backend engine docs must be grounded in `darpan-backend/runtime/component/darpan`. Prefer current XML services, entities, facade contracts, Spark/Drools processing, and tenant-scoped output behavior over aspirational architecture.

## Terminology

- Use "Darpan" for the product.
- Use "schema" for a saved JSON schema definition.
- Use "reconciliation run" for an executed compare workflow.
- Use "connection" for SFTP, NetSuite, AI provider, and similar external setup records.
- Use "active company" or "active tenant" only when discussing scoped data access.
- Use "RuleSet" when referring to the rules-backed reconciliation model.
- Use "JSON-RPC" for the backend `/rpc/json` integration surface.

## Style preferences

- Use active voice and second person ("you").
- Keep sentences concise.
- Use sentence case for headings.
- Bold UI elements and command results: Select **Open SFTP Servers**.
- Use code formatting for file names, commands, paths, and code references.
- Prefer task-oriented pages for workflows and reference pages for stable contracts.
- Call out assumptions, prerequisites, expected results, and next steps.
- Write product tutorials for the Ask Darpan navigation model first.
- When a workflow starts in the app shell, tell users to open **Ask Darpan** with `Cmd/Ctrl+K` or the floating **Ask Darpan** button, then search for the task.
- Avoid assuming a permanent left sidebar, top menu, or traditional nested navigation unless the page itself has local controls after Ask Darpan opens the surface.

## Update rules

- Update docs in the same change as product behavior when the user-facing workflow changes.
- For feature or bug work in the Darpan code repos, Linear remains the source of truth.
- For pure docs setup and maintenance in this repo, no Linear issue is required unless the user asks for one.
- Keep `docs.json` navigation in sync with moved or renamed pages.
