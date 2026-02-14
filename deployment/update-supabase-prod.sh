supabase link --project-ref oihgbdkzfnwzbqzxnjwb
supabase db reset --linked
supabase db push --include-all
supabase secrets set --env-file deployment/.env.prod
supabase functions deploy llm-gateway --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt