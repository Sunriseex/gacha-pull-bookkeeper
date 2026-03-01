SHELL := /bin/bash
SYNC_DIR := tools/patchsync
PY_PORT ?= 4173

.PHONY: serve http sync stop debug

# Запустить оба процесса (http + sync) параллельно
serve: http sync
	@echo "All started. Use: make stop"

# HTTP server на Python
http:
	@echo "Starting http.server on :$(PY_PORT)"
	@python -m http.server $(PY_PORT) & echo $$! > .pid.http

# Go sync service
sync:
	@echo "Starting patchsync"
	@cd "$(SYNC_DIR)" && go run . --serve
	
# Остановить оба процесса
stop:
	@-test -f .pid.http && kill $$(cat .pid.http) && rm -f .pid.http && echo "Stopped http" || true
	@-test -f .pid.sync && kill $$(cat .pid.sync) && rm -f .pid.sync && echo "Stopped sync" || true

debug:
	@echo "CURDIR=$(CURDIR)"
	@pwd
	@ls -la go.mod || true
	@go env GOMOD
	@go env GO111MODULE