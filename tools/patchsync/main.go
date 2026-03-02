package main

import (
	"context"
	"crypto/subtle"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultOutputPath    = "src/data/endfield.generated.js"
	defaultBindAddr      = "127.0.0.1:8787"
	defaultChangeLogPath = "tools/patchsync/logs/table-changes.jsonl"
)

var versionSheetPattern = regexp.MustCompile(`^\d+\.\d+$`)
var versionLikeSheetPattern = regexp.MustCompile(`^\d+\.\d+(?:\*+)?(?:\s*(?:\([^)]+\)|[A-Za-z][A-Za-z0-9 ._-]*))?$`)
var versionPrefixPattern = regexp.MustCompile(`^\s*(\d+)\.(\d+)`)
var wipTagPattern = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])(?:wip|stc)(?:[^a-z0-9]|$)`)
var spreadsheetIDFromURLPattern = regexp.MustCompile(`/spreadsheets/d/([a-zA-Z0-9-_]+)`)
var publishedSpreadsheetIDFromURLPattern = regexp.MustCompile(`/spreadsheets/d/e/([a-zA-Z0-9-_]+)`)
var patchFieldPattern = regexp.MustCompile(`(?m)(?:\bpatch\s*:|"patch"\s*:)\s*"(\d+\.\d+)"`)
var generatedPatchesBlockPattern = regexp.MustCompile(`(?s)export const GENERATED_PATCHES\s*=\s*(\[[\s\S]*?\]);`)
var sheetTabCaptionPattern = regexp.MustCompile(`docs-sheet-tab-caption\">([^<]+)</div>`)
var publishedSheetItemPattern = regexp.MustCompile(`items\.push\(\{name:\s*"([^"]+)"[\s\S]*?gid:\s*"(-?\d+)"`)
var publishedSheetGIDCache sync.Map

func normalizeSheetNameForMatch(raw string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(raw)), " ")
}

func isVersionLikeSheetName(raw string) bool {
	return versionLikeSheetPattern.MatchString(normalizeSheetNameForMatch(raw))
}

func patchTagsFromSheetName(values ...string) []string {
	tags := make([]string, 0, 1)
	for _, raw := range values {
		normalized := normalizeSheetNameForMatch(raw)
		if normalized == "" {
			continue
		}
		if wipTagPattern.MatchString(normalized) {
			tags = append(tags, "WIP")
			break
		}
	}
	if len(tags) == 0 {
		return nil
	}
	return tags
}

func isPublishedSpreadsheetID(raw string) bool {
	trimmed := strings.TrimSpace(raw)
	return strings.HasPrefix(trimmed, "2PACX-")
}

type Rewards struct {
	Oroberyl    float64 `json:"oroberyl"`
	Origeometry float64 `json:"origeometry"`
	Chartered   float64 `json:"chartered"`
	Basic       float64 `json:"basic"`
	Firewalker  float64 `json:"firewalker"`
	Messenger   float64 `json:"messenger"`
	Hues        float64 `json:"hues"`
	Arsenal     float64 `json:"arsenal"`
}

func normalizeRewardKey(raw string) string {
	key := strings.ToLower(strings.TrimSpace(raw))
	replacer := strings.NewReplacer(" ", "", "_", "", "-", "", "'", "", "\"", "")
	return replacer.Replace(key)
}

func (r *Rewards) addMappedValue(key string, value float64) {
	switch normalizeRewardKey(key) {
	case "oroberyl", "astrite", "polychrome", "primogem", "stellarjade":
		r.Oroberyl += value
	case "origeometry", "lunite", "monochrome", "genesiscrystal", "oneiricshard":
		r.Origeometry += value
	case "chartered", "radianttide", "encryptedmastertape", "intertwinedfate", "specialpass":
		r.Chartered += value
	case "basic", "lustroustide", "mastertape", "acquaintfate", "railpass":
		r.Basic += value
	case "firewalker", "forgingtide":
		r.Firewalker += value
	case "messenger":
		r.Messenger += value
	case "hues":
		r.Hues += value
	case "arsenal", "forgingtoken", "boopon", "starglitter", "tracksofdestiny":
		r.Arsenal += value
	}
}

func (r *Rewards) UnmarshalJSON(data []byte) error {
	if strings.TrimSpace(string(data)) == "null" {
		*r = Rewards{}
		return nil
	}

	raw := map[string]float64{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	parsed := Rewards{}
	for key, value := range raw {
		parsed.addMappedValue(key, value)
	}
	*r = parsed
	return nil
}

type Scaler struct {
	Type      string  `json:"type"`
	Unit      string  `json:"unit"`
	EveryDays int     `json:"everyDays"`
	Rounding  string  `json:"rounding"`
	Rewards   Rewards `json:"rewards"`
}

type Source struct {
	ID           string        `json:"id"`
	Label        string        `json:"label"`
	Gate         string        `json:"gate"`
	OptionKey    *string       `json:"optionKey"`
	CountInPulls bool          `json:"countInPulls"`
	Pulls        *float64      `json:"pulls,omitempty"`
	Rewards      Rewards       `json:"rewards"`
	Costs        Rewards       `json:"costs"`
	Scalers      []Scaler      `json:"scalers"`
	BPCrateModel *BPCrateModel `json:"bpCrateModel,omitempty"`
}

type BPCrateModel struct {
	Type             string  `json:"type"`
	DaysToLevel60T3  int     `json:"daysToLevel60Tier3"`
	Tier2XPBonusRate float64 `json:"tier2XpBonus"`
	Tier3XPBonusRate float64 `json:"tier3XpBonus"`
}

type Patch struct {
	ID           string   `json:"id"`
	Patch        string   `json:"patch"`
	VersionName  string   `json:"versionName"`
	StartDate    string   `json:"startDate"`
	DurationDays int      `json:"durationDays"`
	Tags         []string `json:"tags,omitempty"`
	Notes        string   `json:"notes"`
	Sources      []Source `json:"sources"`
}

type GeneratedMeta struct {
	GameID        string   `json:"gameId"`
	SpreadsheetID string   `json:"spreadsheetId"`
	Sheets        []string `json:"sheets"`
	GeneratedAt   string   `json:"generatedAt"`
}

type SyncConfig struct {
	GameID          string
	SpreadsheetID   string
	SheetNames      []string
	OutputPath      string
	BasePatchesPath string
	CreateBranch    bool
	BranchPrefix    string
	SkipExisting    bool
	DryRun          bool
	ClientTimeout   time.Duration
}

type SyncResult struct {
	GameID         string
	Patches        []Patch
	AllPatches     []Patch
	SkippedPatches []string
	SheetNames     []string
	OutputPath     string
	BranchName     string
	Logs           []string
	ChangeCount    int
	ChangeLogPath  string
	GeneratedAt    string
}

type sheetRow struct {
	Name    string
	Rewards Rewards
	HasData bool
}

type syncRequest struct {
	GameID        string   `json:"gameId"`
	SpreadsheetID string   `json:"spreadsheetId"`
	SheetNames    []string `json:"sheetNames"`
	CreateBranch  bool     `json:"createBranch"`
	BranchPrefix  string   `json:"branchPrefix"`
	DryRun        bool     `json:"dryRun"`
}

type syncAllRequest struct {
	DryRun bool `json:"dryRun"`
}

type syncGameResult struct {
	GameID        string   `json:"gameId"`
	Sheets        []string `json:"sheets,omitempty"`
	Patches       []string `json:"patches,omitempty"`
	Skipped       []string `json:"skipped,omitempty"`
	OutputPath    string   `json:"outputPath,omitempty"`
	Error         string   `json:"error,omitempty"`
	Logs          []string `json:"logs,omitempty"`
	ChangeCount   int      `json:"changeCount,omitempty"`
	ChangeLogPath string   `json:"changeLogPath,omitempty"`
	GeneratedAt   string   `json:"generatedAt,omitempty"`
}

type syncResponse struct {
	OK            bool             `json:"ok"`
	Message       string           `json:"message"`
	GameID        string           `json:"gameId,omitempty"`
	Sheets        []string         `json:"sheets,omitempty"`
	Patches       []string         `json:"patches,omitempty"`
	Skipped       []string         `json:"skipped,omitempty"`
	OutputPath    string           `json:"outputPath,omitempty"`
	Branch        string           `json:"branch,omitempty"`
	Results       []syncGameResult `json:"results,omitempty"`
	Logs          []string         `json:"logs,omitempty"`
	ChangeCount   int              `json:"changeCount,omitempty"`
	ChangeLogPath string           `json:"changeLogPath,omitempty"`
	GeneratedAt   string           `json:"generatedAt,omitempty"`
}

type patchChangeLogEntry struct {
	Patch          string   `json:"patch"`
	ChangeType     string   `json:"changeType"`
	ChangedSources []string `json:"changedSources,omitempty"`
}

type syncChangeLogRecord struct {
	Timestamp      string                `json:"timestamp"`
	GameID         string                `json:"gameId"`
	SpreadsheetID  string                `json:"spreadsheetId"`
	OutputPath     string                `json:"outputPath"`
	GeneratedAt    string                `json:"generatedAt"`
	UpdatedPatches []patchChangeLogEntry `json:"updatedPatches"`
}

type patchParser func(sheetName, csvText string) (Patch, error)

func zeroRewards() Rewards {
	return Rewards{}
}

func (r *Rewards) add(other Rewards) {
	r.Oroberyl += other.Oroberyl
	r.Origeometry += other.Origeometry
	r.Chartered += other.Chartered
	r.Basic += other.Basic
	r.Firewalker += other.Firewalker
	r.Messenger += other.Messenger
	r.Hues += other.Hues
	r.Arsenal += other.Arsenal
}

func (r Rewards) hasAny() bool {
	return r.Oroberyl != 0 || r.Origeometry != 0 || r.Chartered != 0 ||
		r.Basic != 0 || r.Firewalker != 0 || r.Messenger != 0 ||
		r.Hues != 0 || r.Arsenal != 0
}

func ptr(s string) *string {
	return &s
}

func source(id, label, gate string, optionKey *string, countInPulls bool, rewards Rewards) Source {
	return Source{
		ID:           id,
		Label:        label,
		Gate:         gate,
		OptionKey:    optionKey,
		CountInPulls: countInPulls,
		Pulls:        nil,
		Rewards:      rewards,
		Costs:        zeroRewards(),
		Scalers:      []Scaler{},
		BPCrateModel: nil,
	}
}

func normalizeName(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimSuffix(value, ":")
	value = strings.ReplaceAll(value, "’", "'")
	value = strings.ReplaceAll(value, "`", "'")
	value = strings.ToLower(value)
	value = strings.Join(strings.Fields(value), " ")
	return value
}

func parseNumber(raw string) float64 {
	cleaned := strings.TrimSpace(raw)
	if cleaned == "" {
		return 0
	}
	cleaned = strings.ReplaceAll(cleaned, "\u00a0", "")
	cleaned = strings.ReplaceAll(cleaned, " ", "")
	cleaned = strings.TrimSuffix(cleaned, "%")

	lastComma := strings.LastIndex(cleaned, ",")
	lastDot := strings.LastIndex(cleaned, ".")
	switch {
	case lastComma >= 0 && lastDot >= 0:
		if lastComma > lastDot {
			cleaned = strings.ReplaceAll(cleaned, ".", "")
			cleaned = strings.ReplaceAll(cleaned, ",", ".")
		} else {
			cleaned = strings.ReplaceAll(cleaned, ",", "")
		}
	case lastComma >= 0:
		if strings.Count(cleaned, ",") > 1 {
			cleaned = strings.ReplaceAll(cleaned, ",", "")
		} else {
			parts := strings.Split(cleaned, ",")
			if len(parts) == 2 && len(parts[1]) == 3 {
				cleaned = parts[0] + parts[1]
			} else {
				cleaned = strings.ReplaceAll(cleaned, ",", ".")
			}
		}
	}

	if strings.Count(cleaned, ".") > 0 {
		parts := strings.Split(cleaned, ".")
		isThousands := len(parts) > 1
		for _, part := range parts {
			if part == "" {
				isThousands = false
				break
			}
			for _, r := range part {
				if r < '0' || r > '9' {
					isThousands = false
					break
				}
			}
			if !isThousands {
				break
			}
		}
		if isThousands {
			for i := 1; i < len(parts); i++ {
				if len(parts[i]) != 3 {
					isThousands = false
					break
				}
			}
		}
		if isThousands {
			cleaned = strings.Join(parts, "")
		}
	}
	value, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return 0
	}
	return value
}

func parseInt(raw string) int {
	value := parseNumber(raw)
	return int(value)
}

func normalizeHeader(raw string) string {
	return normalizeName(raw)
}

func findHeaderIndex(headers []string, expected []string, defaultIndex int) int {
	for idx, header := range headers {
		h := normalizeHeader(header)
		for _, candidate := range expected {
			if h == candidate || strings.Contains(h, candidate) {
				return idx
			}
		}
	}
	return defaultIndex
}

func getCell(record []string, idx int) string {
	if idx < 0 || idx >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[idx])
}

func inferDurationDays(headers []string, firstDataRow []string, durationCol int) int {
	for idx, header := range headers {
		norm := normalizeHeader(header)
		if strings.Contains(norm, "version length") || strings.Contains(norm, "version duration") {
			if idx+1 < len(headers) {
				if days := parseInt(headers[idx+1]); days > 0 {
					return days
				}
			}
			if days := parseInt(getCell(firstDataRow, idx)); days > 0 {
				return days
			}
		}
	}
	if durationCol >= 0 {
		if days := parseInt(getCell(firstDataRow, durationCol)); days > 0 {
			return days
		}
	}
	return 0
}

func rowFromRecord(record []string, idxName, idxOro, idxOri, idxChartered, idxBasic, idxArsenal int) sheetRow {
	oroRaw := getCell(record, idxOro)
	oriRaw := getCell(record, idxOri)
	charteredRaw := getCell(record, idxChartered)
	basicRaw := getCell(record, idxBasic)
	arsenalRaw := getCell(record, idxArsenal)

	hasData := strings.TrimSpace(oroRaw) != "" ||
		strings.TrimSpace(oriRaw) != "" ||
		strings.TrimSpace(charteredRaw) != "" ||
		strings.TrimSpace(basicRaw) != "" ||
		strings.TrimSpace(arsenalRaw) != ""

	return sheetRow{
		Name: getCell(record, idxName),
		Rewards: Rewards{
			Oroberyl:    parseNumber(oroRaw),
			Origeometry: parseNumber(oriRaw),
			Chartered:   parseNumber(charteredRaw),
			Basic:       parseNumber(basicRaw),
			Arsenal:     parseNumber(arsenalRaw),
		},
		HasData: hasData,
	}
}

func battlePassCoreRewards(input Rewards) Rewards {
	return Rewards{
		Origeometry: input.Origeometry,
		Arsenal:     input.Arsenal,
	}
}

func battlePassCrateFallbackRewards(input Rewards) Rewards {
	return Rewards{
		Oroberyl:   input.Oroberyl,
		Chartered:  input.Chartered,
		Basic:      input.Basic,
		Firewalker: input.Firewalker,
		Messenger:  input.Messenger,
		Hues:       input.Hues,
	}
}

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

func fetchText(ctx context.Context, client *http.Client, resourceURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resourceURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	body := string(bodyBytes)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(body))
	}
	return body, nil
}

func sheetCSVURL(spreadsheetID, sheetName string) string {
	return fmt.Sprintf(
		"https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s",
		url.PathEscape(strings.TrimSpace(spreadsheetID)),
		url.QueryEscape(sheetName),
	)
}

func publishedSheetCSVURL(spreadsheetID, gid string) string {
	return fmt.Sprintf(
		"https://docs.google.com/spreadsheets/d/e/%s/pub?gid=%s&single=true&output=csv",
		url.PathEscape(strings.TrimSpace(spreadsheetID)),
		url.QueryEscape(strings.TrimSpace(gid)),
	)
}

func parsePublishedSheetGIDsFromHTML(body string) map[string]string {
	result := map[string]string{}
	matches := publishedSheetItemPattern.FindAllStringSubmatch(body, -1)
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		name := strings.TrimSpace(html.UnescapeString(match[1]))
		gid := strings.TrimSpace(match[2])
		if name == "" || gid == "" {
			continue
		}
		if _, exists := result[name]; !exists {
			result[name] = gid
		}
	}
	return result
}

func discoverPublishedSheetGIDs(ctx context.Context, client *http.Client, spreadsheetID string) (map[string]string, error) {
	pubHTMLURL := fmt.Sprintf(
		"https://docs.google.com/spreadsheets/d/e/%s/pubhtml",
		url.PathEscape(strings.TrimSpace(spreadsheetID)),
	)
	body, err := fetchText(ctx, client, pubHTMLURL)
	if err != nil {
		return nil, err
	}
	gidByName := parsePublishedSheetGIDsFromHTML(body)
	if len(gidByName) == 0 {
		return nil, errors.New("no sheet names found in published HTML")
	}
	return gidByName, nil
}

func getPublishedSheetGIDs(ctx context.Context, client *http.Client, spreadsheetID string) (map[string]string, error) {
	cacheKey := strings.TrimSpace(spreadsheetID)
	if cached, ok := publishedSheetGIDCache.Load(cacheKey); ok {
		if typed, okTyped := cached.(map[string]string); okTyped && len(typed) > 0 {
			return typed, nil
		}
	}
	gidByName, err := discoverPublishedSheetGIDs(ctx, client, spreadsheetID)
	if err != nil {
		return nil, err
	}
	publishedSheetGIDCache.Store(cacheKey, gidByName)
	return gidByName, nil
}

func fetchSheetCSV(ctx context.Context, client *http.Client, spreadsheetID, sheetName string) (string, error) {
	var resourceURL string
	if isPublishedSpreadsheetID(spreadsheetID) {
		gidByName, err := getPublishedSheetGIDs(ctx, client, spreadsheetID)
		if err != nil {
			return "", err
		}
		gid, ok := gidByName[sheetName]
		if !ok {
			normalizedTarget := normalizeSheetNameForMatch(sheetName)
			for name, candidateGID := range gidByName {
				if normalizeSheetNameForMatch(name) == normalizedTarget {
					gid = candidateGID
					ok = true
					break
				}
			}
		}
		if !ok {
			return "", fmt.Errorf("published sheet %q not found", sheetName)
		}
		resourceURL = publishedSheetCSVURL(spreadsheetID, gid)
	} else {
		resourceURL = sheetCSVURL(spreadsheetID, sheetName)
	}

	body, err := fetchText(ctx, client, resourceURL)
	if err != nil {
		return "", err
	}
	if strings.Contains(strings.ToLower(body), "<!doctype html") {
		return "", errors.New("sheet is not accessible as CSV")
	}
	return body, nil
}

type worksheetFeed struct {
	Feed struct {
		Entry []struct {
			Title struct {
				Text string `json:"$t"`
			} `json:"title"`
		} `json:"entry"`
	} `json:"feed"`
}

func discoverSheetNamesByProbe(ctx context.Context, client *http.Client, spreadsheetID string, parser patchParser) ([]string, error) {
	majorCandidates := []int{1, 0, 2, 3, 4, 5}
	type probeResult struct {
		major int
		ok    bool
	}

	results := make(chan probeResult, len(majorCandidates))
	var wg sync.WaitGroup
	for _, major := range majorCandidates {
		wg.Add(1)
		go func(major int) {
			defer wg.Done()
			probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()
			candidate := fmt.Sprintf("%d.0", major)
			csvText, err := fetchSheetCSV(probeCtx, client, spreadsheetID, candidate)
			if err == nil {
				_, err = parser(candidate, csvText)
			}
			results <- probeResult{
				major: major,
				ok:    err == nil,
			}
		}(major)
	}
	wg.Wait()
	close(results)

	majorSet := map[int]struct{}{}
	for result := range results {
		if result.ok {
			majorSet[result.major] = struct{}{}
		}
	}

	names := make([]string, 0, 8)
	for _, major := range majorCandidates {
		if _, ok := majorSet[major]; !ok {
			continue
		}

		missStreak := 0
		for minor := 0; minor <= 50; minor++ {
			candidate := fmt.Sprintf("%d.%d", major, minor)
			probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			csvText, err := fetchSheetCSV(probeCtx, client, spreadsheetID, candidate)
			if err == nil {
				_, err = parser(candidate, csvText)
			}
			cancel()
			if err != nil {
				missStreak++
				if minor == 0 {
					break
				}
				if missStreak >= 2 {
					break
				}
				continue
			}
			missStreak = 0
			names = append(names, candidate)
		}
	}

	names = uniqueSheetNames(names)
	sortVersionStrings(names)
	if len(names) == 0 {
		return nil, errors.New("no N.N sheet names found by probe")
	}
	return names, nil
}

func discoverSheetNamesFromHTML(ctx context.Context, client *http.Client, spreadsheetID string) ([]string, error) {
	editURL := fmt.Sprintf(
		"https://docs.google.com/spreadsheets/d/%s/edit",
		url.PathEscape(strings.TrimSpace(spreadsheetID)),
	)
	body, err := fetchText(ctx, client, editURL)
	if err != nil {
		return nil, err
	}
	matches := sheetTabCaptionPattern.FindAllStringSubmatch(body, -1)
	if len(matches) == 0 {
		return nil, errors.New("no sheet tabs found in HTML")
	}
	names := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		caption := html.UnescapeString(match[1])
		if !isVersionLikeSheetName(caption) {
			continue
		}
		names = append(names, caption)
	}
	names = uniqueSheetNames(names)
	sortVersionStrings(names)
	if len(names) == 0 {
		return nil, errors.New("no version-like sheet names found in HTML tabs")
	}
	return names, nil
}

func discoverPublishedSheetNames(ctx context.Context, client *http.Client, spreadsheetID string) ([]string, error) {
	gidByName, err := getPublishedSheetGIDs(ctx, client, spreadsheetID)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(gidByName))
	for name := range gidByName {
		if !isVersionLikeSheetName(name) {
			continue
		}
		names = append(names, name)
	}
	names = uniqueSheetNames(names)
	sortVersionStrings(names)
	if len(names) == 0 {
		return nil, errors.New("no version-like sheet names found in published HTML")
	}
	return names, nil
}

func discoverSheetNames(ctx context.Context, client *http.Client, spreadsheetID string, parser patchParser) ([]string, error) {
	if isPublishedSpreadsheetID(spreadsheetID) {
		names, err := discoverPublishedSheetNames(ctx, client, spreadsheetID)
		if err != nil {
			return nil, fmt.Errorf("failed to discover version sheets automatically: %w", err)
		}
		return names, nil
	}

	collectedNames := make([]string, 0, 32)
	feedURL := fmt.Sprintf(
		"https://spreadsheets.google.com/feeds/worksheets/%s/public/basic?alt=json",
		url.PathEscape(strings.TrimSpace(spreadsheetID)),
	)
	body, err := fetchText(ctx, client, feedURL)
	if err == nil {
		var payload worksheetFeed
		if unmarshalErr := json.Unmarshal([]byte(body), &payload); unmarshalErr == nil {
			names := make([]string, 0, len(payload.Feed.Entry))
			for _, entry := range payload.Feed.Entry {
				name := html.UnescapeString(entry.Title.Text)
				if isVersionLikeSheetName(name) {
					names = append(names, name)
				}
			}
			if len(names) > 0 {
				collectedNames = append(collectedNames, names...)
			}
		}
	}

	htmlNames, htmlErr := discoverSheetNamesFromHTML(ctx, client, spreadsheetID)
	if htmlErr == nil && len(htmlNames) > 0 {
		collectedNames = append(collectedNames, htmlNames...)
	}

	collectedNames = uniqueSheetNames(collectedNames)
	sortVersionStrings(collectedNames)
	if len(collectedNames) > 0 {
		return collectedNames, nil
	}

	probeNames, probeErr := discoverSheetNamesByProbe(ctx, client, spreadsheetID, parser)
	if probeErr == nil && len(probeNames) > 0 {
		return probeNames, nil
	}

	if err != nil {
		return nil, fmt.Errorf("failed to discover version sheets automatically: %w", err)
	}
	if htmlErr != nil {
		return nil, fmt.Errorf("failed to discover version sheets automatically: html=%v, probe=%v", htmlErr, probeErr)
	}
	return nil, fmt.Errorf("failed to discover version sheets automatically: %v", probeErr)
}
func uniqueSheetNames(input []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(input))
	for _, item := range input {
		key := strings.TrimSpace(item)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, item)
	}
	return result
}

func uniqueStrings(input []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(input))
	for _, item := range input {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	return result
}

func extractSpreadsheetID(input string) string {
	value := strings.TrimSpace(input)
	if value == "" {
		return ""
	}
	if strings.Contains(value, "/spreadsheets/d/e/") {
		matches := publishedSpreadsheetIDFromURLPattern.FindStringSubmatch(value)
		if len(matches) >= 2 {
			return matches[1]
		}
	}
	if strings.Contains(value, "/spreadsheets/d/") {
		matches := spreadsheetIDFromURLPattern.FindStringSubmatch(value)
		if len(matches) >= 2 {
			return matches[1]
		}
	}
	return value
}
func resolveFilePath(inputPath string) string {
	cleanPath := filepath.Clean(strings.TrimSpace(inputPath))
	if cleanPath == "" {
		return cleanPath
	}
	if filepath.IsAbs(cleanPath) {
		return cleanPath
	}
	candidates := []string{
		cleanPath,
		filepath.Join("..", "..", cleanPath),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return cleanPath
}

func resolveOutputPath(inputPath string) string {
	cleanPath := filepath.Clean(strings.TrimSpace(inputPath))
	if cleanPath == "" {
		return cleanPath
	}
	if filepath.IsAbs(cleanPath) {
		return cleanPath
	}
	candidates := []string{
		cleanPath,
		filepath.Join("..", "..", cleanPath),
	}
	for _, candidate := range candidates {
		parent := filepath.Dir(candidate)
		if parent == "." || parent == "" {
			return candidate
		}
		if stat, err := os.Stat(parent); err == nil && stat.IsDir() {
			return candidate
		}
	}
	return cleanPath
}

func parsePatchHeaderMeta(titleCell string) (string, string) {
	title := strings.TrimSpace(titleCell)
	if title == "" {
		return "", ""
	}

	startDate := ""
	datePattern := regexp.MustCompile(`\((\d{1,2}/\d{1,2}/\d{4})\)`)
	if match := datePattern.FindStringSubmatch(title); len(match) >= 2 {
		if parsed, err := time.Parse("01/02/2006", match[1]); err == nil {
			startDate = parsed.Format("2006-01-02")
		}
	}

	versionName := ""
	colonIdx := strings.Index(title, ":")
	if colonIdx >= 0 {
		versionName = strings.TrimSpace(title[colonIdx+1:])
	} else {
		versionName = title
	}
	if open := strings.LastIndex(versionName, "("); open >= 0 {
		versionName = strings.TrimSpace(versionName[:open])
	}

	return versionName, startDate
}

func versionSortKey(value string) (int, int, bool) {
	match := versionPrefixPattern.FindStringSubmatch(strings.TrimSpace(value))
	if len(match) < 3 {
		return 0, 0, false
	}
	major, errMajor := strconv.Atoi(match[1])
	minor, errMinor := strconv.Atoi(match[2])
	if errMajor != nil || errMinor != nil {
		return 0, 0, false
	}
	return major, minor, true
}

func sortVersionStrings(values []string) {
	sort.Slice(values, func(i, j int) bool {
		majorI, minorI, okI := versionSortKey(values[i])
		majorJ, minorJ, okJ := versionSortKey(values[j])
		if okI && okJ {
			if majorI != majorJ {
				return majorI < majorJ
			}
			return minorI < minorJ
		}
		return values[i] < values[j]
	})
}

func sortPatches(patches []Patch) {
	sort.Slice(patches, func(i, j int) bool {
		majorI, minorI, okI := versionSortKey(patches[i].Patch)
		majorJ, minorJ, okJ := versionSortKey(patches[j].Patch)
		if okI && okJ {
			if majorI != majorJ {
				return majorI < majorJ
			}
			return minorI < minorJ
		}
		return patches[i].Patch < patches[j].Patch
	})
}

type generatedScaler struct {
	Type      string             `json:"type"`
	Unit      string             `json:"unit"`
	EveryDays int                `json:"everyDays"`
	Rounding  string             `json:"rounding"`
	Rewards   map[string]float64 `json:"rewards"`
}

type generatedSource struct {
	ID           string             `json:"id"`
	Label        string             `json:"label"`
	Gate         string             `json:"gate"`
	OptionKey    *string            `json:"optionKey"`
	CountInPulls bool               `json:"countInPulls"`
	Pulls        *float64           `json:"pulls,omitempty"`
	Rewards      map[string]float64 `json:"rewards"`
	Costs        map[string]float64 `json:"costs"`
	Scalers      []generatedScaler  `json:"scalers"`
	BPCrateModel *BPCrateModel      `json:"bpCrateModel,omitempty"`
}

type generatedPatch struct {
	ID           string            `json:"id"`
	Patch        string            `json:"patch"`
	VersionName  string            `json:"versionName"`
	StartDate    string            `json:"startDate"`
	DurationDays int               `json:"durationDays"`
	Tags         []string          `json:"tags,omitempty"`
	Notes        string            `json:"notes"`
	Sources      []generatedSource `json:"sources"`
}

func rewardsForGame(r Rewards, gameID string) map[string]float64 {
	timedPermits := r.Firewalker + r.Messenger + r.Hues
	switch gameID {
	case gameIDWuwa:
		return map[string]float64{
			"astrite":      r.Oroberyl,
			"lunite":       r.Origeometry,
			"forgingToken": r.Arsenal,
			"radiantTide":  r.Chartered,
			"lustrousTide": r.Basic,
			"forgingTide":  timedPermits,
		}
	case gameIDZzz:
		return map[string]float64{
			"polychrome":          r.Oroberyl,
			"monochrome":          r.Origeometry,
			"boopon":              r.Arsenal,
			"encryptedMasterTape": r.Chartered + timedPermits,
			"masterTape":          r.Basic,
		}
	case gameIDGenshin:
		return map[string]float64{
			"primogem":        r.Oroberyl,
			"genesisCrystal":  r.Origeometry,
			"starglitter":     r.Arsenal,
			"intertwinedFate": r.Chartered + timedPermits,
			"acquaintFate":    r.Basic,
		}
	case gameIDHsr:
		return map[string]float64{
			"stellarJade":     r.Oroberyl,
			"oneiricShard":    r.Origeometry,
			"tracksOfDestiny": r.Arsenal,
			"specialPass":     r.Chartered + timedPermits,
			"railPass":        r.Basic,
		}
	default:
		return map[string]float64{
			"oroberyl":    r.Oroberyl,
			"origeometry": r.Origeometry,
			"chartered":   r.Chartered,
			"basic":       r.Basic,
			"firewalker":  r.Firewalker,
			"messenger":   r.Messenger,
			"hues":        r.Hues,
			"arsenal":     r.Arsenal,
		}
	}
}

func toGeneratedPatch(patch Patch, gameID string) generatedPatch {
	sources := make([]generatedSource, 0, len(patch.Sources))
	for _, src := range patch.Sources {
		scalers := make([]generatedScaler, 0, len(src.Scalers))
		for _, scaler := range src.Scalers {
			scalers = append(scalers, generatedScaler{
				Type:      scaler.Type,
				Unit:      scaler.Unit,
				EveryDays: scaler.EveryDays,
				Rounding:  scaler.Rounding,
				Rewards:   rewardsForGame(scaler.Rewards, gameID),
			})
		}

		sources = append(sources, generatedSource{
			ID:           src.ID,
			Label:        src.Label,
			Gate:         src.Gate,
			OptionKey:    src.OptionKey,
			CountInPulls: src.CountInPulls,
			Pulls:        src.Pulls,
			Rewards:      rewardsForGame(src.Rewards, gameID),
			Costs:        rewardsForGame(src.Costs, gameID),
			Scalers:      scalers,
			BPCrateModel: src.BPCrateModel,
		})
	}

	return generatedPatch{
		ID:           patch.ID,
		Patch:        patch.Patch,
		VersionName:  patch.VersionName,
		StartDate:    patch.StartDate,
		DurationDays: patch.DurationDays,
		Tags:         patch.Tags,
		Notes:        patch.Notes,
		Sources:      sources,
	}
}
func writeGeneratedFile(path string, patches []Patch, meta GeneratedMeta) error {
	if path == "" {
		path = defaultOutputPath
	}
	outputPatches := make([]generatedPatch, 0, len(patches))
	for _, patch := range patches {
		outputPatches = append(outputPatches, toGeneratedPatch(patch, meta.GameID))
	}
	patchesJSON, err := json.MarshalIndent(outputPatches, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal patches: %w", err)
	}
	metaJSON, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal meta: %w", err)
	}
	content := strings.Join([]string{
		"// Auto-generated by tools/patchsync. Do not edit by hand.",
		fmt.Sprintf("export const GENERATED_PATCHES = %s;", string(patchesJSON)),
		fmt.Sprintf("export const GENERATED_PATCHES_META = %s;", string(metaJSON)),
		"",
	}, "\n")
	if mkErr := os.MkdirAll(filepath.Dir(path), 0o755); mkErr != nil {
		return fmt.Errorf("create output dir: %w", mkErr)
	}
	if writeErr := os.WriteFile(path, []byte(content), 0o644); writeErr != nil {
		return fmt.Errorf("write generated file: %w", writeErr)
	}
	return nil
}
func readPatchIDsFromContent(content string) []string {
	matches := patchFieldPattern.FindAllStringSubmatch(content, -1)
	ids := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		candidate := strings.TrimSpace(match[1])
		if versionSheetPattern.MatchString(candidate) {
			ids = append(ids, candidate)
		}
	}
	return uniqueStrings(ids)
}

func readPatchIDsFromFile(path string) (map[string]struct{}, error) {
	result := map[string]struct{}{}
	body, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return result, nil
		}
		return nil, err
	}
	for _, patchID := range readPatchIDsFromContent(string(body)) {
		result[patchID] = struct{}{}
	}
	return result, nil
}

func readGeneratedPatches(path string) ([]Patch, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Patch{}, nil
		}
		return nil, err
	}
	match := generatedPatchesBlockPattern.FindStringSubmatch(string(body))
	if len(match) < 2 {
		return []Patch{}, nil
	}
	var patches []Patch
	if err := json.Unmarshal([]byte(match[1]), &patches); err != nil {
		return nil, fmt.Errorf("parse GENERATED_PATCHES: %w", err)
	}
	return patches, nil
}

func mergePatchesByID(existing []Patch, additions []Patch) []Patch {
	byID := make(map[string]Patch, len(existing)+len(additions))
	order := make([]string, 0, len(existing)+len(additions))
	for _, patch := range existing {
		if strings.TrimSpace(patch.ID) == "" {
			continue
		}
		if _, ok := byID[patch.ID]; !ok {
			order = append(order, patch.ID)
		}
		byID[patch.ID] = patch
	}
	for _, patch := range additions {
		if strings.TrimSpace(patch.ID) == "" {
			continue
		}
		if _, ok := byID[patch.ID]; !ok {
			order = append(order, patch.ID)
		}
		byID[patch.ID] = patch
	}
	merged := make([]Patch, 0, len(order))
	for _, id := range order {
		if patch, ok := byID[id]; ok {
			merged = append(merged, patch)
		}
	}
	sortPatches(merged)
	return merged
}

type comparablePatch struct {
	ID           string   `json:"id"`
	Patch        string   `json:"patch"`
	VersionName  string   `json:"versionName"`
	StartDate    string   `json:"startDate"`
	DurationDays int      `json:"durationDays"`
	Tags         []string `json:"tags,omitempty"`
	Sources      []Source `json:"sources"`
}

func patchComparableValue(patch Patch) comparablePatch {
	return comparablePatch{
		ID:           strings.TrimSpace(patch.ID),
		Patch:        strings.TrimSpace(patch.Patch),
		VersionName:  strings.TrimSpace(patch.VersionName),
		StartDate:    strings.TrimSpace(patch.StartDate),
		DurationDays: patch.DurationDays,
		Tags:         patch.Tags,
		Sources:      patch.Sources,
	}
}

func patchesEquivalent(left, right Patch) bool {
	leftJSON, leftErr := json.Marshal(patchComparableValue(left))
	if leftErr != nil {
		return false
	}
	rightJSON, rightErr := json.Marshal(patchComparableValue(right))
	if rightErr != nil {
		return false
	}
	return string(leftJSON) == string(rightJSON)
}

func appendSyncLog(logs *[]string, format string, args ...any) {
	message := fmt.Sprintf(format, args...)
	timestamped := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), message)
	*logs = append(*logs, timestamped)
	fmt.Println(timestamped)
}

func patchIDOrFallback(patch Patch) string {
	patchID := strings.TrimSpace(patch.Patch)
	if patchID == "" {
		patchID = strings.TrimSpace(patch.ID)
	}
	return patchID
}

func sourceByID(patch Patch) map[string]Source {
	result := make(map[string]Source, len(patch.Sources))
	for _, src := range patch.Sources {
		sourceID := strings.TrimSpace(src.ID)
		if sourceID == "" {
			continue
		}
		result[sourceID] = src
	}
	return result
}

func sourcesEquivalent(left, right Source) bool {
	leftJSON, leftErr := json.Marshal(left)
	if leftErr != nil {
		return false
	}
	rightJSON, rightErr := json.Marshal(right)
	if rightErr != nil {
		return false
	}
	return string(leftJSON) == string(rightJSON)
}

func changedSourceIDs(previous, next Patch) []string {
	previousSources := sourceByID(previous)
	nextSources := sourceByID(next)
	ids := make([]string, 0, len(previousSources)+len(nextSources))
	seen := map[string]struct{}{}
	for id := range previousSources {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	for id := range nextSources {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	sort.Strings(ids)

	changed := make([]string, 0, len(ids))
	for _, id := range ids {
		prevSource, hasPrev := previousSources[id]
		nextSource, hasNext := nextSources[id]
		if !hasPrev || !hasNext || !sourcesEquivalent(prevSource, nextSource) {
			changed = append(changed, id)
		}
	}
	return changed
}

func appendChangeLogRecord(path string, record syncChangeLogRecord) error {
	logPath := resolveOutputPath(path)
	if strings.TrimSpace(logPath) == "" {
		return errors.New("change log path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return fmt.Errorf("create change log directory: %w", err)
	}
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("open change log file: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(record); err != nil {
		return fmt.Errorf("write change log record: %w", err)
	}
	return nil
}

func createBranch(prefix string) (string, error) {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		prefix = "data/sheets"
	}
	branchName := fmt.Sprintf("%s-%s", prefix, time.Now().Format("20060102-150405"))
	cmd := exec.Command("git", "checkout", "-b", branchName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git checkout -b failed: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	return branchName, nil
}

func runSync(ctx context.Context, cfg SyncConfig) (SyncResult, error) {
	logs := make([]string, 0, 64)
	profile, profileErr := resolveGameProfile(cfg.GameID)
	if profileErr != nil {
		return SyncResult{}, profileErr
	}
	cfg.GameID = profile.ID
	appendSyncLog(&logs, "sync start for game=%s", cfg.GameID)

	cfg.SpreadsheetID = extractSpreadsheetID(cfg.SpreadsheetID)
	if strings.TrimSpace(cfg.SpreadsheetID) == "" {
		cfg.SpreadsheetID = profile.DefaultSpreadsheetID
	}
	cfg.SpreadsheetID = extractSpreadsheetID(cfg.SpreadsheetID)
	if strings.TrimSpace(cfg.SpreadsheetID) == "" {
		envKey := spreadsheetEnvKeyForGame(cfg.GameID)
		if envKey != "" {
			return SyncResult{}, fmt.Errorf("spreadsheet-id is required (set --spreadsheet-id or %s in .env)", envKey)
		}
		return SyncResult{}, errors.New("spreadsheet-id is required")
	}
	if cfg.ClientTimeout <= 0 {
		cfg.ClientTimeout = 20 * time.Second
	}
	if strings.TrimSpace(cfg.OutputPath) == "" {
		cfg.OutputPath = profile.DefaultOutputPath
	}
	cfg.OutputPath = resolveOutputPath(cfg.OutputPath)
	if strings.TrimSpace(cfg.BasePatchesPath) == "" {
		cfg.BasePatchesPath = "src/data/patches.js"
	}
	cfg.BasePatchesPath = resolveFilePath(cfg.BasePatchesPath)
	changeLogPath := resolveOutputPath(defaultChangeLogPath)
	appendSyncLog(&logs, "spreadsheet=%s", cfg.SpreadsheetID)
	client := &http.Client{Timeout: cfg.ClientTimeout}

	var endfieldDataPulls map[string]map[string]float64
	var wuwaDataPulls map[string]map[string]float64
	var zzzDataPulls map[string]map[string]float64
	var hsrDataPulls map[string]map[string]float64
	var genshinSummaryPulls map[string]float64
	var dataSheetTagsByPatch map[string][]string
	if cfg.GameID == gameIDEndfield || cfg.GameID == gameIDWuwa || cfg.GameID == gameIDZzz || cfg.GameID == gameIDHsr {
		appendSyncLog(&logs, "fetch Data sheet")
		dataCSV, dataErr := fetchSheetCSV(ctx, client, cfg.SpreadsheetID, "Data")
		if dataErr != nil {
			return SyncResult{}, fmt.Errorf("fetch Data sheet for %s: %w", cfg.GameID, dataErr)
		}
		parsedTags, tagsErr := parseDataSheetPatchTags(dataCSV)
		if tagsErr == nil {
			dataSheetTagsByPatch = parsedTags
		}
		switch cfg.GameID {
		case gameIDEndfield:
			parsedPulls, parseDataErr := parseEndfieldDataSheet(dataCSV)
			if parseDataErr != nil {
				return SyncResult{}, fmt.Errorf("parse Data sheet for %s: %w", cfg.GameID, parseDataErr)
			}
			endfieldDataPulls = parsedPulls
		case gameIDWuwa:
			parsedPulls, parseDataErr := parseWuwaDataSheet(dataCSV)
			if parseDataErr != nil {
				return SyncResult{}, fmt.Errorf("parse Data sheet for %s: %w", cfg.GameID, parseDataErr)
			}
			wuwaDataPulls = parsedPulls
		case gameIDZzz:
			parsedPulls, parseDataErr := parseZzzDataSheet(dataCSV)
			if parseDataErr != nil {
				return SyncResult{}, fmt.Errorf("parse Data sheet for %s: %w", cfg.GameID, parseDataErr)
			}
			zzzDataPulls = parsedPulls
		case gameIDHsr:
			parsedPulls, parseDataErr := parseHsrDataSheet(dataCSV)
			if parseDataErr != nil {
				return SyncResult{}, fmt.Errorf("parse Data sheet for %s: %w", cfg.GameID, parseDataErr)
			}
			hsrDataPulls = parsedPulls
		}
	}
	existingGenerated, err := readGeneratedPatches(cfg.OutputPath)
	if err != nil {
		return SyncResult{}, fmt.Errorf("read existing generated patches: %w", err)
	}
	appendSyncLog(&logs, "loaded %d existing generated patches", len(existingGenerated))
	existingGeneratedByID := map[string]Patch{}
	for _, patch := range existingGenerated {
		patchID := patchIDOrFallback(patch)
		if patchID != "" {
			existingGeneratedByID[patchID] = patch
		}
	}
	basePatchIDs := map[string]struct{}{}
	if cfg.SkipExisting {
		readIDs, readErr := readPatchIDsFromFile(cfg.BasePatchesPath)
		if readErr != nil {
			return SyncResult{}, fmt.Errorf("read base patches file: %w", readErr)
		}
		for patchID := range readIDs {
			basePatchIDs[patchID] = struct{}{}
		}
		appendSyncLog(&logs, "loaded %d base patch ids for skip-existing", len(basePatchIDs))
	}

	parser := profile.ParseSheet

	sheetNames := uniqueSheetNames(cfg.SheetNames)
	explicitSheetNames := len(sheetNames) > 0
	if len(sheetNames) == 0 {
		sheetNames, err = discoverSheetNames(ctx, client, cfg.SpreadsheetID, parser)
		if err != nil {
			return SyncResult{}, err
		}
	}
	if len(sheetNames) == 0 {
		return SyncResult{}, errors.New("no sheet names to parse")
	}
	sortVersionStrings(sheetNames)
	appendSyncLog(&logs, "sheet names discovered: %d", len(sheetNames))

	if cfg.GameID == gameIDGenshin {
		summaryCSV, summaryErr := fetchSheetCSV(ctx, client, cfg.SpreadsheetID, "Summary")
		if summaryErr != nil {
			summaryCSV, summaryErr = fetchSheetCSV(ctx, client, cfg.SpreadsheetID, "summary")
		}
		if summaryErr != nil {
			return SyncResult{}, fmt.Errorf("fetch Summary sheet for %s: %w", cfg.GameID, summaryErr)
		}
		parsedSummaryPulls, parseSummaryErr := parseGenshinSummaryPullTotals(summaryCSV, sheetNames)
		if parseSummaryErr != nil {
			return SyncResult{}, fmt.Errorf("parse Summary sheet for %s: %w", cfg.GameID, parseSummaryErr)
		}
		genshinSummaryPulls = parsedSummaryPulls
	}

	patches := make([]Patch, 0, len(sheetNames))
	parsedSheetNames := make([]string, 0, len(sheetNames))
	skippedPatches := make([]string, 0, len(sheetNames))
	changeEntries := make([]patchChangeLogEntry, 0, len(sheetNames))
	validPatchRows := 0
	for _, sheetName := range sheetNames {
		csvText, fetchErr := fetchSheetCSV(ctx, client, cfg.SpreadsheetID, sheetName)
		if fetchErr != nil {
			if explicitSheetNames {
				return SyncResult{}, fmt.Errorf("fetch sheet %s: %w", sheetName, fetchErr)
			}
			continue
		}
		patch, parseErr := parser(sheetName, csvText)
		if parseErr != nil {
			if explicitSheetNames {
				return SyncResult{}, fmt.Errorf("parse sheet %s: %w", sheetName, parseErr)
			}
			continue
		}
		switch cfg.GameID {
		case gameIDEndfield:
			if applyErr := applyEndfieldDataPullOverrides(&patch, endfieldDataPulls); applyErr != nil {
				if explicitSheetNames {
					return SyncResult{}, fmt.Errorf("apply Data overrides for sheet %s: %w", sheetName, applyErr)
				}
				continue
			}
		case gameIDWuwa:
			if applyErr := applyWuwaDataPullOverrides(&patch, wuwaDataPulls); applyErr != nil {
				if explicitSheetNames {
					return SyncResult{}, fmt.Errorf("apply Data overrides for sheet %s: %w", sheetName, applyErr)
				}
				continue
			}
		case gameIDZzz:
			if applyErr := applyZzzDataPullOverrides(&patch, zzzDataPulls); applyErr != nil {
				if explicitSheetNames {
					return SyncResult{}, fmt.Errorf("apply Data overrides for sheet %s: %w", sheetName, applyErr)
				}
				continue
			}
		case gameIDHsr:
			if applyErr := applyHsrDataPullOverrides(&patch, hsrDataPulls); applyErr != nil {
				if explicitSheetNames {
					return SyncResult{}, fmt.Errorf("apply Data overrides for sheet %s: %w", sheetName, applyErr)
				}
				continue
			}
		case gameIDGenshin:
			if applyErr := applyGenshinSummaryPullOverrides(&patch, genshinSummaryPulls); applyErr != nil {
				if explicitSheetNames {
					return SyncResult{}, fmt.Errorf("apply Summary overrides for sheet %s: %w", sheetName, applyErr)
				}
				continue
			}
		}
		validPatchRows++
		patchID := patchIDOrFallback(patch)
		if len(dataSheetTagsByPatch) > 0 {
			if dataTags, ok := dataSheetTagsByPatch[patchID]; ok {
				patch.Tags = mergeTagLists(patch.Tags, dataTags)
			}
		}
		previousPatch, hadPrevious := existingGeneratedByID[patchID]
		if cfg.SkipExisting {
			if hadPrevious {
				if patchesEquivalent(previousPatch, patch) {
					if patchID != "" {
						skippedPatches = append(skippedPatches, patchID)
						appendSyncLog(&logs, "skip unchanged patch %s", patchID)
					}
					continue
				}
			}
			if _, inBaseOnly := basePatchIDs[patchID]; inBaseOnly {
				delete(basePatchIDs, patchID)
			}
		}
		changeType := "added"
		changedSources := []string{}
		if hadPrevious {
			changeType = "updated"
			changedSources = changedSourceIDs(previousPatch, patch)
		}
		changeEntries = append(changeEntries, patchChangeLogEntry{
			Patch:          patchID,
			ChangeType:     changeType,
			ChangedSources: changedSources,
		})
		appendSyncLog(&logs, "queue %s patch %s", changeType, patchID)
		patches = append(patches, patch)
		parsedSheetNames = append(parsedSheetNames, sheetName)
		if patchID != "" {
			existingGeneratedByID[patchID] = patch
		}
	}
	if validPatchRows == 0 && len(patches) == 0 && len(skippedPatches) == 0 {
		return SyncResult{}, errors.New("no valid patch sheets found with N.N names")
	}
	sortPatches(patches)
	skippedPatches = uniqueStrings(skippedPatches)
	appendSyncLog(&logs, "parsed=%d changed=%d skipped=%d", validPatchRows, len(patches), len(skippedPatches))

	branchName := ""
	if cfg.CreateBranch {
		createdBranch, branchErr := createBranch(cfg.BranchPrefix)
		if branchErr != nil {
			return SyncResult{}, branchErr
		}
		branchName = createdBranch
		appendSyncLog(&logs, "created branch %s", branchName)
	}

	allPatches := mergePatchesByID(existingGenerated, patches)
	generatedAt := time.Now().UTC().Format(time.RFC3339)
	if !cfg.DryRun && len(patches) > 0 {
		meta := GeneratedMeta{
			GameID:        cfg.GameID,
			SpreadsheetID: cfg.SpreadsheetID,
			Sheets:        uniqueStrings(append(parsedSheetNames, skippedPatches...)),
			GeneratedAt:   generatedAt,
		}
		if writeErr := writeGeneratedFile(cfg.OutputPath, allPatches, meta); writeErr != nil {
			return SyncResult{}, writeErr
		}
		appendSyncLog(&logs, "written generated patches to %s", cfg.OutputPath)
	}

	if !cfg.DryRun && len(changeEntries) > 0 {
		record := syncChangeLogRecord{
			Timestamp:      time.Now().UTC().Format(time.RFC3339),
			GameID:         cfg.GameID,
			SpreadsheetID:  cfg.SpreadsheetID,
			OutputPath:     cfg.OutputPath,
			GeneratedAt:    generatedAt,
			UpdatedPatches: changeEntries,
		}
		if logErr := appendChangeLogRecord(changeLogPath, record); logErr != nil {
			appendSyncLog(&logs, "change log write failed: %v", logErr)
		} else {
			appendSyncLog(&logs, "change log updated: %s", changeLogPath)
		}
	}

	appendSyncLog(&logs, "sync completed: game=%s changed=%d skipped=%d dryRun=%t", cfg.GameID, len(patches), len(skippedPatches), cfg.DryRun)
	return SyncResult{
		GameID:         cfg.GameID,
		Patches:        patches,
		AllPatches:     allPatches,
		SkippedPatches: skippedPatches,
		SheetNames:     parsedSheetNames,
		OutputPath:     cfg.OutputPath,
		BranchName:     branchName,
		Logs:           logs,
		ChangeCount:    len(changeEntries),
		ChangeLogPath:  changeLogPath,
		GeneratedAt:    generatedAt,
	}, nil
}

func parseAllowedOrigins(raw string) map[string]struct{} {
	values := uniqueStrings(strings.Split(raw, ","))
	allowed := make(map[string]struct{}, len(values))
	for _, value := range values {
		allowed[strings.TrimSpace(value)] = struct{}{}
	}
	return allowed
}

func isLoopbackOrigin(origin string) bool {
	if strings.EqualFold(strings.TrimSpace(origin), "null") {
		return true
	}
	parsed, err := url.Parse(strings.TrimSpace(origin))
	if err != nil {
		return false
	}
	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func isOriginAllowed(origin string, allowed map[string]struct{}) bool {
	if origin == "" {
		return true
	}
	if _, ok := allowed["*"]; ok {
		return true
	}
	if _, ok := allowed[origin]; ok {
		return true
	}
	if isLoopbackOrigin(origin) {
		return true
	}
	return false
}

func withCORS(w http.ResponseWriter, r *http.Request, allowed map[string]struct{}) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin != "" {
		if !isOriginAllowed(origin, allowed) {
			return false
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Patchsync-Token")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	return true
}

func isAuthorized(r *http.Request, authToken string) bool {
	if strings.TrimSpace(authToken) == "" {
		return true
	}
	requestToken := strings.TrimSpace(r.Header.Get("X-Patchsync-Token"))
	return subtle.ConstantTimeCompare([]byte(requestToken), []byte(authToken)) == 1
}

func parseSyncRequestBody(r *http.Request, target any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return nil
	}
	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return nil
}

func patchNamesFromPatches(patches []Patch) []string {
	patchNames := make([]string, 0, len(patches))
	for _, patch := range patches {
		patchNames = append(patchNames, patch.Patch)
	}
	return patchNames
}

func buildSyncResponseFromResult(result SyncResult) syncResponse {
	return syncResponse{
		OK:            true,
		Message:       "sync completed",
		GameID:        result.GameID,
		Sheets:        result.SheetNames,
		Patches:       patchNamesFromPatches(result.Patches),
		Skipped:       result.SkippedPatches,
		OutputPath:    result.OutputPath,
		Branch:        result.BranchName,
		Logs:          result.Logs,
		ChangeCount:   result.ChangeCount,
		ChangeLogPath: result.ChangeLogPath,
		GeneratedAt:   result.GeneratedAt,
	}
}

func runSyncAll(ctx context.Context, baseCfg SyncConfig) ([]syncGameResult, bool) {
	results := make([]syncGameResult, 0, len(availableGameIDs()))
	allOK := true
	for _, gameID := range availableGameIDs() {
		cfg := baseCfg
		cfg.GameID = gameID
		cfg.SpreadsheetID = ""
		cfg.SheetNames = nil
		cfg.OutputPath = ""
		cfg.CreateBranch = false
		cfg.BranchPrefix = ""

		result, err := runSync(ctx, cfg)
		if err != nil {
			allOK = false
			results = append(results, syncGameResult{
				GameID: gameID,
				Error:  err.Error(),
			})
			continue
		}

		results = append(results, syncGameResult{
			GameID:        result.GameID,
			Sheets:        result.SheetNames,
			Patches:       patchNamesFromPatches(result.Patches),
			Skipped:       result.SkippedPatches,
			OutputPath:    result.OutputPath,
			Logs:          result.Logs,
			ChangeCount:   result.ChangeCount,
			ChangeLogPath: result.ChangeLogPath,
			GeneratedAt:   result.GeneratedAt,
		})
	}
	return results, allOK
}

func writeJSON(w http.ResponseWriter, statusCode int, payload syncResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func loadDotEnv() {
	cwd, err := os.Getwd()
	if err != nil {
		return
	}

	for {
		envPath := filepath.Join(cwd, ".env")
		if info, statErr := os.Stat(envPath); statErr == nil && !info.IsDir() {
			raw, readErr := os.ReadFile(envPath)
			if readErr != nil {
				return
			}
			for _, rawLine := range strings.Split(string(raw), "\n") {
				line := strings.TrimSpace(strings.TrimPrefix(rawLine, "\uFEFF"))
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				if strings.HasPrefix(line, "export ") {
					line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) != 2 {
					continue
				}
				key := strings.TrimSpace(parts[0])
				if key == "" {
					continue
				}
				value := strings.TrimSpace(parts[1])
				if len(value) >= 2 {
					if (strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"")) ||
						(strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'")) {
						value = value[1 : len(value)-1]
					}
				}
				if _, exists := os.LookupEnv(key); exists {
					continue
				}
				_ = os.Setenv(key, value)
			}
			return
		}

		parent := filepath.Dir(cwd)
		if parent == cwd {
			return
		}
		cwd = parent
	}
}
func main() {
	loadDotEnv()
	var (
		serveMode         bool
		gameID            string
		bindAddr          string
		allowedOriginsRaw string
		authToken         string
		spreadsheetID     string
		sheetNamesRaw     string
		outputPath        string
		createBranch      bool
		branchPrefix      string
		skipExisting      bool
		dryRun            bool
		clientTimeout     time.Duration
	)

	flag.BoolVar(&serveMode, "serve", false, "Run as local HTTP service for the UI button")
	flag.StringVar(&gameID, "game", defaultGameID, fmt.Sprintf("Game id (%s)", strings.Join(availableGameIDs(), ", ")))
	flag.StringVar(&bindAddr, "addr", defaultBindAddr, "HTTP bind address in serve mode")
	flag.StringVar(&allowedOriginsRaw, "allowed-origins", "http://127.0.0.1:5173,http://localhost:5173", "Comma-separated allowed CORS origins in serve mode")
	flag.StringVar(&authToken, "auth-token", os.Getenv("PATCHSYNC_TOKEN"), "Optional auth token required in X-Patchsync-Token header for /sync")
	flag.StringVar(&spreadsheetID, "spreadsheet-id", "", "Google Spreadsheet ID or full spreadsheet URL")
	flag.StringVar(&sheetNamesRaw, "sheet-names", "", "Comma-separated sheet names (optional, if empty auto-detects N.N sheet names)")
	flag.StringVar(&outputPath, "output", "", "Output JS file path (optional; defaults by game)")
	flag.BoolVar(&createBranch, "create-branch", false, "Create a git branch before writing generated file")
	flag.StringVar(&branchPrefix, "branch-prefix", "data/sheets", "Git branch prefix for create-branch")
	flag.BoolVar(&skipExisting, "skip-existing", true, "Skip patches already present in src/data/patches.js and generated output")
	flag.BoolVar(&dryRun, "dry-run", false, "Parse and validate only, do not write file")
	flag.DurationVar(&clientTimeout, "timeout", 20*time.Second, "HTTP client timeout")
	flag.Parse()

	defaultCfg := SyncConfig{
		GameID:          gameID,
		SpreadsheetID:   spreadsheetID,
		SheetNames:      uniqueSheetNames(strings.Split(sheetNamesRaw, ",")),
		OutputPath:      outputPath,
		BasePatchesPath: "src/data/patches.js",
		CreateBranch:    createBranch,
		BranchPrefix:    branchPrefix,
		SkipExisting:    skipExisting,
		DryRun:          dryRun,
		ClientTimeout:   clientTimeout,
	}
	allowedOrigins := parseAllowedOrigins(allowedOriginsRaw)

	if serveMode {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			if !withCORS(w, r, allowedOrigins) {
				writeJSON(w, http.StatusForbidden, syncResponse{
					OK:      false,
					Message: "origin is not allowed",
				})
				return
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			writeJSON(w, http.StatusOK, syncResponse{
				OK:      true,
				Message: "patchsync service is running",
			})
		})
		mux.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
			if !withCORS(w, r, allowedOrigins) {
				writeJSON(w, http.StatusForbidden, syncResponse{
					OK:      false,
					Message: "origin is not allowed",
				})
				return
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			if r.Method != http.MethodPost {
				writeJSON(w, http.StatusMethodNotAllowed, syncResponse{
					OK:      false,
					Message: "method not allowed",
				})
				return
			}
			if !isAuthorized(r, authToken) {
				writeJSON(w, http.StatusUnauthorized, syncResponse{
					OK:      false,
					Message: "unauthorized",
				})
				return
			}
			var req syncRequest
			if err := parseSyncRequestBody(r, &req); err != nil {
				writeJSON(w, http.StatusBadRequest, syncResponse{
					OK:      false,
					Message: "invalid JSON body",
				})
				return
			}

			cfg := defaultCfg
			if strings.TrimSpace(req.GameID) != "" {
				cfg.GameID = strings.TrimSpace(req.GameID)
			}
			if strings.TrimSpace(req.SpreadsheetID) != "" {
				cfg.SpreadsheetID = strings.TrimSpace(req.SpreadsheetID)
			}
			if strings.TrimSpace(req.BranchPrefix) != "" {
				cfg.BranchPrefix = strings.TrimSpace(req.BranchPrefix)
			}
			cfg.SheetNames = nil
			cfg.CreateBranch = req.CreateBranch
			cfg.DryRun = req.DryRun

			result, err := runSync(r.Context(), cfg)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, syncResponse{
					OK:      false,
					Message: err.Error(),
				})
				return
			}
			writeJSON(w, http.StatusOK, buildSyncResponseFromResult(result))
		})
		mux.HandleFunc("/sync-all", func(w http.ResponseWriter, r *http.Request) {
			if !withCORS(w, r, allowedOrigins) {
				writeJSON(w, http.StatusForbidden, syncResponse{
					OK:      false,
					Message: "origin is not allowed",
				})
				return
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			if r.Method != http.MethodPost {
				writeJSON(w, http.StatusMethodNotAllowed, syncResponse{
					OK:      false,
					Message: "method not allowed",
				})
				return
			}
			if !isAuthorized(r, authToken) {
				writeJSON(w, http.StatusUnauthorized, syncResponse{
					OK:      false,
					Message: "unauthorized",
				})
				return
			}

			var req syncAllRequest
			if err := parseSyncRequestBody(r, &req); err != nil {
				writeJSON(w, http.StatusBadRequest, syncResponse{
					OK:      false,
					Message: "invalid JSON body",
				})
				return
			}

			cfg := defaultCfg
			cfg.SheetNames = nil
			cfg.CreateBranch = false
			cfg.BranchPrefix = ""
			cfg.DryRun = req.DryRun

			results, allOK := runSyncAll(r.Context(), cfg)
			message := "sync completed for all games"
			if !allOK {
				message = "sync completed with errors"
			}
			writeJSON(w, http.StatusOK, syncResponse{
				OK:      allOK,
				Message: message,
				Results: results,
			})
		})

		fmt.Printf("patchsync service listening on http://%s\n", bindAddr)
		if strings.TrimSpace(authToken) == "" {
			fmt.Println("warning: auth token is empty; set --auth-token or PATCHSYNC_TOKEN for stricter access control")
		}
		if err := http.ListenAndServe(bindAddr, mux); err != nil {
			fmt.Fprintf(os.Stderr, "server failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	result, err := runSync(context.Background(), defaultCfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "sync failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Game: %s\n", result.GameID)
	patchNames := make([]string, 0, len(result.Patches))
	for _, patch := range result.Patches {
		patchNames = append(patchNames, patch.Patch)
	}
	if len(patchNames) == 0 {
		fmt.Println("Synced patches: none (all discovered patches are already present)")
	} else {
		fmt.Printf("Synced patches: %s\n", strings.Join(patchNames, ", "))
	}
	if len(result.SkippedPatches) > 0 {
		fmt.Printf("Skipped patches: %s\n", strings.Join(result.SkippedPatches, ", "))
	}
	fmt.Printf("Output: %s\n", result.OutputPath)
	if result.BranchName != "" {
		fmt.Printf("Branch: %s\n", result.BranchName)
	}
}
