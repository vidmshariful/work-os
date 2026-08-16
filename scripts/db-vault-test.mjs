// Acceptance for Database folders, folder level access, and stored secrets.
// Run the way the app runs: anon key plus each person's real JWT, so RLS is
// what answers. Cleans up everything it makes.
// Usage: node scripts/db-vault-test.mjs [password]
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadEnv, connect } from "./db.mjs";

const env = loadEnv();
const PASSWORD = process.argv[2] || process.env.SEED_PASSWORD || env.SEED_PASSWORD;
if (!PASSWORD) {
  console.error("Set SEED_PASSWORD in .env.local, or pass it as an argument.");
  process.exit(1);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function signIn(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}`);
  return { client, id: data.user.id };
}

const db = await connect();
const ws = (await db.query("select id from workspaces limit 1")).rows[0].id;

const nadia = await signIn("nadia@vidiosa.com");
const rakib = await signIn("rakib@vidiosa.com");
const mim = await signIn("mim@vidiosa.com");

const MARK = "vault-test";
const cleanup = async () => {
  await db.query("delete from db_folders where name = $1", [MARK]);
  await db.query("delete from db_tables where name = $1", [MARK]);
};
await cleanup();

// ---- a folder, and a table filed in it -------------------------------------

const { data: folder, error: folderError } = await nadia.client
  .from("db_folders")
  .insert({ workspace_id: ws, owner_id: nadia.id, name: MARK, scope: "personal" })
  .select("id")
  .single();
check("a member can create a folder", !folderError && Boolean(folder), folderError?.message ?? "");

const { data: table } = await nadia.client
  .from("db_tables")
  .insert({
    workspace_id: ws,
    owner_id: nadia.id,
    name: MARK,
    color: "#3B6FF6",
    scope: "personal",
    folder_id: folder.id,
  })
  .select("id")
  .single();

const { data: field } = await nadia.client
  .from("db_fields")
  .insert({ table_id: table.id, name: "Password", type: "secret", sort_order: 0 })
  .select("id")
  .single();
check("a field can be a secret", Boolean(field));

// The app encrypts before writing. The script does the same thing here with
// the same key and format, so what lands in the row is what the app would
// have written.
const KEY = Buffer.from(env.WORKOS_SECRET_KEY, "hex");
const PLAIN = "correct horse battery staple";
function encrypt(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}
function decrypt(blob) {
  const [, ivB, tagB, bodyB] = blob.split(":");
  const d = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(bodyB, "base64")), d.final()]).toString("utf8");
}

check("the key is 32 bytes", KEY.length === 32, `${KEY.length} bytes`);
check("a secret round trips", decrypt(encrypt(PLAIN)) === PLAIN);

const cipher = encrypt(PLAIN);
const { data: row } = await nadia.client
  .from("db_rows")
  .insert({ table_id: table.id, values: { [field.id]: cipher }, sort_order: 0, created_by: nadia.id })
  .select("id")
  .single();

const stored = (
  await db.query("select values->>$2 v from db_rows where id = $1", [row.id, field.id])
).rows[0].v;
check("the database holds ciphertext, not the password", !stored.includes(PLAIN) && stored.startsWith("v1:"), stored.slice(0, 22) + "...");
check("that ciphertext decrypts back", decrypt(stored) === PLAIN);

// A value edited straight in the database fails its own tag rather than
// decrypting to something plausible.
let tampered = false;
try {
  const parts = stored.split(":");
  const body = Buffer.from(parts[3], "base64");
  body[0] = body[0] ^ 0xff;
  parts[3] = body.toString("base64");
  decrypt(parts.join(":"));
} catch {
  tampered = true;
}
check("a tampered value refuses to decrypt", tampered);

// ---- who can see it --------------------------------------------------------

const before = await rakib.client.from("db_tables").select("id").eq("id", table.id);
check("someone without the folder cannot see the table", (before.data ?? []).length === 0, `${(before.data ?? []).length} rows`);

const beforeRows = await rakib.client.from("db_rows").select("id").eq("id", row.id);
check("nor its rows", (beforeRows.data ?? []).length === 0, `${(beforeRows.data ?? []).length} rows`);

const { error: grantError } = await nadia.client
  .from("db_folder_shares")
  .insert({ folder_id: folder.id, profile_id: rakib.id, can_edit: false });
check("the owner can give the folder to someone", !grantError, grantError?.message ?? "");

const after = await rakib.client.from("db_tables").select("id").eq("id", table.id);
check("the folder opens the table for them", (after.data ?? []).length === 1, `${(after.data ?? []).length} rows`);

const afterRows = await rakib.client.from("db_rows").select("id, values").eq("id", row.id);
check("and the rows inside it", (afterRows.data ?? []).length === 1, `${(afterRows.data ?? []).length} rows`);

const stillHidden = await mim.client.from("db_tables").select("id").eq("id", table.id);
check("someone else still cannot see it", (stillHidden.data ?? []).length === 0, `${(stillHidden.data ?? []).length} rows`);

// View only means view only.
const noWrite = await rakib.client
  .from("db_rows")
  .update({ values: { [field.id]: "x" } })
  .eq("id", row.id)
  .select("id");
check("a view grant cannot write", (noWrite.data ?? []).length === 0, `${(noWrite.data ?? []).length} rows`);

await nadia.client
  .from("db_folder_shares")
  .update({ can_edit: true })
  .eq("folder_id", folder.id)
  .eq("profile_id", rakib.id);
const canWrite = await rakib.client
  .from("db_rows")
  .update({ values: { [field.id]: cipher } })
  .eq("id", row.id)
  .select("id");
check("an edit grant can write", (canWrite.data ?? []).length === 1, `${(canWrite.data ?? []).length} rows`);

// ---- the audit trail -------------------------------------------------------

const { error: auditError } = await rakib.client.from("secret_reveals").insert({
  workspace_id: ws,
  table_id: table.id,
  row_id: row.id,
  field_id: field.id,
  actor_id: rakib.id,
  action: "reveal",
});
check("a reveal is recorded", !auditError, auditError?.message ?? "");

const { error: forgeError } = await rakib.client.from("secret_reveals").insert({
  workspace_id: ws,
  table_id: table.id,
  row_id: row.id,
  field_id: field.id,
  actor_id: nadia.id,
  action: "reveal",
});
check("nobody can log a reveal as someone else", Boolean(forgeError), forgeError?.code ?? "allowed");

const ownerSees = await nadia.client.from("secret_reveals").select("actor_id").eq("row_id", row.id);
check("the table owner sees who looked", (ownerSees.data ?? []).some((r) => r.actor_id === rakib.id), `${(ownerSees.data ?? []).length} rows`);

const strangerSees = await mim.client.from("secret_reveals").select("id").eq("row_id", row.id);
check("an outsider sees none of it", (strangerSees.data ?? []).length === 0, `${(strangerSees.data ?? []).length} rows`);

const noErase = await rakib.client.from("secret_reveals").delete().eq("row_id", row.id).select("id");
check("the trail cannot be erased", (noErase.data ?? []).length === 0, `${(noErase.data ?? []).length} rows`);

// ---- taking it back --------------------------------------------------------

await nadia.client
  .from("db_folder_shares")
  .delete()
  .eq("folder_id", folder.id)
  .eq("profile_id", rakib.id);
const revoked = await rakib.client.from("db_tables").select("id").eq("id", table.id);
check("removing the grant closes it again", (revoked.data ?? []).length === 0, `${(revoked.data ?? []).length} rows`);

// ---- what was already there still works ------------------------------------

const companySeen = await rakib.client
  .from("db_tables")
  .select("id, name")
  .eq("scope", "company");
check(
  "company tables are still visible to everyone",
  (companySeen.data ?? []).length > 0,
  `${(companySeen.data ?? []).length} rows`
);

// A table with no folder is unaffected by any of this.
const { data: loose } = await nadia.client
  .from("db_tables")
  .insert({ workspace_id: ws, owner_id: nadia.id, name: MARK, color: "#3B6FF6", scope: "personal" })
  .select("id")
  .single();
const looseSeen = await rakib.client.from("db_tables").select("id").eq("id", loose.id);
check("a private table with no folder stays private", (looseSeen.data ?? []).length === 0, `${(looseSeen.data ?? []).length} rows`);

// ---- cleanup ---------------------------------------------------------------

await db.query("delete from secret_reveals where row_id = $1", [row.id]);
await cleanup();
const left = (
  await db.query("select count(*)::int n from db_folders where name=$1", [MARK])
).rows[0].n;
const leftTables = (
  await db.query("select count(*)::int n from db_tables where name=$1", [MARK])
).rows[0].n;
await db.end();
check("nothing left behind", left === 0 && leftTables === 0, `${left} folders, ${leftTables} tables`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nVAULT TEST: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
