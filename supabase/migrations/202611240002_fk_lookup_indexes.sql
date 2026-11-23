-- Short lock and execution budgets keep this migration retryable on a busy database.
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '3s';
CREATE INDEX IF NOT EXISTS rider_auto_deliveries_earning_id_lookup_idx ON public.rider_auto_deliveries (earning_id);
CREATE INDEX IF NOT EXISTS rider_places_user_id_lookup_idx ON public.rider_places (user_id);
CREATE INDEX IF NOT EXISTS rider_recurring_expenses_user_id_lookup_idx ON public.rider_recurring_expenses (user_id);
CREATE INDEX IF NOT EXISTS road_reports_user_id_lookup_idx ON public.road_reports (user_id);
CREATE INDEX IF NOT EXISTS sos_replies_user_id_lookup_idx ON public.sos_replies (user_id);
CREATE INDEX IF NOT EXISTS sos_requests_user_id_lookup_idx ON public.sos_requests (user_id);
