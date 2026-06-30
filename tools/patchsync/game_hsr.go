package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strings"
)

func parseSheetToPatchHsr(sheetName, csvText string) (Patch, error) {
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
		case "travel log events",
			"permanent content",
			"mailbox & web events",
			"mailbox and web events",
			"daily training",
			"weekly modes",
			"treasures lightward",
			"embers store",
			"paid battle pass",
			"supply pass",
			"f2p limited total",
			"paid + f2p limited total",
			"total f2p",
			"total paid":
			aggregateRows[name] = parseHsrRewards(record)
		}
	}

	travelLogEvents, okTravelLogEvents := aggregateRows["travel log events"]
	permanent, okPermanent := aggregateRows["permanent content"]
	mailbox, okMailbox := aggregateRows["mailbox & web events"]
	if !okMailbox {
		mailbox = aggregateRows["mailbox and web events"]
		okMailbox = mailbox.hasAny()
	}
	dailyTraining, okDailyTraining := aggregateRows["daily training"]
	weeklyModes, okWeeklyModes := aggregateRows["weekly modes"]
	treasuresLightward, okTreasuresLightward := aggregateRows["treasures lightward"]
	embersStore, okEmbersStore := aggregateRows["embers store"]

	if !okTravelLogEvents || !okPermanent || !okMailbox || !okDailyTraining || !okWeeklyModes || !okTreasuresLightward || !okEmbersStore {
		return Patch{}, errors.New("missing required aggregate rows in HSR sheet")
	}

	paidBattlePass := aggregateRows["paid battle pass"]
	supplyPass := aggregateRows["supply pass"]

	sources := []Source{
		source("dailyTraining", "Daily Training", "always", nil, true, dailyTraining),
		source("weeklyModes", "Weekly Modes", "always", nil, true, weeklyModes),
		source("treasuresLightward", "Treasures Lightward", "always", nil, true, treasuresLightward),
		source("embersStore", "Embers Store", "always", nil, true, embersStore),
		source("travelLogEvents", "Travel Log Events", "always", nil, true, travelLogEvents),
		source("permanent", "Permanent Content", "always", nil, true, permanent),
		source("mailbox", "Mailbox & Web Events", "always", nil, true, mailbox),
		source("paidBattlePass", "Paid Battle Pass", "bp2", nil, true, paidBattlePass),
		source("supplyPass", "Supply Pass", "monthly", nil, true, supplyPass),
	}

	return Patch{
		ID:           normalizedSheetName,
		Patch:        normalizedSheetName,
		VersionName:  versionName,
		StartDate:    startDate,
		DurationDays: durationDays,
		Tags:         patchTagsFromSheetName(sheetName, getCell(records[0], 0)),
		Notes:        "Generated from Honkai: Star Rail Google Sheets by patchsync",
		Sources:      sources,
	}, nil
}

func parseHsrRewards(record []string) Rewards {
	return Rewards{
		Oroberyl:  parseNumber(getCell(record, 1)),
		Chartered: parseNumber(getCell(record, 2)),
		Basic:     parseNumber(getCell(record, 3)),
	}
}

func parseHsrDataSheet(csvText string, fallbackSheetNames []string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, hsrDataRowToSourceID, fallbackSheetNames)
}

func applyHsrDataPullOverrides(patch *Patch, pullsByPatch map[string]map[string]float64) error {
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
		if sourceID == "__totalF2P" || sourceID == "__totalPaid" {
			continue
		}
		if idx, okSource := sourceIndex[sourceID]; okSource {
			v := roundToTenth(value)
			patch.Sources[idx].Pulls = &v
		}
	}

	if total, hasTotal := sourcePulls["__totalF2P"]; hasTotal {
		f2pSourceIDs := map[string]struct{}{
			"dailyTraining":      {},
			"weeklyModes":        {},
			"treasuresLightward": {},
			"embersStore":        {},
			"travelLogEvents":    {},
			"permanent":          {},
			"mailbox":            {},
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
		if absFloat(delta) > 0.0001 {
			if idx, okAdjust := sourceIndex["permanent"]; okAdjust {
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
