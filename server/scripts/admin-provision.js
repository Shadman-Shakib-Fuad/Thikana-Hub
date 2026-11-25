import {
  connectDatabases,
  closeDatabases,
} from "../src/config/database.js";

import {
  provisionAdmin,
} from "../src/services/admin-provision.service.js";

async function run() {
  const [command, email] = process.argv.slice(2);

  if (command !== "provision" || !email) {
    throw new Error(
      "Usage: node scripts/admin-provision.js provision <email>"
    );
  }

  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Development environment required."
    );
  }

  try {
    await connectDatabases();

    const result = await provisionAdmin(email);

    console.log(
      "[SUCCESS]",
      JSON.stringify(result, null, 2)
    );
  } finally {
    await closeDatabases();
  }
}

run().catch(error => {
  console.error("[FAILED]", error.message);
  process.exitCode = 1;
});
