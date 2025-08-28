APP_NAME := richdocter
PKG := ./cmd/$(APP_NAME) 

.PHONY: build run clean

build:
	go build -o bin/$(APP_NAME) $(PKG)

run: build
	./bin/$(APP_NAME)

clean:
	rm -rf bin
