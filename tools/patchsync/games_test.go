package main

import (
	"encoding/csv"
	"strings"
	"testing"
)

func TestParseWuwaDataSheetInfersSparseVersionHeader(t *testing.T) {
	csvText := "\n" +
		"Version,,,,3.3\n" +
		"Version Events,,25.6,30.3,13.9\n" +
		"Permanent Content,,153.1,28.6,3.7\n" +
		"Mailbox/Miscellaneous,,35.8,5.1,6.6\n" +
		"Daily Activity,,13.5,17.6,12.0\n" +
		"Recurring Sources,,11.3,14.7,22.5\n" +
		"Coral Shop,,6.0,7.0,7.0\n" +
		"Weapon Pulls,,11.0,17.0,7.0\n" +
		"Limited Total F2P,,256.2,120.2,72.7\n"

	pullsByPatch, err := parseWuwaDataSheet(csvText, []string{"1.0", "1.1", "3.3"})
	if err != nil {
		t.Fatalf("parseWuwaDataSheet() error = %v", err)
	}

	tests := []struct {
		patchID  string
		sourceID string
		want     float64
	}{
		{patchID: "1.0", sourceID: "events", want: 25.6},
		{patchID: "1.1", sourceID: "permanent", want: 28.6},
		{patchID: "3.3", sourceID: "__totalF2P", want: 72.7},
	}
	for _, tt := range tests {
		got, ok := pullsByPatch[tt.patchID][tt.sourceID]
		if !ok {
			t.Fatalf("pullsByPatch[%q][%q] was not parsed", tt.patchID, tt.sourceID)
		}
		if got != tt.want {
			t.Fatalf("pullsByPatch[%q][%q] = %v, want %v", tt.patchID, tt.sourceID, got, tt.want)
		}
	}
}

// Helper to build CSV lines from raw rows (no trailing commas needed)
func csvLines(rows ...string) string {
	return strings.Join(rows, "\n") + "\n"
}

func TestFindWuwaDurationDays(t *testing.T) {
	tests := []struct {
		name string
		csv  string
		want int
	}{
		{
			name: "version length in col 0, value in col 1",
			csv: csvLines(
				"Global Release",
				"Version Length,42",
				"Version Events,5000,30,5",
			),
			want: 42,
		},
		{
			name: "version length in col 1, value in col 2",
			csv: csvLines(
				"Global Release",
				",Version Length,42",
				"Version Events,5000,30,5",
			),
			want: 42,
		},
		{
			name: "version length in one row, duration in next row same column",
			csv: csvLines(
				"Global Release",
				"Version Length,",
				",42",
				"Version Events,5000,30,5",
			),
			want: 42,
		},
		{
			name: "no version length returns 0",
			csv: csvLines(
				"Global Release",
				"Version Events,5000,30,5",
			),
			want: 0,
		},
		{
			name: "version length with zero value returns 0 — last row, no fallback",
			csv: csvLines(
				"Global Release",
				"Version Events,5000,30,5",
				"Version Length,0",
			),
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			records := parseCSV(tt.csv)
			got := findWuwaDurationDays(records)
			if got != tt.want {
				t.Fatalf("findWuwaDurationDays() = %d, want %d", got, tt.want)
			}
		})
	}
}

func parseCSV(text string) [][]string {
	reader := csv.NewReader(strings.NewReader(text))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, _ := reader.ReadAll()
	return records
}

func TestParseSheetToPatchWuwa(t *testing.T) {
	// Base CSV that produces consistent F2P/Paid totals.
	// F2P: events(5000,30,5) + permanent(2000,10) + mailbox(1000,5) + recurring(3000,0,10)
	//   = oroberyl:11000, chartered:45, firewalker:15 => 128.75 pulls
	// durationDays=42 => daily astrite total = 90*42 = 3780
	// Paid adds paidPodcast(500,2) + 3780 astrite => oroberyl:15280, chartered:47
	//  => 157.5 pulls
	validCSV := csvLines(
		"Version 3.4 (03.01.2026)", // DD.MM.YYYY = Jan 3
		"Version Length,42",
		"",
		"Version Events,5000,30,5,10",
		"Permanent Content,2000,10,0,0",
		"Mailbox/Miscellaneous,1000,5,0,0",
		"Recurring Sources,3000,0,10,0",
		"Paid Pioneer Podcast,500,2,0,0",
		"Lunite Subscription,3780,21,0,0",
		"Total F2P,11000,45,15,0",
		"Total Paid,15280,47,15,0",
	)

	t.Run("valid patch", func(t *testing.T) {
		patch, err := parseSheetToPatchWuwa("3.4", validCSV)
		if err != nil {
			t.Fatalf("parseSheetToPatchWuwa() error = %v", err)
		}
		if patch.ID != "3.4" {
			t.Errorf("patch.ID = %q, want %q", patch.ID, "3.4")
		}
		if patch.DurationDays != 42 {
			t.Errorf("patch.DurationDays = %d, want %d", patch.DurationDays, 42)
		}
		if patch.StartDate != "2026-01-03" {
			t.Errorf("patch.StartDate = %q, want %q", patch.StartDate, "2026-01-03")
		}
		if patch.VersionName != "Version 3.4" {
			t.Errorf("patch.VersionName = %q, want %q", patch.VersionName, "Version 3.4")
		}
		if len(patch.Sources) != 9 {
			t.Fatalf("len(patch.Sources) = %d, want 9", len(patch.Sources))
		}

		// Check monthly source has scaler with 90 astrite/day
		monthly := patch.Sources[8]
		if monthly.ID != "monthly" {
			t.Errorf("monthly source id = %q, want %q", monthly.ID, "monthly")
		}
		if len(monthly.Scalers) != 1 {
			t.Fatalf("monthly scalers = %d, want 1", len(monthly.Scalers))
		}
		if monthly.Scalers[0].Rewards.Oroberyl != 90 {
			t.Errorf("monthly scaler astrite = %.0f, want 90", monthly.Scalers[0].Rewards.Oroberyl)
		}
	})

	t.Run("missing required rows", func(t *testing.T) {
		csv := csvLines(
			"Version 3.4",
			"Version Length,42",
			"",
			"Version Events,5000,30,5,10",
		)
		_, err := parseSheetToPatchWuwa("3.4", csv)
		if err == nil || !strings.Contains(err.Error(), "missing required aggregate rows") {
			t.Fatalf("expected missing rows error, got %v", err)
		}
	})

	t.Run("f2p mismatch error", func(t *testing.T) {
		// Total F2P does not match computed sum
		csv := csvLines(
			"Version 3.4",
			"Version Length,42",
			"",
			"Version Events,5000,30,5,10",
			"Permanent Content,2000,10,0,0",
			"Mailbox/Miscellaneous,1000,5,0,0",
			"Recurring Sources,3000,0,10,0",
			"Paid Pioneer Podcast,500,2,0,0",
			"Lunite Subscription,3780,21,0,0",
			"Total F2P,99999,45,15,0", // oroberyl too high
			"Total Paid,15280,47,15,0",
		)
		_, err := parseSheetToPatchWuwa("3.4", csv)
		if err == nil || !strings.Contains(err.Error(), "f2p mismatch") {
			t.Fatalf("expected f2p mismatch error, got %v", err)
		}
	})

	t.Run("no durationDays error", func(t *testing.T) {
		csv := csvLines(
			"Version 3.4",
			"Version Events,5000,30,5,10",
			"Permanent Content,2000,10,0,0",
			"Mailbox/Miscellaneous,1000,5,0,0",
			"Recurring Sources,3000,0,10,0",
			"Paid Pioneer Podcast,500,2,0,0",
			"Lunite Subscription,0,0,0,0",
			"Total F2P,11000,45,15,0",
			"Total Paid,15280,47,15,0",
		)
		_, err := parseSheetToPatchWuwa("3.4", csv)
		if err == nil || !strings.Contains(err.Error(), "durationDays") {
			t.Fatalf("expected durationDays error, got %v", err)
		}
	})

	t.Run("no monthly oroberyl => no scaler", func(t *testing.T) {
		// monthly oroberyl=0, scaler should not be added
		// Remove total f2p/paid to avoid mismatch (pass without validation)
		csv := csvLines(
			"Version 3.4",
			"Version Length,42",
			"",
			"Version Events,5000,30,5,10",
			"Permanent Content,2000,10,0,0",
			"Mailbox/Miscellaneous,1000,5,0,0",
			"Recurring Sources,3000,0,10,0",
			"Lunite Subscription,0,21,0,0",
		)
		patch, err := parseSheetToPatchWuwa("3.4", csv)
		if err != nil {
			t.Fatalf("parseSheetToPatchWuwa() error = %v", err)
		}
		monthly := patch.Sources[len(patch.Sources)-1]
		if len(monthly.Scalers) != 0 {
			t.Errorf("expected no scaler when monthly oroberyl=0, got %d scalers", len(monthly.Scalers))
		}
	})

	t.Run("duplicate aggregate rows — first wins", func(t *testing.T) {
		csv := csvLines(
			"Version 3.4",
			"Version Length,42",
			"",
			"Version Events,5000,30,5,10",
			"Version Events,9999,99,9,9", // duplicate, should be ignored
			"Permanent Content,2000,10,0,0",
			"Mailbox/Miscellaneous,1000,5,0,0",
			"Recurring Sources,3000,0,10,0",
			"Paid Pioneer Podcast,500,2,0,0",
			"Lunite Subscription,3780,21,0,0",
			"Total F2P,11000,45,15,0",
			"Total Paid,15280,47,15,0",
		)
		patch, err := parseSheetToPatchWuwa("3.4", csv)
		if err != nil {
			t.Fatalf("parseSheetToPatchWuwa() error = %v", err)
		}
		events := patch.Sources[0]
		if events.Rewards.Oroberyl != 5000 {
			t.Errorf("events oroberyl = %.0f, want 5000 (first occurrence)", events.Rewards.Oroberyl)
		}
	})

	t.Run("less than 3 rows returns error", func(t *testing.T) {
		csv := "only one row\n"
		_, err := parseSheetToPatchWuwa("3.4", csv)
		if err == nil || !strings.Contains(err.Error(), "no data rows") {
			t.Fatalf("expected no data rows error, got %v", err)
		}
	})
}
