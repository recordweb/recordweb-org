"use strict";
const fs = require("fs");
const path = require("path");
const { sha, pick } = require("./lib");

const file = process.argv[2];
if (!file) { console.error("Usage: node hash.js <record.json>"); process.exit(1); }

const rec = JSON.parse(fs.readFileSync(file, "utf8"));
const ver = rec.payload[rec.payload.length - 1];

for (const rep of ver.representations) {
  if ("content" in rep) rep.contentHash = sha(pick(rep, ["format", "content", "primary", "role"]));
}
ver.versionHash = sha(pick(ver, ["state", "parents", "createdAt", "modifiedAt", "representations", "issuance"]));

const core = rec.metadata.core;
if (core.recordType === rec.did) {
  core.schemaVersion = ver.versionHash;
} else {
  const [ns, id] = core.recordType.split(":").slice(2, 4);
  const dir = path.dirname(path.resolve(file));
  const candidates = [path.join(dir, `${id}.json`), path.join(dir, "..", ns, `${id}.json`)];
  const typeFile = candidates.find((c) => fs.existsSync(c));
  if (typeFile) {
    const t = JSON.parse(fs.readFileSync(typeFile, "utf8"));
    core.schemaVersion = t.payload[t.payload.length - 1].versionHash;
  } else {
    console.warn("WARNING: SchemaRecord of recordType not found, schemaVersion left unchanged.");
  }
}

rec.recordHash = sha(pick(rec, ["did", "payload", "metadata"]));
fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n");
console.log("contentHash:  ", ver.representations[0].contentHash);
console.log("versionHash:  ", ver.versionHash);
console.log("schemaVersion:", core.schemaVersion);
console.log("recordHash:   ", rec.recordHash);