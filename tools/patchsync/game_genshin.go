package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var genshinCyclePattern = regexp.MustCompile(`x\s*(\d+)`)
var genshinDaysPattern = regexp.MustCompile(`(\d+)\s*days`)

func isGenshinWelkinPassRow(rowName string) bool {
	if !strings.Contains(rowName, "welkin") {
		return false
	}
	if strings.Contains(rowName, "song of the welkin moon") {
		return false
	}
	if strings.Contains(rowName, "day") || strings.Contains(rowName, "blessing") || strings.Contains(rowName, "monthly") {
		return true
	}
	return rowName == "welkin"
}

func parseSheetToPatchGenshin(sheetName, csvText string) (Patch, error) {
	patchID := canonicalPatchID(sheetName)

	reader := csv.NewReader(strings.NewReader(csvText))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return Patch{}, fmt.Errorf("csv parse error: %w", err)
	}
	if len(records) < 2 {
		return Patch{}, errors.New("sheet has no data rows")
	}

	durationDays := findGenshinDurationDays(records)
	if durationDays <= 0 {
		durationDays = 42
	}

	var (
		eventsRewards      Rewards
		otherRewards       Rewards
		webRewards         Rewards
		dailyRewards       Rewards
		expeditionsRewards Rewards
		parametricRewards  Rewards
		weeklyRewards      Rewards
		sereniteaRewards   Rewards
		endgameRewards     Rewards
		shopRewards        Rewards
		bpF2PRewards       Rewards
		bpPaidRewards      Rewards
		welkinRewards      Rewards
		repeatingOther     Rewards
	)

	currentSection := ""
	for _, record := range records {
		sectionName := normalizeName(getCell(record, 0))
		rowName := normalizeName(getCell(record, 1))

		switch sectionName {
		case "events":
			currentSection = "events"
			continue
		case "other new content":
			currentSection = "other"
			continue
		case "web, mail, apologems":
			currentSection = "web"
			continue
		case "repeating content":
			currentSection = "repeating"
			continue
		}

		if rowName == "conversion rate" {
			break
		}
		if rowName == "" {
			continue
		}

		rewards := parseGenshinGachaRewards(record)
		if !rewards.hasAny() {
			continue
		}

		switch currentSection {
		case "events":
			eventsRewards.add(rewards)
		case "other":
			otherRewards.add(rewards)
		case "web":
			webRewards.add(rewards)
		case "repeating":
			switch {
			case strings.Contains(rowName, "daily resin/commissions"):
				dailyRewards.add(rewards)
			case strings.Contains(rowName, "expeditions"):
				expeditionsRewards.add(rewards)
			case strings.Contains(rowName, "parametric transformer"):
				parametricRewards.add(rewards)
			case strings.Contains(rowName, "weekly requests and bounties"):
				weeklyRewards.add(rewards)
			case strings.Contains(rowName, "serenitea realm shop"):
				sereniteaRewards.add(rewards)
			case strings.Contains(rowName, "abyss") || strings.Contains(rowName, "imaginarium") || strings.Contains(rowName, "stygian"):
				endgameRewards.add(rewards)
			case strings.Contains(rowName, "paimon's bargains"):
				shopRewards.add(rewards)
			case strings.Contains(rowName, "battle pass - f2p"):
				bpF2PRewards.add(rewards)
			case strings.Contains(rowName, "battle pass - paid bonus"):
				bpPaidRewards.add(rewards)
			case isGenshinWelkinPassRow(rowName):
				welkinRewards.add(rewards)
			case strings.Contains(rowName, "total f2p") || strings.Contains(rowName, "total p2p"):
				continue
			default:
				repeatingOther.add(rewards)
			}
		}
	}

	sources := []Source{
		source("events", "Events", "always", nil, true, eventsRewards),
		source("other", "Other New Content", "always", nil, true, otherRewards),
		source("webMail", "Web, Mail, Apologems", "always", nil, true, webRewards),
		source("dailyActivity", "Daily Resin/Commissions", "always", nil, true, dailyRewards),
		source("expeditions", "Expeditions", "always", nil, true, expeditionsRewards),
		source("parametric", "Parametric Transformer", "always", nil, true, parametricRewards),
		source("weekly", "Weekly Requests \u0026 Bounties", "always", nil, true, weeklyRewards),
		source("serenitea", "Serenitea Realm Shop", "always", nil, true, sereniteaRewards),
		source("endgame", "Abyss / Imaginarium / Stygian", "always", nil, true, endgameRewards),
		source("shop", "Paimon's Bargains", "always", nil, true, shopRewards),
		source("bpF2P", "Battle Pass - F2P", "always", nil, true, bpF2PRewards),
		source("bpPaid", "Battle Pass - Paid Bonus", "bp2", nil, true, bpPaidRewards),
		source("welkin", "Welkin", "monthly", nil, true, welkinRewards),
	}
	if repeatingOther.hasAny() {
		sources = append(sources, source("repeatingOther", "Other Repeating Content", "always", nil, true, repeatingOther))
	}

	return Patch{
		ID:           patchID,
		Patch:        patchID,
		VersionName:  fmt.Sprintf("Version %s", patchID),
		StartDate:    "",
		DurationDays: durationDays,
		Tags:         patchTagsFromSheetName(sheetName, getCell(records[0], 0)),
		Notes:        "Generated from Genshin Impact Google Sheets by patchsync",
		Sources:      sources,
	}, nil
}

func parseGenshinGachaRewards(record []string) Rewards {
	return Rewards{
		Oroberyl:  parseNumber(getCell(record, 9)),
		Basic:     parseNumber(getCell(record, 10)),
		Chartered: parseNumber(getCell(record, 11)),
	}
}

func genshinPullsFromRewards(r Rewards) float64 {
	return (r.Oroberyl / 160.0) + r.Chartered
}

func parseGenshinSummaryPullTotals(csvText string, orderedSheetNames []string) (map[string]float64, error) {
	reader := csv.NewReader(strings.NewReader(csvText))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("csv parse error: %w", err)
	}
	if len(records) < 2 {
		return nil, errors.New("Summary sheet has no rows")
	}

	result := map[string]float64{}
	for _, record := range records[1:] {
		pulls, okPulls := parseDataPullValue(getCell(record, 7))
		if !okPulls {
			continue
		}
		patchID := ""
		for _, colIdx := range []int{0, 1, 2, 6} {
			candidateRaw := normalizePatchName(getCell(record, colIdx))
			if candidateRaw == "" || !isVersionLikeSheetName(candidateRaw) {
				continue
			}
			patchID = canonicalPatchID(candidateRaw)
			break
		}
		if patchID != "" {
			result[patchID] = pulls
		}
	}
	if len(result) > 0 {
		return result, nil
	}

	values := make([]float64, 0, len(records))
	for rowIdx := 66; rowIdx < len(records); rowIdx++ {
		if pulls, okPulls := parseDataPullValue(getCell(records[rowIdx], 7)); okPulls {
			values = append(values, pulls)
		}
	}
	if len(values) == 0 {
		return nil, errors.New("Summary sheet has no pull totals in column H")
	}

	names := append([]string(nil), orderedSheetNames...)
	sortVersionStrings(names)
	for idx, sheetName := range names {
		if idx >= len(values) {
			break
		}
		result[canonicalPatchID(sheetName)] = values[idx]
	}
	if len(result) == 0 {
		return nil, errors.New("Summary sheet pull totals could not be mapped to patch names")
	}
	return result, nil
}

func lookupPatchPullTotal(totalsByPatch map[string]float64, patchName string) (float64, bool) {
	if len(totalsByPatch) == 0 {
		return 0, false
	}
	target := canonicalPatchID(patchName)
	if value, ok := totalsByPatch[target]; ok {
		return value, true
	}
	for key, value := range totalsByPatch {
		if canonicalPatchID(key) == target {
			return value, true
		}
	}
	return 0, false
}

func applyGenshinSummaryPullOverrides(patch *Patch, totalsByPatch map[string]float64) error {
	if patch == nil {
		return errors.New("patch is nil")
	}
	patchName := canonicalPatchID(patch.Patch)
	total, ok := lookupPatchPullTotal(totalsByPatch, patchName)
	if !ok {
		return fmt.Errorf("Summary sheet has no row for patch %q", patchName)
	}

	f2pSourceIDs := map[string]struct{}{
		"events":         {},
		"other":          {},
		"webMail":        {},
		"dailyActivity":  {},
		"expeditions":    {},
		"parametric":     {},
		"weekly":         {},
		"serenitea":      {},
		"endgame":        {},
		"shop":           {},
		"bpF2P":          {},
		"repeatingOther": {},
	}

	sourceIndex := map[string]int{}
	sum := 0.0
	for idx, src := range patch.Sources {
		sourceIndex[src.ID] = idx
		if !src.CountInPulls || src.Gate != "always" {
			continue
		}
		if _, okF2P := f2pSourceIDs[src.ID]; !okF2P {
			continue
		}
		pulls := genshinPullsFromRewards(src.Rewards)
		if src.Pulls != nil {
			pulls = *src.Pulls
		}
		sum += pulls
	}

	delta := total - sum
	if absFloat(delta) < 0.05 {
		return nil
	}

	adjustSourceID := "endgame"
	idx, okAdjust := sourceIndex[adjustSourceID]
	if !okAdjust {
		for _, sourceID := range []string{"events", "other", "webMail", "dailyActivity", "shop"} {
			if candidateIdx, okSource := sourceIndex[sourceID]; okSource {
				idx = candidateIdx
				okAdjust = true
				break
			}
		}
		if !okAdjust {
			return fmt.Errorf("cannot apply Summary pull override for patch %q: no F2P sources found", patchName)
		}
	}

	base := genshinPullsFromRewards(patch.Sources[idx].Rewards)
	if patch.Sources[idx].Pulls != nil {
		base = *patch.Sources[idx].Pulls
	}
	v := roundToTenth(base + delta)
	patch.Sources[idx].Pulls = &v
	return nil
}

func findGenshinDurationDays(records [][]string) int {
	for _, record := range records {
		name := normalizeName(getCell(record, 1))
		if strings.Contains(name, "daily resin/commissions") {
			if match := genshinCyclePattern.FindStringSubmatch(name); len(match) >= 2 {
				if days, err := strconv.Atoi(match[1]); err == nil && days > 0 {
					return days
				}
			}
		}
	}
	for _, record := range records {
		name := normalizeName(getCell(record, 1))
		if strings.Contains(name, "welkin") {
			if match := genshinDaysPattern.FindStringSubmatch(name); len(match) >= 2 {
				if days, err := strconv.Atoi(match[1]); err == nil && days > 0 {
					return days
				}
			}
		}
	}
	return 0
}
