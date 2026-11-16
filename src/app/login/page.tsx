import { redirect } from "next/navigation";
import { Dialog } from "@/components/ui";
import { signIn } from "@/lib/actions";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/"); // demo mode has no login
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-3">
      <h1 className="text-center font-display text-lg leading-relaxed">{APP_NAME}</h1>
      {error && <Dialog tone="error">{error}</Dialog>}
      {sent ? (
        <Dialog>A login link is on its way. Open it on this device to continue your save.</Dialog>
      ) : (
        <form action={signIn} className="box flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            Email
            <input name="email" type="email" required autoComplete="email" className="field" />
          </label>
          <button className="btn btn-primary">Email me a login link</button>
        </form>
      )}
    </main>
  );
}
