export type DeliveryHistoryRangeInput = {
  range: "last_7_days" | "last_30_days" | "custom";
  from?: string;
  to?: string;
  timezoneOffsetMinutes?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatCalendarDateInput(
  date: Date,
  timezoneOffsetMinutes = date.getTimezoneOffset()
) {
  return new Date(date.getTime() - timezoneOffsetMinutes * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function shiftLocalCalendarDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

export function resolveDeliveryHistoryRange(input: DeliveryHistoryRangeInput, now = new Date()) {
  if (input.range === "last_7_days") {
    return { from: new Date(now.getTime() - 7 * DAY_MS), toExclusive: now };
  }

  if (input.range === "last_30_days") {
    return { from: new Date(now.getTime() - 30 * DAY_MS), toExclusive: now };
  }

  const offsetMinutes = input.timezoneOffsetMinutes ?? 0;
  const from = parseCalendarDate(input.from, offsetMinutes);
  const inclusiveTo = parseCalendarDate(input.to, offsetMinutes);
  if (!from || !inclusiveTo || from > inclusiveTo) {
    throw new Error("Enter a valid custom date range.");
  }

  return {
    from,
    toExclusive: new Date(inclusiveTo.getTime() + DAY_MS),
  };
}

export function isValidCalendarDate(value: string | undefined) {
  return Boolean(parseCalendarDate(value, 0));
}

function parseCalendarDate(value: string | undefined, timezoneOffsetMinutes: number) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const utcDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(utcDate.getTime()) || utcDate.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return new Date(utcDate.getTime() + timezoneOffsetMinutes * 60 * 1000);
}
