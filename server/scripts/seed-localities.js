import {
  connectDatabases,
  getMainDB,
  closeDatabases,
} from "../src/config/database.js";

import {
  starterLocalities,
} from "../data/localities.js";

async function seedLocalities() {
  if (!process.argv.includes("--approve-starter")) {
    console.error(
      "Review the starter records before approving import."
    );

    process.exitCode = 1;
    return;
  }

  try {
    await connectDatabases();

    const collection = getMainDB()
      .collection("localities");

    await collection.createIndex(
      { id: 1 },
      { unique: true }
    );

    await collection.createIndex({
      approved: 1,
      districtEn: 1,
    });

    const operations = starterLocalities.map(
      (locality) => ({
        updateOne: {
          filter: {
            id: locality.id,
          },

          update: {
            $setOnInsert: {
              ...locality,

              approved: true,

              datasetVersion: "starter-v1",

              createdAt: new Date(),
            },
          },

          upsert: true,
        },
      })
    );

    const result = await collection.bulkWrite(
      operations
    );

    console.log("============================");
    console.log("LOCALITY DATASET IMPORT");
    console.log("============================");

    console.log(
      "New localities:",
      result.upsertedCount
    );

    console.log(
      "Existing records:",
      result.matchedCount
    );

    console.log(
      "[SUCCESS] Dataset import completed"
    );

  } catch (error) {
    console.error(
      "[IMPORT_FAILED]",
      error.name
    );

    process.exitCode = 1;

  } finally {
    await closeDatabases();
  }
}

await seedLocalities();