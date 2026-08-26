import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">LOG IN</h1>
        <p className="text-sm text-ink/70">Welcome back to the draft.</p>
      </div>
      <LoginForm next={next} />
      <p className="text-center text-sm text-ink/70">
        New here?{" "}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="font-bold text-purple underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
