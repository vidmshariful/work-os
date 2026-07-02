import { redirect } from "next/navigation";

// Middleware sends signed-out visitors to /login. Everyone else lands on the
// personal dashboard.
export default function RootPage() {
  redirect("/dashboard");
}
