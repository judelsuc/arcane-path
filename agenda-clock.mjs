export function agendaClock(date, locale) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error("Invalid game clock date.");
  const format = options => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
  return {
    weekday: format({ weekday: "long" }), day: format({ day: "2-digit" }),
    month: format({ month: "long" }), year: format({ year: "numeric" }),
    time: format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    full: format({ dateStyle: "full", timeStyle: "short", hourCycle: "h23" }),
    iso: date.toISOString(),
    hourDegrees: (date.getUTCHours() % 12) * 30 + date.getUTCMinutes() / 2,
    minuteDegrees: date.getUTCMinutes() * 6,
  };
}
