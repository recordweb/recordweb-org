"use strict";
const fs = require("fs");
const crypto = require("crypto");
const { b58, jcs, sha, pick, publicMultibase } = require("./lib");

const [recordFile, keyFile, verificationMethod] = process.argv.slice(2);
if (!recordFile || !keyFile || !verificationMethod) {
  console.error("Usage: node sign.js <record.json> <private.pem> <verificationMethod DID URL>");
  process.exit(1);
}

const rec = JSON.parse(fs.readFileSync(recordFile, "utf8"));
const ver = rec.payload[rec.payload.length - 1];

for (const rep of ver.representations) {
  if ("content" in rep && rep.contentHash !== sha(pick(rep, ["format", "content", "primary", "role"]))) {
    console.error("contentHash does not match. Run hash.js first."); process.exit(1);
  }
}
const expected = sha(pick(ver, ["state", "parents", "createdAt", "modifiedAt", "representations", "issuance"]));
if (ver.versionHash !== expected) {
  console.error("versionHash does not match. Run hash.js first."); process.exit(1);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile));
const publicKey = crypto.createPublicKey(privateKey);

const { proof: _ignored, ...unsecured } = ver;
const proofConfig = {
  type: "DataIntegrityProof",
  cryptosuite: "eddsa-jcs-2022",
  created: ver.modifiedAt,
  verificationMethod,
  proofPurpose: "assertionMethod",
};
const h = (s) => crypto.createHash("sha256").update(s, "utf8").digest();
const hashData = Buffer.concat([h(jcs(proofConfig)), h(jcs(unsecured))]);

const signature = crypto.sign(null, hashData, privateKey);
if (!crypto.verify(null, hashData, publicKey, signature)) { console.error("Self-check failed."); process.exit(1); }

ver.proof = [{ ...proofConfig, proofValue: "z" + b58(signature) }];
rec.recordHash = sha(pick(rec, ["did", "payload", "metadata"]));

fs.writeFileSync(recordFile, JSON.stringify(rec, null, 2) + "\n");
console.log("publicKeyMultibase:", publicMultibase(publicKey));
console.log("proofValue:        ", ver.proof[0].proofValue);
console.log("recordHash:        ", rec.recordHash);