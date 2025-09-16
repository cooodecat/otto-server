-- Create build_histories table for CodeBuild execution history
-- This table tracks individual build executions and is separate from the projects table
-- managed by the pipeline team
CREATE TABLE build_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL, -- References the project table managed by pipeline team
  aws_build_id TEXT UNIQUE NOT NULL, -- AWS CodeBuild build ID
  build_execution_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    build_execution_status IN ('pending', 'in_progress', 'succeeded', 'failed', 'stopped', 'timed_out', 'fault')
  ),
  build_spec JSONB NOT NULL, -- The buildspec used for this execution
  environment_variables JSONB, -- Environment variables passed to the build
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER, -- Build duration in seconds
  logs_url TEXT, -- CloudWatch logs URL
  build_error_message TEXT, -- Error message if build failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create build_execution_phases table for detailed phase information
CREATE TABLE build_execution_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_history_id UUID NOT NULL REFERENCES build_histories(id) ON DELETE CASCADE,
  phase_type TEXT NOT NULL, -- SUBMITTED, PROVISIONING, DOWNLOAD_SOURCE, etc.
  phase_status TEXT NOT NULL, -- SUCCEEDED, FAILED, IN_PROGRESS, etc.
  phase_start_time TIMESTAMP WITH TIME ZONE,
  phase_end_time TIMESTAMP WITH TIME ZONE,
  phase_duration_seconds INTEGER, -- Phase duration in seconds
  phase_context_message TEXT, -- Additional context or error message
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_build_histories_user_id ON build_histories(user_id);
CREATE INDEX idx_build_histories_project_id ON build_histories(project_id);
CREATE INDEX idx_build_histories_aws_build_id ON build_histories(aws_build_id);
CREATE INDEX idx_build_histories_status ON build_histories(build_execution_status);
CREATE INDEX idx_build_histories_created_at ON build_histories(created_at);
CREATE INDEX idx_build_execution_phases_build_history_id ON build_execution_phases(build_history_id);
CREATE INDEX idx_build_execution_phases_type ON build_execution_phases(phase_type);

-- Enable RLS
ALTER TABLE build_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_execution_phases ENABLE ROW LEVEL SECURITY;

-- RLS policies for build_histories table
CREATE POLICY "Users can view own build histories"
  ON build_histories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own build histories"
  ON build_histories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own build histories"
  ON build_histories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own build histories"
  ON build_histories FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for build_execution_phases table (inherit from build_histories table)
CREATE POLICY "Users can view own build execution phases"
  ON build_execution_phases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM build_histories
      WHERE build_histories.id = build_execution_phases.build_history_id
      AND build_histories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own build execution phases"
  ON build_execution_phases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM build_histories
      WHERE build_histories.id = build_execution_phases.build_history_id
      AND build_histories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own build execution phases"
  ON build_execution_phases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM build_histories
      WHERE build_histories.id = build_execution_phases.build_history_id
      AND build_histories.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own build execution phases"
  ON build_execution_phases FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM build_histories
      WHERE build_histories.id = build_execution_phases.build_history_id
      AND build_histories.user_id = auth.uid()
    )
  );

-- Create trigger for updating updated_at on build_histories table
CREATE OR REPLACE FUNCTION update_build_histories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_build_histories_updated_at
  BEFORE UPDATE ON build_histories
  FOR EACH ROW
  EXECUTE FUNCTION update_build_histories_updated_at();