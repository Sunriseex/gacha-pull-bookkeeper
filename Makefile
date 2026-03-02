SHELL := /bin/bash
PY_PORT ?= 4173
SYNC_DIR := tools/patchsync

.PHONY: serve stop

serve:
	@set -euo pipefail; \
	echo "Starting http on :$(PY_PORT)"; \
	python -m http.server $(PY_PORT) & HTTP_PID=$$!; \
	echo $$HTTP_PID > .pid.http; \
	echo "Starting patchsync"; \
	( cd "$(SYNC_DIR)" && go run . --serve ) & SYNC_PID=$$!; \
	echo $$SYNC_PID > .pid.sync; \
	cleanup() { \
	  echo "Stopping..."; \
	  kill $$HTTP_PID $$SYNC_PID 2>/dev/null || true; \
	  rm -f .pid.http .pid.sync; \
	}; \
	trap cleanup INT TERM EXIT; \
	wait

stop:
	@-test -f .pid.http && kill $$(cat .pid.http) 2>/dev/null || true
	@-test -f .pid.sync && kill $$(cat .pid.sync) 2>/dev/null || true
	@rm -f .pid.http .pid.sync