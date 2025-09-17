const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yodwrmwzkghrpyuarhet.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZHdybXd6a2docnB5dWFyaGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3Njk1NDEsImV4cCI6MjA3MzM0NTU0MX0.Ek7So_WRpzg81lwuQ5tIb-dM6vgOTAA2aVYK2YOby64';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testProjects() {
  try {
    // 1. 모든 프로젝트 조회
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*');

    console.log('=== Projects in Database ===');
    if (error) {
      console.error('Error fetching projects:', error);
    } else {
      console.log('Total projects:', projects?.length || 0);
      if (projects && projects.length > 0) {
        console.log('\nProjects:');
        projects.forEach(p => {
          console.log(`- ${p.name} (ID: ${p.project_id}, User: ${p.user_id})`);
        });
      }
    }

    // 2. 사용자 조회
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('*');

    console.log('\n=== Users in Database ===');
    if (userError) {
      console.error('Error fetching users:', userError);
    } else {
      console.log('Total users:', users?.length || 0);
      if (users && users.length > 0) {
        console.log('\nUsers:');
        users.forEach(u => {
          console.log(`- ${u.username || u.email || 'Unknown'} (ID: ${u.id})`);
        });
      }
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testProjects();