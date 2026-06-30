package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strings"
)

func parseSheetToPatch(sheetName, csvText string) (Patch, error) {
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

	headers := records[0]
	idxName := 0
	idxOro := findHeaderIndex(headers, []string{"oroberyl"}, -1)
	idxOri := findHeaderIndex(headers, []string{"origeometry"}, -1)
	idxChartered := findHeaderIndex(headers, []string{"chartered hh permit", "chartered"}, -1)
	idxBasic := findHeaderIndex(headers, []string{"basic hh permit", "basic"}, -1)
	idxArsenal := findHeaderIndex(headers, []string{"arsenal tickets", "arsenal"}, -1)
	idxDuration := findHeaderIndex(headers, []string{"version length", "version duration"}, -1)

	// Supports 2 layouts:
	// 1) Explicit headers in first row (Oroberyl/Origeometry/Chartered/Basic/Arsenal)
	// 2) Title row in first row and implicit column order:
	//    Name, Oroberyl, Chartered, Basic, Origeometry, Arsenal
	hasExplicitHeaders := idxOro >= 0 && idxOri >= 0 && idxChartered >= 0 && idxBasic >= 0 && idxArsenal >= 0
	if !hasExplicitHeaders {
		idxName = 0
		idxOro = 1
		idxChartered = 2
		idxBasic = 3
		idxOri = 4
		idxArsenal = 5
	}

	durationDays := inferDurationDays(headers, records[1], idxDuration)
	if durationDays <= 0 && !hasExplicitHeaders {
		durationDays = inferDurationDaysFromTitleRow(records[0])
	}
	if durationDays <= 0 {
		return Patch{}, errors.New("unable to determine durationDays from sheet")
	}

	rows := make([]sheetRow, 0, len(records)-1)
	dataStartRow := 1
	if hasExplicitHeaders {
		dataStartRow = 1
	}
	for _, record := range records[dataStartRow:] {
		rows = append(rows, rowFromRecord(record, idxName, idxOro, idxOri, idxChartered, idxBasic, idxArsenal))
	}

	var (
		eventsAggregate   Rewards
		eventsFallbackSum Rewards
		permanentSum      Rewards
		mailboxSum        Rewards

		firewalkerRewards Rewards
		messengerRewards  Rewards
		huesRewards       Rewards

		dailyRewards      Rewards
		weeklyRewards     Rewards
		monumentalRewards Rewards
		aicRewards        Rewards
		urgentRewards     Rewards
		hhDossierRewards  Rewards
		monthlyRewards    Rewards
		bp2CoreRewards    Rewards
		bp3CoreRewards    Rewards
		bpCrateMRewards   Rewards
		bpCrateLRewards   Rewards
	)

	currentSection := ""
	for _, row := range rows {
		name := normalizeName(row.Name)
		if name == "" {
			continue
		}

		switch name {
		case "events":
			currentSection = "events"
			if row.HasData {
				eventsAggregate = row.Rewards
			}
			continue
		case "permanent content":
			currentSection = "permanent"
			continue
		case "mailbox & web events":
			currentSection = "mailbox"
			continue
		case "recurring sources":
			currentSection = "recurring"
			continue
		case "total":
			continue
		}

		switch currentSection {
		case "events":
			if row.HasData {
				eventsFallbackSum.add(row.Rewards)
			}
		case "permanent":
			if row.HasData {
				permanentSum.add(row.Rewards)
			}
		case "mailbox":
			if row.HasData {
				mailboxSum.add(row.Rewards)
			}
		}

		switch name {
		case "firewalker's trail":
			firewalkerRewards.Chartered += row.Rewards.Chartered
		case "messenger express":
			messengerRewards.Chartered += row.Rewards.Chartered
		case "hues of passion":
			huesRewards.Chartered += row.Rewards.Chartered
		case "daily activity":
			dailyRewards = row.Rewards
		case "weekly routine":
			weeklyRewards = row.Rewards
		case "monumental etching":
			monumentalRewards = row.Rewards
		case "aic quota exchange", "aic quata exchange":
			aicRewards = row.Rewards
		case "urgent recruit":
			urgentRewards = row.Rewards
		case "hh dossier":
			hhDossierRewards = row.Rewards
		case "monthly pass":
			monthlyRewards = row.Rewards
		case "originium supply pass":
			coreRewards := battlePassCoreRewards(row.Rewards)
			if coreRewards.hasAny() {
				bp2CoreRewards = coreRewards
			}
			fallbackRewards := battlePassCrateFallbackRewards(row.Rewards)
			if fallbackRewards.hasAny() && !bpCrateMRewards.hasAny() {
				bpCrateMRewards = fallbackRewards
			}
		case "protocol customized pass":
			coreRewards := battlePassCoreRewards(row.Rewards)
			if coreRewards.hasAny() {
				bp3CoreRewards = coreRewards
			}
			fallbackRewards := battlePassCrateFallbackRewards(row.Rewards)
			if fallbackRewards.hasAny() && !bpCrateLRewards.hasAny() {
				bpCrateLRewards = fallbackRewards
			}
		case "exchange crate-o-surprise [m]":
			bpCrateMRewards = row.Rewards
		case "exchange crate-o-surprise [l]":
			bpCrateLRewards = row.Rewards
		}
	}

	if !eventsAggregate.hasAny() {
		eventsAggregate = eventsFallbackSum
	}

	timedChartered := firewalkerRewards.Chartered + messengerRewards.Chartered + huesRewards.Chartered
	eventsChartered := eventsAggregate.Chartered
	if timedChartered > 0 && eventsAggregate.Chartered >= timedChartered {
		eventsChartered = eventsAggregate.Chartered - timedChartered
	}

	if monthlyRewards.Oroberyl == 0 {
		monthlyRewards.Oroberyl = float64(durationDays * 200)
	}
	monthlyRewards = Rewards{
		Oroberyl: monthlyRewards.Oroberyl,
	}
	monthlyBonusRewards := Rewards{
		Origeometry: float64(((durationDays + 29) / 30) * 12),
	}

	eventsRewards := Rewards{
		Oroberyl:    eventsAggregate.Oroberyl,
		Origeometry: eventsAggregate.Origeometry,
		Chartered:   eventsChartered,
		Basic:       eventsAggregate.Basic,
		Firewalker:  firewalkerRewards.Chartered,
		Messenger:   messengerRewards.Chartered,
		Hues:        huesRewards.Chartered,
		Arsenal:     eventsAggregate.Arsenal,
	}

	bpCrateModel := &BPCrateModel{
		Type:             "post_bp60_estimate",
		DaysToLevel60T3:  21,
		Tier2XPBonusRate: 0.03,
		Tier3XPBonusRate: 0.06,
	}

	sources := []Source{
		source("events", "Events", "always", nil, true, eventsRewards),
		source("permanent", "Permanent Content", "always", nil, true, permanentSum),
		source("mailbox", "Mailbox & Web Events", "always", nil, true, mailboxSum),
		source("dailyActivity", "Daily Activity", "always", nil, true, dailyRewards),
		source("weekly", "Weekly Routine", "always", nil, true, weeklyRewards),
		source("monumental", "Monumental Etching", "always", nil, true, monumentalRewards),
		source("aicQuota", "AIC Quota Exchange", "always", ptr("includeAicQuotaExchange"), true, aicRewards),
		source("urgentRecruit", "Urgent Recruit", "always", ptr("includeUrgentRecruit"), true, urgentRewards),
		source("hhDossier", "HH Dossier", "always", ptr("includeHhDossier"), true, hhDossierRewards),
		source("monthly", "Monthly Pass", "monthly", nil, true, monthlyRewards),
		source("monthlyBonus", "Monthly Pass Bonus", "monthly", nil, false, monthlyBonusRewards),
		source("bp2Core", "Originium Supply Pass", "bp2", nil, false, bp2CoreRewards),
		source("bp3Core", "Protocol Customized Pass", "bp3", nil, false, bp3CoreRewards),
		Source{
			ID:           "bpCrateM",
			Label:        "Exchange Crate-o-Surprise [M]",
			Gate:         "bp2",
			OptionKey:    ptr("includeBpCrates"),
			CountInPulls: true,
			Rewards:      bpCrateMRewards,
			Costs:        zeroRewards(),
			Scalers:      []Scaler{},
			BPCrateModel: bpCrateModel,
		},
		Source{
			ID:           "bpCrateL",
			Label:        "Exchange Crate-o-Surprise [L]",
			Gate:         "bp3",
			OptionKey:    ptr("includeBpCrates"),
			CountInPulls: true,
			Rewards:      bpCrateLRewards,
			Costs:        zeroRewards(),
			Scalers:      []Scaler{},
			BPCrateModel: bpCrateModel,
		},
	}

	versionName, startDate := parsePatchHeaderMeta(getCell(headers, 0))
	if startDate == "" && !hasExplicitHeaders {
		startDate = inferStartDateFromTitleRow(headers)
	}
	patchID := canonicalPatchID(sheetName)
	patch := Patch{
		ID:           patchID,
		Patch:        patchID,
		VersionName:  versionName,
		StartDate:    startDate,
		DurationDays: durationDays,
		Tags:         patchTagsFromSheetName(sheetName, getCell(headers, 0)),
		Notes:        "Generated from Google Sheets by patchsync",
		Sources:      sources,
	}

	return patch, nil
}
