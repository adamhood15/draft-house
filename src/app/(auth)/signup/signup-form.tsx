"use client";

import { useActionState } from "react";
import { signUp } from "@/lib/auth/actions";
import { initialAuthState } from "@/lib/auth/state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signUp, initialAuthState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Input
        label="Username"
        name="username"
        autoComplete="username"
        pattern="[a-z0-9_]{3,20}"
        title="3-20 characters: lowercase letters, numbers, or underscores."
        required
      />
      <Input
        label="Display Name"
        name="displayName"
        autoComplete="name"
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Input
        label="Confirm Password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={6}
        required
      />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-pink">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full">
        Create Account
      </Button>
    </form>
  );
}
