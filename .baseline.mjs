import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./scripts/db.mjs";
import { writeFileSync } from "node:fs";
const env = loadEnv(); const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const { data } = await c.auth.signInWithPassword({email:"nadia@vidiosa.com",password:env.SEED_PASSWORD});
const raw0="base64-"+Buffer.from(JSON.stringify(data.session)).toString("base64"); const parts=raw0.match(/.{1,3180}/g);
const cookie = parts.length===1?`sb-${REF}-auth-token=${parts[0]}`:parts.map((p,i)=>`sb-${REF}-auth-token.${i}=${p}`).join("; ");
const get = async p => (await (await fetch(`http://localhost:3100${p}`,{headers:{cookie}})).text())
  .replace(/<script[\s\S]*?<\/script>/g,"").replace(/<!--[\s\S]*?-->/g,"");
const { data: proj } = await admin.from("projects").select("id, code")
  .eq("department_id",(await admin.from("departments").select("id").eq("slug","production").single()).data.id).limit(1).single();

const PAGES = {
  space:   "/vidiosa/departments/production",
  board:   "/vidiosa/departments/production?view=board",
  table:   "/vidiosa/departments/production?view=table",
  project: `/vidiosa/projects/${proj.id}`,
  index:   "/vidiosa/departments",
};
const MARKERS = [
  /aria-label="Actions for PRJ-[A-Z0-9]+"/g, /aria-label="List actions for [^"]+"/g,
  /aria-label="Add a project to [^"]+"/g, /aria-label="Space actions for [^"]+"/g,
  /aria-label="Folder actions for [^"]+"/g, /aria-label="Collapse [^"]+"/g,
  /aria-label="Select PRJ-[A-Z0-9]+"/g, /aria-label="Change theme"/g,
  /aria-label="Show keyboard shortcuts"/g, /data-project-row=/g, /data-row-menu=/g,
  /data-space-search/g, /aria-label="Filter by [^"]+"/g, /aria-label="Group projects"/g,
  /aria-label="Sort projects"/g, /aria-label="Search projects by title or code"/g,
];
const out = {};
for (const [name, path] of Object.entries(PAGES)) {
  const html = await get(path);
  out[name] = { bytes: html.length };
  for (const re of MARKERS) {
    const n = (html.match(re)??[]).length;
    if (n) out[name][String(re).slice(1,-2)] = n;
  }
}
out.__project_code = proj.code;
writeFileSync("/private/tmp/claude-501/-Users-apple-Work-OS-work-os/2980a57c-7c3e-4ed4-9577-f74b258a1380/scratchpad/ui-baseline.json", JSON.stringify(out,null,1));
for (const [k,v] of Object.entries(out)) if (k[0]!=="_") console.log(k.padEnd(9), JSON.stringify(v));
