import { rs33Paths, rs33Timestamp } from "./route-analysis.mjs";
import { rs33CourseToneColor } from "./course-layers.mjs";

// A read-only playback view: the real GPS timestamps determine the motion.
// Sessions are concatenated on the playback clock WITHOUT inventing a route
// through the off-duty gaps between separate saved rides.
export function buildPlaybackTrack(sessions) {
  const rows = (Array.isArray(sessions) ? sessions : sessions ? [sessions] : [])
    .filter((row) => row && Array.isArray(row.points) && rs33Timestamp(row.started_at))
    .slice()
    .sort((a, b) => rs33Timestamp(a.started_at) - rs33Timestamp(b.started_at));
  if (!rows.length) return null;
  const segments = [], windows = [];
  let elapsed = 0, samples = 0;
  for (const row of rows) {
    const start = rs33Timestamp(row.started_at);
    const gps = rs33Paths(row.points);
    const lastGPS = Math.max(start, ...gps.map((segment) =>
      segment.length ? segment[segment.length - 1].time || start : start));
    const recordEnd = rs33Timestamp(row.ended_at);
    const end = Math.max(start, recordEnd || lastGPS);
    const duration = Math.max(0, end - start);
    windows.push({ start, duration, offset: elapsed });
    for (const group of gps) {
      const coords = [], times = [];
      for (const point of group) {
        if (!Number.isFinite(point.time)) continue;
        const time = elapsed + Math.max(0, Math.min(duration, point.time - start));
        if (times.length && time < times[times.length - 1]) continue;
        coords.push([point.lat, point.lng]);
        times.push(time);
      }
      if (coords.length) {
        segments.push({
          coordinates: coords,
          times,
          start: times[0],
          end: times[times.length - 1],
        });
        samples += coords.length;
      }
    }
    elapsed += duration;
  }
  if (!samples) return null;
  // Stable even when run boundaries share a timestamp. No GPS or event arrays
  // are modified, uploaded, smoothed, or turned into artificial connectors.
  return {
    segments,
    windows,
    duration: elapsed,
    samples,
    firstTime: windows[0]?.start || 0,
  };
}

export function playbackTimestamp(track, offset) {
  if (!track?.windows?.length) return null;
  const position = Math.max(0, Math.min(track.duration, Number(offset) || 0));
  let current = track.windows[0];
  for (let i = 1; i < track.windows.length; i++) {
    if (position < track.windows[i].offset) break;
    current = track.windows[i];
  }
  return current.start + Math.min(current.duration, Math.max(0, position - current.offset));
}

function upperBound(values, position) {
  let low = 0, high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= position) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function playbackFrame(track, position) {
  if (!track?.segments?.length) return { lines: [], point: null };
  const time = Math.max(0, Math.min(track.duration, Number(position) || 0));
  const lines = [];
  let point = null;
  for (const segment of track.segments) {
    if (time < segment.start) {
      lines.push([]);
      continue;
    }
    const index = upperBound(segment.times, time) - 1;
    const count = index + 1;
    const coords = segment.coordinates.slice(0, count);
    const next = index + 1;
    if (next < segment.times.length && time > segment.times[index] && segment.times[next] > time) {
      const ratio =
        (time - segment.times[index]) / (segment.times[next] - segment.times[index]);
      const from = segment.coordinates[index], to = segment.coordinates[next];
      coords.push([
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio,
      ]);
    }
    lines.push(coords);
    if (coords.length) point = coords[coords.length - 1];
  }
  return { lines, point };
}

// Keep the color of a GPS edge fixed throughout playback. Every slice is
// assigned a tone using its distance along the COMPLETE route, rather than
// regrading the portion already drawn on each animation frame.
export function buildPlaybackColorSlices(track) {
  if (!track?.segments?.length) return [];
  const length = (a, b) => {
    const scale = Math.cos(((a[0] + b[0]) * Math.PI) / 360);
    return Math.hypot(b[0] - a[0], (b[1] - a[1]) * scale);
  };
  let total = 0;
  for (const segment of track.segments) {
    for (let i = 1; i < segment.coordinates.length; i++) {
      total += length(segment.coordinates[i - 1], segment.coordinates[i]);
    }
  }
  if (!(total > 0)) return [];

  const slices = [];
  let walked = 0;
  for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex++) {
    const segment = track.segments[segmentIndex];
    let slice = null;
    const flush = () => {
      if (slice?.coordinates.length > 1) slices.push(slice);
      slice = null;
    };
    for (let i = 1; i < segment.coordinates.length; i++) {
      const from = segment.coordinates[i - 1];
      const to = segment.coordinates[i];
      const fromTime = segment.times[i - 1];
      const toTime = segment.times[i];
      const edge = length(from, to);
      if (!(edge > 0)) continue;
      const end = walked + edge;
      const at = (fraction) => [
        from[0] + (to[0] - from[0]) * fraction,
        from[1] + (to[1] - from[1]) * fraction,
      ];
      const atTime = (fraction) => fromTime + (toTime - fromTime) * fraction;
      let cursor = walked;
      while (cursor < end) {
        const tone = Math.min(47, Math.floor((cursor / total + 1e-12) * 48));
        const next = tone === 47 ? end : Math.min(end, ((tone + 1) * total) / 48);
        if (next <= cursor) break;
        const startFraction = (cursor - walked) / edge;
        const endFraction = (next - walked) / edge;
        if (slice?.tone !== tone) {
          flush();
          slice = {
            tone, segmentIndex,
            coordinates: [at(startFraction)],
            times: [atTime(startFraction)],
          };
        }
        slice.coordinates.push(at(endFraction));
        slice.times.push(atTime(endFraction));
        cursor = next;
      }
      walked = end;
    }
    flush(); // Never connect separate rides or GPS outage fragments.
  }
  return slices;
}

export function createPlaybackLayer(L, map, track) {
  const group = L.layerGroup().addTo(map);
  const slices = buildPlaybackColorSlices(track);
  const lines = slices.map((slice) =>
    L.polyline([], {
      color: rs33CourseToneColor(slice.tone),
      weight: 6,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
      className: "rs59-playback-route",
    }).addTo(group));
  const completed = slices.map(() => false);
  const marker = L.circleMarker([0, 0], {
    radius: 8,
    color: "#ffffff",
    weight: 3,
    fillColor: "#0c705b",
    fillOpacity: 1,
    opacity: 1,
    interactive: false,
    className: "rs59-playback-marker",
  });
  let markerVisible = false;
  return {
    setTime(position) {
      const frame = playbackFrame(track, position);
      const time = Math.max(0, Math.min(track.duration, Number(position) || 0));
      for (let i = 0; i < lines.length; i++) {
        const slice = slices[i];
        const first = slice.times[0];
        const last = slice.times[slice.times.length - 1];
        if (time < first) {
          if (completed[i] !== null) lines[i].setLatLngs([]);
          completed[i] = null;
          continue;
        }
        if (time >= last) {
          if (completed[i] !== true) lines[i].setLatLngs(slice.coordinates);
          completed[i] = true;
          continue;
        }
        const index = upperBound(slice.times, time) - 1;
        const coords = slice.coordinates.slice(0, index + 1);
        const next = index + 1;
        if (
          next < slice.times.length &&
          time > slice.times[index] &&
          slice.times[next] > slice.times[index]
        ) {
          const fraction =
            (time - slice.times[index]) /
            (slice.times[next] - slice.times[index]);
          const from = slice.coordinates[index], to = slice.coordinates[next];
          coords.push([
            from[0] + (to[0] - from[0]) * fraction,
            from[1] + (to[1] - from[1]) * fraction,
          ]);
        }
        lines[i].setLatLngs(coords);
        completed[i] = false;
      }
      if (frame.point) {
        marker.setLatLng(frame.point);
        if (!markerVisible) {
          marker.addTo(group);
          markerVisible = true;
        }
      } else if (markerVisible) {
        group.removeLayer(marker);
        markerVisible = false;
      }
    },
    destroy() { group.remove(); },
  };
}

export function useRoutePlayback(React, source) {
  const track = React.useMemo(() => buildPlaybackTrack(source), [source]);
  const [state, setState] = React.useState({
    track: null, showing: false, playing: false, elapsed: 0, speed: 20,
  });
  const relevant = state.track === track && Boolean(track);
  const elapsed = relevant ? Math.min(track.duration, state.elapsed) : 0;
  const showing = relevant && state.showing;
  const playing = showing && state.playing;

  React.useEffect(() => {
    if (!playing || !track) return;
    let frame = 0, previous = null, lastCommit = null, pending = 0;
    const tick = (now) => {
      if (previous == null) {
        previous = lastCommit = now;
      } else {
        pending += Math.max(0, now - previous) * state.speed;
        previous = now;
      }
      if (now - lastCommit >= 85) {
        const advance = pending;
        pending = 0;
        lastCommit = now;
        setState((prev) => {
          if (prev.track !== track || !prev.playing) return prev;
          const next = Math.min(track.duration, prev.elapsed + advance);
          return { ...prev, elapsed: next, playing: next < track.duration };
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const pauseWhenHidden = () => {
      if (document.hidden) setState((old) => ({ ...old, playing: false }));
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [playing, track, state.speed]);

  return {
    track,
    showing,
    playing,
    speed: state.speed,
    elapsed,
    duration: track?.duration || 0,
    displayTime: track ? playbackTimestamp(track, elapsed) : null,
    toggle() {
      if (!track) return;
      setState((prev) => {
        const same = prev.track === track;
        if (same && prev.playing) return { ...prev, playing: false };
        const restart = !same || prev.elapsed >= track.duration;
        return {
          ...prev, track, showing: true, playing: true,
          elapsed: restart ? 0 : prev.elapsed,
        };
      });
    },
    seek(value) {
      if (!track) return;
      setState((prev) => {
        const time = Math.max(0, Math.min(track.duration, Number(value) || 0));
        return {
          ...prev, track, showing: true,
          playing: prev.track === track && prev.playing && time < track.duration,
          elapsed: time,
        };
      });
    },
    setSpeed(value) {
      const speed = Number(value);
      if (![10, 20, 30, 60, 100].includes(speed)) return;
      setState((prev) => ({ ...prev, speed }));
    },
    reset() {
      setState((prev) => ({
        ...prev, track, showing: false, playing: false, elapsed: 0,
      }));
    },
  };
}
