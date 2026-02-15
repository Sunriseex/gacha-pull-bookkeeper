package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
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
	"time"
)

const (
	defaultOutputPath = "src/data/patches.generated.js"
	defaultBindAddr   = "127.0.0.1:8787"
)

var versionSheetPattern = regexp.MustCompile(`^\d+\.\d+$`)
var spreadsheetIDFromURLPattern = regexp.MustCompile(`/spreadsheets/d/([a-zA-Z0-9-_]+)`)

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

type Scaler struct {
	Type      string  `json:"type"`
	Unit      string  `json:"unit"`
	EveryDays int     `json:"everyDays"`
	Rounding  string  `json:"rounding"`
	Rewards   Rewards `json:"rewards"`
}

type Source struct {
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Gate         string   `json:"gate"`
	OptionKey    *string  `json:"optionKey"`
	CountInPulls bool     `json:"countInPulls"`
	Rewards      Rewards  `json:"rewards"`
	Costs        Rewards  `json:"costs"`
	Scalers      []Scaler `json:"scalers"`
}

type Patch struct {
	ID           string   `json:"id"`
	Patch        string   `json:"patch"`
	VersionName  string   `json:"versionName"`
	StartDate    string   `json:"startDate"`
	DurationDays int      `json:"durationDays"`
	Notes        string   `json:"notes"`
	Sources      []Source `json:"sources"`
}

type GeneratedMeta struct {
	SpreadsheetID string   `json:"spreadsheetId"`
	Sheets        []string `json:"sheets"`
	GeneratedAt   string   `json:"generatedAt"`
}

type SyncConfig struct {
	SpreadsheetID string
	SheetNames    []string
	OutputPath    string
	CreateBranch  bool
	BranchPrefix  string
	DryRun        bool
	ClientTimeout time.Duration
}

type SyncResult struct {
	Patches    []Patch
	SheetNames []string
	OutputPath string
	BranchName string
}

type sheetRow struct {
	Name    string
	Rewards Rewards
	HasData bool
}

type syncRequest struct {
	SpreadsheetID string   `json:"spreadsheetId"`
	SheetNames    []string `json:"sheetNames"`
	OutputPath    string   `json:"outputPath"`
	CreateBranch  bool     `json:"createBranch"`
	BranchPrefix  string   `json:"branchPrefix"`
	DryRun        bool     `json:"dryRun"`
}

type syncResponse struct {
	OK         bool     `json:"ok"`
	Message    string   `json:"message"`
	Sheets     []string `json:"sheets,omitempty"`
	Patches    []string `json:"patches,omitempty"`
	OutputPath string   `json:"outputPath,omitempty"`
	Branch     string   `json:"branch,omitempty"`
}

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
		Rewards:      rewards,
		Costs:        zeroRewards(),
		Scalers:      []Scaler{},
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
	cleaned = strings.ReplaceAll(cleaned, ",", "")
	cleaned = strings.TrimSuffix(cleaned, "%")
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
		if strings.Contains(norm, "version length") {
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
	idxDuration := findHeaderIndex(headers, []string{"version length"}, -1)

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
			bp2CoreRewards = row.Rewards
		case "protocol customized pass":
			bp3CoreRewards = row.Rewards
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
		source("bpCrateM", "Exchange Crate-o-Surprise [M]", "bp2", ptr("includeBpCrates"), true, bpCrateMRewards),
		source("bpCrateL", "Exchange Crate-o-Surprise [L]", "bp3", ptr("includeBpCrates"), true, bpCrateLRewards),
	}

	versionName, startDate := parsePatchHeaderMeta(getCell(headers, 0))
	patch := Patch{
		ID:           sheetName,
		Patch:        sheetName,
		VersionName:  versionName,
		StartDate:    startDate,
		DurationDays: durationDays,
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
		url.QueryEscape(strings.TrimSpace(sheetName)),
	)
}

func fetchSheetCSV(ctx context.Context, client *http.Client, spreadsheetID, sheetName string) (string, error) {
	body, err := fetchText(ctx, client, sheetCSVURL(spreadsheetID, sheetName))
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

func discoverSheetNames(ctx context.Context, client *http.Client, spreadsheetID string) ([]string, error) {
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
				name := strings.TrimSpace(entry.Title.Text)
				if versionSheetPattern.MatchString(name) {
					names = append(names, name)
				}
			}
			if len(names) > 0 {
				return uniqueStrings(names), nil
			}
		}
	}

	// Fallback for "1.0 / 1.1 / 1.2 ..." naming.
	names := make([]string, 0)
	majorCandidates := []int{1, 0, 2, 3, 4, 5}
	for _, major := range majorCandidates {
		foundInMajor := false
		for minor := 0; minor <= 30; minor++ {
			candidate := fmt.Sprintf("%d.%d", major, minor)
			probeCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
			_, fetchErr := fetchSheetCSV(probeCtx, client, spreadsheetID, candidate)
			cancel()
			if fetchErr != nil {
				if !foundInMajor && minor == 0 {
					break
				}
				if foundInMajor {
					break
				}
				continue
			}
			foundInMajor = true
			names = append(names, candidate)
		}
	}
	if len(names) == 0 {
		return nil, errors.New("failed to discover version sheets automatically; pass sheet names explicitly")
	}
	return uniqueStrings(names), nil
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
	if strings.Contains(value, "/spreadsheets/d/") {
		matches := spreadsheetIDFromURLPattern.FindStringSubmatch(value)
		if len(matches) >= 2 {
			return matches[1]
		}
	}
	return value
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
	parts := strings.Split(strings.TrimSpace(value), ".")
	if len(parts) != 2 {
		return 0, 0, false
	}
	major, errMajor := strconv.Atoi(parts[0])
	minor, errMinor := strconv.Atoi(parts[1])
	if errMajor != nil || errMinor != nil {
		return 0, 0, false
	}
	return major, minor, true
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

func writeGeneratedFile(path string, patches []Patch, meta GeneratedMeta) error {
	if path == "" {
		path = defaultOutputPath
	}
	patchesJSON, err := json.MarshalIndent(patches, "", "  ")
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
	cfg.SpreadsheetID = extractSpreadsheetID(cfg.SpreadsheetID)
	if strings.TrimSpace(cfg.SpreadsheetID) == "" {
		return SyncResult{}, errors.New("spreadsheet-id is required")
	}
	if cfg.ClientTimeout <= 0 {
		cfg.ClientTimeout = 20 * time.Second
	}
	client := &http.Client{Timeout: cfg.ClientTimeout}

	sheetNames := uniqueStrings(cfg.SheetNames)
	explicitSheetNames := len(sheetNames) > 0
	var err error
	if len(sheetNames) == 0 {
		sheetNames, err = discoverSheetNames(ctx, client, cfg.SpreadsheetID)
		if err != nil {
			return SyncResult{}, err
		}
	}
	if len(sheetNames) == 0 {
		return SyncResult{}, errors.New("no sheet names to parse")
	}

	patches := make([]Patch, 0, len(sheetNames))
	parsedSheetNames := make([]string, 0, len(sheetNames))
	for _, sheetName := range sheetNames {
		csvText, fetchErr := fetchSheetCSV(ctx, client, cfg.SpreadsheetID, sheetName)
		if fetchErr != nil {
			if explicitSheetNames {
				return SyncResult{}, fmt.Errorf("fetch sheet %s: %w", sheetName, fetchErr)
			}
			continue
		}
		patch, parseErr := parseSheetToPatch(sheetName, csvText)
		if parseErr != nil {
			if explicitSheetNames {
				return SyncResult{}, fmt.Errorf("parse sheet %s: %w", sheetName, parseErr)
			}
			continue
		}
		patches = append(patches, patch)
		parsedSheetNames = append(parsedSheetNames, sheetName)
	}
	if len(patches) == 0 {
		return SyncResult{}, errors.New("no valid patch sheets found; provide sheet names explicitly")
	}
	sortPatches(patches)

	branchName := ""
	if cfg.CreateBranch {
		createdBranch, branchErr := createBranch(cfg.BranchPrefix)
		if branchErr != nil {
			return SyncResult{}, branchErr
		}
		branchName = createdBranch
	}

	if !cfg.DryRun {
		outputPath := cfg.OutputPath
		if outputPath == "" {
			outputPath = defaultOutputPath
		}
		meta := GeneratedMeta{
			SpreadsheetID: cfg.SpreadsheetID,
			Sheets:        parsedSheetNames,
			GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		}
		if writeErr := writeGeneratedFile(outputPath, patches, meta); writeErr != nil {
			return SyncResult{}, writeErr
		}
	}

	return SyncResult{
		Patches:    patches,
		SheetNames: parsedSheetNames,
		OutputPath: cfg.OutputPath,
		BranchName: branchName,
	}, nil
}

func withCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
}

func main() {
	var (
		serveMode     bool
		bindAddr      string
		spreadsheetID string
		sheetNamesRaw string
		outputPath    string
		createBranch  bool
		branchPrefix  string
		dryRun        bool
		clientTimeout time.Duration
	)

	flag.BoolVar(&serveMode, "serve", false, "Run as local HTTP service for the UI button")
	flag.StringVar(&bindAddr, "addr", defaultBindAddr, "HTTP bind address in serve mode")
	flag.StringVar(&spreadsheetID, "spreadsheet-id", "", "Google Spreadsheet ID or full spreadsheet URL")
	flag.StringVar(&sheetNamesRaw, "sheet-names", "", "Comma-separated sheet names (optional)")
	flag.StringVar(&outputPath, "output", defaultOutputPath, "Output JS file path")
	flag.BoolVar(&createBranch, "create-branch", false, "Create a git branch before writing generated file")
	flag.StringVar(&branchPrefix, "branch-prefix", "data/sheets", "Git branch prefix for create-branch")
	flag.BoolVar(&dryRun, "dry-run", false, "Parse and validate only, do not write file")
	flag.DurationVar(&clientTimeout, "timeout", 20*time.Second, "HTTP client timeout")
	flag.Parse()

	defaultCfg := SyncConfig{
		SpreadsheetID: spreadsheetID,
		SheetNames:    uniqueStrings(strings.Split(sheetNamesRaw, ",")),
		OutputPath:    outputPath,
		CreateBranch:  createBranch,
		BranchPrefix:  branchPrefix,
		DryRun:        dryRun,
		ClientTimeout: clientTimeout,
	}

	if serveMode {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			withCORS(w)
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(syncResponse{
				OK:      true,
				Message: "patchsync service is running",
			})
		})
		mux.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
			withCORS(w)
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			var req syncRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(syncResponse{
					OK:      false,
					Message: "invalid JSON body",
				})
				return
			}

			cfg := defaultCfg
			if strings.TrimSpace(req.SpreadsheetID) != "" {
				cfg.SpreadsheetID = strings.TrimSpace(req.SpreadsheetID)
			}
			if len(req.SheetNames) > 0 {
				cfg.SheetNames = uniqueStrings(req.SheetNames)
			}
			if strings.TrimSpace(req.OutputPath) != "" {
				cfg.OutputPath = req.OutputPath
			}
			if strings.TrimSpace(req.BranchPrefix) != "" {
				cfg.BranchPrefix = req.BranchPrefix
			}
			cfg.CreateBranch = req.CreateBranch
			cfg.DryRun = req.DryRun

			result, err := runSync(r.Context(), cfg)
			w.Header().Set("Content-Type", "application/json")
			if err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(syncResponse{
					OK:      false,
					Message: err.Error(),
				})
				return
			}
			patchNames := make([]string, 0, len(result.Patches))
			for _, patch := range result.Patches {
				patchNames = append(patchNames, patch.Patch)
			}
			_ = json.NewEncoder(w).Encode(syncResponse{
				OK:         true,
				Message:    "sync completed",
				Sheets:     result.SheetNames,
				Patches:    patchNames,
				OutputPath: cfg.OutputPath,
				Branch:     result.BranchName,
			})
		})

		fmt.Printf("patchsync service listening on http://%s\n", bindAddr)
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
	patchNames := make([]string, 0, len(result.Patches))
	for _, patch := range result.Patches {
		patchNames = append(patchNames, patch.Patch)
	}
	fmt.Printf("Synced patches: %s\n", strings.Join(patchNames, ", "))
	fmt.Printf("Output: %s\n", defaultCfg.OutputPath)
	if result.BranchName != "" {
		fmt.Printf("Branch: %s\n", result.BranchName)
	}
}
