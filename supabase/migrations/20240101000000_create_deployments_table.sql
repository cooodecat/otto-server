-- Create deployments table for tracking CodeDeploy deployments
CREATE TABLE IF NOT EXISTS deployments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id VARCHAR(255) UNIQUE NOT NULL,
  build_id UUID REFERENCES builds(build_id),
  project_id VARCHAR(255) REFERENCES projects(project_id),
  user_id UUID REFERENCES auth.users(id),

  -- Deployment information
  deployment_name VARCHAR(255),
  environment VARCHAR(50) NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  status VARCHAR(50) NOT NULL,

  -- Configuration (stored as JSON)
  config JSONB,

  -- Results
  deployment_url TEXT,
  error_message TEXT,
  instance_ids TEXT[],

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Create indexes for better query performance
CREATE INDEX idx_deployments_build_id ON deployments(build_id);
CREATE INDEX idx_deployments_project_id ON deployments(project_id);
CREATE INDEX idx_deployments_user_id ON deployments(user_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_environment ON deployments(environment);
CREATE INDEX idx_deployments_created_at ON deployments(created_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_deployments_updated_at
  BEFORE UPDATE ON deployments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create deployment history view for easier querying
CREATE OR REPLACE VIEW deployment_history AS
SELECT
  d.id,
  d.deployment_id,
  d.deployment_name,
  d.environment,
  d.status,
  d.created_at,
  d.completed_at,
  d.error_message,
  b.build_id,
  b.build_number,
  b.build_status,
  p.project_id,
  p.project_name,
  u.email as user_email
FROM deployments d
LEFT JOIN builds b ON d.build_id = b.build_id
LEFT JOIN projects p ON d.project_id = p.project_id
LEFT JOIN auth.users u ON d.user_id = u.id
ORDER BY d.created_at DESC;

-- Add RLS (Row Level Security) policies
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own deployments
CREATE POLICY "Users can view own deployments"
  ON deployments FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own deployments
CREATE POLICY "Users can insert own deployments"
  ON deployments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own deployments
CREATE POLICY "Users can update own deployments"
  ON deployments FOR UPDATE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON deployments TO authenticated;
GRANT SELECT ON deployment_history TO authenticated;