import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import express from "express";
import { env } from "./env.js";
import { isTrustedOrigin } from "../utils/mobile-auth.js";

const prod=env.NODE_ENV==="production";
// The app must be reachable only through a trusted TLS reverse proxy.
// Exactly one hop is supported by this deployment template.
export function configureProductionSecurity(app){
 if(!prod)return;
 const mode=process.env.THIKANAHUB_WEB_MODE||"static";
 if(!["static","api-only"].includes(mode))throw new Error("Invalid THIKANAHUB_WEB_MODE. Use static or api-only.");
 const origin=new URL(env.CLIENT_URL);
 if(origin.protocol!=="https:"||origin.origin!==env.CLIENT_URL||origin.username||origin.password)throw new Error("Production CLIENT_URL must be an exact HTTPS origin.");
 if(process.env.TRUST_PROXY_HOPS!=="1")throw new Error("Production requires an explicitly configured single trusted proxy (TRUST_PROXY_HOPS=1).");
 app.set("trust proxy",1);
 app.use((req,res,next)=>{
  // Internal platform health probe is the sole HTTP exception. No private data.
  if(!req.secure&&!(req.method==="GET"&&req.path==="/api/v1/health"))return res.status(400).json({success:false,code:"HTTPS_REQUIRED",message:"HTTPS is required."});
  if(req.path.startsWith("/api/")){
   res.setHeader("Cache-Control","no-store");
   if(!["GET","HEAD","OPTIONS"].includes(req.method)&&!isTrustedOrigin(req, env.CLIENT_URL, env.MOBILE_AUTH_ENABLED))return res.status(403).json({success:false,code:"UNTRUSTED_ORIGIN",message:"Request origin is not allowed."});
  }
  next();
 });
}
export function mountProductionWeb(app){
 if(!prod)return;
 if(process.env.THIKANAHUB_WEB_MODE==="api-only"){
  console.log("[PRODUCTION] API-only hosting; frontend served separately.");
  return;
 }
 const root=path.resolve(process.env.STATIC_WEB_DIR||"../out");
 if(!fs.existsSync(path.join(root,"index.html")))throw new Error("Production static frontend missing. Build it with NEXT_PUBLIC_API_URL=/api/v1 first.");
 // Static Next export contains inline hydration scripts. Hash the exact trusted
 // build output instead of globally enabling unsafe-inline for JavaScript.
 const htmlPolicy=new Map();
 function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(entry.isFile()&&entry.name.endsWith(".html")){
  const html=fs.readFileSync(file,"utf8");const hashes=new Set();
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(!/\bsrc\s*=/i.test(match[1])&&match[2])hashes.add(`'sha256-${createHash("sha256").update(match[2].replace(/\r\n?/g,"\n")).digest("base64")}'`);}
  const policy=`default-src 'self'; script-src 'self' ${[...hashes].join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`;
  // Fail at startup rather than serving a CSP header too big for common proxies.
  if(Buffer.byteLength(policy)>24000)throw new Error("Static page CSP too large; review proxy header limits before deployment.");
  htmlPolicy.set(file,policy);
 }}}
 scan(root);
 const staticWeb=express.static(root,{index:"index.html",dotfiles:"deny",setHeaders(res,file){
  if(htmlPolicy.has(file)){res.setHeader("Content-Security-Policy",htmlPolicy.get(file));res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");}
  else if(file.includes(`${path.sep}_next${path.sep}static${path.sep}`))res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  else res.setHeader("Cache-Control","no-cache");
 }});
 app.use((req,res,next)=>{if(req.path==="/api"||req.path.startsWith("/api/"))return next();return staticWeb(req,res,next);});
}
