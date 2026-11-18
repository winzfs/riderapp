export const rs33Zone = "Asia/Seoul";
export const rs33DayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: rs33Zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const rs33Clock = new Intl.DateTimeFormat("ko-KR", {
  timeZone: rs33Zone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const rs33ISO = (value) => rs33DayFormat.format(new Date(value));
// A delivery workday is 03:00–02:59:59 KST; keep the underlying trip timestamps unchanged.
export const rs33WorkDay = (value) => rs33ISO(new Date(value).getTime() - 3 * 60 * 60 * 1000);
export const rs33Time = (value) => rs33Clock.format(new Date(value));
export const rs33Format = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});
export function rs33DateAdd(date, offset) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function rs33WeekStart(date) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return rs33DateAdd(date, -(day + 6) % 7);
}
export function rs33Duration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (!minutes) return "1분 미만";
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return [h ? h + "시간" : "", m ? m + "분" : ""].filter(Boolean).join(" ");
}
export function rs33Timestamp(value) {
  if (value === undefined || value === null || value === "") return null;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) && time > 0 && time <= 8640000000000000
    ? time
    : null;
}
