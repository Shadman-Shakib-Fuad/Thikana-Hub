import { z } from "zod";
import { provisionDedicatedAccount } from "./operator-provision.service.js";
export async function provisionAdmin(rawEmail,options={}){
 const email=z.string().trim().toLowerCase().email().max(254).parse(rawEmail);
 return provisionDedicatedAccount(email,"admin","ADMIN_PROVISION",options);
}
