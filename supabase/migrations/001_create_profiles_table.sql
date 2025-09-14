-- Create profiles table with foreign key to auth.users
-- This table stores additional user information beyond authentication data

-- Drop existing objects if they exist (for re-running migration)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.profiles;

-- Create profiles table
CREATE TABLE public.profiles (
  -- Primary key that references auth.users
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,

  -- User profile information
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,

  -- GitHub specific information (populated from auth metadata)
  github_username TEXT,
  github_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on username for faster lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_github_username ON public.profiles(github_username);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.email),  -- Use GitHub username or email as default
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'user_name',  -- GitHub username
    NEW.raw_user_meta_data->>'provider_id',  -- GitHub user ID
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- Prevent errors if profile already exists

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to handle user updates
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET
    updated_at = NOW()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updating the updated_at timestamp
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- RLS Policies

-- Policy: Users can view all profiles (public profiles)
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Policy: Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Users can only insert their own profile (backup for trigger failure)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Users cannot delete profiles (only through cascade from auth.users)
-- No DELETE policy means no one can delete directly

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Add comment to table
COMMENT ON TABLE public.profiles IS 'User profile information extending auth.users';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id - primary key';
COMMENT ON COLUMN public.profiles.username IS 'Unique username for the application';
COMMENT ON COLUMN public.profiles.github_username IS 'GitHub username from OAuth provider';