#!/usr/bin/env python3
"""Prevent the Android document-start bridge from re-finalizing the same trip.

This only changes the native integration's reconciliation decisions. It does
not clear the Android SQLite capture, history, earnings, or GPS permissions.
"""
from pathlib import Path
import re
import sys

root=Path(sys.argv[1])
bridge=root/"app/src/main/assets/native-bridge.js"
text=bridge.read_text(encoding="utf8")
old_missing="""    let existing;
    try { existing = JSON.parse(localStorage.getItem('active:' + userId) || 'null'); }
    catch { existing = null; }
    const points = await loadAll(id);"""
new_missing="""    // The old bridge read an unprefixed legacy key while React uses rs:active:.
    // A completed trip must NEVER be resurrected, even if the native service
    // has stale state following a process restart.
    if (isTripCompleted(userId, id)) return;
    const existing = readActiveTrip(userId, id);
    const points = await loadAll(id);"""
old_stopped="""    let record;
    try { record = JSON.parse(localStorage.getItem('active:' + userId) || 'null'); }
    catch { return; }
    if (!record || record.id !== id) return;"""
new_stopped="""    if (isTripCompleted(userId, id)) {
      // Only delete a legacy active pointer after durable completion is proven.
      // Native SQLite GPS samples and completed history remain untouched.
      const legacy = 'active:' + userId;
      try {
        if (JSON.parse(localStorage.getItem(legacy) || 'null')?.id === id)
          localStorage.removeItem(legacy);
      } catch { /* Store may be temporarily unavailable. */ }
      return;
    }
    const record = readActiveTrip(userId, id);
    if (!record) return;"""
anchor="""  async function recoverMissingTrip(state) {"""
helper="""  function isTripCompleted(userId, id) {
    if (!id) return false;
    try {
      if (JSON.parse(localStorage.getItem('rs:native-merged:' + userId + ':' + id) || 'false') === true)
        return true;
    } catch { /* Best effort, history remains authoritative. */ }
    for (const key of ['rs:trips:' + userId, 'trips:' + userId]) {
      try {
        const rows = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(rows) && rows.some(row => row?.id === id && row.ended_at))
          return true;
      } catch { /* Keep checking independent stores. */ }
    }
    return false;
  }

  function readActiveTrip(userId, id) {
    for (const key of ['rs:active:' + userId, 'active:' + userId]) {
      try {
        const row = JSON.parse(localStorage.getItem(key) || 'null');
        if (row?.id === id && !row.ended_at) return row;
      } catch { /* Keep checking the other store. */ }
    }
    return null;
  }

  async function recoverMissingTrip(state) {"""
for before,after in [(old_missing,new_missing),(old_stopped,new_stopped),(anchor,helper)]:
    if text.count(before)!=1:
        raise SystemExit("Refuse to patch unexpected bridge source: "+before[:60])
    text=text.replace(before,after,1)
bridge.write_text(text,encoding="utf8")
gradle=root/"app/build.gradle"
s=gradle.read_text()
if "versionCode 11" not in s or "versionName '1.0.11-native-recovery'" not in s:
    raise SystemExit("Native version unexpectedly changed; refusing to patch")
s=s.replace("versionCode 11","versionCode 12",1)
s=s.replace("versionName '1.0.11-native-recovery'","versionName '1.0.12-recovery-loop-guard'",1)
gradle.write_text(s)
assert "isTripCompleted(userId, id)" in text
assert "localStorage.removeItem(legacy)" in text
assert "location.reload(" not in text
print("PASS: no completed trip reactivation, legacy compatibility, SQLite untouched")
