-- RiderSpot / 2026-11-23 / bounded lossless GPS checkpoint batches.
-- Raw Android SQLite GPS samples are unchanged. No data is truncated or deleted.
-- Existing clients upload no more than 120 points per checkpoint write.
alter table public.rider_trip_checkpoints
  add constraint rs_checkpoint_payload_v47
  check (
    first_seq >= 1
    and last_seq >= first_seq
    and jsonb_typeof(points) = 'array'
    and case
      when jsonb_typeof(points) = 'array'
        then jsonb_array_length(points) between 1 and 120
      else false
    end
    and pg_column_size(points) <= 65536
  ) not valid;
alter table public.rider_trip_checkpoints
  validate constraint rs_checkpoint_payload_v47;
