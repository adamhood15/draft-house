"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/auth/actions";
import { initialAuthState } from "@/lib/auth/state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, initialAuthState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Input
        label="Username"
        name="username"
        autoComplete="username"
        pattern="[a-z0-9_]{3,20}"
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full">
        Log In
      </Button>
    </form>
  );
}
