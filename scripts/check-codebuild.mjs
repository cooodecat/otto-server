import { CodeBuildClient, BatchGetBuildsCommand } from "@aws-sdk/client-codebuild";

async function main() {
  const buildId = process.argv[2];
  if (!buildId) {
    console.error("Usage: node scripts/check-codebuild.mjs <codebuild-id>");
    process.exit(1);
  }

  const region = process.env.AWS_REGION || "ap-northeast-2";
  const client = new CodeBuildClient({ region });

  try {
    const resp = await client.send(new BatchGetBuildsCommand({ ids: [buildId] }));
    if (!resp.builds || resp.builds.length === 0) {
      console.error(`No build found for ID: ${buildId}`);
      process.exit(2);
    }

    const build = resp.builds[0];
    const out = {
      buildId: build.id,
      projectName: build.projectName,
      buildStatus: build.buildStatus,
      arn: build.arn,
      startTime: build.startTime,
      endTime: build.endTime,
      logs: {
        groupName: build.logs?.groupName,
        streamName: build.logs?.streamName,
        deepLink: build.logs?.deepLink,
      },
      sourceVersion: build.sourceVersion,
      environment: build.environment?.type,
      serviceRole: build.serviceRole,
      region,
    };

    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error("Error calling CodeBuild:", err?.name || err?.code || "UnknownError");
    console.error(err?.message || String(err));
    process.exit(3);
  }
}

await main();

