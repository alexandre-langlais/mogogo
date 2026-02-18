-- RPC get_user_stats : statistiques utilisateur pour le widget dashboard
CREATE OR REPLACE FUNCTION public.get_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_weekly_count int;
  v_top_theme text;
  v_total_sessions int;
  v_distinct_themes int;
  v_explorer_ratio int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'weekly_count', 0,
      'top_theme', null,
      'total_sessions', 0,
      'explorer_ratio', 0
    );
  END IF;

  -- Nombre de sessions cette semaine (lundi ISO)
  SELECT count(*)::int INTO v_weekly_count
  FROM sessions_history
  WHERE user_id = v_uid
    AND created_at >= date_trunc('week', now());

  -- Theme dominant sur 30 jours (premier tag)
  SELECT activity_tags[1] INTO v_top_theme
  FROM sessions_history
  WHERE user_id = v_uid
    AND created_at >= now() - interval '30 days'
    AND array_length(activity_tags, 1) > 0
  GROUP BY activity_tags[1]
  ORDER BY count(*) DESC
  LIMIT 1;

  -- Total de sessions
  SELECT count(*)::int INTO v_total_sessions
  FROM sessions_history
  WHERE user_id = v_uid;

  -- Ratio d'exploration : themes distincts / 14 themes total
  SELECT count(DISTINCT activity_tags[1])::int INTO v_distinct_themes
  FROM sessions_history
  WHERE user_id = v_uid
    AND array_length(activity_tags, 1) > 0;

  v_explorer_ratio := LEAST(v_distinct_themes * 100 / 14, 100);

  RETURN jsonb_build_object(
    'weekly_count', v_weekly_count,
    'top_theme', v_top_theme,
    'total_sessions', v_total_sessions,
    'explorer_ratio', v_explorer_ratio
  );
END;
$$;
