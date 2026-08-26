import Link from "next/link";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">SIGN UP</h1>
        <p className="text-sm text-ink/70">
          Username and password only — no real email required.
        </p>
      </div>
      <SignupForm next={next} />
      <p className="text-center text-sm text-ink/70">
        Already have an account?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-bold text-purple underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
