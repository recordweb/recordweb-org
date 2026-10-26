"use strict";
const fs = require("fs");
const crypto = require("crypto");

function jcs(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  return "{" + Object.keys(v).sort()
    .map((k) => JSON.stringify(k) + ":" + jcs(v[k])).join(",") + "}";
}
const sha = (v) => "sha256:" +
  crypto.createHash("sha256").update(jcs(v).normalize("NFC"), "utf8").digest("hex");
const pick = (o, keys) =>
  Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

const file = process.argv[2];
const rec = JSON.parse(fs.readFileSync(file, "utf8"));
const ver = rec.payload[0];

for (const rep of ver.representations) {
  if ("content" in rep) rep.contentHash = sha(pick(rep, ["format", "content", "primary", "role"]));
}
ver.versionHash = sha(pick(ver, ["state", "parents", "createdAt", "modifiedAt", "representations", "issuance"]));
rec.metadata.core.schemaVersion = ver.versionHash;
rec.recordHash = sha(pick(rec, ["did", "payload", "metadata"]));

fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n");
console.log("contentHash:", ver.representations[0].contentHash);
console.log("versionHash:", ver.versionHash);
console.log("recordHash: ", rec.recordHash);