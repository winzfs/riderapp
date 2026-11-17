# Rider Spot — public facilities (pilot)

Scope: Western Gwangju / Gwangsan-gu vicinity, approximate bounding box
`35.08..35.25 N, 126.67..126.92 E`. **This is not an administrative
boundary**; it can include neighbouring districts. Widen carefully after
validation. Not all places are mapped in OpenStreetMap.

## Data flow (no end-user OSM API traffic)

1. GitHub Actions in the repository's **default `main` branch** runs
   [rider-spot-public-pois.yml](../.github/workflows/rider-spot-public-pois.yml)
   every Sunday at 02:00 UTC. It checks out the *feature branch* and downloads
   the public Geofabrik South Korea OSM extract (approx. 280 MB).
2. Pinned `osmium==4.3.2` reads the PBF and
   `rider-spot-web/scripts/sync-public-pois.py` writes the small, public,
   licensed snapshot at `rider-spot-web/data/gwangsan-osm-pois.json`.
   The job commits **only** after a successful parse and count sanity check.
   On failure the previous snapshot is retained unchanged.
3. Supabase Cron job `rider-spot-public-pois-weekly` calls the
   `sync-public-pois` Edge Function at 03:00 UTC each Sunday.
   Its bearer-equivalent 256-bit trigger token is generated **inside** the
   database and read from Supabase Vault (`rider_spot_poi_sync_token`);
   only its SHA-256 digest is stored in `poi_import_control`.
   No secrets are committed to GitHub or shipped in the APK.
4. The Edge Function downloads the public snapshot from GitHub raw,
   checks its region, freshness (21 days), minimum count and unexpected
   shrinkage, then upserts by `source + source_id` to the separate
   `public.public_pois` table. It never deletes missing records automatically.
   Failed imports leave existing rows in place.
5. On the facilities map, `public-pois-overlay.mjs` makes a bounded,
   read-only Supabase query at zoom **14+**, displays up to 45/95/190 pins
   by zoom, and hides matching OSM pins when nearby rider reports exist.
   It is entirely separate from GPS, SQLite, location sharing, rider reports,
   bookmarks, community and timeline playback.

Categories: toilets, fuel stations, shelters (excludes known bus shelters),
and named parks, hospitals, libraries, community centres, town halls, police
stations and attractions. Only OSM-mapped items are available. A shelter
tag is **not** a guarantee of rider access; status/opening hours may be stale.

## License and compliance

Source © OpenStreetMap contributors, Open Database License (ODbL 1.0),
via [Geofabrik](https://download.geofabrik.de/asia/south-korea.html).
App map pins and their detail sheets link to
[OSM attribution](https://www.openstreetmap.org/copyright) and the
individual source feature. The derived snapshot is published in this
public repository for data reuse, separately from private rider data.
When adding other providers (e.g. Opinet or government APIs), keep their
license/source identifiers separate. Do not merge incompatible datasets
into OSM-derived data without checking redistribution conditions.

## Monitoring and recovery

- GitHub Actions: `Rider Spot public POI snapshot weekly` must succeed
  each Sunday; snapshot `generated_at` must be recent and have 8+ records.
- Supabase: `select region,last_success_at,last_count,last_error from
  public.poi_import_control;` monitors import success without exposing
  credentials.
- Supabase: `select category,count(*) from public.public_pois where active
  group by category;` shows serving counts. RLS only permits public SELECT
  of active rows; no client write policy exists.
- If external data fails, **do not** clear the POI table or touch
  `rider_places`. Investigate the GitHub download and Edge Function logs.
- To disable automatic imports, unschedule by name using `cron.unschedule`;
  the existing public POIs continue to serve.
- To hide the overlay temporarily, remove the
  `createPublicPoiOverlay` integration in `map-reports.js` and redeploy
  web assets; neither Supabase nor saved ride records need modification.
- Browser support: no APK rebuild is required for the web-only overlay,
  but the worker must be redeployed after the frontend bundle changes.

## Future data providers

Use distinct source + source_id keys, provider-specific importers and source
attribution. Opinet fuel prices require separate API credentials and rights
verification. Nationwide public toilets can require geocoding (the published
standard feed has restricted coordinates). Do not claim facility opening hours
are live unless the actual provider guarantees that.
