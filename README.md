# Threadr

A fiction-writing tool. Users define their story's characters, locations, events, and other entities in advance; when they write, mentions of those entities are highlighted automatically in the text and are clickable to retrieve the associated details.

Public site: https://threadr.net

## Stack

- **Backend:** Go 1.25 (module `Threadr`)
- **Frontend:** React + Lexical rich-text editor (bundled via webpack)
- **Hosting:** AWS — ECS for the long-running service, Lambda for scheduled/async jobs
- **Data:** DynamoDB (via `aws-sdk-go-v2`), S3 for assets, SES for email
- **Auth:** OAuth via `markbates/goth` + JWT (`golang-jwt/jwt/v5`)
- **Billing:** Stripe (`stripe-go/v79`)
- **PDF export:** `go-wkhtmltopdf`

## Repo layout

```
api/         HTTP handlers (gorilla/mux), per-feature .go + _test.go
auth/        OAuth, JWT, session wiring
billing/     Stripe integration
converters/  Document / format conversion
daos/        Data access objects (DynamoDB)
email/       SES wrapper
lambdas/     cleanup, migration, tablereplace, transform
logger/      Structured JSON logging
models/      Shared domain types (stories, chapters, series, associations, users)
sessions/    gorilla/sessions wiring
ctxkeys/     Request-context key definitions
cmd/threadr/ Service entrypoint
assets/      Static assets served by the Go service
static/      Webpack-built frontend bundle output
scripts/     Build / ops scripts
```

The auto-highlighting entities (characters, locations, events, etc.) are modeled as "associations" — see `api/*_association*.go` and the `models/` package.

## Development

Common Makefile targets:

```
make build         # Compile the Go service
make run           # Build and run locally
make run-ui        # Run frontend dev server
make lint          # Lint Go
make lint-ui       # Lint frontend
make unit-test     # Run Go unit tests
make coverage      # Coverage report
make coverage-html # HTML coverage report
make dev-local     # Local dev loop
make dev-mobile    # Dev loop paired with the MiniDocter mobile app
```

VS Code is the primary editor; on-save actions auto-compile webpack for the frontend.

## Deployment

- `/ecs/richdocter-task` is the active ECS log group in production CloudWatch.
- Lambdas under `lambdas/` are deployed independently of the main service.
- Credentials for local AWS CLI / scripts live in `.env` at the repo root (gitignored).

## Related

- [MiniDocter](../MiniDocter) — companion React Native mobile app (internal name `minithreadr`, store package `io.docter.mobile`). Shares the Lexical editor via a WebView bridge.
