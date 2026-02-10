set -a; source deployment/.env.preview; set +a
supabase link --project-ref onikkjpvrralafalzsdk --label preview
supabase config push