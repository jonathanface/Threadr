APP_NAME := threadr
PKG := ./cmd/threadr

.PHONY: build run clean

build:
	go build -o bin/$(APP_NAME) $(PKG)

run: build
	./bin/$(APP_NAME)

clean:
	rm -rf bin

run-ui:
	npm --prefix ./static run dev

lint:
	golangci-lint run --fix

lint-ui:
	npm --prefix ./static run lint

unit-test:
	@go test ./...
	@npm run test --prefix static

coverage:
	@echo "Running tests with coverage..."
	@go list ./... | xargs go test -cover

coverage-html:
	@echo "Generating HTML coverage report..."
	@go test -coverprofile=coverage.out $$(go list ./... )
	@go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"
	@echo "Opening in browser..."
	@open coverage.html || xdg-open coverage.html || echo "Please open coverage.html manually"

dev-mobile: build
	@echo "Setting up local mobile development environment..."
	@./scripts/dev-mobile.sh

dev-local: build
	@echo "Stopping mobile development environment..."
	@./scripts/stop-mobile.sh
	@echo "Starting backend in local mode..."
	@./bin/$(APP_NAME)

