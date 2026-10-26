"use strict";
const crypto = require("crypto");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = BigInt("0x" + (buf.toString("hex") || "0"));
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
}
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
function publicMultibase(publicKey) {
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  return "z" + b58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]));
}
module.exports = { b58, jcs, sha, pick, publicMultibase };