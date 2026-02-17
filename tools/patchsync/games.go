package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	gameIDEndfield = "arknights-endfield"
	gameIDWuwa     = "wuthering-waves"
	gameIDZzz      = "zenless-zone-zero"
	gameIDGenshin  = "genshin-impact"
	gameIDHsr      = "honkai-star-rail"
	defaultGameID  = gameIDEndfield
)

type gameProfile struct {
	ID                   string
	DefaultSpreadsheetID string
	DefaultOutputPath    string
	ParseSheet           patchParser
}

var patchVersionWithDatePattern = regexp.MustCompile(`(?i)^version\s+\d+\.\d+\s*\(([^)]+)\)`)

var endfieldDataRowToSourceID = map[string]string{
	"daily activity":           "dailyActivity",
	"weekly routine":           "weekly",
	"monumental etching":       "monumental",
	"aic quota exchange":       "aicQuota",
	"urgent recruit":           "urgentRecruit",
	"hh dossier":               "hhDossier",
	"permanent content":        "permanent",
	"events":                   "events",
	"mailbox & web events":     "mailbox",
	"mailbox and web events":   "mailbox",
	"originium supply pass":    "bpCrateM",
	"protocol customized pass": "bpCrateL",
	"monthly pass":             "monthly",
	"f2p headhunt total":       "__totalF2P",
	"total f2p":                "__totalF2P",
	"total paid":               "__totalPaid",
}

var wuwaDataRowToSourceID = map[string]string{
	"version events":        "events",
	"permanent content":     "permanent",
	"mailbox/miscellaneous": "mailbox",
	"daily activity":        "dailyActivity",
	"recurring sources":     "endgameModes",
	"coral shop":            "coralShop",
	"weapon pulls":          "weaponPulls",
	"paid pioneer podcast":  "paidPodcast",
	"lunite subscription":   "monthly",
	"limited total f2p":     "__totalF2P",
}

var zzzDataRowToSourceID = map[string]string{
	"events":                 "events",
	"permanent content":      "permanent",
	"mailbox & web events":   "mailbox",
	"mailbox and web events": "mailbox",
	"errands":                "errands",
	"hollow zero":            "hollowZero",
	"endgame modes":          "endgameModes",
	"24-hour shop":           "shop24h",
	"f2p battle pass":        "f2pBattlePass",
	"paid battle pass":       "paidBattlePass",
	"inter-knot membership":  "membership",
	"f2p exclusive total":    "__totalF2P",
}

var hsrDataRowToSourceID = map[string]string{
	"daily training":           "dailyTraining",
	"weekly modes":             "weeklyModes",
	"treasures lightward":      "treasuresLightward",
	"embers store":             "embersStore",
	"travel log events":        "travelLogEvents",
	"permanent content":        "permanent",
	"mailbox & web events":     "mailbox",
	"mailbox and web events":   "mailbox",
	"paid battle pass":         "paidBattlePass",
	"supply pass":              "supplyPass",
	"f2p limited total":        "__totalF2P",
	"paid + f2p limited total": "__totalPaid",
	"paid+f2p limited total":   "__totalPaid",
}

var profilesByGameID = map[string]gameProfile{
	gameIDEndfield: {
		ID:                   gameIDEndfield,
		DefaultSpreadsheetID: "1zGNuQ53R7c190RG40dHxcHv8tJuT3cBaclm8CjI-luY",
		DefaultOutputPath:    "src/data/endfield.generated.js",
		ParseSheet:           parseSheetToPatch,
	},
	gameIDWuwa: {
		ID:                   gameIDWuwa,
		DefaultSpreadsheetID: "1msSsnWBcXKniykf4rWQCEdk2IQuB9JHy",
		DefaultOutputPath:    "src/data/wuwa.generated.js",
		ParseSheet:           parseSheetToPatchWuwa,
	},
	gameIDZzz: {
		ID:                   gameIDZzz,
		DefaultSpreadsheetID: "2PACX-1vTiSx8OSyx-BZktnpT-fh_pQHjjkD8q3sp3Csy2aOI-8CV_QroqxzhhNjiCZNV4IdzhyK3xbipZn9WD",
		DefaultOutputPath:    "src/data/zzz.generated.js",
		ParseSheet:           parseSheetToPatchZzz,
	},
	gameIDGenshin: {
		ID:                   gameIDGenshin,
		DefaultSpreadsheetID: "1l9HPu2cAzTckdXtr7u-7D8NSKzZNUqOuvbmxERFZ_6w",
		DefaultOutputPath:    "src/data/genshin.generated.js",
		ParseSheet:           parseSheetToPatchGenshin,
	},
	gameIDHsr: {
		ID:                   gameIDHsr,
		DefaultSpreadsheetID: "2PACX-1vRIWjzFwAZZoBvKw2oiNaVpppI9atoV0wxuOjulKRJECrg_BN404d7LoKlHp8RMX8hegDr4b8jlHjYy",
		DefaultOutputPath:    "src/data/hsr.generated.js",
		ParseSheet:           parseSheetToPatchHsr,
	},
}

func availableGameIDs() []string {
	return []string{gameIDEndfield, gameIDWuwa, gameIDZzz, gameIDGenshin, gameIDHsr}
}

func resolveGameProfile(gameID string) (gameProfile, error) {
	trimmed := strings.TrimSpace(gameID)
	if trimmed == "" {
		trimmed = defaultGameID
	}
	profile, ok := profilesByGameID[trimmed]
	if !ok {
		return gameProfile{}, fmt.Errorf(
			"unknown game id %q (allowed: %s)",
			trimmed,
			strings.Join(availableGameIDs(), ", "),
		)
	}
	return profile, nil
}

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
func parseSheetToPatchWuwa(sheetName, csvText string) (Patch, error) {
	normalizedSheetName := normalizePatchName(sheetName)

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

	if monthly.Oroberyl > 0 {
		sources[len(sources)-1].Scalers = []Scaler{
			{
				Type:      "per_duration",
				Unit:      "day",
				EveryDays: 1,
				Rounding:  "floor",
				Rewards: Rewards{
					Oroberyl: monthly.Oroberyl,
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
		actualPaidRewards.Oroberyl += monthly.Oroberyl * float64(durationDays)
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
			return Patch{}, fmt.Errorf(
				"paid mismatch: expected %.3f pulls from Total Paid, got %.3f",
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
		Notes:        "Generated from Wuthering Waves Google Sheets by patchsync",
		Sources:      sources,
	}, nil
}

func parseSheetToPatchHsr(sheetName, csvText string) (Patch, error) {
	normalizedSheetName := normalizePatchName(sheetName)

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
		Notes:        "Generated from Honkai: Star Rail Google Sheets by patchsync",
		Sources:      sources,
	}, nil
}
func parseSheetToPatchZzz(sheetName, csvText string) (Patch, error) {
	normalizedSheetName := normalizePatchName(sheetName)

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
		Notes:        "Generated from Zenless Zone Zero Google Sheets by patchsync",
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

func parseZzzRewards(record []string) Rewards {
	return Rewards{
		Oroberyl:  parseNumber(getCell(record, 1)),
		Chartered: parseNumber(getCell(record, 2)),
		Basic:     parseNumber(getCell(record, 3)),
		Arsenal:   parseNumber(getCell(record, 4)),
	}
}
func normalizePatchName(raw string) string {
	normalized := strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
	return strings.TrimSpace(strings.TrimRight(normalized, "*"))
}

func canonicalPatchID(raw string) string {
	normalized := normalizePatchName(raw)
	if major, minor, ok := versionSortKey(normalized); ok {
		return fmt.Sprintf("%d.%d", major, minor)
	}
	return normalized
}

func parseDataSheetPulls(csvText string, rowToSourceID map[string]string) (map[string]map[string]float64, error) {
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

	header := records[0]
	patchCols := map[int]string{}
	for idx, cell := range header {
		patchName := normalizePatchName(cell)
		if patchName == "" || !isVersionLikeSheetName(patchName) {
			continue
		}
		patchCols[idx] = patchName
	}
	if len(patchCols) == 0 {
		return nil, errors.New("Data sheet has no patch columns")
	}

	result := map[string]map[string]float64{}
	for _, record := range records[1:] {
		rowName := normalizeName(getCell(record, 0))
		sourceID, ok := rowToSourceID[rowName]
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

func parseEndfieldDataSheet(csvText string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, endfieldDataRowToSourceID)
}

func parseWuwaDataSheet(csvText string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, wuwaDataRowToSourceID)
}

func parseZzzDataSheet(csvText string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, zzzDataRowToSourceID)
}

func parseHsrDataSheet(csvText string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, hsrDataRowToSourceID)
}

func parseDataPullValue(raw string) (float64, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, false
	}
	value = strings.ReplaceAll(value, "\u00a0", "")
	value = strings.ReplaceAll(value, " ", "")

	lastComma := strings.LastIndex(value, ",")
	lastDot := strings.LastIndex(value, ".")
	switch {
	case lastComma >= 0 && lastDot >= 0:
		if lastComma > lastDot {
			value = strings.ReplaceAll(value, ".", "")
			value = strings.ReplaceAll(value, ",", ".")
		} else {
			value = strings.ReplaceAll(value, ",", "")
		}
	case lastComma >= 0:
		value = strings.ReplaceAll(value, ",", ".")
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, false
	}
	return roundToTenth(parsed), true
}

func lookupSourcePullsByPatchName(pullsByPatch map[string]map[string]float64, patchName string) (map[string]float64, bool) {
	if sourcePulls, ok := pullsByPatch[patchName]; ok {
		return sourcePulls, true
	}
	normalizedPatch := normalizePatchName(patchName)
	for key, value := range pullsByPatch {
		if normalizePatchName(key) == normalizedPatch {
			return value, true
		}
	}
	targetMajor, targetMinor, okTarget := versionSortKey(patchName)
	if okTarget {
		for key, value := range pullsByPatch {
			major, minor, ok := versionSortKey(key)
			if ok && major == targetMajor && minor == targetMinor {
				return value, true
			}
		}
	}
	return nil, false
}
func applyEndfieldDataPullOverrides(patch *Patch, pullsByPatch map[string]map[string]float64) error {
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
	return nil
}

func applyWuwaDataPullOverrides(patch *Patch, pullsByPatch map[string]map[string]float64) error {
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
		if sourceID == "__totalF2P" {
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
			"dailyActivity": {},
			"endgameModes":  {},
			"coralShop":     {},
			"weaponPulls":   {},
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
		if delta != 0 {
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
		if sourceID == "__totalF2P" {
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
		if delta != 0 {
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
func parseWuwaRewards(record []string) Rewards {
	return Rewards{
		Oroberyl:   parseNumber(getCell(record, 1)),
		Chartered:  parseNumber(getCell(record, 2)),
		Firewalker: parseNumber(getCell(record, 3)),
		Basic:      parseNumber(getCell(record, 4)),
	}
}

func parseDateToISO(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	layouts := []string{
		"02.01.2006",
		"2.1.2006",
		"02/01/2006",
		"2/1/2006",
		"01/02/2006",
		"1/2/2006",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.Format("2006-01-02")
		}
	}
	return ""
}

func findWuwaDurationDays(records [][]string) int {
	for rowIdx, record := range records {
		for colIdx, cell := range record {
			label := normalizeName(cell)
			if !strings.Contains(label, "version length") {
				continue
			}
			if days := parseInt(getCell(record, colIdx+1)); days > 0 {
				return days
			}
			if rowIdx+1 < len(records) {
				if days := parseInt(getCell(records[rowIdx+1], colIdx+1)); days > 0 {
					return days
				}
			}
		}
	}
	return 0
}

func wwPullsFromRewards(r Rewards) float64 {
	return (r.Oroberyl / 160.0) + r.Chartered + r.Firewalker
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func roundToTenth(value float64) float64 {
	return math.Round(value*10) / 10
}
