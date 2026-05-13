const DEFAULT_TIME_ZONE = "Europe/Istanbul";

const DEFAULT_HOUR_CYCLE = "h23";

const COMMON_TIME_ZONES = [
  "Europe/Istanbul",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export interface TimeDisplaySettings {
  timeZone: string;
  use24HourClock: boolean;
}

export const DEFAULT_TIME_DISPLAY_SETTINGS: TimeDisplaySettings = {
  timeZone: DEFAULT_TIME_ZONE,
  use24HourClock: true,
};

const supportedTimeZones = resolveSupportedTimeZones();

export const TIME_ZONE_OPTIONS = buildTimeZoneOptions();

function normalizeTimeZone(value: string | null | undefined) {
  const candidate = value?.trim();
  return candidate && supportedTimeZones.has(candidate) ? candidate : DEFAULT_TIME_ZONE;
}

export function isValidTimeZone(value: string) {
  return supportedTimeZones.has(value.trim());
}

export function resolveTimeDisplaySettings(
  value?: Partial<TimeDisplaySettings> | null
): TimeDisplaySettings {
  return {
    timeZone: normalizeTimeZone(value?.timeZone),
    use24HourClock:
      typeof value?.use24HourClock === "boolean"
        ? value.use24HourClock
        : DEFAULT_TIME_DISPLAY_SETTINGS.use24HourClock,
  };
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  settings?: Partial<TimeDisplaySettings> | null,
  options: { includeSeconds?: boolean; includeTimeZone?: boolean } = {}
) {
  const date = coerceDate(value);
  if (!date) {
    return "--";
  }

  const resolved = resolveTimeDisplaySettings(settings);
  const parts = getFormatter(resolved, options.includeSeconds ?? false).formatToParts(date);
  const values = mapPartValues(parts);
  const time = buildTimePart(values, resolved.use24HourClock, options.includeSeconds ?? false);
  const base = `${values.day}.${values.month}.${values.year} ${time}`.trim();
  return options.includeTimeZone ? `${base} ${resolved.timeZone}` : base;
}

function resolveSupportedTimeZones() {
  const values =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : Array.from(COMMON_TIME_ZONES);

  return new Set([...COMMON_TIME_ZONES, ...values]);
}

function buildTimeZoneOptions() {
  const customOrder = new Set(COMMON_TIME_ZONES);
  const extras = Array.from(supportedTimeZones).filter(
    (value) => !customOrder.has(value as (typeof COMMON_TIME_ZONES)[number])
  );

  return [...COMMON_TIME_ZONES, ...extras];
}

function getFormatter(settings: TimeDisplaySettings, includeSeconds: boolean) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hourCycle: settings.use24HourClock ? DEFAULT_HOUR_CYCLE : "h12",
  });
}

function buildTimePart(
  values: ReturnType<typeof mapPartValues>,
  use24HourClock: boolean,
  includeSeconds: boolean
) {
  const base = `${values.hour}:${values.minute}${includeSeconds ? `:${values.second}` : ""}`;
  return use24HourClock ? base : `${base} ${values.dayPeriod || ""}`.trim();
}

function mapPartValues(parts: Intl.DateTimeFormatPart[]) {
  return parts.reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }

    return accumulator;
  }, {});
}

function coerceDate(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}
