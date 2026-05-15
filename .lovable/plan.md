# Encrypt sensitive columns at rest

Encrypt 4 column groups using AES (via `pgcrypto`'s `pgp_sym_encrypt`) with a single master key stored in **Supabase Vault**. The key never reaches the client — only the database can decrypt, and only through `SECURITY DEFINER` functions that enforce who's allowed to read.

## What gets encrypted

| Table | Columns | Who can decrypt |
|---|---|---|
| `app_credentials` | `password`, `notes` | admin, management |
| `user_ip_logs` | `ip`, `user_agent` | admin, management, moderator |
| `orders` | `shipping_address`, `email` | order owner + admin, management |
| `gate_messages` | `content` | message participants + admin, management, moderator |

## How it works

```text
client  ──writes plaintext──▶  server fn  ──app_encrypt(text)──▶  bytea column
client  ◀──reads plaintext──   server fn  ◀──app_decrypt_<table>(row)──  bytea column
                                                  ▲
                                            checks auth.uid() + role
```

- Master key lives in `vault.secrets` under name `app_encryption_key` (auto-generated random 32 bytes, hex-encoded).
- `private.get_enc_key()` is the only function that touches the vault. Not exposed to PostgREST.
- One `app_encrypt(text) → bytea` for writes (callable by anyone authenticated; encrypting is harmless).
- One per-table `decrypt_*` SECURITY DEFINER function that re-checks authorization before returning plaintext. RLS on the underlying ciphertext columns alone is not enough — without the function, a leaked row is just opaque bytes.

## Migration steps (single SQL migration)

1. `create extension if not exists pgcrypto;`
2. Generate + store the master key in Vault if not already present.
3. Add `*_enc bytea` columns alongside existing plaintext columns.
4. Backfill: `UPDATE … SET col_enc = app_encrypt(col) WHERE col IS NOT NULL`.
5. Drop the original plaintext columns and rename `*_enc` → original name (now `bytea`).
6. Create per-table `decrypt_*` functions and `read_*` server-side helpers.
7. Tighten RLS: clients cannot `SELECT` the ciphertext columns directly via PostgREST — force everything through server functions / RPC. (Practically: revoke `SELECT` on those specific columns from `authenticated`, grant via security-definer RPC.)

## Code changes (app side)

All reads/writes for these fields move to **TanStack server functions** (`createServerFn` + `requireSupabaseAuth`). Clients never touch ciphertext.

- **New** `src/lib/credentials.functions.ts` — `listCredentials`, `upsertCredential`, `deleteCredential`. Backs `admin-credentials.tsx`.
- **New** `src/lib/orders.functions.ts` — `listOrdersForAdmin`, `getOrderForUser`, helper to insert orders with encrypted PII. Update `shop.tsx` and admin order views to call these.
- **New** `src/lib/gate.functions.ts` — `listGateMessages`, `sendGateMessage`. Update `gate.tsx` and `moderation.tsx`.
- **Update** `src/lib/ip-log.functions.ts` — encrypt on insert; new `listIpLogs` for moderation views.
- **Realtime caveat** for `gate_messages` and `chat`-style flows: realtime payloads will deliver ciphertext. After a realtime INSERT event, the client re-fetches via the server fn to get plaintext. (Or we just refetch the thread on event.)

## Trade-offs you should know

- **No server-side text search** on encrypted fields (`gate_messages.content`, `notes`, etc.). LIKE/ILIKE/full-text won't work.
- **Slightly slower reads** — every read now goes through a server fn round-trip, not a direct PostgREST query.
- **Realtime** delivers ciphertext for `gate_messages`; UI must refetch on event.
- **Key rotation** is possible later (re-encrypt all rows with a new key) but not in scope now.
- **Backups** containing the database AND vault secret together are still readable — encryption-at-rest in this design protects against DB dumps leaking without the vault, and against the publishable key being abused via PostgREST. It does NOT protect against a full project compromise.
- **Irreversible**: dropping the plaintext columns means if the migration backfill has a bug, original data is gone. I'll keep the backfill in a transaction and verify counts before drop.

## Out of scope

- End-to-end encryption (server can still decrypt — that's by design so admins can read).
- Encrypting `chat_messages` (would break mentions, moderation, search — you didn't pick it).
- Encrypting `tickets` (you didn't pick it).
- Key rotation tooling.

---

Reply **"go"** and I'll run the migration + ship the code changes. If you want to drop or add a table from the list, say so first.
