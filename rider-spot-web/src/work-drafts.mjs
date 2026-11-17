// Account-scoped, best-effort form drafts. Never stores GPS, authentication or session data.
const FIELDS = Object.freeze({
  earnings: ["work_date", "platform", "gross_won", "deliveries", "hours", "distance_km", "expenses_won", "note"],
  fuel: ["fueled_on", "cost_won", "liters", "odometer_km", "full_tank", "note"],
  maintenance: ["item", "cost_won", "serviced_on", "odometer_km", "next_due_km", "note"],
});
const IGNORE_FOR_DIRTY = new Set(["work_date", "fueled_on", "serviced_on", "platform"]);
const TTL = 7 * 24 * 60 * 60 * 1000;

export function createWorkDrafts(storage, now = () => Date.now()) {
  const key = (uid, type) => uid && Object.hasOwn(FIELDS, type)
    ? "rs:work-draft:v1:" + uid + ":" + type : null;
  function clear(uid, type) {
    const k = key(uid, type);
    try { if (k) storage?.removeItem(k); } catch { /* unavailable on some WebViews */ }
  }
  function read(uid, type) {
    const k = key(uid, type);
    if (!k) return null;
    try {
      const data = JSON.parse(storage?.getItem(k) || "null");
      if (!data || !data.savedAt || !data.values || now() - data.savedAt > TTL ||
          data.savedAt > now() + 60000) {
        clear(uid, type);
        return null;
      }
      return data;
    } catch { return null; }
  }
  function save(uid, form) {
    const type = form?.dataset?.rsForm, k = key(uid, type);
    if (!k || !form || form.dataset.rsSaved) return;
    const values = {};
    for (const name of FIELDS[type]) {
      const field = form.elements.namedItem(name);
      if (field) values[name] = field.type === "checkbox" ? Boolean(field.checked) : String(field.value);
    }
    const dirty = Object.entries(values).some(([name, val]) =>
      !IGNORE_FOR_DIRTY.has(name) && val !== "" && val !== "0" && val !== false);
    if (!dirty) return clear(uid, type);
    const data = { savedAt: now(), values, expanded: Boolean(form.querySelector("details")?.open) };
    try { storage?.setItem(k, JSON.stringify(data)); } catch { /* device storage may be full */ }
  }
  function fill(form, type, values, expanded = false) {
    if (!form || !Object.hasOwn(FIELDS, type)) return;
    for (const name of FIELDS[type]) {
      const field = form.elements.namedItem(name);
      if (!field || values?.[name] === undefined || values[name] === null) continue;
      if (field.type === "checkbox") field.checked = Boolean(values[name]);
      else {
        if (field.tagName === "SELECT" && ![...field.options].some((opt) => opt.value === String(values[name])))
          field.add(new Option(String(values[name]), String(values[name])));
        field.value = String(values[name]);
      }
    }
    const details = form.querySelector("details");
    if (details) details.open = expanded;
  }
  return { clear, read, save, fill };
}
