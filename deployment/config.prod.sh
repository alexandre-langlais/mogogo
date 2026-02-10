set -a; source deployment/.env.prod; set +a
supabase link --project-ref oihgbdkzfnwzbqzxnjwb --label production
supabase config push