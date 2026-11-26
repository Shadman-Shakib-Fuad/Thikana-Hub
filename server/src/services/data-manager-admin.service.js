import { z } from "zod";

import { provisionDedicatedAccount } from "./operator-provision.service.js";

// =====================================
// EMAIL VALIDATION
// =====================================

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

// =====================================
// SERVICE ERROR CLASS
// =====================================

export class DataManagerAdminError extends Error {
  constructor(code, message) {
    super(message);

    this.name = "DataManagerAdminError";
    this.code = code;
  }
}

// =====================================
// DATA MANAGER PROVISIONING
// =====================================

export async function provisionDataManager(rawEmail) {
  if(process.env.NODE_ENV !== "development") throw new DataManagerAdminError("DEVELOPMENT_ONLY","Local provisioning is restricted to development.");
  const parsed=emailSchema.safeParse(rawEmail);
  if(!parsed.success)throw new DataManagerAdminError("INVALID_EMAIL","A valid account email is required.");
  try{return await provisionDedicatedAccount(parsed.data,"data_manager","DATA_MANAGER_PROVISION");}
  catch(e){throw new DataManagerAdminError(e.code??"PROVISION_FAILED",e.message);}
}
