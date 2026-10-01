"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAuthProfile } from "@/lib/profile-sync";
import { redirect } from "next/navigation";

/* ─── helpers ─── */

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value: string): boolean {
  // Must start with + and have at least 8 digits
  const cleaned = value.replace(/[\s\-()]/g, "");
  return /^\+\d{8,15}$/.test(cleaned);
}

function cleanPhone(value: string): string {
  return value.replace(/[\s\-()]/g, "");
}

async function getDefaultLandingPath(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "/app";
  const { data } = await supabase
    .from("user_settings")
    .select("default_landing_page")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.default_landing_page === "compose" ? "/app/compose" : "/app";
}

type AuthResult = {
  error?: string;
  success?: string;
  prompt?: "create-account" | "log-in";
  needsOtp?: boolean;
  needsConfirmation?: boolean;
  email?: string;
  phone?: string;
  redirectUrl?: string;
};

async function authAccountExists(email: string): Promise<boolean | null> {
  try {
    const admin = createAdminClient();
    const perPage = 1000;

    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return null;
      if (data.users.some((user) => user.email?.toLowerCase() === email.toLowerCase())) return true;
      if (data.users.length < perPage) return false;
    }
  } catch {
    return null;
  }
}

/* ─── SIGNUP ─── */

export async function signUpAction(formData: FormData): Promise<AuthResult> {
  const contact = (formData.get("contact") as string)?.trim();
  const password = formData.get("password") as string;
  const passwordConfirm = formData.get("passwordConfirm") as string;
  const firstName = (formData.get("firstName") as string)?.trim();
  const lastName = (formData.get("lastName") as string)?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const captchaToken = (formData.get("captchaToken") as string)?.trim();

  if (!contact || !password || !firstName || !lastName) {
    return { error: "Please fill in all fields." };
  }

  if (password !== passwordConfirm) {
    return { error: "Passwords do not match." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  if (isEmail(contact)) {
    const accountExists = await authAccountExists(contact);
    if (accountExists === true) return { prompt: "log-in" };
    if (accountExists === null) {
      return { error: "Unable to check whether this email already has an account. Please try again." };
    }
  }

  const supabase = await createClient();

  if (isEmail(contact)) {
    // Email signup
    const { data, error } = await supabase.auth.signUp({
      email: contact,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) {
      if (error.code === "captcha_failed") {
        return {
          error: process.env.NODE_ENV === "production"
            ? "Security verification failed. Refresh the page and complete the security check before trying again."
            : "Supabase Auth CAPTCHA is blocking local signup. Configure localhost in Turnstile or create the account on the deployed site.",
        };
      }
      if (error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered")) {
        return { prompt: "log-in" };
      }
      return { error: error.message };
    }

    if (data.user?.identities?.length === 0) {
      return { prompt: "log-in" };
    }

    if (data.user) await syncAuthProfile(data.user);

    if (data.session) {
      return { success: "Account created. Redirecting to your workspace…", redirectUrl: await getDefaultLandingPath(supabase) };
    }

    return {
      success: "Your account is ready. Confirm your email to open your workspace.",
      needsConfirmation: true,
      email: contact,
    };
  }

  if (isPhone(contact)) {
    // Phone signup — sign up with phone + password, then verify OTP
    const phone = cleanPhone(contact);
    const { data, error } = await supabase.auth.signUp({
      phone,
      password,
      options: {
        data: { full_name: fullName },
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered")) {
        return { prompt: "log-in" };
      }
      return { error: error.message };
    }

    if (data.user) await syncAuthProfile(data.user);

    return {
      success: "Verification code sent to your phone.",
      needsOtp: true,
      phone,
    };
  }

  return { error: "Please enter a valid email address or phone number (with country code, e.g. +1...)." };
}

/* ─── LOGIN ─── */

export async function logInAction(formData: FormData): Promise<AuthResult> {
  const contact = (formData.get("contact") as string)?.trim();
  const password = formData.get("password") as string;
  const captchaToken = (formData.get("captchaToken") as string)?.trim();

  if (!contact || !password) {
    return { error: "Please fill in all fields." };
  }

  if (isEmail(contact) && await authAccountExists(contact) === false) {
    return { prompt: "create-account" };
  }

  const supabase = await createClient();

  if (isEmail(contact)) {
    const { error } = await supabase.auth.signInWithPassword({
      email: contact,
      password,
      options: {
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) {
      if (error.message.includes("Email not confirmed")) {
        return { error: "Please confirm your email before logging in." };
      }
      if (error.code === "captcha_failed") {
        return {
          error: process.env.NODE_ENV === "production"
            ? "Security verification failed. Refresh the page and complete the security check before trying again."
            : "Supabase Auth CAPTCHA is enabled, but localhost cannot provide a valid CAPTCHA token. Configure localhost in Turnstile or test email/password login on the deployed site.",
        };
      }
      const invalidCredentials = error.code === "invalid_credentials" || error.message.toLowerCase().includes("invalid login credentials");
      if (invalidCredentials) {
        const accountExists = await authAccountExists(contact);
        if (accountExists === false) {
          return { prompt: "create-account" };
        }
      }
      return { error: "Invalid email or password." };
    }

    redirect(await getDefaultLandingPath(supabase));
  }

  if (isPhone(contact)) {
    const phone = cleanPhone(contact);
    const { error } = await supabase.auth.signInWithPassword({
      phone,
      password,
      options: {
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) {
      return { error: "Invalid phone number or password." };
    }

    redirect(await getDefaultLandingPath(supabase));
  }

  return { error: "Please enter a valid email address or phone number (with country code, e.g. +1...)." };
}

/* ─── VERIFY OTP (phone) ─── */

export async function verifyOtpAction(formData: FormData): Promise<AuthResult> {
  const phone = formData.get("phone") as string;
  const otp = formData.get("otp") as string;

  if (!phone || !otp) {
    return { error: "Please enter the verification code." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    phone: cleanPhone(phone),
    token: otp,
    type: "sms",
  });

  if (error) {
    return { error: "Invalid or expired verification code." };
  }

  redirect(await getDefaultLandingPath(supabase));
}

/* ─── FORGOT PASSWORD ─── */

export async function forgotPasswordAction(formData: FormData): Promise<AuthResult> {
  const email = (formData.get("email") as string)?.trim();
  const captchaToken = formData.get("captchaToken") as string;

  if (!email || !isEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/app/settings`,
    ...(captchaToken ? { captchaToken } : {}),
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Password reset link sent to your email." };
}

/* ─── GOOGLE OAUTH ─── */

export async function signInWithGoogleAction(intent: "login" | "signup"): Promise<AuthResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return {
      success: "You're already signed in. Redirecting to your workspace…",
      redirectUrl: await getDefaultLandingPath(supabase),
    };
  }

  const cookieStore = await cookies();
  cookieStore.set("primecut-auth-intent", `${intent}:${Date.now()}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    cookieStore.delete("primecut-auth-intent");
    return { error: error.message };
  }

  if (data.url) {
    return {
      success: "Redirecting to Google…",
      redirectUrl: data.url,
    };
  }

  return { error: "Something went wrong. Please try again." };
}

/* ─── LOGOUT ─── */

export async function logOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
