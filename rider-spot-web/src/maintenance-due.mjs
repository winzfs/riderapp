// Advisory only. Uses explicitly entered next-due distances; never invents service intervals.
export function upcomingMaintenance(maintenance = [], fuel = [], thresholdKm = 500) {
  const entries = [
    ...(Array.isArray(maintenance) ? maintenance.map((row) => ({
      date: row.serviced_on, created: row.created_at, km: Number(row.odometer_km),
    })) : []),
    ...(Array.isArray(fuel) ? fuel.map((row) => ({
      date: row.fueled_on, created: row.created_at, km: Number(row.odometer_km),
    })) : []),
  ].filter((row) => row.km > 0 && Number.isSafeInteger(row.km) && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)));
  if (!entries.length) return { odometerKm: null, due: [] };
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
    String(b.created || "").localeCompare(String(a.created || "")));
  const odometerKm = entries[0].km;
  const latestByItem = new Map();
  for (const row of Array.isArray(maintenance) ? maintenance : []) {
    const item = String(row.item || "").trim();
    if (!item || latestByItem.has(item)) continue;
    latestByItem.set(item, row);
  }
  const due = [...latestByItem.values()].map((row) => ({
    item: String(row.item),
    nextDueKm: Number(row.next_due_km),
  })).filter((row) =>
    Number.isSafeInteger(row.nextDueKm) && row.nextDueKm > 0 &&
    row.nextDueKm - odometerKm <= thresholdKm
  ).sort((a, b) => a.nextDueKm - b.nextDueKm);
  return { odometerKm, due };
}
