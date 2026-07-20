UPDATE public.mindmaps AS m
SET data = jsonb_set(
  m.data,
  '{nodes}',
  COALESCE(
    (
      SELECT jsonb_agg(node - 'image')
      FROM jsonb_array_elements(COALESCE(m.data->'nodes', '[]'::jsonb)) AS node
    ),
    '[]'::jsonb
  ),
  true
),
updated_at = now()
WHERE m.data::text LIKE '%"image":"data:image/%'
   OR m.data::text LIKE '%"image": "data:image/%';