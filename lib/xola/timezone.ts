// DST-aware timezone offset for the Xola /api/events ?offset= param.
//
// Per XOLA_INTEGRATION.md, the events endpoint takes start/end as UNIX
// epoch seconds plus a separate offset (seconds) that shifts those
// boundaries into the seller's local timezone. Cleveland on a June date
// uses -14400 (EDT, UTC-4); on a January date it's -18000 (EST, UTC-5).
// Omitting the offset = UTC boundaries = wrong window for any seller
// not on UTC.
//
// V1 hardcodes the seller TZ at the call site (BrewBoat is Cleveland =
// "America/New_York"). V2 multi-seller will pull TZ from the installations
// table populated by the `installation.create` webhook (DEC-114).

const SECONDS_PER_MINUTE = 60;

// Returns the UTC offset in seconds for the given date in the given IANA
// timezone. Negative for timezones west of UTC. DST-aware: pass a date in
// the relevant range and you get the correct offset for that date.
export function getOffsetSeconds(date: Date, timeZone: string): number {
  // Intl.DateTimeFormat with timeZoneName: "longOffset" yields strings like
  // "GMT-04:00" or "GMT" — we parse them rather than building a Date in the
  // target zone and diffing, because diffing local Date arithmetic is
  // brittle across DST transitions.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const parts = dtf.formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  if (!tzPart) {
    throw new Error(`getOffsetSeconds: could not resolve offset for ${timeZone}`);
  }
  // tzPart.value is "GMT" (== 0), "GMT-04:00", "GMT+05:30", etc.
  const m = tzPart.value.match(/^GMT(?:([+-])(\d{2}):?(\d{2}))?$/);
  if (!m) {
    throw new Error(`getOffsetSeconds: unexpected offset format '${tzPart.value}' for ${timeZone}`);
  }
  if (m[1] === undefined) return 0; // bare "GMT"
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  return sign * (hours * 60 + minutes) * SECONDS_PER_MINUTE;
}

// Convenience: convert an ISO date string (e.g. "2026-06-01") to a UNIX
// epoch seconds value representing local midnight (start of day) in the
// given timezone. Used to build the Xola events ?start= param.
export function localDateToEpochSeconds(
  isoDate: string,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  // Parse as UTC first, then shift backward by the offset to get the
  // moment that displays as "isoDate hour:minute:second" in timeZone.
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`localDateToEpochSeconds: expected YYYY-MM-DD, got '${isoDate}'`);
  }
  const [, y, mo, d] = m;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), hour, minute, second);
  // Use the offset at that approximate instant — for boundary dates this
  // is within seconds of the true local-midnight offset; DST transitions
  // happen at 02:00 local, so 00:00 local is unambiguous.
  const offsetSec = getOffsetSeconds(new Date(asUtc), timeZone);
  return Math.floor(asUtc / 1000) - offsetSec;
}
