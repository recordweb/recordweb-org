"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { publicMultibase } = require("./lib");

const dir = process.argv[2];
if (!dir) { console.error("Usage: node keygen.js <key-directory>"); process.exit(1); }
const file = path.join(dir, "rwta-ed25519-private.pem");
if (fs.existsSync(file)) { console.error("Key already exists: " + file); process.exit(1); }

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
console.log("Private key written to:", file);
console.log("publicKeyMultibase:", publicMultibase(publicKey));