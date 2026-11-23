export async function readIncomeForEdit(client, uid, day, platform) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("rider_earnings").select("gross_won,gross_entered")
      .eq("user_id", uid).eq("work_date", day).eq("platform", platform)
      .order("id").range(offset, offset + 499);
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
  }
}

export function sumRideDays(rows, days) {
  const buckets = new Map(days.map(day => [day, {day, trips: 0, distanceKm: 0, durationMs: 0}]));
  for (const ride of rows) {
    const total = buckets.get(ride.day);
    if (!total) continue;
    total.trips++;
    total.distanceKm += ride.distanceKm;
    total.durationMs += ride.durationMs;
  }
  return days.map(day => buckets.get(day));
}
