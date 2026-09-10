-- READ ONLY structural fingerprint. No academic data, credentials, owners or sequence values.
-- Run with the default search_path (which does not include gradebook) on PostgreSQL 17.
-- MD5 is a drift checksum, not an authentication/security signature.
WITH relations AS (
  SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='gradebook' AND c.relkind='r'
), definitions AS (
  SELECT 'tables' AS kind,r.relname AS name,
    concat_ws('|',r.relname,r.relrowsecurity::text,r.relforcerowsecurity::text) AS definition
  FROM relations r
  UNION ALL
  SELECT 'columns',r.relname||'.'||a.attnum,
    concat_ws('|',r.relname,a.attnum::text,a.attname,format_type(a.atttypid,a.atttypmod),
      a.attnotnull::text,a.attidentity,coalesce(pg_get_expr(d.adbin,d.adrelid),''))
  FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  UNION ALL
  SELECT 'constraints',r.relname||'.'||c.conname,
    concat_ws('|',r.relname,c.conname,c.contype::text,pg_get_constraintdef(c.oid))
  FROM relations r JOIN pg_constraint c ON c.conrelid=r.oid
  UNION ALL
  SELECT 'indexes',indexname,indexdef FROM pg_indexes WHERE schemaname='gradebook'
  UNION ALL
  SELECT 'functions',p.proname,
    concat_ws('|',p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
      l.lanname,p.provolatile::text,p.prosecdef::text,p.proconfig::text,
      regexp_replace(btrim(p.prosrc),E'\\s+',' ','g'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='gradebook'
  UNION ALL
  SELECT 'triggers',t.tgname,pg_get_triggerdef(t.oid)
  FROM relations r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
)
SELECT kind,count(*)::integer AS count,
  md5(string_agg(definition,E'\n' ORDER BY name COLLATE "C")) AS fingerprint
FROM definitions GROUP BY kind ORDER BY kind;
