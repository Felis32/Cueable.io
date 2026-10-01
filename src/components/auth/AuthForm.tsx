"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  signUpAction,
  logInAction,
  verifyOtpAction,
  forgotPasswordAction,
  signInWithGoogleAction,
} from "@/app/(auth)/actions";
import { Turnstile } from "@/components/auth/Turnstile";
import { LogoMark } from "@/components/marketing/LogoMark";

type Phase = "off" | "signup" | "login";

const nextPhase: Record<Phase, Phase> = {
  off: "signup",
  signup: "login",
  login: "off",
};

type View = "form" | "otp" | "forgot" | "confirmation";
type AuthPrompt = "create-account" | "log-in" | "google-account-created";

function isLocalHostname(hostname: string) {
  if (!hostname) return true;
  const normalized = hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(normalized)
    || normalized.endsWith(".local")
    || normalized.includes("localtest.me");
}

function isUsableTurnstileSiteKey(siteKey: string) {
  if (!siteKey) return false;
  const trimmed = siteKey.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("1x") && trimmed.length >= 20) return true;
  if (trimmed.length < 30) return false;
  return true;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(mode === "login" ? "login" : "signup");
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"error" | "success">("error");
  const [authPrompt, setAuthPrompt] = useState<AuthPrompt | null>(null);
  const [view, setView] = useState<View>("form");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [localDevBypass, setLocalDevBypass] = useState(false);

  const drag = useRef<{ y: number; base: number } | null>(null);
  const pullRef = useRef(0);
  const springVelocity = useRef(0);
  const frame = useRef(0);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    setLocalDevBypass(
      process.env.NODE_ENV !== "production" && isLocalHostname(window.location.hostname),
    );
  }, []);

  useEffect(() => {
    const notice = new URLSearchParams(window.location.search).get("auth");
    if (notice === "account-exists") setAuthPrompt("log-in");
    if (notice === "google-account-created") setAuthPrompt("google-account-created");
    if (new URLSearchParams(window.location.search).get("error") === "oauth") {
      setNote("Google sign-up could not finish. Check Supabase Auth URL settings and the user-profile trigger, then try again.");
      setNoteType("error");
    }
  }, [mode]);

  useEffect(() => {
    setPhase(mode === "login" ? "login" : "signup");
  }, [mode]);

  function commitPull(value: number) {
    pullRef.current = value;
    setPull(value);
  }

  const showNote = useCallback((msg: string, type: "error" | "success" = "error") => {
    setNote(msg);
    setNoteType(type);
  }, []);

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken("");
  }, []);

  const handleCaptchaError = useCallback((errorCode?: string | number) => {
    setCaptchaToken("");
    showNote(
      `Cloudflare security check failed (${errorCode ?? "unknown error"}). Try a regular browser or switch to Cloudflare test keys for local development.`,
      "error",
    );
  }, [showNote]);

  function go(next: Phase) {
    cancelAnimationFrame(frame.current);
    springVelocity.current = 0;
    setPhase(next);
    setNote("");
    setView("form");
    setCaptchaToken("");
    const href = next === "login" ? "/login" : "/signup";
    window.history.replaceState(null, "", href);
  }

  function springBack(advance: boolean) {
    cancelAnimationFrame(frame.current);
    const target = advance ? 78 : 0;
    const step = () => {
      const current = pullRef.current;
      const diff = target - current;
      springVelocity.current += diff * 0.25;
      springVelocity.current *= 0.68;
      const nextValue = current + springVelocity.current;

      if (Math.abs(diff) < 0.5 && Math.abs(springVelocity.current) < 0.5) {
        commitPull(target);
        springVelocity.current = 0;
        if (advance) go(nextPhase[phase]);
        return;
      }

      commitPull(nextValue);
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    cancelAnimationFrame(frame.current);
    drag.current = { y: event.clientY, base: pullRef.current };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    event.preventDefault();
    const next = drag.current.base + (event.clientY - drag.current.y);
    commitPull(Math.min(120, Math.max(-12, next)));
  }

  function onPointerUp() {
    const distance = pullRef.current;
    drag.current = null;
    setDragging(false);
    springBack(distance > 38);
  }

  function nudge() {
    cancelAnimationFrame(frame.current);
    commitPull(78);
    requestAnimationFrame(() => springBack(true));
  }

  /* ─── Auth handlers ─── */

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (signup && formData.get("password") !== formData.get("passwordConfirm")) {
      showNote("Passwords do not match.", "error");
      return;
    }

    if (captchaRequired && !captchaToken) {
      showNote("Please complete the security check before continuing.", "error");
      return;
    }

    formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const action = signup ? signUpAction : logInAction;
      const result = await action(formData);

      if (result.prompt) {
        setAuthPrompt(result.prompt);
        setCaptchaToken("");
        return;
      }

      if (result.error) {
        showNote(result.error, "error");
        setCaptchaToken("");
        return;
      }

      if (result.needsConfirmation && result.email) {
        setConfirmationEmail(result.email);
        setView("confirmation");
        setNote("");
        return;
      }

      if (result.needsOtp && result.phone) {
        setOtpPhone(result.phone);
        setView("otp");
        showNote(result.success || "Code sent.", "success");
        return;
      }

      if (result.redirectUrl) {
        router.replace(result.redirectUrl);
        router.refresh();
        return;
      }

      if (result.success) {
        showNote(result.success, "success");
      }
    });
  }

  function handleOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("phone", otpPhone);

    startTransition(async () => {
      const result = await verifyOtpAction(formData);
      if (result.error) {
        showNote(result.error, "error");
      }
      // If successful, the server action redirects
    });
  }

  function handleForgotSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    if (captchaRequired && !captchaToken) {
      showNote("Please complete the security check before continuing.", "error");
      return;
    }

    formData.set("captchaToken", captchaToken);

    startTransition(async () => {
      const result = await forgotPasswordAction(formData);
      if (result.error) {
        showNote(result.error, "error");
      } else if (result.success) {
        showNote(result.success, "success");
      }
    });
  }

  function handleGoogleSignIn() {
    startTransition(async () => {
      const result = await signInWithGoogleAction(signup ? "signup" : "login");
      if (result.error) {
        showNote(result.error, "error");
        return;
      }

      if (result.success) {
        showNote(result.success, "success");
        if (result.redirectUrl) {
          if (result.redirectUrl.startsWith("http")) {
            window.location.href = result.redirectUrl;
          } else {
            router.push(result.redirectUrl);
          }
        }
      }
    });
  }

  const signup = phase === "signup";
  const open = phase !== "off";
  const glow =
    phase === "login"
      ? "shadow-[0_0_0_1px_rgba(214,164,122,0.7),0_0_56px_rgba(214,150,104,0.42)]"
      : "shadow-[0_0_0_1px_rgba(168,186,122,0.75),0_0_56px_rgba(154,176,112,0.4)]";

  const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
  const localCaptchaEnabled = process.env.NODE_ENV !== "production"
    && localDevBypass
    && process.env.NEXT_PUBLIC_TURNSTILE_DEV_ENABLED === "true";
  const turnstileEnabled =
    isUsableTurnstileSiteKey(turnstileSiteKey) &&
    (localCaptchaEnabled || (process.env.NODE_ENV === "production" && !localDevBypass));
  const captchaRequired = turnstileEnabled;

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <Link href="/" aria-label="Cueable home" className="absolute left-6 top-6 z-10">
        <LogoMark />
      </Link>

      <div className={`relative z-10 mx-auto flex min-h-screen w-full max-w-[1040px] flex-col items-center justify-center gap-8 px-6 py-20 md:flex-row md:gap-16 ${open ? "" : "md:justify-start md:pl-[10%]"}`}>
        <StudioLamp phase={phase} pull={pull} dragging={dragging} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onNudge={nudge} />

        <div inert={open ? undefined : true} className={`w-full max-w-[380px] transition-all duration-500 ease-out ${open ? "relative translate-y-0 opacity-100" : "pointer-events-none absolute translate-y-3 opacity-0"}`}>
          <div className={`rounded-[24px] border border-line/90 bg-surface px-6 py-7 shadow-[0_24px_60px_rgba(17,18,20,0.08)] ${glow}`}>
            {/* Tab switcher */}
            <div className="mb-5 flex items-center justify-between gap-3 rounded-full border border-line bg-paper px-1 py-1">
              <button
                type="button"
                className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition ${!signup ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
                onClick={() => go("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium transition ${signup ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
                onClick={() => go("signup")}
              >
                Sign up
              </button>
            </div>

            {/* ─── OTP Verification View ─── */}
            {view === "confirmation" && (
              <div className="text-center">
                <h1 className="font-serif text-[34px] leading-none text-ink">Confirm your email</h1>
                <p className="mt-3 text-[13px] leading-[1.5] text-muted">
                  We sent a confirmation link to <span className="font-medium text-ink">{confirmationEmail}</span>. Open that link to finish signing up and enter your workspace.
                </p>
                <button
                  type="button"
                  onClick={() => go("login")}
                  className="mt-6 h-11 w-full cursor-pointer rounded-[10px] bg-ink text-[14px] font-medium text-surface"
                >
                  Go to log in
                </button>
              </div>
            )}

            {view === "otp" && (
              <>
                <h1 className="text-center font-serif text-[34px] leading-none text-ink">Verify your phone</h1>
                <p className="mt-3 text-center text-[13px] leading-[1.45] text-muted">
                  Enter the 6-digit code sent to {otpPhone}
                </p>
                <form className="mt-7 space-y-4" onSubmit={handleOtpSubmit}>
                  <label className="block text-[13px] text-muted">
                    Verification code
                    <input
                      required
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      className="mt-1.5 h-11 w-full rounded-[10px] border border-line bg-paper px-3 text-center text-[20px] font-medium tracking-[0.3em] text-ink outline-none placeholder:text-muted-2 transition focus:border-[#c2bab0]"
                    />
                  </label>

                  {note ? (
                    <p className={`text-center text-[13px] ${noteType === "error" ? "text-red-600" : "text-olive"}`}>{note}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="h-11 w-full cursor-pointer rounded-[10px] bg-ink text-[14px] font-medium text-surface transition hover:bg-[#1d1d1d] disabled:opacity-50"
                  >
                    {isPending ? "Verifying…" : "Verify"}
                  </button>

                  <button
                    type="button"
                    className="mx-auto block cursor-pointer text-[12px] text-muted hover:text-ink"
                    onClick={() => { setView("form"); setNote(""); }}
                  >
                    ← Back
                  </button>
                </form>
              </>
            )}

            {/* ─── Forgot Password View ─── */}
            {view === "forgot" && (
              <>
                <h1 className="text-center font-serif text-[34px] leading-none text-ink">Reset password</h1>
                <p className="mt-3 text-center text-[13px] leading-[1.45] text-muted">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
                <form className="mt-7 space-y-4" onSubmit={handleForgotSubmit}>
                  <Field label="Email" name="email" type="email" placeholder="Your email address" />

                  {turnstileEnabled && (
                    <div className="flex justify-center" ref={turnstileRef}>
                      <Turnstile
                        siteKey={turnstileSiteKey}
                        onVerify={handleCaptchaVerify}
                        onExpire={handleCaptchaExpire}
                        onError={handleCaptchaError}
                        theme="light"
                      />
                    </div>
                  )}

                  {note ? (
                    <p className={`text-center text-[13px] ${noteType === "error" ? "text-red-600" : "text-olive"}`}>{note}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isPending || (captchaRequired && !captchaToken)}
                    className="h-11 w-full cursor-pointer rounded-[10px] bg-ink text-[14px] font-medium text-surface transition hover:bg-[#1d1d1d] disabled:opacity-50"
                  >
                    {isPending ? "Sending…" : "Send reset link"}
                  </button>

                  <button
                    type="button"
                    className="mx-auto block cursor-pointer text-[12px] text-muted hover:text-ink"
                    onClick={() => { setView("form"); setNote(""); go("login"); }}
                  >
                    ← Back to login
                  </button>
                </form>
              </>
            )}

            {/* ─── Main Auth Form View ─── */}
            {view === "form" && (
              <>
                <h1 className="text-center font-serif text-[34px] leading-none text-ink">{signup ? "Create your account" : "Welcome back"}</h1>
                <p className="mt-3 text-center text-[13px] leading-[1.45] text-muted">{signup ? "Start with Google or continue with your phone/email." : "Continue with Google or use your phone/email."}</p>
                <form className="mt-7 space-y-4" onSubmit={handleFormSubmit}>
                  {/* Google OAuth */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleGoogleSignIn}
                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-line bg-paper text-[14px] font-medium text-ink transition hover:bg-[#f7f5f2] hover:border-[#d7d1c8] disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {signup ? "Sign up with Google" : "Log in with Google"}
                  </button>

                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted">
                    <span className="h-px flex-1 bg-line" />
                    <span>or use phone / email</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>

                  {signup ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="First name" name="firstName" type="text" placeholder="First name" />
                      <Field label="Last name" name="lastName" type="text" placeholder="Last name" />
                    </div>
                  ) : null}
                  <Field label="Phone or email" name="contact" type="text" placeholder="Phone number or work email" />
                  <label className="block text-[13px] text-muted">
                    Password
                    <span className="relative mt-1.5 block">
                      <input
                        required
                        name="password"
                        type={show ? "text" : "password"}
                        placeholder="Enter your password"
                        minLength={6}
                        className="h-11 w-full rounded-[10px] border border-line bg-paper px-3 pr-16 text-[14px] text-ink outline-none placeholder:text-muted-2 transition focus:border-[#c2bab0]"
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[12px] text-muted" onClick={() => setShow((value) => !value)}>
                        {show ? "Hide" : "Show"}
                      </button>
                    </span>
                  </label>
                  {signup ? (
                    <label className="block text-[13px] text-muted">
                      Re-enter password
                      <span className="relative mt-1.5 block">
                        <input
                          required
                          name="passwordConfirm"
                          type={show ? "text" : "password"}
                          placeholder="Re-enter your password"
                          minLength={6}
                          autoComplete="new-password"
                          className="h-11 w-full rounded-[10px] border border-line bg-paper px-3 pr-16 text-[14px] text-ink outline-none placeholder:text-muted-2 transition focus:border-[#c2bab0]"
                        />
                      </span>
                    </label>
                  ) : null}
                  {signup ? null : (
                    <div className="text-right">
                      <button
                        type="button"
                        className="cursor-pointer text-[12px] text-muted hover:text-ink"
                        onClick={() => { setView("forgot"); setNote(""); }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {/* Turnstile CAPTCHA */}
                  {turnstileEnabled && (
                    <div className="flex justify-center" ref={turnstileRef}>
                      <Turnstile
                        siteKey={turnstileSiteKey}
                        onVerify={handleCaptchaVerify}
                        onExpire={handleCaptchaExpire}
                        onError={handleCaptchaError}
                        theme="light"
                      />
                    </div>
                  )}

                  {note ? (
                    <p className={`text-center text-[13px] ${noteType === "error" ? "text-red-600" : "text-olive"}`}>{note}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isPending || (captchaRequired && !captchaToken)}
                    className="h-11 w-full cursor-pointer rounded-[10px] bg-ink text-[14px] font-medium text-surface transition hover:bg-[#1d1d1d] disabled:opacity-50"
                  >
                    {isPending
                      ? (signup ? "Creating account…" : "Logging in…")
                      : (signup ? "Create account" : "Log in")
                    }
                  </button>

                  {signup && (
                    <p className="text-center text-[11px] leading-[1.5] text-muted">
                      By creating an account, you agree to our{" "}
                      <Link href="/terms" className="underline hover:text-ink">Terms of Service</Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="underline hover:text-ink">Privacy Policy</Link>.
                    </p>
                  )}
                </form>
              </>
            )}

            {view === "form" && (
              <>
                <p className="mt-5 text-center text-[13px] text-muted">
                  {signup ? "Already have an account?" : "Need an account?"}{" "}
                  <button type="button" className="cursor-pointer font-medium text-ink" onClick={() => go(signup ? "login" : "signup")}>
                    {signup ? "Log in" : "Sign up"}
                  </button>
                </p>
                <p className="mt-3 text-center text-[12px] text-muted">{signup ? "Pull the cord again to log in." : "Pull the cord to turn the light off."}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {authPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-5 py-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-prompt-title"
            className="w-full max-w-[380px] rounded-[16px] border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(17,18,20,0.24)]"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Cueable account</p>
            <h2 id="auth-prompt-title" className="mt-2 font-serif text-[26px] leading-tight text-ink">
              {authPrompt === "create-account" ? "No account found" : authPrompt === "log-in" ? "Account already exists" : "Google account ready"}
            </h2>
            <p className="mt-3 text-[14px] leading-[1.5] text-muted">
              {authPrompt === "create-account"
                ? "There is no account for this email yet. Create one to get started."
                : authPrompt === "log-in"
                  ? "This email is already registered. Log in to continue."
                  : "No existing account was found. Google created an account for you; continue to your workspace."}
            </p>
            <button
              type="button"
              className="mt-6 h-11 w-full cursor-pointer rounded-[10px] bg-ink text-[14px] font-medium text-surface transition hover:bg-[#1d1d1d]"
              onClick={() => {
                const prompt = authPrompt;
                setAuthPrompt(null);
                if (prompt === "google-account-created") {
                  router.replace("/app");
                } else {
                  go(prompt === "create-account" ? "signup" : "login");
                }
              }}
            >
              {authPrompt === "create-account" ? "Create account" : authPrompt === "log-in" ? "Go to log in" : "Continue to workspace"}
            </button>
            {authPrompt !== "google-account-created" && (
              <button
                type="button"
                className="mt-3 w-full cursor-pointer py-1 text-[13px] text-muted hover:text-ink"
                onClick={() => setAuthPrompt(null)}
              >
                Not now
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Field({ label, name, type, placeholder }: { label: string; name: string; type: string; placeholder: string }) {
  return (
    <label className="block text-[13px] text-muted">
      {label}
      <input required name={name} type={type} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-[10px] border border-line bg-paper px-3 text-[14px] text-ink outline-none placeholder:text-muted-2 transition focus:border-[#c2bab0]" />
    </label>
  );
}

const moods = {
  off: {
    edge: "#2a2c30",
    mid: "#4a4d53",
    top: "#3a3d42",
    stem: "#6a6e74",
    stemHi: "#8d9198",
    base: "#b7bcc2",
    baseEdge: "#8e9399",
    cord: "#3f4248",
    beam: "rgba(180,184,190,0)",
    mouth: "#1c1e22",
    bulb: "#1c1e22",
    halo: "rgba(0,0,0,0)",
    cheek: "transparent",
    ribHighlight: "rgba(255,255,255,0.04)",
    beadRing: "#7a7e84",
    beadFill: "#c8cbd0",
    beadHighlight: "rgba(255,255,255,0.4)",
  },
  signup: {
    edge: "#6d8450",
    mid: "#c5d4a4",
    top: "#a9be86",
    stem: "#f4f1ea",
    stemHi: "#ffffff",
    base: "#f7f4ef",
    baseEdge: "#d9d3c8",
    cord: "#3f4248",
    beam: "rgba(214,224,176,0.55)",
    mouth: "#243018",
    bulb: "#ffeaa7",
    halo: "rgba(194,214,136,0.18)",
    cheek: "rgba(220,180,160,0.35)",
    ribHighlight: "rgba(255,255,255,0.22)",
    beadRing: "#8fa06e",
    beadFill: "#e8ecd4",
    beadHighlight: "rgba(255,255,240,0.7)",
  },
  login: {
    edge: "#a07c62",
    mid: "#e4d0b8",
    top: "#c9aa90",
    stem: "#f7f4ef",
    stemHi: "#ffffff",
    base: "#f7f4ef",
    baseEdge: "#ddd4c8",
    cord: "#3f4248",
    beam: "rgba(232,196,156,0.55)",
    mouth: "#3a2a22",
    bulb: "#ffe4b5",
    halo: "rgba(232,196,156,0.16)",
    cheek: "rgba(230,160,140,0.3)",
    ribHighlight: "rgba(255,255,255,0.2)",
    beadRing: "#b09478",
    beadFill: "#eddcc8",
    beadHighlight: "rgba(255,255,240,0.65)",
  },
};

/* Dust particles that float in the light beam */
function DustMotes({ awake }: { awake: boolean }) {
  if (!awake) return null;
  const particles = [
    { cx: 110, cy: 340, dx: 18, dy: -60, delay: 0, dur: 4.2 },
    { cx: 200, cy: 360, dx: -14, dy: -50, delay: 1.1, dur: 3.8 },
    { cx: 145, cy: 380, dx: 8, dy: -70, delay: 2.4, dur: 5.0 },
    { cx: 180, cy: 330, dx: -20, dy: -44, delay: 0.6, dur: 4.5 },
    { cx: 125, cy: 400, dx: 12, dy: -55, delay: 3.2, dur: 3.6 },
    { cx: 210, cy: 390, dx: -6, dy: -48, delay: 1.8, dur: 4.8 },
  ];
  return (
    <g>
      {particles.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r="1.5"
          fill="rgba(255,248,220,0.7)"
        >
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`0,0; ${p.dx * 0.3},${p.dy * 0.3}; ${p.dx},${p.dy}`}
            dur={`${p.dur}s`}
            begin={`${p.delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;0.6;0.5;0"
            dur={`${p.dur}s`}
            begin={`${p.delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="0.8;1.6;1.2"
            dur={`${p.dur}s`}
            begin={`${p.delay}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </g>
  );
}

function StudioLamp({
  phase,
  pull,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onNudge,
}: {
  phase: Phase;
  pull: number;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onNudge: () => void;
}) {
  const mood = moods[phase];
  const nod = pull * 0.055;
  const cordEnd = 348 + pull;
  const awake = phase !== "off";

  /* Chain link positions along the cord */
  const cordMidY = (228 + cordEnd) / 2;
  const cordQuarterY = (228 + cordMidY) / 2;
  const cord3QuarterY = (cordMidY + cordEnd) / 2;

  return (
    <div className="relative h-[480px] w-[320px] shrink-0">
      {/* Ambient halo behind the lamp */}
      <div
        className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
          background: `radial-gradient(circle, ${mood.halo} 0%, transparent 70%)`,
          filter: "blur(40px)",
          animation: awake ? "halo-breathe 4s ease-in-out infinite" : "none",
          transition: "background 0.6s ease",
        }}
      />

      <svg viewBox="0 0 320 480" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          {/* Metallic shade gradient */}
          <linearGradient id="shade-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={mood.edge} />
            <stop offset="0.22" stopColor={mood.mid} stopOpacity="0.9" />
            <stop offset="0.42" stopColor={mood.mid} />
            <stop offset="0.58" stopColor={mood.mid} stopOpacity="0.95" />
            <stop offset="0.78" stopColor={mood.mid} stopOpacity="0.85" />
            <stop offset="1" stopColor={mood.edge} />
          </linearGradient>

          <linearGradient id="shade-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mood.top} />
            <stop offset="0.6" stopColor={mood.edge} stopOpacity="0.9" />
            <stop offset="1" stopColor={mood.edge} />
          </linearGradient>

          {/* Stem with metallic highlight */}
          <linearGradient id="stem-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={mood.stem} />
            <stop offset="0.35" stopColor={mood.stemHi} />
            <stop offset="0.5" stopColor={mood.stemHi} />
            <stop offset="0.65" stopColor={mood.stemHi} stopOpacity="0.95" />
            <stop offset="1" stopColor={mood.stem} />
          </linearGradient>

          {/* Light beam with radial falloff */}
          <radialGradient id="beam" cx="50%" cy="0%" r="70%">
            <stop offset="0" stopColor={mood.beam} />
            <stop offset="1" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Inner bulb warm glow */}
          <radialGradient id="bulb-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={mood.bulb} stopOpacity={awake ? "0.9" : "0"} />
            <stop offset="0.5" stopColor={mood.bulb} stopOpacity={awake ? "0.4" : "0"} />
            <stop offset="1" stopColor={mood.bulb} stopOpacity="0" />
          </radialGradient>

          {/* Base metallic ring */}
          <linearGradient id="base-ring" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mood.base} />
            <stop offset="0.5" stopColor={mood.baseEdge} />
            <stop offset="1" stopColor={mood.base} stopOpacity="0.85" />
          </linearGradient>

          {/* Shade interior glow filter */}
          <filter id="inner-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
          </filter>

          {/* Cord braid texture */}
          <pattern id="cord-braid" width="4" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="4" y2="6" stroke={mood.cord} strokeWidth="0.8" strokeOpacity="0.3" />
            <line x1="4" y1="0" x2="0" y2="6" stroke={mood.cord} strokeWidth="0.8" strokeOpacity="0.2" />
          </pattern>
        </defs>

        {/* Light cone with pulsating animation */}
        <g style={{ animation: awake ? "beam-pulse 3s ease-in-out infinite" : "none" }}>
          <polygon
            points="58,250 148,248 118,430 8,440"
            fill={mood.beam}
            opacity={awake ? 0.75 : 0}
            style={{ transition: "opacity 0.6s ease" }}
          />
          <polygon
            points="172,248 262,250 312,440 202,430"
            fill={mood.beam}
            opacity={awake ? 0.75 : 0}
            style={{ transition: "opacity 0.6s ease" }}
          />
          {/* Soft inner light cone */}
          <polygon
            points="88,250 148,248 128,410 48,420"
            fill={mood.beam}
            opacity={awake ? 0.3 : 0}
            style={{ transition: "opacity 0.6s ease" }}
          />
          <polygon
            points="172,248 232,250 272,420 192,410"
            fill={mood.beam}
            opacity={awake ? 0.3 : 0}
            style={{ transition: "opacity 0.6s ease" }}
          />
        </g>

        {/* Floating dust particles in the light */}
        <DustMotes awake={awake} />

        {/* Floor shadow — softer and wider when lit */}
        <ellipse
          cx="160"
          cy="432"
          rx={awake ? 100 : 86}
          ry={awake ? 14 : 10}
          fill="rgba(23,23,23,0.06)"
          style={{ transition: "all 0.5s ease" }}
        />
        <ellipse
          cx="160"
          cy="432"
          rx="72"
          ry="8"
          fill="rgba(23,23,23,0.05)"
        />

        {/* === Lamp head group (nodding) === */}
        <g style={{ transform: `rotate(${nod}deg)`, transformOrigin: "160px 248px" }}>
          {/* Main shade body */}
          <path
            d="M78 118 C70 170 42 220 48 246 L272 246 C278 220 250 170 242 118 Z"
            fill="url(#shade-body)"
            style={{ transition: "fill 0.5s ease" }}
          />

          {/* Shade ribs (decorative lines) */}
          <path d="M100 132 C96 176 82 214 84 240" fill="none" stroke={mood.ribHighlight} strokeWidth="1" style={{ animation: awake ? "shade-shimmer 4s ease-in-out infinite" : "none" }} />
          <path d="M140 125 C138 170 134 214 133 240" fill="none" stroke={mood.ribHighlight} strokeWidth="0.8" style={{ animation: awake ? "shade-shimmer 4s ease-in-out 0.5s infinite" : "none" }} />
          <path d="M180 125 C182 170 186 214 187 240" fill="none" stroke={mood.ribHighlight} strokeWidth="0.8" style={{ animation: awake ? "shade-shimmer 4s ease-in-out 1s infinite" : "none" }} />
          <path d="M220 132 C224 176 238 214 236 240" fill="none" stroke={mood.ribHighlight} strokeWidth="1" style={{ animation: awake ? "shade-shimmer 4s ease-in-out 1.5s infinite" : "none" }} />

          {/* Primary shine stripe */}
          <path
            d="M118 132 C132 176 136 214 134 240"
            fill="none"
            stroke="#fff"
            strokeOpacity={awake ? 0.25 : 0.05}
            strokeWidth="14"
            strokeLinecap="round"
            style={{ transition: "stroke-opacity 0.5s ease" }}
          />

          {/* Secondary subtle shine */}
          <path
            d="M196 136 C202 176 206 214 204 240"
            fill="none"
            stroke="#fff"
            strokeOpacity={awake ? 0.12 : 0.02}
            strokeWidth="8"
            strokeLinecap="round"
            style={{ transition: "stroke-opacity 0.5s ease" }}
          />

          {/* Top ellipse cap */}
          <ellipse
            cx="160"
            cy="118"
            rx="82"
            ry="20"
            fill="url(#shade-top)"
            style={{ transition: "fill 0.5s ease" }}
          />

          {/* Top rim highlight */}
          <ellipse
            cx="160"
            cy="118"
            rx="80"
            ry="18"
            fill="none"
            stroke="#fff"
            strokeOpacity={awake ? 0.15 : 0.04}
            strokeWidth="0.8"
          />

          {/* Mouth opening — warm glow when lit */}
          <ellipse
            cx="160"
            cy="248"
            rx="108"
            ry="9"
            fill={awake ? "#fff6df" : "#101216"}
            style={{ transition: "fill 0.5s ease" }}
          />

          {/* Inner bulb glow orb */}
          <ellipse
            cx="160"
            cy="238"
            rx="40"
            ry="18"
            fill="url(#bulb-glow)"
            filter={awake ? "url(#inner-glow)" : undefined}
            opacity={awake ? 1 : 0}
            style={{ transition: "opacity 0.5s ease" }}
          />

          {/* Mouth rim — subtle ring */}
          <ellipse
            cx="160"
            cy="248"
            rx="108"
            ry="9"
            fill="none"
            stroke={awake ? "rgba(255,246,220,0.3)" : "rgba(255,255,255,0.03)"}
            strokeWidth="0.7"
          />

          {/* Face */}
          <LampFace awake={awake} mouth={mood.mouth} cheek={mood.cheek} />
        </g>

        {/* === Stem with decorative bands === */}
        <rect x="148" y="258" width="24" height="148" rx="12" fill="url(#stem-body)" />
        {/* Decorative bands on stem */}
        <rect x="150" y="280" width="20" height="2" rx="1" fill={mood.stemHi} opacity="0.3" />
        <rect x="150" y="320" width="20" height="2" rx="1" fill={mood.stemHi} opacity="0.25" />
        <rect x="150" y="360" width="20" height="2" rx="1" fill={mood.stemHi} opacity="0.2" />
        {/* Stem cap */}
        <ellipse cx="160" cy="258" rx="12" ry="5" fill={mood.stemHi} />
        <ellipse cx="160" cy="258" rx="10" ry="4" fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="0.6" />

        {/* === Base with metallic ring === */}
        <ellipse cx="160" cy="408" rx="78" ry="18" fill={mood.baseEdge} />
        <ellipse cx="160" cy="400" rx="78" ry="16" fill={mood.base} />
        {/* Base top rim highlight */}
        <ellipse cx="160" cy="400" rx="76" ry="14" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="0.6" />
        {/* Decorative base ring */}
        <ellipse cx="160" cy="404" rx="68" ry="10" fill="none" stroke={mood.baseEdge} strokeWidth="1.2" strokeOpacity="0.5" />

        {/* === Cord — braided with chain links === */}
        {/* Main cord path */}
        <path
          d={`M112 228 C 86 ${250 + pull * 0.2}, 78 ${300 + pull * 0.35}, 96 ${cordEnd}`}
          fill="none"
          stroke={mood.cord}
          strokeWidth="2.6"
          strokeLinecap="round"
          style={{ transition: "stroke 0.3s ease" }}
        />
        {/* Cord highlight — gives braided feel */}
        <path
          d={`M112 228 C 86 ${250 + pull * 0.2}, 78 ${300 + pull * 0.35}, 96 ${cordEnd}`}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="3 5"
        />

        {/* Small chain-link ornaments along cord */}
        <ellipse
          cx="100"
          cy={cordQuarterY}
          rx="3"
          ry="4.5"
          fill="none"
          stroke={mood.cord}
          strokeWidth="1.3"
          opacity="0.6"
        />
        <ellipse
          cx="94"
          cy={cord3QuarterY}
          rx="3"
          ry="4.5"
          fill="none"
          stroke={mood.cord}
          strokeWidth="1.3"
          opacity="0.5"
        />
      </svg>

      {/* === Ornamental pull bead with large grab area === */}
      <div
        role="button"
        tabIndex={0}
        aria-label={awake ? "Pull the cord" : "Pull the cord to open the studio"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNudge();
          }
        }}
        style={{
          top: cordEnd - 30,
        }}
        className={`absolute left-[96px] z-10 flex h-[60px] w-[60px] -translate-x-1/2 touch-none select-none items-center justify-center ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Visible bead */}
        <div
          style={{
            background: `radial-gradient(circle at 40% 35%, ${mood.beadHighlight}, ${mood.beadFill} 60%, ${mood.beadRing})`,
            transition: dragging ? "none" : "background 0.4s ease, transform 0.15s ease",
            transform: dragging ? "scale(0.92)" : "scale(1)",
          }}
          className={`relative h-[34px] w-[34px] rounded-full border-2 pointer-events-none ${
            dragging
              ? "border-white/70"
              : `border-white/40 ${awake ? "lamp-bead-lit" : ""}`
          } shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(0,0,0,0.28)]`}
        >
          {/* Inner decorative ring */}
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              width: 18,
              height: 18,
              borderColor: `${mood.beadRing}80`,
              transition: "border-color 0.4s ease",
            }}
          />
          {/* Center dot */}
          <span
            className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: mood.cord,
              boxShadow: awake ? `0 0 4px ${mood.bulb}` : "none",
              transition: "all 0.4s ease",
            }}
          />
          {/* Top highlight crescent */}
          <span
            className="absolute left-1/2 top-[6px] h-[3px] w-[12px] -translate-x-1/2 rounded-full bg-white/40"
          />
        </div>
        {/* Pull hint */}
        {!dragging && pull < 5 && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-muted/60 animate-bounce">
            pull ↓
          </span>
        )}
      </div>
    </div>
  );
}

function LampFace({ awake, mouth, cheek }: { awake: boolean; mouth: string; cheek: string }) {
  if (!awake) {
    return (
      <g>
        {/* Sleeping eyes — gentle arcs */}
        <g fill="none" stroke="#1a1c20" strokeWidth="2.8" strokeLinecap="round">
          <path d="M118 168 q12 10 24 0" />
          <path d="M178 168 q12 10 24 0" />
        </g>
        {/* Tiny sleeping Z's */}
        <text x="210" y="150" fontSize="11" fill="#1a1c20" opacity="0.25" fontWeight="bold">z</text>
        <text x="222" y="140" fontSize="8" fill="#1a1c20" opacity="0.18" fontWeight="bold">z</text>
      </g>
    );
  }

  return (
    <g>
      {/* Rosy cheeks */}
      <ellipse cx="116" cy="182" rx="14" ry="8" fill={cheek} style={{ transition: "fill 0.5s ease" }} />
      <ellipse cx="204" cy="182" rx="14" ry="8" fill={cheek} style={{ transition: "fill 0.5s ease" }} />

      {/* Happy eyes with blink animation */}
      <g>
        <path d="M116 162 q14 -16 26 2" fill="none" stroke="#1c1e18" strokeWidth="3" strokeLinecap="round">
          <animate
            attributeName="d"
            values="M116 162 q14 -16 26 2;M116 166 q14 4 26 0;M116 162 q14 -16 26 2"
            dur="4s"
            begin="2s"
            repeatCount="indefinite"
            keyTimes="0;0.04;0.08"
            calcMode="spline"
            keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
          />
        </path>
        <path d="M176 162 q14 -16 26 2" fill="none" stroke="#1c1e18" strokeWidth="3" strokeLinecap="round">
          <animate
            attributeName="d"
            values="M176 162 q14 -16 26 2;M176 166 q14 4 26 0;M176 162 q14 -16 26 2"
            dur="4s"
            begin="2s"
            repeatCount="indefinite"
            keyTimes="0;0.04;0.08"
            calcMode="spline"
            keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
          />
        </path>
      </g>

      {/* Smile with tongue */}
      <path d="M132 186 q28 34 56 0 q-10 18 -28 22 q-18 -4 -28 -22 Z" fill={mouth} style={{ transition: "fill 0.5s ease" }} />
      <ellipse cx="160" cy="206" rx="12" ry="8" fill="#e0898a" />
      {/* Tongue highlight */}
      <ellipse cx="158" cy="204" rx="6" ry="4" fill="rgba(255,255,255,0.15)" />
    </g>
  );
}
