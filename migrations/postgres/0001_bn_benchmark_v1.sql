CREATE SCHEMA IF NOT EXISTS bn_benchmark;

CREATE TABLE IF NOT EXISTS bn_benchmark.streams (
  benchmark_id TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  current_version INTEGER NOT NULL CHECK (current_version > 0),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (benchmark_id, stream_key)
);

CREATE TABLE IF NOT EXISTS bn_benchmark.versions (
  benchmark_id TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  payload JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (benchmark_id, stream_key, version),
  FOREIGN KEY (benchmark_id, stream_key)
    REFERENCES bn_benchmark.streams (benchmark_id, stream_key)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS bn_benchmark_versions_lookup_v1
  ON bn_benchmark.versions (benchmark_id, stream_key, version DESC);

CREATE OR REPLACE FUNCTION bn_benchmark.apply_snapshot(
  p_benchmark_id TEXT,
  p_snapshot JSONB
)
RETURNS TABLE(total INTEGER, changed INTEGER, unchanged INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = bn_benchmark, pg_temp
AS $$
DECLARE
  v_total INTEGER;
  v_distinct INTEGER;
  v_changed INTEGER;
BEGIN
  IF p_benchmark_id IS NULL OR btrim(p_benchmark_id) = '' THEN
    RAISE EXCEPTION 'benchmark_id_required';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'array' THEN
    RAISE EXCEPTION 'snapshot_array_required';
  END IF;

  SELECT count(*), count(DISTINCT item->>'stream_key')
    INTO v_total, v_distinct
  FROM jsonb_array_elements(p_snapshot) AS item;

  IF v_total <> v_distinct THEN
    RAISE EXCEPTION 'duplicate_stream_key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_snapshot) AS item
    WHERE coalesce(item->>'stream_key', '') = ''
       OR coalesce(item->>'payload_hash', '') !~ '^[0-9a-f]{64}$'
       OR item->'payload' IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_snapshot_item';
  END IF;

  WITH incoming AS (
    SELECT
      item->>'stream_key' AS stream_key,
      item->>'payload_hash' AS payload_hash,
      item->'payload' AS payload
    FROM jsonb_array_elements(p_snapshot) AS item
  ),
  upserted AS (
    INSERT INTO bn_benchmark.streams (
      benchmark_id, stream_key, current_version, payload_hash, updated_at
    )
    SELECT p_benchmark_id, i.stream_key, 1, i.payload_hash, clock_timestamp()
    FROM incoming i
    ON CONFLICT (benchmark_id, stream_key) DO UPDATE
      SET current_version = bn_benchmark.streams.current_version + 1,
          payload_hash = excluded.payload_hash,
          updated_at = clock_timestamp()
      WHERE bn_benchmark.streams.payload_hash IS DISTINCT FROM excluded.payload_hash
    RETURNING stream_key, current_version, payload_hash
  ),
  versioned AS (
    INSERT INTO bn_benchmark.versions (
      benchmark_id, stream_key, version, payload_hash, payload, recorded_at
    )
    SELECT
      p_benchmark_id,
      u.stream_key,
      u.current_version,
      u.payload_hash,
      i.payload,
      clock_timestamp()
    FROM upserted u
    JOIN incoming i USING (stream_key)
    RETURNING 1
  )
  SELECT count(*) INTO v_changed FROM versioned;

  RETURN QUERY SELECT v_total, v_changed, v_total - v_changed;
END;
$$;

CREATE OR REPLACE FUNCTION bn_benchmark.reset(p_benchmark_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = bn_benchmark, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM bn_benchmark.streams WHERE benchmark_id = p_benchmark_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON SCHEMA bn_benchmark FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA bn_benchmark FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bn_benchmark FROM PUBLIC;
