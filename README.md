# Darpan

Mintlify documentation site for Darpan product, API, troubleshooting, and engineering guidance.

## Content model

- `index.mdx` and `quickstart.mdx` introduce the product and first workflow.
- `getting-started/**` explains concepts, Ask Darpan navigation, users, and environments.
- `guides/**` holds task-oriented product guides.
- `reference/**` holds stable product reference material.
- `troubleshooting/**` captures symptom-first repair paths.
- `api-reference/**` documents the JSON-RPC API surface and the generated OpenAPI entrypoint.
- `backend/**` explains the Moqui backend engine, service layer, reconciliation processing, rules, schemas, and tenancy model. These pages appear under the Engineering navigation tab.
- `engineering/**` captures agent coding practices, repo ownership, implementation workflow, and release guidance that is safe to publish.

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

## Documentation principles

Darpan uses Ask Darpan as the primary navigation model. Product pages should describe how users move from setup to reconciliation runs and result review.

Connections, schemas, RuleSets, saved runs, and generated outputs are not separate product stories; they are the support structure for setting up, running, and reviewing reconciliation.

Backend docs stay repo-grounded. They describe current Moqui XML services, entities, facade contracts, Spark/Drools processing, and tenant-scoped output behavior from the implementation.
