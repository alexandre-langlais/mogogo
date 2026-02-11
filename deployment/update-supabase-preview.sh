supabase link --project-ref onikkjpvrralafalzsdk
supabase db reset --linked
supabase db push --include-all
supabase secrets set --env-file deployment/.env.preview
supabase functions deploy llm-gateway --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt