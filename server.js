"use strict";
const fs = require("fs");
const path = require("path");
const express = require("express");

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

function sendJson(res, file, type) {
  fs.readFile(file, "utf8", (err, text) => {
    if (err) return res.status(404).json({ error: "not found" });
    res.type(type).send(text);
  });
}

app.get("/resolver/did/:did", (req, res) => {
  const parts = req.params.did.split(":");
  if (parts.length < 4 || parts[0] !== "did" || parts[1] !== "rwp") {
    return res.status(400).json({ error: "invalid did:rwp" });
  }
  const [ns, id] = [parts[2], parts[3]];
  if (!UUID.test(ns) || !UUID.test(id)) {
    return res.status(404).json({ error: "unknown DID" });
  }
  sendJson(res, path.join(DATA, "did", `${id}.json`), "application/did+ld+json");
});

app.get("/resolver/records/:ns/:id", (req, res) => {
  const { ns, id } = req.params;
  if (!UUID.test(ns) || !UUID.test(id)) {
    return res.status(404).json({ error: "unknown record" });
  }
  sendJson(res, path.join(DATA, "records", ns, `${id}.json`), "application/json");
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(express.static(path.join(__dirname, "site"), { extensions: ["html"] }));

app.listen(PORT, () => console.log(`recordweb.org on :${PORT}`));