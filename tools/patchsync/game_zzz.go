package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strings"
)

func parseSheetToPatchZzz(sheetName, csvText string) (Patch, error) {
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

	versionName, startDate := parsePatchHeaderMeta(getCell(records[0], 0))
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
		case "events",
			"permanent content",
			"mailbox & web events",
			"mailbox and web events",
			"recurring sources",
			"errands",
			"hollow zero",
			"f2p battle pass",
			"24-hour shop",
			"endgame modes",
			"paid battle pass",
			"inter-knot membership",
			"total f2p",
			"total paid":
			aggregateRows[name] = parseZzzRewards(record)
		}
	}

	events, okEvents := aggregateRows["events"]
	permanent, okPermanent := aggregateRows["permanent content"]
	mailbox, okMailbox := aggregateRows["mailbox & web events"]
	if !okMailbox {
		mailbox = aggregateRows["mailbox and web events"]
		okMailbox = mailbox.hasAny()
	}
	if !okEvents || !okPermanent || !okMailbox {
		return Patch{}, errors.New("missing required aggregate rows in ZZZ sheet")
	}

	recurring := aggregateRows["recurring sources"]
	errands := aggregateRows["errands"]
	hollowZero := aggregateRows["hollow zero"]
	shop24h := aggregateRows["24-hour shop"]
	f2pBattlePass := aggregateRows["f2p battle pass"]
	endgameModes := aggregateRows["endgame modes"]
	paidBattlePass := aggregateRows["paid battle pass"]
	membership := aggregateRows["inter-knot membership"]

	if !errands.hasAny() && recurring.hasAny() {
		errands = recurring
	}

	sources := []Source{
		source("events", "Events", "always", nil, true, events),
		source("permanent", "Permanent Content", "always", nil, true, permanent),
		source("mailbox", "Mailbox & Web Events", "always", nil, true, mailbox),
		source("errands", "Errands", "always", nil, true, errands),
		source("hollowZero", "Hollow Zero", "always", nil, true, hollowZero),
		source("f2pBattlePass", "F2P Battle Pass", "always", nil, true, f2pBattlePass),
		source("shop24h", "24-Hour Shop", "always", nil, true, shop24h),
		source("endgameModes", "Endgame Modes", "always", nil, true, endgameModes),
		source("paidBattlePass", "Paid Battle Pass", "bp2", nil, true, paidBattlePass),
		source("membership", "Inter-Knot Membership", "monthly", nil, true, membership),
	}

	return Patch{
		ID:           normalizedSheetName,
		Patch:        normalizedSheetName,
		VersionName:  versionName,
		StartDate:    startDate,
		DurationDays: durationDays,
		Tags:         patchTagsFromSheetName(sheetName, getCell(records[0], 0)),
		Notes:        "Generated from Zenless Zone Zero Google Sheets by patchsync",
		Sources:      sources,
	}, nil
}

func parseZzzRewards(record []string) Rewards {
	return Rewards{
		Oroberyl:  parseNumber(getCell(record, 1)),
		Chartered: parseNumber(getCell(record, 2)),
		Basic:     parseNumber(getCell(record, 3)),
		Arsenal:   parseNumber(getCell(record, 4)),
	}
}

func isZzzBooponsTotalRow(rowName string) bool {
	return rowName == "f2p boopons total"
}

func parseZzzDataSheet(csvText string, fallbackSheetNames []string) (map[string]map[string]float64, error) {
	reader := csv.NewReader(strings.NewReader(csvText))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("csv parse error: %w", err)
	}
	if len(records) < 2 {
		return nil, errors.New("Data sheet has no rows")
	}

	header, headerIdx := findDataSheetHeader(records)
	patchCols := explicitDataSheetPatchColumns(header)
	patchCols = inferDataSheetPatchColumns(records, zzzDataRowToSourceID, headerIdx, patchCols, fallbackSheetNames)
	if len(patchCols) == 0 {
		return nil, errors.New("Data sheet has no patch columns")
	}

	result := map[string]map[string]float64{}
	inBooponSection := false
	for _, record := range records[headerIdx+1:] {
		rowName := normalizeName(getCell(record, 0))
		if rowName == "" {
			continue
		}
		if rowName == "master tape total" {
			inBooponSection = true
			continue
		}

		if inBooponSection {
			if !isZzzBooponsTotalRow(rowName) {
				continue
			}
			for colIdx, patchName := range patchCols {
				raw := getCell(record, colIdx)
				value, okValue := parseDataPullValue(raw)
				if !okValue {
					continue
				}
				if _, okPatch := result[patchName]; !okPatch {
					result[patchName] = map[string]float64{}
				}
				if _, alreadySet := result[patchName]["__totalBooponsF2P"]; alreadySet {
					continue
				}
				result[patchName]["__totalBooponsF2P"] = value
			}
			continue
		}

		sourceID, ok := zzzDataRowToSourceID[rowName]
		if !ok {
			continue
		}

		for colIdx, patchName := range patchCols {
			raw := getCell(record, colIdx)
			value, okValue := parseDataPullValue(raw)
			if !okValue {
				continue
			}
			if _, okPatch := result[patchName]; !okPatch {
				result[patchName] = map[string]float64{}
			}
			result[patchName][sourceID] = value
		}
	}
	if len(result) == 0 {
		return nil, errors.New("Data sheet has no recognized pull rows")
	}
	return result, nil
}

func applyZzzDataPullOverrides(patch *Patch, pullsByPatch map[string]map[string]float64) error {
	if patch == nil {
		return errors.New("patch is nil")
	}
	patchName := normalizePatchName(patch.Patch)
	sourcePulls, ok := lookupSourcePullsByPatchName(pullsByPatch, patchName)
	if !ok {
		return fmt.Errorf("Data sheet has no row for patch %q", patchName)
	}

	sourceIndex := map[string]int{}
	for idx, src := range patch.Sources {
		sourceIndex[src.ID] = idx
	}
	for sourceID, value := range sourcePulls {
		if sourceID == "__totalF2P" || sourceID == "__totalBooponsF2P" {
			continue
		}
		if idx, okSource := sourceIndex[sourceID]; okSource {
			v := roundToTenth(value)
			patch.Sources[idx].Pulls = &v
		}
	}

	if total, hasTotal := sourcePulls["__totalF2P"]; hasTotal {
		f2pSourceIDs := map[string]struct{}{
			"events":        {},
			"permanent":     {},
			"mailbox":       {},
			"errands":       {},
			"hollowZero":    {},
			"f2pBattlePass": {},
			"shop24h":       {},
			"endgameModes":  {},
		}
		sum := 0.0
		for _, src := range patch.Sources {
			if src.Pulls != nil && src.CountInPulls {
				if _, okF2P := f2pSourceIDs[src.ID]; !okF2P {
					continue
				}
				sum += *src.Pulls
			}
		}
		delta := total - sum
		if absFloat(delta) <= 1 {
			if idx, okAdjust := sourceIndex["endgameModes"]; okAdjust {
				base := 0.0
				if patch.Sources[idx].Pulls != nil {
					base = *patch.Sources[idx].Pulls
				}
				v := roundToTenth(base + delta)
				patch.Sources[idx].Pulls = &v
			}
		}
	}
	return nil
}
