package api

import "testing"

func TestAppConfigValidators(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	cases := []struct {
		key, value string
		ok         bool
	}{
		{"map_style_url", "https://maps.example.com/styles/osm-bright/style.json", true},
		{"map_style_url", "http://maps.example.com/style.json", false}, // plain http in production
		{"map_style_url", "https://user:pw@maps.example.com/style.json", false},
		{"map_style_url", "javascript:alert(1)", false},
		{"map_tile_url", "https://maps.example.com/styles/osm-bright/{z}/{x}/{y}.png", true},
		{"map_tile_url", "https://maps.example.com/tiles.png", false}, // no placeholders
		{"map_style_url", "/tiles/styles/osm-bright/style.json", true}, // same-domain tileserver
		{"map_style_url", "//evil.example.com/style.json", false},
		{"map_tile_url", "/tiles/styles/osm-bright/{z}/{x}/{y}.png", true},
		{"map_attribution", "© OpenStreetMap contributors", true},
	}
	for _, tc := range cases {
		if got := appConfigKeys[tc.key](tc.value); got != tc.ok {
			t.Errorf("%s=%q: got %v, want %v", tc.key, tc.value, got, tc.ok)
		}
	}
}
