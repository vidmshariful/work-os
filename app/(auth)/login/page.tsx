import type { Metadata } from "next";
import { LoginForm, type DemoAccount } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// Read at request time so the switcher reflects the running environment and
// never bakes credentials into a prerendered page.
export const dynamic = "force-dynamic";

// Names and roles only. The shared password comes from DEMO_PASSWORD in
// .env.local, which is git-ignored, so no credential lives in the repo.
const SEED_ACCOUNTS: DemoAccount[] = [
  { email: "shariful@vidiosa.com", name: "Shariful Islam", role: "CEO", wall: "above" },
  { email: "nadia@vidiosa.com", name: "Nadia Rahman", role: "Operations Manager", wall: "above" },
  { email: "farhan@vidiosa.com", name: "Farhan Ahmed", role: "Creative Lead", wall: "above" },
  { email: "sadia@vidiosa.com", name: "Sadia Karim", role: "Sales Closer", wall: "above" },
  { email: "tania@vidiosa.com", name: "Tania Akter", role: "Animation Lead", wall: "below" },
  { email: "rakib@vidiosa.com", name: "Rakib Hasan", role: "Animator", wall: "below" },
  { email: "mim@vidiosa.com", name: "Mim Chowdhury", role: "Designer", wall: "below" },
];

export default function LoginPage() {
  // The switcher signs you in as any of the seven real staff accounts with one
  // click. That is a development convenience and a serious hole anywhere else,
  // so a production build refuses to draw it however the environment is set.
  // Copying .env.local onto a server is the normal way people deploy, and that
  // must not be the thing that puts a "sign in as the CEO" button on the
  // internet.
  const demoPassword = process.env.DEMO_PASSWORD;
  const showDemo =
    process.env.NODE_ENV !== "production" &&
    process.env.DEMO_LOGINS === "1" &&
    Boolean(demoPassword);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-body font-semibold text-primary-foreground">
            W
          </div>
          <div className="text-center">
            <h1 className="text-h2 font-semibold tracking-tight text-text-1">
              Work OS
            </h1>
            <p className="page-subtitle mt-1">
              Sign in to your studio account.
            </p>
          </div>
        </div>
        <LoginForm
          demoAccounts={showDemo ? SEED_ACCOUNTS : undefined}
          demoPassword={showDemo ? demoPassword : undefined}
        />
      </div>
    </main>
  );
}
