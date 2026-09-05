package main

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var sheetNumberPattern = regexp.MustCompile(`^[+-]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?$`)

func parseSheetNumber(raw string) (float64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, nil
	}
	if !sheetNumberPattern.MatchString(value) {
		return 0, fmt.Errorf("invalid numeric cell %q", raw)
	}
	parsed, err := strconv.ParseFloat(strings.ReplaceAll(value, ",", ""), 64)
	if err != nil || math.IsInf(parsed, 0) || math.IsNaN(parsed) {
		return 0, fmt.Errorf("invalid numeric cell %q", raw)
	}
	return parsed, nil
}

// Existing reward readers collect values before deciding which rows are sources.
// Reject nonnumeric values in selected sources before exposing a parsed patch.
func validateParsedNumbers(patch *Patch, parseErr *error) {
	if *parseErr != nil {
		return
	}
	for _, src := range patch.Sources {
		if _, err := json.Marshal(src); err != nil {
			*parseErr = fmt.Errorf("patch %s source %s has an invalid numeric cell: %w", patch.Patch, src.ID, err)
			*patch = Patch{}
			return
		}
	}
}
