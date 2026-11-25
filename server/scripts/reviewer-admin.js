import {
  connectDatabases,
  closeDatabases,
} from "../src/config/database.js";

import {
  provisionReviewer,
  assignReview,
} from "../src/services/reviewer-admin.service.js";

// =====================================
// COMMAND LINE USAGE
// =====================================

function showUsage() {
  console.log(`
ThikanaHub Reviewer Administration

Commands:

  node scripts/reviewer-admin.js provision <email>

  node scripts/reviewer-admin.js assign <jobId> <reviewerEmail>

Use only dedicated accounts and authorized review requests.
`);
}

// =====================================
// EXECUTE COMMAND
// =====================================

async function main() {
  const [command, ...args] =
    process.argv.slice(2);

  const valid =
    (command === "provision" && args.length === 1) ||
    (command === "assign" && args.length === 2);

  if (!valid) {
    showUsage();

    process.exitCode = 1;

    return;
  }

  try {
    await connectDatabases();

    let result;

    if (command === "provision") {
      result = await provisionReviewer(
        args[0]
      );
    }

    if (command === "assign") {
      result = await assignReview(
        args[0],
        args[1]
      );
    }

    console.log(
      "\n[SUCCESS]",
      JSON.stringify(result, null, 2)
    );

  } finally {
    await closeDatabases();
  }
}

main().catch((error) => {
  console.error(
    "[REVIEWER_ADMIN_ERROR]",
    error.code || error.name
  );

  console.error(
    error.message
  );

  process.exitCode = 1;
});