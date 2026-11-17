export function rs33Timestamp(value) {
  if (value === undefined || value === null || value === "") return null;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) && time > 0 && time <= 8640000000000000
    ? time
    : null;
}

export function rs43Meters(a, b) {
  if (!a || !b) return Infinity;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r,
    dLng = (b.lng - a.lng) * r;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(s), Math.sqrt(Math.max(0, 1 - s)));
}

export function rs43CleanPaths(groups) {
  return groups
    .map((path) => {
      if (!Array.isArray(path) || path.length < 3) return path || [];
      const output = [];
      let i = 0;
      while (i < path.length) {
        const pivot = path[i];
        let j = i + 1;
        while (j < path.length) {
          const gap = (path[j].time ?? 0) - (pivot.time ?? 0);
          if (gap < 0 || gap > 1800000) break;
          const radius = rs43Meters(pivot, path[j]);
          if (radius <= 24) {
            j++;
            continue;
          }
          // Ignore a single noisy sample which immediately returns to the stop radius.
          if (j + 1 < path.length && rs43Meters(pivot, path[j + 1]) <= 24) {
            j += 2;
            continue;
          }
          break;
        }
        const size = j - i;
        const duration =
          size > 1 ? (path[j - 1].time ?? 0) - (pivot.time ?? 0) : 0;
        if (size >= 5 && duration >= 25000) {
          const span = path.slice(i, j);
          const lat = span.map((p) => p.lat).sort((a, b) => a - b);
          const lng = span.map((p) => p.lng).sort((a, b) => a - b);
          const center = {
            ...span[0],
            lat: lat[Math.floor(lat.length / 2)],
            lng: lng[Math.floor(lng.length / 2)],
          };
          if (output.length && rs43Meters(output.at(-1), center) < 6)
            output[output.length - 1] = center;
          else output.push(center);
          i = j;
          continue;
        }
        // Consume the scanned window once, including short clusters and isolated noisy readings.
        for (; i < j; i++) {
          const next = path[i];
          if (!output.length || rs43Meters(output.at(-1), next) >= 7)
            output.push(next);
        }
      }
      const last = path.at(-1);
      if (last && (!output.length || rs43Meters(last, output.at(-1)) >= 7))
        output.push(last);
      return output.length ? output : [path[0]];
    })
    .filter((p) => p && p.length);
}

export function rs43Revisits(groups) {
  const rails = [];
  const cells = new Map();
  const zones = [];
  let cumulative = 0;
  let sumLat = 0,
    numPoints = 0;
  for (const group of groups)
    for (const p of group) {
      sumLat += p.lat;
      numPoints++;
    }
  const centerLat = numPoints ? sumLat / numPoints : 35;
  const latMeter = 111120,
    lonMeter = 111120 * Math.cos((centerLat * Math.PI) / 180);
  const bin = 24;
  const threshold = 19;
  for (let g = 0; g < groups.length; g++) {
    const path = groups[g];
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1],
        to = path[i],
        len = rs43Meters(from, to);
      if (!Number.isFinite(len) || len < 8 || len > 110) {
        if (Number.isFinite(len) && len < 20000) cumulative += len;
        continue;
      }
      cumulative += len;
      const x = ((from.lng + to.lng) / 2) * lonMeter,
        y = ((from.lat + to.lat) / 2) * latMeter;
      const dx = ((to.lng - from.lng) * lonMeter) / len,
        dy = ((to.lat - from.lat) * latMeter) / len;
      const gx = Math.floor(x / bin),
        gy = Math.floor(y / bin);
      let candidate = null,
        score = Infinity;
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          for (const idx of cells.get(gx + ox + "," + (gy + oy)) || []) {
            const z = zones[idx],
              dist = Math.hypot(x - z.x, y - z.y);
            // Parallel or opposite lanes both count; crossing streets do not.
            const parallel = Math.abs(dx * z.dx + dy * z.dy);
            if (
              dist < threshold &&
              parallel > 0.88 &&
              dist + (1 - parallel) * 35 < score
            ) {
              candidate = z;
              score = dist + (1 - parallel) * 35;
            }
          }
        }
      const at = Number.isFinite(to.time) ? to.time : null;
      let zone;
      if (!candidate) {
        zone = {
          x,
          y,
          dx,
          dy,
          visits: [{ time: at, distance: cumulative }],
          segments: [],
        };
        const idx = zones.push(zone) - 1,
          key = gx + "," + gy;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(idx);
      } else {
        zone = candidate;
        const farEnough =
          zone.visits.length < 4 &&
          at != null &&
          zone.visits.every(
            (v) =>
              v.time != null &&
              Math.abs(at - v.time) > 120000 &&
              Math.abs(cumulative - v.distance) > 160,
          );
        if (farEnough) zone.visits.push({ time: at, distance: cumulative });
      }
      zone.segments.push({ group: g, index: i, from, to });
    }
  }
  // Multiple observations in the same location during a single visit are one pass.
  for (const zone of zones) {
    const count = Math.min(4, zone.visits.length);
    if (count < 2) continue;
    for (const seg of zone.segments) rails.push({ ...seg, count });
  }
  return rails.sort((a, b) => a.group - b.group || a.index - b.index);
}

export function rs33Paths(points) {
  const groups = [];
  let current = [];
  for (const sample of Array.isArray(points) ? points : []) {
    if (
      !sample ||
      !Number.isFinite(sample.lat) ||
      !Number.isFinite(sample.lng) ||
      Math.abs(sample.lat) > 90 ||
      Math.abs(sample.lng) > 180
    ) {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    if (sample.accuracy != null && Number(sample.accuracy) > 100) {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    const point = {
      lat: sample.lat,
      lng: sample.lng,
      time: rs33Timestamp(sample.t),
    };
    const previous = current.at(-1);
    const gap =
      previous?.time != null && point.time != null
        ? point.time - previous.time
        : 0;
    const distance = previous ? rs43Meters(previous, point) : 0;
    const badJump =
      previous && gap > 0 && distance > 75 && distance / (gap / 1000) > 38;
    if (previous && (sample.break || gap >= 30000 || gap < 0 || badJump)) {
      groups.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) groups.push(current);
  return groups;
}

export function rs33Stamps(groups, events) {
  const points = groups.flat().filter((p) => p.time != null);
  if (!points.length) return [];
  const first = points[0],
    last = points.at(-1),
    duration = Math.max(0, last.time - first.time);
  const step =
    (duration > 6 * 3600000 ? 60 : duration > 2 * 3600000 ? 30 : 15) * 60000;
  const result = [{ ...first, label: "출발", kind: "start" }];
  let next = Math.floor(first.time / step) * step + step;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (p.time >= next) {
      next = Math.floor(p.time / step) * step + step;
      if (p.time - first.time >= step / 4 && last.time - p.time >= step / 4)
        result.push({ ...p, label: "기록 위치", kind: "stamp" });
    }
  }
  if (last.time !== first.time)
    result.push({ ...last, label: "마지막 기록", kind: "end" });
  const stops = (Array.isArray(events) ? events : [])
    .filter(
      (e) =>
        e?.source === "riderspot-native-stop-v1" &&
        rs33Timestamp(e.at) != null &&
        Number.isFinite(Number(e.lat)) &&
        Number.isFinite(Number(e.lng)) &&
        Math.abs(Number(e.lat)) <= 90 &&
        Math.abs(Number(e.lng)) <= 180,
    )
    .map((e) => ({
      lat: Number(e.lat),
      lng: Number(e.lng),
      time: rs33Timestamp(e.at),
      label: e.type || "정차",
      kind: "stop",
    }));
  return [...result, ...stops].sort((a, b) => a.time - b.time);
}

export function rs33Gradient(paths) {
  const lengths = paths.map((path) =>
    path.slice(1).map((p, i) => {
      const q = path[i],
        scale = Math.cos(((p.lat + q.lat) * Math.PI) / 360);
      return Math.hypot(p.lat - q.lat, (p.lng - q.lng) * scale);
    }),
  );
  const total = lengths.reduce(
    (sum, lengths) => sum + lengths.reduce((a, b) => a + b, 0),
    0,
  );
  if (!total) return [];
  const output = [];
  let walked = 0;
  for (let group = 0; group < paths.length; group++) {
    const path = paths[group];
    let span = [],
      current = -1;
    const flush = () => {
      if (span.length > 1) output.push({ tone: current, points: span });
    };
    for (let i = 1; i < path.length; i++) {
      const length = lengths[group][i - 1];
      if (!length) continue;
      const from = path[i - 1],
        to = path[i],
        end = walked + length;
      const at = (f) => [
        from.lat + (to.lat - from.lat) * f,
        from.lng + (to.lng - from.lng) * f,
      ];
      let cursor = walked;
      while (cursor < end) {
        const tone = Math.min(47, Math.floor((cursor / total + 1e-12) * 48));
        const next =
          tone === 47 ? end : Math.min(end, ((tone + 1) * total) / 48);
        if (next <= cursor) break;
        if (current !== tone) {
          flush();
          current = tone;
          span = [at((cursor - walked) / length)];
        }
        span.push(at((next - walked) / length));
        cursor = next;
      }
      walked = end;
    }
    flush();
  }
  return output;
}

export function routeGeometry(groups, revisits = []) {
  const paths = [];
  const dots = [];
  for (const group of groups) {
    if (group.length > 1) paths.push(group);
    else if (group.length) dots.push([group[0].lat, group[0].lng]);
  }
  const railRuns = [[], [], [], [], []];
  let previous;
  let run;
  for (const edge of revisits) {
    if (
      previous &&
      previous.group === edge.group &&
      previous.index + 1 === edge.index &&
      previous.count === edge.count
    ) {
      run.push([edge.to.lat, edge.to.lng]);
    } else {
      run = [
        [edge.from.lat, edge.from.lng],
        [edge.to.lat, edge.to.lng],
      ];
      railRuns[edge.count].push(run);
    }
    previous = edge;
  }
  const gradient = Array.from({ length: 48 }, () => []);
  for (const part of rs33Gradient(paths)) gradient[part.tone].push(part.points);
  return {
    paths: paths.map((path) => path.map((p) => [p.lat, p.lng])),
    dots,
    gradient,
    railRuns,
  };
}

function routeBounds(groups) {
  let south = Infinity,
    west = Infinity,
    north = -Infinity,
    east = -Infinity;
  for (const group of groups)
    for (const { lat, lng } of group) {
      south = Math.min(south, lat);
      west = Math.min(west, lng);
      north = Math.max(north, lat);
      east = Math.max(east, lng);
    }
  return south !== Infinity
    ? [
        [south, west],
        [north, east],
      ]
    : null;
}

function roadBatches(groups) {
  const batches = [];
  for (const group of groups) {
    for (let i = 0; i < group.length - 3; i += 69) {
      batches.push(group.slice(i, i + 70));
      if (batches.length > 5) return null;
    }
  }
  return batches;
}

export function analyzeCourse(points, events) {
  const groups = rs33Paths(points);
  const display = rs43CleanPaths(groups);
  const revisits = rs43Revisits(display);
  return {
    geometry: routeGeometry(display, revisits),
    bounds: routeBounds(groups),
    stamps: rs33Stamps(groups, events),
    gapCount: Math.max(0, groups.length - 1),
    batches: roadBatches(groups),
    revisitCount: revisits.length,
  };
}

export function analyzeMatchedCourse(groups) {
  return {
    geometry: routeGeometry(groups),
    bounds: routeBounds(groups),
    revisitCount: 0,
  };
}
