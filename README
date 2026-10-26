# recordweb-org

Resolver and website for the **Record Web Trust Association (RWTA)** namespace, served at <https://recordweb.org>.

The repository holds the records of the RWTA namespace as plain JSON files, a small read-only HTTP service that serves them as an RWP DID resolver, the static website, and the tools used to hash, sign and verify records.

## What it does

- Serves DID documents and Records of the namespace `d2d14675-50c9-463d-b564-1ea50644c836` according to the RecordWeb Protocol ([RWP](https://recordweb.github.io/rwp/)).
- The Global Namespace Registry (GNR) entry of the namespace points to `https://recordweb.org/resolver/did`.
- Provides the entry page of recordweb.org and a viewer for the root SchemaRecord.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /health` | Health check (`{"status":"ok"}`) |
| `GET /resolver/did/{did}` | DID document (`application/did+ld+json`). `404` if unknown |
| `GET /resolver/records/{namespace}/{record-id}` | Record as JSON. `404` if unknown |
| `GET /` | Website (`site/index.html`) |
| `GET /root-schema` | Viewer: resolves the root SchemaRecord live through the endpoints above |

The resolver is read-only, needs no database and sends `Access-Control-Allow-Origin: *`. The RecordFinder calls `{resolverEndpoint}/{did}`, so the GNR endpoint is registered **without** a trailing slash.

## Repository layout

```
.
|-- server.js                  Express app: resolver endpoints and static site
|-- package.json
|-- Dockerfile
|-- docker-compose.yml         Joins the Docker network of the reverse proxy
|-- site/                      Static website (index.html, root-schema.html, assets/)
|-- data/
|   |-- did/<record-id>.json                       DID documents
|   `-- records/<namespace>/<record-id>.json       Records
|-- tools/
|   |-- lib.js                 Shared functions (canonical JSON, hashes, base58)
|   |-- hash.js                Calculates contentHash, versionHash, schemaVersion, recordHash
|   |-- keygen.js              Creates the Ed25519 key pair
|   |-- sign.js                Adds the Data Integrity proof to a Record
|   `-- verify.js              Verifies all files in data/ (also used in CI)
|-- docs/operations.md         Step-by-step procedures with all commands
`-- .github/workflows/deploy.yml   Verify, then deploy to the VPS
```

## Records in this repository

| Record | Record ID | `recordType` |
|---|---|---|
| Root SchemaRecord | `1710c421-bb2b-462e-ad6b-fc47c934c276` | itself |
| Agent SchemaRecord | `c25a00eb-552e-4696-bed7-69a0839ad460` | Root SchemaRecord |
| RWTA AgentRecord | `efd09e7b-5f65-4637-b06c-404a9da97f0b` | Agent SchemaRecord |

A DID has the form `did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:<record-id>`. The RWTA AgentRecord is its own `owner` and `controller`, because it is the first organisation in the namespace. All three records are signed with the same RWTA key.

## Conventions

These conventions apply to every record in this repository.

- Hash values in Record fields carry the prefix `sha256:` (`contentHash`, `versionHash`, `schemaVersion`, `recordHash`, `currentVersion`). Hash segments inside a DID are bare hex without the prefix.
- Canonical JSON is RFC 8785 (JCS). The prefix is part of the hashed data, so all implementations must use the same notation.
- `contentHash` = SHA-256 of `{format, content, primary, role}`.
- `versionHash` = SHA-256 of `{state, parents, createdAt, modifiedAt, representations[, issuance]}` (no `versionHash`, no `proof`).
- `recordHash` = SHA-256 of `{did, payload, metadata}` (includes the proofs). It is therefore calculated last.
- The proof is a Data Integrity proof (`eddsa-jcs-2022`) over the Version including `versionHash`, excluding `proof`. `created` equals `modifiedAt` of the Version.
- A Version has no `@context`, so the proof configuration has none either.
- The `verificationMethod` of every proof is the RWTA key in the DID document of the AgentRecord: `did:rwp:<namespace>:efd09e7b-5f65-4637-b06c-404a9da97f0b#key-1`.
- The `recordType` of a Record is the DID of its SchemaRecord, `schemaVersion` is the `versionHash` of that SchemaRecord. The root SchemaRecord refers to itself.
- `agentType` of AgentRecords uses the PROV-O names: `organization`, `person`, `softwareAgent`.

Several of these points are not yet fixed in the RWP draft. They are tracked in an RWP issue and may change with the next RWP version; records would then have to be recreated and re-signed.

## Deployment in short

1. A push to `main` runs `tools/verify.js` on all files in `data/`. Pull requests run the verification only.
2. If the verification passes, the workflow connects to the VPS over SSH, resets `/opt/recordweb-org` to `origin/main` and runs `docker compose up -d --build`.
3. `data/` is mounted read-only into the container. A change of data files needs no code change.

Traffic path: Cloudflare (TLS) -> Cloudflare Tunnel `poc-vps` -> `http://localhost:8081` on the VPS -> nginx container `poc-nginx` -> `http://recordweb-org:3000`. See [docs/operations.md](docs/operations.md) for the infrastructure details.

## What the verification checks

File names and locations, valid JSON, all hashes, all signatures against the public key in the DID document, `recordEndpoint` and `currentVersion` of each DID document, and that `schemaVersion` matches the SchemaRecord. It warns about finalized versions without proof and about references to records outside this repository.

It does **not** yet validate the payload content against the `jsonSchema` of the SchemaRecord.

## Security

The private key of the RWTA is never stored in this repository and is not needed on the server. See [docs/operations.md](docs/operations.md#2-the-private-key) for how to create, store and use it.
