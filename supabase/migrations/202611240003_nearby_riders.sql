SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';

CREATE INDEX IF NOT EXISTS locations_point_gist_idx ON public.locations
USING gist (point(lng, lat));

CREATE OR REPLACE FUNCTION public.rs_nearby_riders()
RETURNS SETOF public.locations
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = 'pg_catalog'
AS $$
  SELECT l.*
  FROM public.share_status AS s
  JOIN public.locations AS l ON point(l.lng, l.lat) <@ box(
    point(s.lng - 0.06, s.lat - 0.05), point(s.lng + 0.06, s.lat + 0.05))
  WHERE s.user_id = (SELECT auth.uid()) AND l.user_id <> s.user_id
    AND s.updated_at > now() - interval '60 seconds'
    AND l.updated_at > now() - interval '60 seconds'
    AND abs(s.lat - l.lat) < 0.05 AND abs(s.lng - l.lng) < 0.06
$$;

REVOKE ALL ON FUNCTION public.rs_nearby_riders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rs_nearby_riders() TO authenticated;
