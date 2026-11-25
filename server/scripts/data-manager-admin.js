import {
  connectDatabases,
  closeDatabases,
} from "../src/config/database.js";

import {
  provisionDataManager,
  DataManagerAdminError,
} from "../src/services/data-manager-admin.service.js";

// =====================================
// COMMAND LINE ARGUMENTS
// =====================================

const [command, email, ...extra] =
  process.argv.slice(2);

// =====================================
// MAIN CLI FUNCTION
// =====================================

async function run() {
  if (
    command !== "provision" ||
    !email ||
    extra.length > 0
  ) {
    console.log(
      'Usage: node scripts/data-manager-admin.js provision "email@example.com"'
    );

    process.exitCode = 1;
    return;
  }

  try {
    await connectDatabases();

    const result =
      await provisionDataManager(email);

    console.log(
      "\n[SUCCESS]",
      JSON.stringify(result, null, 2)
    );

  } catch (error) {
    if (error instanceof DataManagerAdminError) {
      console.error(
        "[FAILED]",
        error.code,
        error.message
      );
    } else {
      console.error(
        "[FAILED] Data Manager provisioning could not be completed."
      );
    }

    process.exitCode = 1;

  } finally {
    await closeDatabases();
  }
}

run().catch(() => {
  console.error(
    "[FAILED] Administration command failed."
  );

  process.exitCode = 1;
});