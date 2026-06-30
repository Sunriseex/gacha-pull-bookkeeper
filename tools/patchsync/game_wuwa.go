package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"strings"
)

func parseSheetToPatchWuwa(sheetName, csvText string) (Patch, error) {
	normalizedSheetName := canonicalPatchID(sheetName)

	reader := csv.NewReader(strings.NewReader(csvText))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return Patch{}, fmt.Errorf("csv parse error: %w", err)
	}
	if len(records) < 3 {
		return Patch{}, errors.New("sheet has no data rows")
	}

	durationDays := findWuwaDurationDays(records)
	if durationDays <= 0 {
		return Patch{}, errors.New("unable to determine durationDays from sheet")
	}

	versionName := strings.TrimSpace(getCell(records[0], 0))
	if strings.HasPrefix(strings.ToLower(versionName), "version ") {
		versionName = ""
	}
	startDate := ""
	for _, record := range records {
		candidate := strings.TrimSpace(getCell(record, 0))
		match := patchVersionWithDatePattern.FindStringSubmatch(candidate)
		if len(match) >= 2 {
			startDate = parseDateToISO(match[1])
			break
		}
	}
	if versionName == "" {
		versionName = fmt.Sprintf("Version %s", normalizedSheetName)
	}

	aggregateRows := map[string]Rewards{}
	for _, record := range records {
		name := normalizeName(getCell(record, 0))
		if name == "" {
			continue
		}
		switch name {
		case "version events",
			"permanent content",
			"mailbox/miscellaneous",
			"recurring sources",
			"paid pioneer podcast",
			"lunite subscription",
			"total f2p",
			"total paid":
			if _, exists := aggregateRows[name]; exists {
				continue
			}
			aggregateRows[name] = parseWuwaRewards(record)
		}
	}

	events, okEvents := aggregateRows["version events"]
	permanent, okPermanent := aggregateRows["permanent content"]
	mailbox, okMailbox := aggregateRows["mailbox/miscellaneous"]
	recurring, okRecurring := aggregateRows["recurring sources"]
	if !okEvents || !okPermanent || !okMailbox || !okRecurring {
		return Patch{}, errors.New("missing required aggregate rows in Wuthering Waves sheet")
	}
	paidPodcast := aggregateRows["paid pioneer podcast"]
	monthly := aggregateRows["lunite subscription"]

	sources := []Source{
		source("events", "Version Events", "always", nil, true, events),
		source("permanent", "Permanent Content", "always", nil, true, permanent),
		source("mailbox", "Mailbox/Miscellaneous", "always", nil, true, mailbox),
		source("dailyActivity", "Daily Activity", "always", nil, true, Rewards{}),
		source("endgameModes", "Endgame Modes", "always", nil, true, recurring),
		source("coralShop", "Coral Shop", "always", nil, true, Rewards{}),
		source("weaponPulls", "Weapon Pulls", "always", nil, true, Rewards{}),
		source("paidPodcast", "Paid Pioneer Podcast", "bp2", nil, true, paidPodcast),
		source("monthly", "Lunite Subscription", "monthly", nil, true, Rewards{
			Chartered:  monthly.Chartered,
			Basic:      monthly.Basic,
			Firewalker: monthly.Firewalker,
			Messenger:  monthly.Messenger,
			Hues:       monthly.Hues,
			Arsenal:    monthly.Arsenal,
		}),
	}

	const luniteDailyAstrite = 90.0
	if monthly.Oroberyl > 0 {
		sources[len(sources)-1].Scalers = []Scaler{
			{
				Type:      "per_duration",
				Unit:      "day",
				EveryDays: 1,
				Rounding:  "floor",
				Rewards: Rewards{
					Oroberyl: luniteDailyAstrite,
				},
			},
		}
	}

	totalF2P, hasTotalF2P := aggregateRows["total f2p"]
	totalPaid, hasTotalPaid := aggregateRows["total paid"]
	if hasTotalF2P && hasTotalPaid {
		expectedF2PPulls := wwPullsFromRewards(totalF2P)
		expectedPaidPulls := wwPullsFromRewards(totalPaid)
		actualF2PRewards := zeroRewards()
		actualF2PRewards.add(events)
		actualF2PRewards.add(permanent)
		actualF2PRewards.add(mailbox)
		actualF2PRewards.add(recurring)
		actualF2PPulls := wwPullsFromRewards(actualF2PRewards)

		actualPaidRewards := actualF2PRewards
		actualPaidRewards.add(paidPodcast)
		actualPaidRewards.Oroberyl += luniteDailyAstrite * float64(durationDays)
		actualPaidPulls := wwPullsFromRewards(actualPaidRewards)

		const epsilon = 0.001
		if absFloat(expectedF2PPulls-actualF2PPulls) > epsilon {
			return Patch{}, fmt.Errorf(
				"f2p mismatch: expected %.3f pulls from Total F2P, got %.3f",
				expectedF2PPulls,
				actualF2PPulls,
			)
		}
		if absFloat(expectedPaidPulls-actualPaidPulls) > epsilon {
			fmt.Fprintf(os.Stderr,
				"WARNING: patch %s paid mismatch: expected %.3f pulls from Total Paid, got %.3f (using F2P-only validation)\n",
				normalizedSheetName,
				expectedPaidPulls,
				actualPaidPulls,
			)
		}
	}

	return Patch{
		ID:           normalizedSheetName,
		Patch:        normalizedSheetName,
		VersionName:  versionName,
		StartDate:    startDate,
		DurationDays: durationDays,
		Tags:         patchTagsFromSheetName(sheetName, getCell(records[0], 0)),
		Notes:        "Generated from Wuthering Waves Google Sheets by patchsync",
		Sources:      sources,
	}, nil
}

func parseWuwaRewards(record []string) Rewards {
	return Rewards{
		Oroberyl:   parseNumber(getCell(record, 1)),
		Chartered:  parseNumber(getCell(record, 2)),
		Firewalker: parseNumber(getCell(record, 3)),
		Basic:      parseNumber(getCell(record, 4)),
	}
}

func wwPullsFromRewards(r Rewards) float64 {
	return (r.Oroberyl / 160.0) + r.Chartered + r.Firewalker
}

func parseWuwaDataSheet(csvText string, fallbackSheetNames []string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, wuwaDataRowToSourceID, fallbackSheetNames)
}
