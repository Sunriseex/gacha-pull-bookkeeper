package main

import (
	"context"
	"io"
	"math"
	"net/http"
	"strings"
	"sync"
	"testing"
)

func TestSheetNumberFormat(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want float64
	}{{"0.125", .125}, {"1.250", 1.25}, {"1,250.5", 1250.5}, {"-0.125", -.125}, {"", 0}, {"0", 0}} {
		got, err := parseSheetNumber(tc.raw)
		if err != nil || got != tc.want {
			t.Errorf("%q: got %v, %v; want %v", tc.raw, got, err, tc.want)
		}
	}
	for _, raw := range []string{"#REF!", "unknown", "NaN", "Infinity", "1,25", "1.2.3"} {
		if _, err := parseSheetNumber(raw); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
}

func TestRewardParserRejectsBrokenNumericCell(t *testing.T) {
	_, err := parseSheetToPatchWuwa("1.0", strings.Replace(syncPatchCSV, "160,0,0,0", "#REF!,0,0,0", 1))
	if err == nil || !strings.Contains(err.Error(), "invalid numeric cell") {
		t.Fatalf("expected numeric cell error, got %v", err)
	}
	if _, err := parseWuwaDataSheet("Version,,1.0\nVersion Events,,#REF!\n", []string{"1.0"}); err == nil {
		t.Fatal("Data accepted #REF!")
	}
}

func TestHSRPartialOverridesMatchFrontendFallback(t *testing.T) {
	for _, permanent := range []float64{0, 320} {
		p := Patch{Patch: "1.0", Sources: []Source{
			source("dailyTraining", "Daily", "always", nil, true, Rewards{Oroberyl: 1600}),
			source("permanent", "Permanent", "always", nil, true, Rewards{Oroberyl: permanent}),
			source("travelLogEvents", "Events", "always", nil, true, Rewards{Oroberyl: 850}),
		}}
		if err := applyHsrDataPullOverrides(&p, map[string]map[string]float64{"1.0": {"dailyTraining": 10, "__totalF2P": 20}}); err != nil {
			t.Fatal(err)
		}
		total := 0.0
		for _, s := range p.Sources {
			if s.Pulls != nil {
				total += *s.Pulls
			} else {
				total += s.Rewards.Oroberyl/160 + s.Rewards.Chartered
			}
		}
		if math.Abs(total-20) > 1e-9 {
			t.Fatalf("got %v pulls, want 20", total)
		}
	}
}

func TestPublishedSheetsCacheExpiresBetweenSyncContexts(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		body := `items.push({name: "1.0", gid: "1"});`
		if calls > 1 {
			body += `items.push({name: "1.1", gid: "2"});`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	first := context.WithValue(context.Background(), sheetGIDCacheKey{}, &sync.Map{})
	for range 2 {
		data, err := getPublishedSheetGIDs(first, client, "2PACX-test")
		if err != nil || len(data) != 1 {
			t.Fatalf("first sync: %v, %v", data, err)
		}
	}
	second := context.WithValue(context.Background(), sheetGIDCacheKey{}, &sync.Map{})
	data, err := getPublishedSheetGIDs(second, client, "2PACX-test")
	if err != nil || len(data) != 2 || calls != 2 {
		t.Fatalf("second sync: %v, calls=%d, err=%v", data, calls, err)
	}
}
