export type SidebarAccent =
  | "amber"
  | "emerald"
  | "sky"
  | "cyan"
  | "teal"
  | "blue"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "pink"
  | "rose"
  | "red"
  | "orange"
  | "lime"
  | "slate";

type AccentShade = "50" | "100" | "300" | "400" | "500" | "600" | "700" | "800" | "950";
type AccentScale = Record<AccentShade, string>;

export type AccentTheme = {
  cssVars: Record<`--${string}`, string>;
};

const accentScales: Record<SidebarAccent, AccentScale> = {
  amber: {
    "50": "#fffbeb",
    "100": "#fef3c7",
    "300": "#fcd34d",
    "400": "#fbbf24",
    "500": "#f59e0b",
    "600": "#d97706",
    "700": "#b45309",
    "800": "#92400e",
    "950": "#451a03",
  },
  emerald: {
    "50": "#ecfdf5",
    "100": "#d1fae5",
    "300": "#6ee7b7",
    "400": "#34d399",
    "500": "#10b981",
    "600": "#059669",
    "700": "#047857",
    "800": "#065f46",
    "950": "#022c22",
  },
  sky: {
    "50": "#f0f9ff",
    "100": "#e0f2fe",
    "300": "#7dd3fc",
    "400": "#38bdf8",
    "500": "#0ea5e9",
    "600": "#0284c7",
    "700": "#0369a1",
    "800": "#075985",
    "950": "#082f49",
  },
  cyan: {
    "50": "#ecfeff",
    "100": "#cffafe",
    "300": "#67e8f9",
    "400": "#22d3ee",
    "500": "#06b6d4",
    "600": "#0891b2",
    "700": "#0e7490",
    "800": "#155e75",
    "950": "#083344",
  },
  teal: {
    "50": "#f0fdfa",
    "100": "#ccfbf1",
    "300": "#5eead4",
    "400": "#2dd4bf",
    "500": "#14b8a6",
    "600": "#0d9488",
    "700": "#0f766e",
    "800": "#115e59",
    "950": "#042f2e",
  },
  blue: {
    "50": "#eff6ff",
    "100": "#dbeafe",
    "300": "#93c5fd",
    "400": "#60a5fa",
    "500": "#3b82f6",
    "600": "#2563eb",
    "700": "#1d4ed8",
    "800": "#1e40af",
    "950": "#172554",
  },
  indigo: {
    "50": "#eef2ff",
    "100": "#e0e7ff",
    "300": "#a5b4fc",
    "400": "#818cf8",
    "500": "#6366f1",
    "600": "#4f46e5",
    "700": "#4338ca",
    "800": "#3730a3",
    "950": "#1e1b4b",
  },
  rose: {
    "50": "#fff1f2",
    "100": "#ffe4e6",
    "300": "#fda4af",
    "400": "#fb7185",
    "500": "#f43f5e",
    "600": "#e11d48",
    "700": "#be123c",
    "800": "#9f1239",
    "950": "#4c0519",
  },
  violet: {
    "50": "#f5f3ff",
    "100": "#ede9fe",
    "300": "#c4b5fd",
    "400": "#a78bfa",
    "500": "#8b5cf6",
    "600": "#7c3aed",
    "700": "#6d28d9",
    "800": "#5b21b6",
    "950": "#2e1065",
  },
  fuchsia: {
    "50": "#fdf4ff",
    "100": "#fae8ff",
    "300": "#f0abfc",
    "400": "#e879f9",
    "500": "#d946ef",
    "600": "#c026d3",
    "700": "#a21caf",
    "800": "#86198f",
    "950": "#4a044e",
  },
  pink: {
    "50": "#fdf2f8",
    "100": "#fce7f3",
    "300": "#f9a8d4",
    "400": "#f472b6",
    "500": "#ec4899",
    "600": "#db2777",
    "700": "#be185d",
    "800": "#9d174d",
    "950": "#500724",
  },
  red: {
    "50": "#fef2f2",
    "100": "#fee2e2",
    "300": "#fca5a5",
    "400": "#f87171",
    "500": "#ef4444",
    "600": "#dc2626",
    "700": "#b91c1c",
    "800": "#991b1b",
    "950": "#450a0a",
  },
  orange: {
    "50": "#fff7ed",
    "100": "#ffedd5",
    "300": "#fdba74",
    "400": "#fb923c",
    "500": "#f97316",
    "600": "#ea580c",
    "700": "#c2410c",
    "800": "#9a3412",
    "950": "#431407",
  },
  lime: {
    "50": "#f7fee7",
    "100": "#ecfccb",
    "300": "#bef264",
    "400": "#a3e635",
    "500": "#84cc16",
    "600": "#65a30d",
    "700": "#4d7c0f",
    "800": "#3f6212",
    "950": "#1a2e05",
  },
  slate: {
    "50": "#f8fafc",
    "100": "#f1f5f9",
    "300": "#cbd5e1",
    "400": "#94a3b8",
    "500": "#64748b",
    "600": "#475569",
    "700": "#334155",
    "800": "#1e293b",
    "950": "#020617",
  },
};

const accentForegrounds: Record<SidebarAccent, string> = {
  amber: "#291600",
  emerald: "#022c22",
  sky: "#082f49",
  cyan: "#083344",
  teal: "#042f2e",
  blue: "#06152f",
  indigo: "#040314",
  rose: "#4c0519",
  violet: "#2e1065",
  fuchsia: "#30002f",
  pink: "#300010",
  red: "#240000",
  orange: "#431407",
  lime: "#1a2e05",
  slate: "#0f172a",
};

export const ACCENT_OPTIONS = [
  { value: "emerald", label: "Emerald", hex: accentScales.emerald["500"] },
  { value: "sky", label: "Sky", hex: accentScales.sky["500"] },
  { value: "cyan", label: "Cyan", hex: accentScales.cyan["500"] },
  { value: "teal", label: "Teal", hex: accentScales.teal["500"] },
  { value: "blue", label: "Blue", hex: accentScales.blue["500"] },
  { value: "indigo", label: "Indigo", hex: accentScales.indigo["500"] },
  { value: "violet", label: "Violet", hex: accentScales.violet["500"] },
  { value: "fuchsia", label: "Fuchsia", hex: accentScales.fuchsia["500"] },
  { value: "pink", label: "Pink", hex: accentScales.pink["500"] },
  { value: "rose", label: "Rose", hex: accentScales.rose["500"] },
  { value: "red", label: "Red", hex: accentScales.red["500"] },
  { value: "orange", label: "Orange", hex: accentScales.orange["500"] },
  { value: "amber", label: "Amber", hex: accentScales.amber["500"] },
  { value: "lime", label: "Lime", hex: accentScales.lime["500"] },
  { value: "slate", label: "Slate", hex: accentScales.slate["500"] },
] as const satisfies ReadonlyArray<{ value: SidebarAccent; label: string; hex: string }>;

export const accentThemes: Record<SidebarAccent, AccentTheme> = {
  emerald: buildAccentTheme(accentScales.emerald, accentForegrounds.emerald),
  sky: buildAccentTheme(accentScales.sky, accentForegrounds.sky),
  cyan: buildAccentTheme(accentScales.cyan, accentForegrounds.cyan),
  teal: buildAccentTheme(accentScales.teal, accentForegrounds.teal),
  blue: buildAccentTheme(accentScales.blue, accentForegrounds.blue),
  indigo: buildAccentTheme(accentScales.indigo, accentForegrounds.indigo),
  violet: buildAccentTheme(accentScales.violet, accentForegrounds.violet),
  fuchsia: buildAccentTheme(accentScales.fuchsia, accentForegrounds.fuchsia),
  pink: buildAccentTheme(accentScales.pink, accentForegrounds.pink),
  rose: buildAccentTheme(accentScales.rose, accentForegrounds.rose),
  red: buildAccentTheme(accentScales.red, accentForegrounds.red),
  orange: buildAccentTheme(accentScales.orange, accentForegrounds.orange),
  amber: buildAccentTheme(accentScales.amber, accentForegrounds.amber),
  lime: buildAccentTheme(accentScales.lime, accentForegrounds.lime),
  slate: buildAccentTheme(accentScales.slate, accentForegrounds.slate),
};

export function normalizeSidebarAccent(value: string | undefined): SidebarAccent {
  return value && Object.hasOwn(accentThemes, value) ? value as SidebarAccent : "emerald";
}

function buildAccentTheme(scale: AccentScale, foreground: string): AccentTheme {
  const cssVars: Record<`--${string}`, string> = {
    "--color-primary": scale[500],
    "--color-primary-foreground": foreground,
    "--color-ring": scale[400],
    "--color-primary-dim": scale[700],
    "--color-chart-1": scale[500],
  };

  for (const shade of Object.keys(scale) as AccentShade[]) {
    cssVars[`--color-emerald-${shade}`] = scale[shade];
  }

  return { cssVars };
}
