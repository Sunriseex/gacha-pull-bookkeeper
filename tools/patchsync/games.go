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
}

func availableGameIDs() []string {
	return []string{gameIDEndfield, gameIDWuwa}
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

func normalizePatchName(raw string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
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

func applyEndfieldDataPullOverrides(patch *Patch, pullsByPatch map[string]map[string]float64) error {
	if patch == nil {
		return errors.New("patch is nil")
	}
	patchName := normalizePatchName(patch.Patch)
	sourcePulls, ok := pullsByPatch[patchName]
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
	sourcePulls, ok := pullsByPatch[patchName]
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
