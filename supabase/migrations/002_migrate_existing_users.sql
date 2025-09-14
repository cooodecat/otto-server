-- Migrate existing users to profiles table
-- This script creates profile entries for users who signed up before the profiles table existed

-- Create profiles for existing users who don't have one
INSERT INTO public.profiles (
  id,
  username,
  display_name,
  avatar_url,
  github_username,
  github_id,
  created_at,
  updated_at
)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'user_name', au.email) as username,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    au.email
  ) as display_name,
  au.raw_user_meta_data->>'avatar_url' as avatar_url,
  au.raw_user_meta_data->>'user_name' as github_username,
  au.raw_user_meta_data->>'provider_id' as github_id,
  au.created_at,
  NOW() as updated_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;  -- Only insert if profile doesn't exist

-- Log the migration results
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM public.profiles
  WHERE created_at >= NOW() - INTERVAL '1 minute';

  RAISE NOTICE 'Migration completed. % profile(s) created.', migrated_count;
END $$;