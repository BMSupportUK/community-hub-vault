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

// flagcdn.com supports ISO codes (lowercase) AND the UK home nations via
// "gb-eng", "gb-sct", "gb-wls", "gb-nir". This is the standard way to render
// reliable flags in a browser without depending on emoji fonts.
export function teamFlagUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const iso = TEAM_TO_ISO[name.trim()];
  if (!iso) return null;
  return `https://flagcdn.com/w40/${iso.toLowerCase()}.png`;
}

export function teamFlagSrcSet(name: string | null | undefined): string | null {
  if (!name) return null;
  const iso = TEAM_TO_ISO[name.trim()];
  if (!iso) return null;
  const slug = iso.toLowerCase();
  return `https://flagcdn.com/w40/${slug}.png 1x, https://flagcdn.com/w80/${slug}.png 2x`;
}

import { createElement, type ReactElement } from "react";

export function teamFlag(
  name: string | null | undefined,
  className = "inline-block h-3.5 w-5 rounded-[2px] object-cover align-[-2px] shadow-sm",
): ReactElement | null {
  const src = teamFlagUrl(name);
  if (!src) return null;
  return createElement("img", {
    src,
    srcSet: teamFlagSrcSet(name) ?? undefined,
    alt: `${name} flag`,
    loading: "lazy",
    decoding: "async",
    className,
  });
}
