"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidUsername, toAuthEmail } from "@/lib/auth/synthetic-email";
import type { AuthState } from "@/lib/auth/state";

// supabase/config.toml: auth.minimum_password_length
const MIN_PASSWORD_LENGTH = 6;

/** Only ever redirect within the app — an unvalidated `next` is an open redirect. */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = safeRedirectTarget(formData.get("next"));

  if (!isValidUsername(username)) {
    return {
      error:
        "Username must be 3-20 characters: lowercase letters, numbers, or underscores.",
    };
  }
  if (!displayName) {
    return { error: "Display name is required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: toAuthEmail(username),
    password,
    options: {
      data: { username, display_name: displayName },
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: "Username already taken." };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too weak — try a longer one." };
    }
    return { error: error.message };
  }

  redirect(next);
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectTarget(formData.get("next"));

  if (!isValidUsername(username)) {
    return { error: "Incorrect username or password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: toAuthEmail(username),
    password,
  });

  if (error) {
    return { error: "Incorrect username or password." };
  }

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
