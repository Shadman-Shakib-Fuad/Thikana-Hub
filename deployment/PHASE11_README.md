# ThikanaHub — Phase 11 master package

## 1. Local installation (existing Windows Git Bash project)

Stop existing frontend and backend processes, download the installer, and run from the frontend root:

```bash
cd "$HOME/Desktop/Vs Code/ThikanaHub/thikana-hub"
node "$HOME/Downloads/ThikanaHub_Phase11_Master_Installer.cjs" --check &&
node "$HOME/Downloads/ThikanaHub_Phase11_Master_Installer.cjs" --apply &&
npm run test:phase11
```

Use only the existing **development database**. The master runner starts and stops its own servers, uses the existing dependency versions and Chromium, and preserves rate limits. It runs crypto/matching unit tests, lint/build/TypeScript, 6 sharing browser/API test groups, the prior 8-group Admin browser suite, 8-group role security suite, 8-group Data Manager browser suite, and a same-origin production static build. Add `-- --extended` for three additional Admin API suites and the Reviewer browser suite. No .env, lockfile, dependency install, or hosting credentials are changed. If a step fails, stop and send the complete output. A partial run is not completion. If a test is interrupted use the existing cleanup script for the exact logged 16-character fixture marker only. Synthetic accounts and audit evidence are retained. Never run fixture scripts against production.

The share UI is in Merchant → Saved Addresses or History → Manage Address → Secure address sharing (confirmed only). Choose 15 minutes, one hour, or 24 hours, explicitly consent, then copy the link. Recipients can open the shared page without an account. The token is in a URL fragment and sent in a POST body rather than a path or query; the server stores only SHA-256 of a random 256-bit token. Anyone holding the link can view the original address and confirmed locality; forwarded links cannot be recalled. Owner can revoke a link or all links for the address. Edit, delete, suspension or security-version changes invalidate older links. No other address, user account, encrypted payload, candidate list, reviewer notes, or raw token is returned to a recipient. The UI does not persist tokens in localStorage. Share lists show up to 50 unexpired/unrevoked records; Revoke all covers every record for that address. TTL cleanup is asynchronous; access checks enforce expiry independently. In-flight access cannot be canceled retroactively.

## 2. Production deployment — operator checklist (not executed by the installer)

This is a single-host, single-replica Docker Compose + Caddy template. It serves the static Next.js export and API at one HTTPS origin, so Secure HttpOnly SameSite=Lax cookies work without cross-site cookie dependencies. Do not use an unrelated frontend/backend origin for this template. It assumes exactly one trusted TLS proxy; the app container must never be published directly to the internet. Do not add an extra CDN/proxy hop without revisiting trust-proxy configuration and testing real client IP handling. Existing in-memory limits are for one API replica; distributed limits and load tests are needed before scaling. A real domain, DNS, Docker/Compose host, firewall and two independent production DB connections are required. Do not deploy from a shared/public development DB. Only approved dataset records are imported; no development accounts, sessions, addresses, test records or audit logs are migrated into a fresh production system.

### Development-side reference dataset

Before deploying, review the approved locality names, aliases, source evidence and precision in Admin Dataset. Only export approved **public reference locality records**, not private addresses or user data:

```bash
cd "$HOME/Desktop/Vs Code/ThikanaHub/thikana-hub/server"
node scripts/production-dataset.js export ../deployment/reviewed-localities.json
```

This fails if schema, dataset size or existing output file is invalid; inspect the exported JSON and every source before using it. Excludes `BD-TEST-` records, but no automatic source checker can identify all synthetic/unreliable data. The starter data covers only a small area and does not establish nationwide accuracy.

### Production host setup (Linux shell, NOT Windows dev terminal)

1. Install Docker Engine and Compose plugin according to the host's supported setup. Transfer the source through a private repository or a secure source-only archive. Do not include `.env`, `.env.local`, `deployment/production.env`, node_modules, personal data or signing keys. Before using a private repository ensure `.gitignore` excludes `deployment/production.env`, `.env*`, backups, key files, and reviewed dataset files if not intended for source control.
2. Provision separate main/audit MongoDB databases, each with its own least-privilege credential. Restrict network access to the production host. Require TLS, rotate leaked credentials, disable broad IP access. Use Atlas/managed backup or encrypted operator-controlled backups. Do not paste credentials into ChatGPT, commit them, or print them. Choose distinct database names; keep dev and prod independent. The deployment environment should use a replica set or sharded cluster supporting transactions.
3. In the project root on the host, copy templates and restrict the env file:

```bash
cp deployment/production.env.example deployment/production.env
chmod 600 deployment/production.env
cp deployment/Caddyfile.example deployment/Caddyfile
```

Edit the two files locally. Set `CLIENT_URL` to the exact HTTPS origin (no trailing slash or path), replace domain in Caddyfile, configure both MongoDB URIs/names and a fresh 64-hex AES key generated using a cryptographic RNG for an empty database. For a restore, use the **original corresponding encryption key**. Never regenerate or replace a key for existing encrypted data. Keep the key in a separate protected secret store; Compose's env file is an operational secret, not a source artifact. Do not leave `ALLOW_ADMIN_BOOTSTRAP` in the permanent environment. Point DNS to the host, permit inbound 80/443 only for the reverse proxy, restrict SSH, and verify the application port 5000 is not exposed externally.

4. Build and start the production stack:

```bash
docker compose -f deployment/compose.yaml config --quiet
docker compose -f deployment/compose.yaml up -d --build
docker compose -f deployment/compose.yaml ps
```

Caddy obtains TLS certificates when DNS, ports and domain are correctly configured. Check readiness without printing secrets; `docker compose -f deployment/compose.yaml logs --tail 80 app` reports startup and safe errors. `node deployment/verify-live.mjs https://YOUR-REAL-DOMAIN` checks HTTPS pages, CSP, API health, anonymous Admin denial and origin enforcement. No certificate validation bypass is permitted. Docker images should be pinned to reviewed digests after the first validated build, and OS/dependency security updates tracked. `npm audit --omit=dev` in root and server separately is a useful network-based dependency check; review findings rather than using `npm audit fix --force` blindly.

5. Import only the reviewed JSON on a fresh, empty production locality collection (stop public application traffic while importing). From the project root:

```bash
docker compose -f deployment/compose.yaml run --rm --no-deps -v "$PWD/deployment/reviewed-localities.json:/tmp/reviewed-localities.json:ro" app node scripts/production-dataset.js import /tmp/reviewed-localities.json --approved-reviewed-dataset
```

The command requires production mode, explicit approval, consistent dataset version/precision and an empty collection. It is not an overwrite or general restore tool. Verify locality count and manual matching with reviewed records.

6. Register a dedicated, brand-new Admin candidate account in the production web UI. Use a unique long password; sign out and ensure the candidate owns no addresses. Restrict public access during bootstrap. From the host only, run this with the dedicated account email, replacing the placeholder:

```bash
docker compose -f deployment/compose.yaml run --rm --no-deps -e ALLOW_ADMIN_BOOTSTRAP=1 app node scripts/admin-provision.js provision 'ADMIN-ACCOUNT-EMAIL' --production-bootstrap
```

This is a local operator command, not an HTTP endpoint. It uses a transaction, revokes old sessions and sets a new security version. The flag is temporary and must never be set in the running service. Re-login to the web UI; verify `auditRecorded` is true. Reviewer and Data Manager can then be promoted through the Admin portal. Operator reviewer and data manager provisioning remain dev-only. Do not grant untrusted shell access to the host.

7. Production acceptance: In a clean browser test real HTTPS login, HttpOnly/Secure/SameSite cookie attributes, role navigation, a consented synthetic address share and revocation, unauthorized requests, dataset workflow and account security. Check console for CSP violations/hydration errors, access logs for absence of tokens/passwords/full addresses, audit DB records, static export navigation, TLS renewal, and mobile viewport. Production CSP is generated from static page inline-script hashes; it must be validated against the deployed browser build, not assumed correct from unit tests. Restrict any test data to consented synthetic samples and clean them up carefully. Do not run the destructive development fixture suite on production. Public launch is conditional on passing these checks.

## 3. Backup and disaster recovery runbook

Proposed baseline: encrypted daily snapshots retained for 30 days; audit records retained 180 days unless project/legal needs require another period. This is a proposed operating policy, not automatic data deletion. Configure schedule/retention/access on the chosen hosting/database plan; if managed snapshots are unavailable, use an approved encrypted database backup procedure with MongoDB Database Tools and separate backup encryption keys. Never create unencrypted plaintext archives of private records. Back up main and audit separately, document capture times (not a single cross-DB snapshot), and preserve application AES keys in a separate restricted secret store. Use restricted operator credentials and encrypted transport. Restrict backups and key access, test restoration into isolated staging databases with distinct names and restricted network, disable public endpoints and do not reuse staging as production. Validate counts, indexes, random encrypted address decryptions using the matching key, approval data and audit continuity. Before exposing a restored system, invalidate restored sessions and share capabilities (staging/operator-approved controlled maintenance only). Record recovery point/time and compare to targets; do not claim RPO/RTO until measured. Do not use destructive restore flags against a live database. Keep previous validated application image and compatible encrypted backup before deployment; if rollback requires schema changes or data loss, stop and review with operator. Main/audit final write failure is not atomically recoverable across independent DB clients; reconcile started/unconfirmed events by request ID.

## 4. SRS traceability and limitations

| SRS | Evidence / remaining acceptance |
|---|---|
| FR-01–13, FR-16 | Existing phases implemented and tested in development; Phase 11 reruns selected regression flows. Not an exhaustive proof of every input and workflow. |
| FR-14, SEC-25/26 | New one-address capability, hash-only storage, limited lifetime, explicit revocation, edit and owner-security version invalidation. Local browser/API test required. |
| FR-15, MOB requirements | Responsive web tested previously; Android, bundled offline shell, mobile auth and signed APK remain Phase 12. |
| SEC-01–14, SEC-28–34 | Existing validation/auth/RBAC/session/error handling; hardened CLI transaction and added tests. No password-change UI currently; in-flight requests are not universally canceled. |
| SEC-15/16, SEC-23/24/27 | AES-GCM, fresh nonce, AAD and secret separation. Unit tests verify key/owner/ciphertext/tag/nonce rejection. Android signing separate in Phase 12. |
| SEC-17/40 | Backup and audit retention runbook provided; actual encrypted backups, schedule and restore drill must be configured and evidenced by operator. |
| SEC-18/19 | HTTPS single-origin deployment configuration; live certificate, proxy and cookie/browser smoke tests still required. |
| SEC-20–22, SEC-35–39 | Explicit projections, private data decryption on server, separate audit DB, no raw token logging in app. Infrastructure log configuration and permissions must be reviewed. |

The matching engine remains rule-based, uses approved reference records, improves division-aware context and avoids repeating the same edit distance calculation. It always requires user confirmation for suggestions. Synthetic test coverage is not evidence of a measured nationwide accuracy percentage. Existing MAX_LOCALITIES=1000 stays in place; actual load testing, indexed retrieval beyond that scale and larger verified dataset are future work. No automatic key rotation, password reset, MFA, distributed rate limiting, or external security certification is added. Final production completion requires real hosting and backup acceptance. The ZIP contains changed/new files only; not a replacement for the full source repository.
