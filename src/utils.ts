const TIME_UNITS = {
  "s": 1,
  "m": 60,
  "h": 60 * 60,
  "d": 60 * 60 * 24,
  "w": 60 * 60 * 24 * 7,
  "mo": 60 * 60 * 24 * 30,
  "y": 60 * 60 * 24 * 365,
  "kys": 60 * 60 * 24 * 365 * 1000,
};
const TIME_UNITS_NAMES: [string, number][] = [
  ["kiloyears", TIME_UNITS.kys],
  ["years", TIME_UNITS.y],
  ["days", TIME_UNITS.d],
  ["hours", TIME_UNITS.h],
  ["minutes", TIME_UNITS.m],
  ["seconds", TIME_UNITS.s],
];

export function secondsToHuman(seconds: number) {
  const parts: string[] = [];

  for (const [unit, secondsInUnit] of TIME_UNITS_NAMES) {
    const count = math.floor(seconds / secondsInUnit);
    if (count > 0) {
      if (count === 1) {
        parts.push(`${count} ${unit.sub(1, -2)}`);
      } else {
        parts.push(`${count} ${unit}`);
      }
      seconds -= count * secondsInUnit;
    }
  }

  if (parts.size() > 1) {
    // add "and" before last part
    parts[parts.size() - 1] = `and ${parts[parts.size() - 1]}`;
  }

  return parts.join(" ");
}
