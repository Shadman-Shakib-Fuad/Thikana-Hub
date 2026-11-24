import { MongoClient } from "mongodb";
import { env } from "./env.js";

const connectionOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 10000,
};

// Main database client
const mainClient = new MongoClient(
  env.MONGODB_URI,
  connectionOptions
);

// Separate audit database client
const auditClient = new MongoClient(
  env.AUDIT_MONGODB_URI,
  connectionOptions
);

// Database instances
const mainDB = mainClient.db(
  env.MONGODB_DB_NAME
);

const auditDB = auditClient.db(
  env.AUDIT_DB_NAME
);

// Connect both databases
export async function connectDatabases() {
  try {
    await Promise.all([
      mainClient.connect(),
      auditClient.connect(),
    ]);

    await checkDatabaseHealth();

    // Verify access to the intended collections
    await Promise.all([
      mainDB.collection("users").findOne(
        {},
        { projection: { _id: 1 } }
      ),

      auditDB.collection("audit_events").findOne(
        {},
        { projection: { _id: 1 } }
      ),
    ]);

    console.log(
      "[DATABASE] Main database connected successfully"
    );

    console.log(
      "[DATABASE] Audit database connected successfully"
    );

    console.log(
      "[DATABASE] Collection read access verified"
    );
  } catch (error) {
    await closeDatabases();
    throw error;
  }
}

// Get main database
export function getMainDB() {
  return mainDB;
}

// Get audit database
export function getAuditDB() {
  return auditDB;
}

// Check database connectivity
export async function checkDatabaseHealth() {
  await Promise.all([
    mainDB.command({ ping: 1 }),
    auditDB.command({ ping: 1 }),
  ]);

  return true;
}

// Close database connections safely
export async function closeDatabases() {
  await Promise.allSettled([
    mainClient.close(),
    auditClient.close(),
  ]);
}