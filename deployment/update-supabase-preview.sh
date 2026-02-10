supabase link --project-ref onikkjpvrralafalzsdk --label preview
supabase db push
supabase secrets set --env-file deployment/.env.preview
supabase functions deploy llm-gateway --no-verify-jwt