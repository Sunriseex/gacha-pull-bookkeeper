package main

import (
	"encoding/csv"
	"errors"
	"fmt"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)



var patchVersionWithDatePattern = regexp.MustCompile(`(?i)^version\s+\d+\.\d+\s*\(([^)]+)\)`)






func availableGameIDs() []string {
	return []string{gameIDEndfield, gameIDWuwa, gameIDZzz, gameIDGenshin, gameIDHsr}
}

func spreadsheetEnvKeyForGame(gameID string) string {
	switch gameID {
	case gameIDEndfield:
		return envSpreadsheetEndfield
	case gameIDWuwa:
		return envSpreadsheetWuwa
	case gameIDZzz:
		return envSpreadsheetZzz
	case gameIDGenshin:
		return envSpreadsheetGenshin
	case gameIDHsr:
		return envSpreadsheetHsr
	default:
		return ""
	}
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

	envKey := spreadsheetEnvKeyForGame(trimmed)
	if envKey != "" {
		profile.DefaultSpreadsheetID = extractSpreadsheetID(strings.TrimSpace(os.Getenv(envKey)))
	}
	return profile, nil
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

func mergeTagLists(base []string, extra []string) []string {
	if len(base) == 0 && len(extra) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	merged := make([]string, 0, len(base)+len(extra))
	for _, tag := range append(append([]string{}, base...), extra...) {
		normalized := strings.TrimSpace(tag)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		merged = append(merged, normalized)
	}
	if len(merged) == 0 {
		return nil
	}
	return merged
}

func parseDataSheetPatchTags(csvText string) (map[string][]string, error) {
	reader := csv.NewReader(strings.NewReader(csvText))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("csv parse error: %w", err)
	}
	if len(records) == 0 {
		return map[string][]string{}, nil
	}

	header, _ := findDataSheetHeader(records)
	tagsByPatch := map[string][]string{}
	for _, cell := range header {
		patchID := canonicalPatchID(cell)
		if patchID == "" || !isVersionLikeSheetName(patchID) {
			continue
		}
		tags := patchTagsFromSheetName(cell)
		if len(tags) == 0 {
			continue
		}
		tagsByPatch[patchID] = mergeTagLists(tagsByPatch[patchID], tags)
	}
	return tagsByPatch, nil
}

func findDataSheetHeader(records [][]string) ([]string, int) {
	for idx, record := range records {
		if normalizeName(getCell(record, 0)) != "version" {
			continue
		}
		for _, cell := range record {
			patchName := canonicalPatchID(cell)
			if patchName != "" && isVersionLikeSheetName(patchName) {
				return record, idx
			}
		}
	}

	bestIdx := 0
	bestCount := 0
	for idx, record := range records {
		count := 0
		for _, cell := range record {
			patchName := canonicalPatchID(cell)
			if patchName != "" && isVersionLikeSheetName(patchName) {
				count++
			}
		}
		if count > bestCount {
			bestIdx = idx
			bestCount = count
		}
	}
	if len(records) == 0 {
		return nil, 0
	}
	return records[bestIdx], bestIdx
}

func explicitDataSheetPatchColumns(header []string) map[int]string {
	patchCols := map[int]string{}
	for idx, cell := range header {
		patchName := canonicalPatchID(cell)
		if patchName == "" || !isVersionLikeSheetName(patchName) {
			continue
		}
		patchCols[idx] = patchName
	}
	return patchCols
}

func sortedDataColumns(records [][]string, rowToSourceID map[string]string, startRow int) []int {
	seen := map[int]struct{}{}
	for _, record := range records[startRow:] {
		rowName := normalizeName(getCell(record, 0))
		if _, ok := rowToSourceID[rowName]; !ok {
			continue
		}
		for idx := 1; idx < len(record); idx++ {
			if _, ok := parseDataPullValue(getCell(record, idx)); !ok {
				continue
			}
			seen[idx] = struct{}{}
		}
	}
	cols := make([]int, 0, len(seen))
	for idx := range seen {
		cols = append(cols, idx)
	}
	sort.Ints(cols)
	return cols
}

func inferDataSheetPatchColumns(records [][]string, rowToSourceID map[string]string, headerIdx int, explicitCols map[int]string, fallbackSheetNames []string) map[int]string {
	fallbackIDs := make([]string, 0, len(fallbackSheetNames))
	for _, sheetName := range fallbackSheetNames {
		patchID := canonicalPatchID(sheetName)
		if patchID == "" || !isVersionLikeSheetName(patchID) {
			continue
		}
		fallbackIDs = append(fallbackIDs, patchID)
	}
	fallbackIDs = uniqueStrings(fallbackIDs)
	sortVersionStrings(fallbackIDs)
	if len(fallbackIDs) == 0 {
		return explicitCols
	}

	valueCols := sortedDataColumns(records, rowToSourceID, headerIdx+1)
	if len(valueCols) == 0 {
		return explicitCols
	}

	fallbackIndexByPatch := map[string]int{}
	for idx, patchID := range fallbackIDs {
		fallbackIndexByPatch[patchID] = idx
	}
	for colIdx, patchID := range explicitCols {
		fallbackIdx, ok := fallbackIndexByPatch[canonicalPatchID(patchID)]
		if !ok {
			continue
		}
		startCol := colIdx - fallbackIdx
		inferred := map[int]string{}
		for idx, patchID := range fallbackIDs {
			col := startCol + idx
			if col < 0 {
				continue
			}
			inferred[col] = patchID
		}
		return inferred
	}

	if len(valueCols) == len(fallbackIDs) {
		inferred := map[int]string{}
		for idx, col := range valueCols {
			inferred[col] = fallbackIDs[idx]
		}
		return inferred
	}

	return explicitCols
}

func parseDataSheetPulls(csvText string, rowToSourceID map[string]string, fallbackSheetNames []string) (map[string]map[string]float64, error) {
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
	patchCols = inferDataSheetPatchColumns(records, rowToSourceID, headerIdx, patchCols, fallbackSheetNames)
	if len(patchCols) == 0 {
		return nil, errors.New("Data sheet has no patch columns")
	}

	result := map[string]map[string]float64{}
	for _, record := range records[headerIdx+1:] {
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

func parseEndfieldDataSheet(csvText string, fallbackSheetNames []string) (map[string]map[string]float64, error) {
	return parseDataSheetPulls(csvText, endfieldDataRowToSourceID, fallbackSheetNames)
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
			// label may span rows; scan same column below for duration
			for scanRow := rowIdx + 1; scanRow < len(records); scanRow++ {
				if days := parseInt(getCell(records[scanRow], colIdx)); days >= 7 && days <= 120 {
					return days
				}
			}
		}
	}
	return 0
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
