# Supabase Database Setup Guide

## 📋 Prerequisites
- Access to your Supabase project dashboard
- Project URL: `https://yodwrmwzkghrpyuarhet.supabase.co`
- Node.js 18+ installed
- pnpm package manager

## 🚀 Quick Setup (Automated)

### Option 1: Full Automation (Recommended)
```bash
# One-time setup (first time only)
pnpm db:setup

# This will:
# 1. Install Supabase CLI
# 2. Login to Supabase (browser will open)
# 3. Link the project
# 4. Run all migrations
# 5. Generate TypeScript types
```

### Option 2: Step by Step Commands
```bash
# First time only - login and link
pnpm db:login          # Login to Supabase
pnpm db:link           # Link to project

# Run migrations
pnpm db:migrate        # Apply all migrations
pnpm db:types          # Generate TypeScript types

# Other useful commands
pnpm db:diff           # Check for schema differences
pnpm db:reset          # Reset database (DANGER!)
```

## 🚀 Manual Setup (Alternative)

### Step 1: Execute Migration Scripts

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Execute the following scripts in order:

#### 1️⃣ Create Profiles Table (001_create_profiles_table.sql)
- Copy the entire contents of `migrations/001_create_profiles_table.sql`
- Paste into SQL Editor
- Click **Run** button
- ✅ Expected result: "Success. No rows returned"

#### 2️⃣ Migrate Existing Users (002_migrate_existing_users.sql)
- Copy the entire contents of `migrations/002_migrate_existing_users.sql`
- Paste into SQL Editor
- Click **Run** button
- ✅ Expected result: Notice showing number of profiles created

### Step 2: Verify Setup

Run this verification query in SQL Editor:

```sql
-- Check if profiles table exists and has data
SELECT
  p.id,
  p.username,
  p.display_name,
  p.github_username,
  p.created_at,
  au.email
FROM public.profiles p
JOIN auth.users au ON p.id = au.id
ORDER BY p.created_at DESC;
```

You should see:
- Your existing user (Jinwoo Han) with profile data
- GitHub username and other metadata populated

### Step 3: Test Trigger (Optional)

To verify the trigger works for new users:

```sql
-- Check trigger exists
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

Expected output:
- `on_auth_user_created` trigger on auth.users table
- `on_profile_updated` trigger on profiles table

## 🔍 Troubleshooting

### If profiles table is not created:
1. Check for SQL syntax errors in the output
2. Ensure you have proper permissions
3. Try running the DROP statements first, then CREATE

### If existing users are not migrated:
1. Run the migration script again
2. Check if users exist in auth.users:
   ```sql
   SELECT id, email, created_at FROM auth.users;
   ```

### If trigger doesn't work for new signups:
1. Check trigger status:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```
2. Test manually:
   ```sql
   -- Manually create a profile for a user
   INSERT INTO public.profiles (id, username, display_name)
   SELECT id, email, email
   FROM auth.users
   WHERE id NOT IN (SELECT id FROM public.profiles);
   ```

## 📊 Database Schema

### profiles table structure:
- `id` (UUID) - Primary key, references auth.users(id)
- `username` (TEXT) - Unique username
- `display_name` (TEXT) - Display name
- `bio` (TEXT) - User biography
- `avatar_url` (TEXT) - Profile picture URL
- `github_username` (TEXT) - GitHub username
- `github_id` (TEXT) - GitHub user ID
- `created_at` (TIMESTAMPTZ) - Creation timestamp
- `updated_at` (TIMESTAMPTZ) - Last update timestamp

### Row Level Security (RLS):
- ✅ Everyone can view profiles
- ✅ Users can only update their own profile
- ✅ Users can only insert their own profile
- ❌ Direct deletion not allowed (only via cascade from auth.users)

## 🔐 Security Notes

1. The profiles table has RLS enabled
2. Foreign key constraint ensures data integrity
3. ON DELETE CASCADE ensures profiles are deleted when users are deleted
4. Triggers run with SECURITY DEFINER to ensure proper permissions

## 📝 Next Steps

After successful setup:
1. Restart your NestJS backend to pick up the new schema
2. Test the `/api/v1/auth/profile` endpoint
3. Verify profile data is returned with user authentication