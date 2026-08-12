// Acceptance for direct messages, run the way the app reads: anon key plus a
// signed-in user's JWT, RLS in force. Every message it writes is deleted at
// the end.
// Usage: node scripts/dm-test.mjs [password]
import { createClient } from "@supabase/supabase-js";
import { loadEnv, connect } from "./db.mjs";

const env = loadEnv();
const PASSWORD = process.argv[2] || process.env.SEED_PASSWORD || env.SEED_PASSWORD;
if (!PASSWORD) {
  console.error("Set SEED_PASSWORD in .env.local, or pass it as an argument.");
  process.exit(1);
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function signIn(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}`);
  return { client, id: data.user.id };
}

const MARK = "dm-test:";
const db = await connect();
const ws = (await db.query("select id from workspaces limit 1")).rows[0].id;
await db.query("delete from direct_messages where body like $1", [`${MARK}%`]);

// Three people: two in the conversation, one outside it.
const nadia = await signIn("nadia@vidiosa.com");
const rakib = await signIn("rakib@vidiosa.com");
const third = await signIn("sadia@vidiosa.com").catch(() => null);

// ---- sending -------------------------------------------------------------
const { data: sent, error: sendError } = await nadia.client
  .from("direct_messages")
  .insert({ workspace_id: ws, sender_id: nadia.id, recipient_id: rakib.id, body: `${MARK} one` })
  .select("id")
  .single();
check("a member can send to another member", !sendError && Boolean(sent), sendError?.message ?? "");

const { error: asOtherError } = await nadia.client
  .from("direct_messages")
  .insert({ workspace_id: ws, sender_id: rakib.id, recipient_id: nadia.id, body: `${MARK} forged` });
check("nobody can send as someone else", Boolean(asOtherError), asOtherError?.code ?? "it was allowed");

const { error: strangerError } = await nadia.client.from("direct_messages").insert({
  workspace_id: ws,
  sender_id: nadia.id,
  recipient_id: "00000000-0000-0000-0000-000000000000",
  body: `${MARK} stranger`,
});
check("cannot send to someone outside the workspace", Boolean(strangerError), strangerError?.code ?? "it was allowed");

const { error: selfError } = await nadia.client
  .from("direct_messages")
  .insert({ workspace_id: ws, sender_id: nadia.id, recipient_id: nadia.id, body: `${MARK} self` });
check("cannot message yourself", Boolean(selfError), selfError?.code ?? "it was allowed");

// ---- reading -------------------------------------------------------------
const mine = await nadia.client.from("direct_messages").select("id").like("body", `${MARK}%`);
check("the sender sees their message", (mine.data ?? []).length === 1, `${(mine.data ?? []).length} rows`);

const theirs = await rakib.client.from("direct_messages").select("id, body").like("body", `${MARK}%`);
check("the recipient sees it", (theirs.data ?? []).length === 1, `${(theirs.data ?? []).length} rows`);

if (third) {
  const out = await third.client.from("direct_messages").select("id").like("body", `${MARK}%`);
  check(
    "nobody else sees it, not even an executive",
    (out.data ?? []).length === 0,
    `${(out.data ?? []).length} rows`
  );
} else {
  check("a third account exists to test with", false, "could not sign in");
}

// ---- read state ----------------------------------------------------------
const { data: marked } = await rakib.client
  .from("direct_messages")
  .update({ read_at: new Date().toISOString() })
  .eq("id", sent.id)
  .select("id");
check("the recipient can mark it read", (marked ?? []).length === 1, `${(marked ?? []).length} rows`);

const { data: senderMarked } = await nadia.client
  .from("direct_messages")
  .update({ read_at: null })
  .eq("id", sent.id)
  .select("id");
check(
  "the sender cannot change read state",
  (senderMarked ?? []).length === 0,
  `${(senderMarked ?? []).length} rows`
);

// ---- unsending -----------------------------------------------------------
const { data: theirDelete } = await rakib.client
  .from("direct_messages")
  .delete()
  .eq("id", sent.id)
  .select("id");
check(
  "the recipient cannot delete the sender's message",
  (theirDelete ?? []).length === 0,
  `${(theirDelete ?? []).length} rows`
);

const { data: ownDelete } = await nadia.client
  .from("direct_messages")
  .delete()
  .eq("id", sent.id)
  .select("id");
check("the sender can unsend their own", (ownDelete ?? []).length === 1, `${(ownDelete ?? []).length} rows`);

// ---- cleanup -------------------------------------------------------------
const { rows: left } = await db.query(
  "select count(*)::int n from direct_messages where body like $1",
  [`${MARK}%`]
);
await db.query("delete from direct_messages where body like $1", [`${MARK}%`]);
await db.end();
check("nothing left behind", left[0].n === 0, `${left[0].n} rows before cleanup`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nDM TEST: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
