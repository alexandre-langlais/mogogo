supabase link --project-ref oihgbdkzfnwzbqzxnjwb
supabase db push
supabase secrets set --env-file deployment/.env.prod
supabase functions deploy llm-gateway --no-verify-jwt
