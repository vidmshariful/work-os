import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/context";
import { Card, CardBody, CardHeader } from "@/components/primitives/card";
import { Field } from "@/components/primitives/field";
import { PersonAvatar } from "@/components/primitives/avatar";
import { ROLE_LABELS } from "@/components/shell/sidebar";
import { Tag } from "@/components/primitives/tag";
import { ChangePasswordForm } from "@/components/features/account/change-password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await getSession();

  async function updateName(formData: FormData) {
    "use server";
    const name = String(formData.get("full_name") ?? "").trim();
    if (!name) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ full_name: name }).eq("id", user.id);
    revalidatePath("/", "layout");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text-1">Account</h1>
        <p className="mt-1 text-sm text-text-2">Your profile across all workspaces.</p>
      </div>

      <Card>
        <CardHeader title="Profile" />
        <CardBody>
          <div className="flex items-center gap-4 pb-5">
            <PersonAvatar name={session.profile.full_name} src={session.profile.avatar_url} size={56} />
            <div>
              <div className="text-[15px] font-semibold text-text-1">{session.profile.full_name}</div>
              <div className="text-[13px] text-text-2">{session.profile.email}</div>
            </div>
          </div>
          <form action={updateName} className="flex max-w-sm flex-col gap-4">
            <Field label="Full name" htmlFor="full_name">
              <input
                id="full_name"
                name="full_name"
                defaultValue={session.profile.full_name}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-sm text-text-1 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25"
              />
            </Field>
            <div>
              <button className="h-9 rounded-[9px] bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-black">
                Save changes
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Password" />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Memberships" />
        <CardBody className="flex flex-col gap-3">
          {session.memberships.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-[10px] border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-8 items-center justify-center rounded-[8px] text-[13px] font-semibold"
                  style={{ backgroundColor: `${m.workspace.accent_color}1A`, color: m.workspace.accent_color }}
                >
                  {m.workspace.name.slice(0, 1)}
                </span>
                <div>
                  <div className="text-sm font-medium text-text-1">{m.workspace.name}</div>
                  <div className="text-[12px] text-text-3">{ROLE_LABELS[m.role] ?? m.role}</div>
                </div>
              </div>
              <Tag tone="gray">{m.archetype.replace("_", " ")}</Tag>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
