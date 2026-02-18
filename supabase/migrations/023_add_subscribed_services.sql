-- Migration 023 : Ajouter les services d'abonnement streaming au profil utilisateur
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscribed_services text[] DEFAULT '{}';
