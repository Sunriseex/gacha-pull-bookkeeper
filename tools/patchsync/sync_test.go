package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

const syncPatchCSV = "Version 1.0\nVersion Length,42\nVersion Events,160,0,0,0\nPermanent Content,0,0,0,0\nMailbox/Miscellaneous,0,0,0,0\nRecurring Sources,0,0,0,0\n"

func TestSyncTransactions(t *testing.T) {
	t.Chdir(t.TempDir())
	for _, scenario := range []string{"data unavailable", "data empty", "data malformed", "patch fetch", "patch parse", "missing overrides", "success", "dry run"} {
		t.Run(scenario, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "wuwa.generated.js")
			old := []byte("export const GENERATED_PATCHES = [{\"id\":\"0.9\",\"patch\":\"0.9\"}];\n")
			if err := os.WriteFile(path, old, 0o644); err != nil {
				t.Fatal(err)
			}
			transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
				status, body := 200, ""
				switch r.URL.Query().Get("sheet") {
				case "Data":
					body = "Version,,1.0,1.1\nVersion Events,,1,2\n"
					if scenario == "data unavailable" {
						status = 503
					}
					if scenario == "data empty" {
						body = ""
					}
					if scenario == "data malformed" {
						body = "bad data"
					}
					if scenario == "missing overrides" {
						body = "Version,,1.0,1.1\nVersion Events,,1,\n"
					}
				case "1.0":
					body = syncPatchCSV
				case "1.1":
					body = syncPatchCSV
					if scenario == "patch fetch" {
						status = 503
					}
					if scenario == "patch parse" {
						body = "invalid patch"
					}
				default:
					if strings.Contains(r.URL.Path, "/feeds/") {
						body = `{"feed":{"entry":[{"title":{"$t":"1.0"}},{"title":{"$t":"1.1"}}]}}`
					} else {
						body = `<div class="docs-sheet-tab-caption">1.0</div><div class="docs-sheet-tab-caption">1.1</div>`
					}
				}
				return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
			})
			result, err := runSync(context.Background(), SyncConfig{GameID: gameIDWuwa, SpreadsheetID: "test", OutputPath: path, Transport: transport, DryRun: scenario == "dry run", CreateBranch: scenario == "dry run"})
			if scenario == "success" || scenario == "dry run" {
				if err != nil {
					t.Fatal(err)
				}
				if len(result.Patches) != 2 || len(result.AllPatches) != 3 {
					t.Fatalf("lost patch history: %+v", result)
				}
			} else {
				expected := map[string]string{
					"data unavailable": "fetch required Data", "data empty": "Data sheet is empty",
					"data malformed": "parse required Data", "patch fetch": "fetch sheet 1.1",
					"patch parse": "parse sheet 1.1", "missing overrides": "apply Data overrides for sheet 1.1",
				}[scenario]
				if err == nil || !strings.Contains(err.Error(), expected) {
					t.Fatalf("expected %q error, got %v", expected, err)
				}
			}
			got, readErr := os.ReadFile(path)
			if readErr != nil {
				t.Fatal(readErr)
			}
			if scenario == "success" {
				patches, err := readGeneratedPatches(path)
				if err != nil || len(patches) != 3 {
					t.Fatalf("invalid written patches: %v", err)
				}
			} else if !bytes.Equal(got, old) {
				t.Fatal("existing data changed on failure or dry run")
			}
			if _, err := os.Stat(path + ".lock"); !os.IsNotExist(err) {
				t.Fatal("lock was not released")
			}
		})
	}
}

func TestMalformedGeneratedFileIsNotAnEmptyBaseline(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.js")
	if err := os.WriteFile(path, []byte("export const GENERATED_PATCHES = ["), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readGeneratedPatches(path); err == nil {
		t.Fatal("corrupt baseline accepted")
	}
}

func TestAtomicReplacementAndFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.js")
	for _, content := range []string{"old", "complete replacement"} {
		if err := writeFileAtomic(path, []byte(content)); err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(path)
		if err != nil || string(got) != content {
			t.Fatalf("wrong replacement: %q, %v", got, err)
		}
	}
	// Renaming over a nonempty directory must fail without removing it or leaking a temp file.
	target := filepath.Join(dir, "blocked")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "keep"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic(target, []byte("bad")); err == nil {
		t.Fatal("expected rename error")
	}
	if _, err := os.Stat(filepath.Join(target, "keep")); err != nil {
		t.Fatal(err)
	}
	matches, _ := filepath.Glob(filepath.Join(dir, ".patchsync-*.tmp"))
	if len(matches) != 0 {
		t.Fatalf("temporary files leaked: %v", matches)
	}
}

func TestConcurrentOutputLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.js")
	unlock, err := lockOutput(path)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			release, err := lockOutput(path)
			if err == nil {
				release()
				t.Error("concurrent writer acquired held lock")
			}
		}()
	}
	wg.Wait()
	unlock()
	release, err := lockOutput(path)
	if err != nil {
		t.Fatal(err)
	}
	release()
}

func TestNullOriginRejected(t *testing.T) {
	if isOriginAllowed("null", parseAllowedOrigins("http://localhost:5173")) {
		t.Fatal("opaque origin accepted")
	}
}
