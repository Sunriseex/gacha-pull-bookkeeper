package main

import "testing"

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
