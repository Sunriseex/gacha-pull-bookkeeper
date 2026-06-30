package main

const (
	gameIDEndfield = "arknights-endfield"
	gameIDWuwa     = "wuthering-waves"
	gameIDZzz      = "zenless-zone-zero"
	gameIDGenshin  = "genshin-impact"
	gameIDHsr      = "honkai-star-rail"
	defaultGameID  = gameIDEndfield

	envSpreadsheetEndfield = "PATCHSYNC_SPREADSHEET_ENDFIELD"
	envSpreadsheetWuwa     = "PATCHSYNC_SPREADSHEET_WUWA"
	envSpreadsheetZzz      = "PATCHSYNC_SPREADSHEET_ZZZ"
	envSpreadsheetGenshin  = "PATCHSYNC_SPREADSHEET_GENSHIN"
	envSpreadsheetHsr      = "PATCHSYNC_SPREADSHEET_HSR"
)

type patchParser func(sheetName, csvText string) (Patch, error)

type gameProfile struct {
	ID                   string
	DefaultSpreadsheetID string
	DefaultOutputPath    string
	ParseSheet           patchParser
}

var profilesByGameID = map[string]gameProfile{
	gameIDEndfield: {
		ID:                   gameIDEndfield,
		DefaultSpreadsheetID: "",
		DefaultOutputPath:    "src/data/endfield.generated.js",
		ParseSheet:           parseSheetToPatch,
	},
	gameIDWuwa: {
		ID:                   gameIDWuwa,
		DefaultSpreadsheetID: "",
		DefaultOutputPath:    "src/data/wuwa.generated.js",
		ParseSheet:           parseSheetToPatchWuwa,
	},
	gameIDZzz: {
		ID:                   gameIDZzz,
		DefaultSpreadsheetID: "",
		DefaultOutputPath:    "src/data/zzz.generated.js",
		ParseSheet:           parseSheetToPatchZzz,
	},
	gameIDGenshin: {
		ID:                   gameIDGenshin,
		DefaultSpreadsheetID: "",
		DefaultOutputPath:    "src/data/genshin.generated.js",
		ParseSheet:           parseSheetToPatchGenshin,
	},
	gameIDHsr: {
		ID:                   gameIDHsr,
		DefaultSpreadsheetID: "",
		DefaultOutputPath:    "src/data/hsr.generated.js",
		ParseSheet:           parseSheetToPatchHsr,
	},
}

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
