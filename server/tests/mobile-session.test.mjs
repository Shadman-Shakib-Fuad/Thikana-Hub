import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MOBILE_ORIGIN, getRequestSessionHash, hashTokenForTransport } from "../src/utils/mobile-auth.js";

const WEBSITE = "https://example.com";
const COOKIE = "thikanahub_session";
const TOKEN = "b".repeat(64);
const webHash = createHash("sha256").update(TOKEN).digest("hex");
const mobileHash = createHash("sha256").update(`mobile:${TOKEN}`).digest("hex");
function req(origin, authorization, cookie) {
  const headers = { Origin: origin, Authorization: authorization, Cookie: cookie === undefined ? undefined : `${COOKIE}=${cookie}` };
  return { get: (key) => headers[key], cookies: cookie === undefined ? {} : { [COOKIE]: cookie } };
}
function hash(request, enabled = true) {
  return getRequestSessionHash(request, COOKIE, WEBSITE, enabled);
}
test("existing website cookie hash preserved with mobile off and on", () => {
  for (const enabled of [false, true]) {
    assert.equal(hash(req(WEBSITE, undefined, TOKEN), enabled), webHash);
    assert.equal(hash(req(undefined, undefined, TOKEN), enabled), webHash);
  }
});
test("mobile bearer hashes to a different session key", () => {
  assert.equal(hash(req(MOBILE_ORIGIN, `Bearer ${TOKEN}`)), mobileHash);
  assert.notEqual(mobileHash, webHash);
  assert.equal(hashTokenForTransport(TOKEN, "mobile"), mobileHash);
  assert.equal(hashTokenForTransport(TOKEN), webHash);
});
test("mobile disabled rejects bearer", () => {
  assert.equal(hash(req(MOBILE_ORIGIN, `Bearer ${TOKEN}`), false), null);
});
test("mobile cookie or mixed credentials rejected", () => {
  assert.equal(hash(req(MOBILE_ORIGIN, undefined, TOKEN)), null);
  assert.equal(hash(req(MOBILE_ORIGIN, `Bearer ${TOKEN}`, TOKEN)), null);
});
test("bearer outside mobile origin does not authenticate", () => {
  for (const origin of [undefined, WEBSITE, "https://evil.example", "null"]) {
    assert.equal(hash(req(origin, `Bearer ${TOKEN}`)), null);
    assert.equal(hash(req(origin, `Bearer ${TOKEN}`, TOKEN)), null);
  }
});
test("missing or malformed mobile token rejected", () => {
  for (const token of [undefined, "Bearer bad", `Bearer ${TOKEN} `]) {
    assert.equal(hash(req(MOBILE_ORIGIN, token)), null);
  }
});
test("missing or malformed website cookie rejected", () => {
  assert.equal(hash(req(WEBSITE)), null);
  assert.equal(hash(req(WEBSITE, undefined, "bad")), null);
});
test("invalid session transport rejected", () => {
  assert.throws(() => hashTokenForTransport(TOKEN, "unknown"), TypeError);
});
