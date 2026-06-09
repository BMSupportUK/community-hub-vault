// Map World Cup 2026 team names → ISO 3166-1 alpha-2 codes, then build a flag emoji.
const TEAM_TO_ISO: Record<string, string> = {
  // Hosts
  "Canada": "CA",
  "Mexico": "MX",
  "United States": "US",
  "USA": "US",
  // UEFA
  "England": "GB-ENG",
  "Scotland": "GB-SCT",
  "Wales": "GB-WLS",
  "Northern Ireland": "GB-NIR",
  "Republic of Ireland": "IE",
  "Ireland": "IE",
  "France": "FR",
  "Germany": "DE",
  "Spain": "ES",
  "Portugal": "PT",
  "Italy": "IT",
  "Netherlands": "NL",
  "Belgium": "BE",
  "Switzerland": "CH",
  "Austria": "AT",
  "Croatia": "HR",
  "Denmark": "DK",
  "Sweden": "SE",
  "Norway": "NO",
  "Poland": "PL",
  "Czechia": "CZ",
  "Serbia": "RS",
  "Türkiye": "TR",
  "Turkey": "TR",
  "Ukraine": "UA",
  "Slovakia": "SK",
  "Slovenia": "SI",
  "Hungary": "HU",
  "Romania": "RO",
  "Greece": "GR",
  "Albania": "AL",
  "Bosnia and Herzegovina": "BA",
  "North Macedonia": "MK",
  "Kosovo": "XK",
  "Iceland": "IS",
  "Finland": "FI",
  // CONMEBOL
  "Argentina": "AR",
  "Brazil": "BR",
  "Uruguay": "UY",
  "Colombia": "CO",
  "Ecuador": "EC",
  "Paraguay": "PY",
  "Peru": "PE",
  "Chile": "CL",
  "Bolivia": "BO",
  "Venezuela": "VE",
  // CAF
  "Morocco": "MA",
  "Senegal": "SN",
  "Tunisia": "TN",
  "Egypt": "EG",
  "Algeria": "DZ",
  "Nigeria": "NG",
  "Ghana": "GH",
  "Cameroon": "CM",
  "Ivory Coast": "CI",
  "Côte d'Ivoire": "CI",
  "South Africa": "ZA",
  "Cape Verde": "CV",
  "Mali": "ML",
  "Burkina Faso": "BF",
  "DR Congo": "CD",
  "Democratic Republic of the Congo": "CD",
  // AFC
  "Japan": "JP",
  "South Korea": "KR",
  "Korea Republic": "KR",
  "Australia": "AU",
  "Iran": "IR",
  "IR Iran": "IR",
  "Saudi Arabia": "SA",
  "Qatar": "QA",
  "United Arab Emirates": "AE",
  "UAE": "AE",
  "Iraq": "IQ",
  "Uzbekistan": "UZ",
  "Jordan": "JO",
  // CONCACAF (non-host)
  "Costa Rica": "CR",
  "Panama": "PA",
  "Jamaica": "JM",
  "Honduras": "HN",
  "El Salvador": "SV",
  "Trinidad and Tobago": "TT",
  "Haiti": "HT",
  "Curaçao": "CW",
  // OFC
  "New Zealand": "NZ",
  "Fiji": "FJ",
};

// Sub-national flags (UK home nations etc.)
const SPECIAL_FLAGS: Record<string, string> = {
  "GB-ENG": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "GB-SCT": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "GB-WLS": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "GB-NIR": "🇬🇧",
  "XK": "🇽🇰",
};

function isoToFlag(iso: string): string {
  if (SPECIAL_FLAGS[iso]) return SPECIAL_FLAGS[iso];
  if (iso.length !== 2) return "";
  const A = 0x1f1e6;
  const codePoints = iso
    .toUpperCase()
    .split("")
    .map((c) => A + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

export function teamFlag(name: string | null | undefined): string {
  if (!name) return "";
  const iso = TEAM_TO_ISO[name.trim()];
  return iso ? isoToFlag(iso) : "";
}
