#!/usr/bin/env node

/**
 * Supabase Database Migration Automation Script
 * This script handles the entire Supabase setup and migration process
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Get from environment variables (loaded by dotenv-cli)
const PROJECT_REF = process.env.SUPABASE_PROJECT_ID || 'yodwrmwzkghrpyuarhet';
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://yodwrmwzkghrpyuarhet.supabase.co';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, silent = false) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    });
    return result;
  } catch (error) {
    if (!silent) {
      log(`Error executing: ${command}`, 'red');
      log(error.message, 'red');
    }
    return null;
  }
}

async function checkSupabaseCLI() {
  log('\n📦 Checking Supabase CLI...', 'cyan');

  const supabaseVersion = execCommand('npx supabase --version', true);

  if (!supabaseVersion) {
    log('Supabase CLI not found. Installing...', 'yellow');
    execCommand('npm install --save-dev supabase');
    log('✅ Supabase CLI installed', 'green');
  } else {
    log(`✅ Supabase CLI found: ${supabaseVersion.trim()}`, 'green');
  }
}

async function checkSupabaseProject() {
  log('\n🔍 Checking Supabase project configuration...', 'cyan');

  const configPath = path.join(
    process.cwd(),
    'supabase',
    '.temp',
    'project-ref',
  );

  if (fs.existsSync(configPath)) {
    const linkedProject = fs.readFileSync(configPath, 'utf-8').trim();
    if (linkedProject === PROJECT_REF) {
      log('✅ Project already linked', 'green');
      return true;
    }
  }

  log('Project not linked. Linking now...', 'yellow');
  execCommand(`npx supabase link --project-ref ${PROJECT_REF}`);
  log('✅ Project linked successfully', 'green');
  return true;
}

async function runMigrations() {
  log('\n🚀 Running database migrations...', 'cyan');

  const migrationsPath = path.join(process.cwd(), 'supabase', 'migrations');

  if (!fs.existsSync(migrationsPath)) {
    log('No migrations folder found. Creating...', 'yellow');
    fs.mkdirSync(migrationsPath, { recursive: true });
  }

  const migrations = fs
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (migrations.length === 0) {
    log('No migration files found', 'yellow');
    return;
  }

  log(`Found ${migrations.length} migration file(s):`, 'blue');
  migrations.forEach((file) => log(`  - ${file}`, 'blue'));

  log('\nPushing migrations to database...', 'cyan');
  const result = execCommand('npx supabase db push');

  if (result !== null) {
    log('✅ Migrations applied successfully!', 'green');
  }
}

async function generateTypes() {
  log('\n📝 Generating TypeScript types...', 'cyan');

  const result = execCommand(
    `npx supabase gen types typescript --project-id ${PROJECT_REF} > src/types/database.generated.ts`,
    true,
  );

  if (result !== null) {
    log('✅ TypeScript types generated', 'green');
  } else {
    log(
      '⚠️  Could not generate types. You may need to run this manually after authentication',
      'yellow',
    );
  }
}

async function showStatus() {
  log('\n📊 Database Status:', 'cyan');
  execCommand('npx supabase db diff --use-migra');
}

async function main() {
  log('\n🎯 Supabase Database Setup and Migration Tool', 'green');
  log('='.repeat(50), 'green');

  try {
    // Step 1: Check and install Supabase CLI
    await checkSupabaseCLI();

    // Step 2: Check if logged in
    log('\n🔐 Checking Supabase authentication...', 'cyan');
    const authCheck = execCommand('npx supabase projects list', true);

    if (!authCheck) {
      log('Not logged in to Supabase. Please login...', 'yellow');
      log('Opening browser for authentication...', 'blue');
      execCommand('npx supabase login');
    } else {
      log('✅ Already authenticated', 'green');
    }

    // Step 3: Link project
    await checkSupabaseProject();

    // Step 4: Run migrations
    await runMigrations();

    // Step 5: Generate types (optional, may fail without proper auth)
    await generateTypes();

    // Step 6: Show status
    await showStatus();

    log('\n✨ Setup complete!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Verify tables in Supabase Dashboard', 'blue');
    log('2. Restart your backend: pnpm dev', 'blue');
    log('3. Test the API endpoints', 'blue');
  } catch (error) {
    log('\n❌ Setup failed:', 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}
