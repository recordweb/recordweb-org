"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { jcs, sha, pick } = require("./lib");

const ROOT = path.resolve(process.argv[2] || "data");
const BASE = "https://recordweb.org/resolver";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

function db58(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("invalid base58 character");
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let zeros = 0;
  for (const c of s) { if (c === "1") zeros++; else break; }
  return Buffer.concat([Buffer.alloc(zeros), body]);
}
function keyFromMultibase(mb) {
  if (typeof mb !== "string" || !mb.startsWith("z")) throw new Error("not multibase base58btc");
  const raw = db58(mb.slice(1));
  if (raw.length !== 34 || raw[0] !== 0xed || raw[1] !== 0x01) throw new Error("not an Ed25519 multikey");
  return crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: raw.subarray(2).toString("base64url") },
    format: "jwk",
  });
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { err(path.relative(ROOT, file), "invalid JSON: " + e.message); return null; }
}
function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listJson(p) : [p];
  });
}

const records = new Map();
const didDocs = new Map();

for (const file of listJson(path.join(ROOT, "records"))) {
  const rel = path.relative(ROOT, file);
  const parts = rel.split(path.sep);
  if (parts.length !== 3 || !file.endsWith(".json") || file.endsWith(".json.json")) {
    err(rel, "expected records/<namespace>/<record-id>.json"); continue;
  }
  const ns = parts[1];
  const id = parts[2].slice(0, -5);
  if (!UUID.test(ns) || !UUID.test(id)) { err(rel, "namespace and record id must be lowercase UUIDv4"); continue; }
  const rec = readJson(file);
  if (rec) records.set(`${ns}:${id}`, { rel, ns, id, rec });
}
for (const file of listJson(path.join(ROOT, "did"))) {
  const rel = path.relative(ROOT, file);
  const name = path.basename(file);
  if (!name.endsWith(".json") || name.endsWith(".json.json") || !UUID.test(name.slice(0, -5))) {
    err(rel, "expected did/<record-id>.json"); continue;
  }
  const doc = readJson(file);
  if (doc) didDocs.set(name.slice(0, -5), { rel, doc });
}

function checkRecord({ rel, ns, id, rec }) {
  const did = `did:rwp:${ns}:${id}`;
  if (rec.did !== did) err(rel, `did is ${rec.did}, expected ${did}`);
  if (!Array.isArray(rec.payload) || rec.payload.length === 0) { err(rel, "payload must contain at least one version"); return; }

  rec.payload.forEach((ver, i) => {
    const at = `${rel} payload[${i}]`;
    for (const rep of ver.representations || []) {
      if ("content" in rep) {
        if (!HASH.test(rep.contentHash || "")) err(at, "contentHash missing or without sha256: prefix");
        else if (rep.contentHash !== sha(pick(rep, ["format", "content", "primary", "role"]))) err(at, "contentHash does not match content");
      }
    }
    const vh = sha(pick(ver, ["state", "parents", "createdAt", "modifiedAt", "representations", "issuance"]));
    if (ver.versionHash !== vh) err(at, `versionHash is ${ver.versionHash}, calculated ${vh}`);
    if (ver.state === "finalized" && (!Array.isArray(ver.proof) || ver.proof.length === 0)) warn(at, "finalized without proof");
    for (const proof of ver.proof || []) checkProof(at, ver, proof);
  });

  const rh = sha(pick(rec, ["did", "payload", "metadata"]));
  if (rec.recordHash !== rh) err(rel, `recordHash is ${rec.recordHash}, calculated ${rh}`);

  const core = (rec.metadata || {}).core || {};
  for (const f of ["recordType", "schemaVersion", "transit"]) if (!core[f]) err(rel, `metadata.core.${f} missing`);
  if (core.schemaVersion && !HASH.test(core.schemaVersion)) err(rel, "schemaVersion must be sha256:<64 hex>");
  const typeKey = (core.recordType || "").split(":").slice(2, 4).join(":");
  const typeRec = records.get(typeKey);
  if (typeRec) {
    const last = typeRec.rec.payload[typeRec.rec.payload.length - 1];
    if (core.schemaVersion !== last.versionHash) err(rel, "schemaVersion differs from versionHash of the SchemaRecord");
  } else warn(rel, "recordType is not in this repository, schemaVersion not checked");
  const owner = ((rec.metadata || {}).governance || {}).owner;
  if (owner && !records.get(owner.split(":").slice(2, 4).join(":"))) warn(rel, "owner is not in this repository");

  const dd = didDocs.get(id);
  if (!dd) { err(rel, `no DID document did/${id}.json`); return; }
  const doc = dd.doc;
  const last = rec.payload[rec.payload.length - 1];
  if (doc.id !== did) err(dd.rel, `id is ${doc.id}, expected ${did}`);
  if (doc.recordEndpoint !== `${BASE}/records/${ns}/${id}`) err(dd.rel, "recordEndpoint does not match the record path");
  if (doc.currentVersion !== last.versionHash) err(dd.rel, "currentVersion differs from versionHash of the last version");
  for (const vm of doc.verificationMethod || []) {
    try { keyFromMultibase(vm.publicKeyMultibase); }
    catch (e) { err(dd.rel, `verificationMethod ${vm.id}: ${e.message}`); }
  }
  if (!(doc.verificationMethod || []).length) err(dd.rel, "no verificationMethod");
}

function checkProof(at, ver, proof) {
  const need = ["type", "cryptosuite", "created", "verificationMethod", "proofPurpose", "proofValue"];
  for (const f of need) if (!proof[f]) { err(at, `proof.${f} missing`); return; }
  if (proof.type !== "DataIntegrityProof" || proof.cryptosuite !== "eddsa-jcs-2022" || proof.proofPurpose !== "assertionMethod") {
    err(at, "unsupported proof type, cryptosuite or purpose"); return;
  }
  const [vmDid] = proof.verificationMethod.split("#");
  const p = vmDid.split(":");
  const holder = didDocs.get(p[3]);
  if (!holder || p[0] !== "did" || p[1] !== "rwp") { warn(at, `verification method ${proof.verificationMethod} not in this repository, signature not checked`); return; }
  const vm = (holder.doc.verificationMethod || []).find((v) => v.id === proof.verificationMethod);
  if (!vm) { err(at, `verification method ${proof.verificationMethod} not found in ${holder.rel}`); return; }
  try {
    const key = keyFromMultibase(vm.publicKeyMultibase);
    const { proof: _p, ...unsecured } = ver;
    const cfg = pick(proof, ["type", "cryptosuite", "created", "verificationMethod", "proofPurpose"]);
    const h = (s) => crypto.createHash("sha256").update(s, "utf8").digest();
    const data = Buffer.concat([h(jcs(cfg)), h(jcs(unsecured))]);
    const sig = db58(proof.proofValue.slice(1));
    if (!crypto.verify(null, data, key, sig)) err(at, "signature is invalid");
  } catch (e) { err(at, "proof check failed: " + e.message); }
}

for (const entry of records.values()) checkRecord(entry);
for (const [id, { rel }] of didDocs) {
  if (![...records.values()].some((r) => r.id === id)) warn(rel, "DID document without record");
}

for (const w of warnings) console.log("WARN  " + w);
for (const e of errors) console.log("ERROR " + e);
console.log(`${records.size} records, ${didDocs.size} DID documents, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
