# Darpan Docs

Mintlify documentation site for Darpan product, API, troubleshooting, and engineering guidance.

## Content model

- `index.mdx` and `quickstart.mdx` introduce the product and first workflow.
- `getting-started/**` explains concepts, users, and environments.
- `guides/**` holds task-oriented product guides.
- `reference/**` holds stable product reference material.
- `troubleshooting/**` captures symptom-first repair paths.
- `api-reference/**` documents the JSON-RPC API surface and the generated OpenAPI entrypoint.
- `engineering/**` captures internal implementation, workflow, and release guidance that is safe to publish.

## Local preview

Install the Mintlify CLI:

```bash
npm i -g mint
```

Run the docs site from this repository root:

```bash
mint dev
```

Preview at `http://localhost:3000`.

## Validation

Run these checks before publishing larger updates:

```bash
mint broken-links
mint validate
```

If the CLI is not installed, at minimum validate `docs.json` and any OpenAPI JSON:

```bash
jq empty docs.json
jq empty api-reference/openapi.json
```

## Publishing

Mintlify deploys from the connected GitHub repository after changes are pushed to `main`. Use small commits and keep docs changes tied to the product, release, or support work that made them necessary.
