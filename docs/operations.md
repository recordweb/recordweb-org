# Operations guide

All commands run with Docker only. Node.js does not have to be installed on the VPS or on your computer.

## 1. Preparation

Work in a clone of the repository, not in `/opt/recordweb-org` (the deployment resets that directory with `git reset --hard`).

```bash
git clone https://github.com/recordweb/recordweb-org.git ~/work/recordweb-org
cd ~/work/recordweb-org
git checkout -b my-change
```

Add this helper to `~/.bashrc` (then run `source ~/.bashrc`). It starts a temporary Node container, mounts the repository at `/work` and the key directory read-only at `/keys`:

```bash
rwnode() {
  docker run --rm --user "$(id -u):$(id -g)" \
    -v "$PWD":/work -v "$HOME/rwta-keys":/keys:ro -w /work \
    node:24-alpine node "$@"
}
```

Create a new UUIDv4 (for namespace or record IDs):

```bash
docker run --rm alpine cat /proc/sys/kernel/random/uuid
```

Create a UTC timestamp:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
```

## 2. The private key

The RWTA signs every record with one Ed25519 key pair.

**Where the key lives.** In `~/rwta-keys/rwta-ed25519-private.pem` on the machine where you sign, directory mode `700`, file mode `600`. It must never be inside a Git working copy, never be committed and never be copied to the server that runs the resolver. The resolver does not need it. The `.gitignore` of the repository excludes `*.pem` as a safety net.

**Backup.** Keep an offline copy (for example in the password manager). If the key is lost, nothing can be signed any more. If it leaks, anyone can sign in the name of the RWTA. The key in the DID document cannot be replaced according to the current RWP draft, so there is no rotation.

**Create it (once).** Create the directory first. Otherwise Docker creates it with root ownership.

```bash
mkdir -p ~/rwta-keys && chmod 700 ~/rwta-keys
cd ~/work/recordweb-org
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/tools":/tools -v "$HOME/rwta-keys":/keys \
  node:24-alpine node /tools/keygen.js /keys
```

The script refuses to overwrite an existing key. It prints the `publicKeyMultibase` (starts with `z6Mk`). The public key of the RWTA is currently:

```
z6MkpgYzzH9AJJTnsYYMEaaVPZN2t2iCsz76ShftvkBt5jpP
```

It is entered as `publicKeyMultibase` in every DID document in `data/did/`.

**Use it.** Only `tools/sign.js` reads the key (see section 3, step 6). Nothing else in the repository uses it.

**Remove it from the server.** After signing you can delete `~/rwta-keys` from the VPS, as long as the offline copy exists.

## 3. Add a new record

Example: a new Record of an existing Record type. Replace the placeholders in angle brackets.

1. **Choose the type.** Take the DID of the SchemaRecord that defines the type (for instance the Agent SchemaRecord `c25a00eb-552e-4696-bed7-69a0839ad460`). Its record file must be in the repository.

2. **Create the ID** (section 1) and the file `data/records/d2d14675-50c9-463d-b564-1ea50644c836/<record-id>.json`:

```json
{
  "did": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:<record-id>",
  "payload": [
    {
      "versionHash": "",
      "state": "finalized",
      "parents": [],
      "createdAt": "<timestamp>",
      "modifiedAt": "<same timestamp>",
      "proof": [],
      "representations": [
        {
          "format": "application/json",
          "content": { },
          "contentHash": "",
          "primary": true,
          "role": "source"
        }
      ]
    }
  ],
  "metadata": {
    "core": {
      "recordType": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:<schema-record-id>",
      "schemaVersion": "",
      "transit": "internal"
    },
    "governance": {
      "owner": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:efd09e7b-5f65-4637-b06c-404a9da97f0b",
      "classification": "public"
    },
    "extensions": []
  },
  "recordHash": ""
}
```

Put the payload in `content`. It has to conform to the `jsonSchema` of the SchemaRecord. The verification does not check this yet, so validate it yourself.

3. **Calculate the hashes.** This fills `contentHash`, `versionHash`, `schemaVersion` (taken from the SchemaRecord file) and `recordHash`:

```bash
rwnode tools/hash.js data/records/d2d14675-50c9-463d-b564-1ea50644c836/<record-id>.json
```

4. **Create the DID document** `data/did/<record-id>.json`. `currentVersion` is the `versionHash` printed in step 3, `created` and `updated` are the `createdAt` of the Version:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:<record-id>",
  "recordEndpoint": "https://recordweb.org/resolver/records/d2d14675-50c9-463d-b564-1ea50644c836/<record-id>",
  "created": "<createdAt>",
  "updated": "<createdAt>",
  "currentVersion": "sha256:<versionHash>",
  "controller": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:efd09e7b-5f65-4637-b06c-404a9da97f0b",
  "verificationMethod": [
    {
      "id": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:<record-id>#key-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:efd09e7b-5f65-4637-b06c-404a9da97f0b",
      "publicKeyMultibase": "z6MkpgYzzH9AJJTnsYYMEaaVPZN2t2iCsz76ShftvkBt5jpP"
    }
  ]
}
```

Per the current RWP draft, only `recordEndpoint`, `updated` and `currentVersion` of a DID document may change later. `controller` and the key are permanent.

5. **Check without signature (optional).** `rwnode tools/verify.js data` reports a warning for the missing proof, but no errors.

6. **Sign.** Needs the private key in `~/rwta-keys`. The last argument is the key in the DID document of the AgentRecord:

```bash
rwnode tools/sign.js data/records/d2d14675-50c9-463d-b564-1ea50644c836/<record-id>.json \
  /keys/rwta-ed25519-private.pem \
  "did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:efd09e7b-5f65-4637-b06c-404a9da97f0b#key-1"
```

`sign.js` stops if `contentHash` or `versionHash` does not match the content. It writes the `proof` into the file and recalculates `recordHash`. The signature is deterministic: running it again gives the same result.

7. **Verify everything:**

```bash
rwnode tools/verify.js data
```

Expect `0 errors`. Warnings are explained in the README.

8. **Publish.**

```bash
git add data
git commit -m "Add record <record-id>"
git push -u origin my-change
```

Open a pull request. The workflow runs the verification. After the merge to `main` the workflow deploys.

9. **Check the live result:**

```bash
curl -s https://recordweb.org/resolver/did/did:rwp:d2d14675-50c9-463d-b564-1ea50644c836:<record-id>
curl -s https://recordweb.org/resolver/records/d2d14675-50c9-463d-b564-1ea50644c836/<record-id> | grep -E '"recordHash"|"proofValue"'
```

The `recordHash` must equal the value printed in step 3 or 6. The RecordFinder resolves the record when the GNR entry exists.

**Rules**

- Never edit a record after signing. After any change, run `hash.js` and `sign.js` again (in this order).
- Never edit a finalized Version. A correction is a new Version of the same record (see section 4).
- File names are `<uuid>.json` in lower case. A double extension `.json.json` does not resolve.

## 4. New version of an existing record

This has not yet been exercised in this repository. The procedure follows the RWP draft:

1. Add a new object to the `payload` array of the record. `parents` contains the `versionHash` of the superseded Version. `createdAt` and `modifiedAt` are new.
2. Run `hash.js` and `sign.js` on the file. Both work on the last Version in `payload`.
3. In the DID document change only `currentVersion` (the new `versionHash`) and `updated`.
4. Run `verify.js`, push, check the live result.

If the record is a SchemaRecord, the new Version must contain `previousSchemaVersion`. Records of the type have to refer to the new schema version in their own `schemaVersion` when they are updated.

## 5. Infrastructure reference

The infrastructure is not part of this repository. This section records how it is set up.

**Docker.** `docker-compose.yml` publishes no port. The container `recordweb-org` joins the external Docker network that `poc-nginx` is in (the network name is set in the compose file). `data/` is mounted read-only at `/app/data`.

**nginx.** In the configuration of `poc-nginx` (`default.conf`):

```nginx
server {
    listen 80;
    server_name recordweb.org www.recordweb.org;

    location / {
        proxy_pass http://recordweb-org:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After a change: `docker exec poc-nginx nginx -t` and `docker exec poc-nginx nginx -s reload`.

**Port of poc-nginx.** `poc-nginx` publishes `127.0.0.1:8081:80` in its own compose file. Port 80 of the VPS belongs to another nginx container (`tws-nginx`).

**Cloudflare.** The domain `recordweb.org` is a zone in the Cloudflare account. The tunnel `poc-vps` has a published application route `recordweb.org` -> `http://localhost:8081`. Cloudflare terminates TLS; no certificate is needed on the VPS. `cloudflared` runs directly on the VPS.

**GNR.** The namespace `d2d14675-50c9-463d-b564-1ea50644c836` is registered with the resolver endpoint `https://recordweb.org/resolver/did` (no trailing slash).

**GitHub Actions.** Secrets `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY` are set in the repository. The repository has to be public, because the VPS clones it over HTTPS.

## 6. Troubleshooting

| Symptom | Likely cause and check |
|---|---|
| Record returns `404`, DID document works | File is not at `data/records/<namespace>/<record-id>.json`, or the name has a double `.json`. Run `find data -type f` in `/opt/recordweb-org` and `docker compose exec -T recordweb-org ls -R /app/data` |
| `curl` to `127.0.0.1:80` returns `Empty reply from server` | Port 80 belongs to `tws-nginx`. Use `127.0.0.1:8081` with `-H "Host: recordweb.org"` |
| `nginx -t` reports `host not found in upstream` | The container `recordweb-org` is not running or not in the network of `poc-nginx` |
| `verify.js`: `versionHash is ..., calculated ...` | Content changed after hashing. Run `hash.js` and `sign.js` again |
| `verify.js`: `signature is invalid` | Record changed after signing, or the DID document of the signer holds a different or placeholder key |
| `verify.js`: `schemaVersion differs` | `hash.js` ran without the SchemaRecord file next to it, or the SchemaRecord got a new Version |
| `sign.js`: `versionHash does not match` | Run `hash.js` first |
| `Permission denied` in a tool run | Missing `--user "$(id -u):$(id -g)"`, or the key directory was created by Docker as root. Remove it and create it with `mkdir` first |
| Workflow warning about Node 20 | Use `actions/checkout@v7`, `actions/setup-node@v7` and `node-version: 24` |
