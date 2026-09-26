"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "off" | "signup" | "login";

const nextPhase: Record<Phase, Phase> = {
  off: "signup",
  signup: "login",
  login: "off",
};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(mode === "login" ? "login" : "off");
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const drag = useRef<{ y: number; base: number } | null>(null);
  const pullRef = useRef(0);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function commitPull(value: number) {
    pullRef.current = value;
    setPull(value);
  }

  function go(next: Phase) {
    setPhase(next);
    setNote("");
    const href = next === "login" ? "/login" : "/signup";
    window.history.replaceState(null, "", href);
  }

  function springBack(advance: boolean) {
    if (advance) go(nextPhase[phase]);
    let y = pullRef.current;
    let velocity = 0;
    const step = () => {
      velocity = (velocity + (0 - y) * 0.28) * 0.58;
      y += velocity;
      if (Math.abs(y) < 0.35 && Math.abs(velocity) < 0.35) {
        commitPull(0);
        return;
      }
      commitPull(y);
      frame.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    cancelAnimationFrame(frame.current);
    drag.current = { y: event.clientY, base: pullRef.current };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const next = drag.current.base + (event.clientY - drag.current.y);
    commitPull(Math.min(120, Math.max(-12, next)));
  }

  function onPointerUp() {
    const distance = pullRef.current;
    drag.current = null;
    setDragging(false);
    springBack(distance > 58);
  }

  function nudge() {
    cancelAnimationFrame(frame.current);
    commitPull(78);
    requestAnimationFrame(() => springBack(true));
  }

  const signup = phase === "signup";
  const open = phase !== "off";
  const glow =
    phase === "login"
      ? "shadow-[0_0_0_1px_rgba(214,164,122,0.7),0_0_56px_rgba(214,150,104,0.42)]"
      : "shadow-[0_0_0_1px_rgba(168,186,122,0.75),0_0_56px_rgba(154,176,112,0.4)]";

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <Link href="/" className="absolute left-6 top-6 z-10 text-[15px] font-semibold tracking-tight text-ink">
        Primecut
      </Link>

      <div className={`relative z-10 mx-auto flex min-h-screen w-full max-w-[1040px] flex-col items-center justify-center gap-8 px-6 py-20 md:flex-row md:gap-16 ${open ? "" : "md:justify-start md:pl-[10%]"}`}>
        <StudioLamp phase={phase} pull={pull} dragging={dragging} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onNudge={nudge} />

        <div inert={open ? undefined : true} className={`w-full max-w-[380px] transition-all duration-500 ease-out ${open ? "relative translate-y-0 opacity-100" : "pointer-events-none absolute translate-y-3 opacity-0"}`}>
          <div className={`rounded-[22px] border border-line bg-surface px-7 py-8 ${glow}`}>
            <h1 className="text-center font-serif text-[34px] leading-none text-ink">{signup ? "Open a studio" : "Welcome back"}</h1>
            <p className="mt-3 text-center text-[13px] leading-[1.45] text-muted">Accounts are not connected yet. This opens the local preview.</p>
            <form
              className="mt-7 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                router.push("/app");
              }}
            >
              {signup ? <Field label="Name" name="name" type="text" placeholder="Your name" /> : null}
              <Field label="Email" name="email" type="email" placeholder="Work email" />
              <label className="block text-[13px] text-muted">
                Password
                <span className="relative mt-1.5 block">
                  <input
                    required
                    name="password"
                    type={show ? "text" : "password"}
                    placeholder="Enter your password"
                    className="h-11 w-full rounded-[10px] border border-line bg-paper px-3 pr-16 text-[14px] text-ink outline-none placeholder:text-muted-2"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[12px] text-muted" onClick={() => setShow((value) => !value)}>
                    {show ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              {signup ? null : (
                <div className="text-center">
                  <button type="button" className="cursor-pointer text-[13px] text-muted" onClick={() => setNote("Password reset is not connected yet.")}>
                    Forgot password?
                  </button>
                </div>
              )}
              {note ? <p className="text-center text-[13px] text-muted">{note}</p> : null}
              <button type="submit" className="h-11 w-full cursor-pointer rounded-[10px] bg-ink text-[14px] font-medium text-surface">
                {signup ? "Create account" : "Log in"}
              </button>
            </form>
            <p className="mt-5 text-center text-[13px] text-muted">{signup ? "Pull the cord again to log in." : "Pull the cord to turn the light off."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, type, placeholder }: { label: string; name: string; type: string; placeholder: string }) {
  return (
    <label className="block text-[13px] text-muted">
      {label}
      <input required name={name} type={type} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-[10px] border border-line bg-paper px-3 text-[14px] text-ink outline-none placeholder:text-muted-2" />
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
  },
};

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
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onNudge: () => void;
}) {
  const mood = moods[phase];
  const nod = pull * 0.055;
  const cordEnd = 348 + pull;
  const awake = phase !== "off";

  return (
    <div className="relative h-[480px] w-[320px] shrink-0">
      <svg viewBox="0 0 320 480" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="shade-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={mood.edge} />
            <stop offset="0.42" stopColor={mood.mid} />
            <stop offset="1" stopColor={mood.edge} />
          </linearGradient>
          <linearGradient id="shade-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mood.top} />
            <stop offset="1" stopColor={mood.edge} />
          </linearGradient>
          <linearGradient id="stem-body" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={mood.stem} />
            <stop offset="0.5" stopColor={mood.stemHi} />
            <stop offset="1" stopColor={mood.stem} />
          </linearGradient>
          <radialGradient id="beam" cx="50%" cy="0%" r="70%">
            <stop offset="0" stopColor={mood.beam} />
            <stop offset="1" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        <polygon points="58,250 148,248 118,430 8,440" fill={mood.beam} opacity={awake ? 0.9 : 0} />
        <polygon points="172,248 262,250 312,440 202,430" fill={mood.beam} opacity={awake ? 0.9 : 0} />
        <ellipse cx="160" cy="432" rx="92" ry="12" fill="rgba(23,23,23,0.08)" />

        <g style={{ transform: `rotate(${nod}deg)`, transformOrigin: "160px 248px" }}>
          <path d="M78 118 C70 170 42 220 48 246 L272 246 C278 220 250 170 242 118 Z" fill="url(#shade-body)" />
          <path d="M118 132 C132 176 136 214 134 240" fill="none" stroke="#fff" strokeOpacity={awake ? 0.3 : 0.07} strokeWidth="16" strokeLinecap="round" />
          <ellipse cx="160" cy="118" rx="82" ry="20" fill="url(#shade-top)" />
          <ellipse cx="160" cy="248" rx="108" ry="9" fill={awake ? "#fff6df" : "#101216"} />
          <LampFace awake={awake} mouth={mood.mouth} />
        </g>

        <rect x="148" y="258" width="24" height="148" rx="12" fill="url(#stem-body)" />
        <ellipse cx="160" cy="258" rx="12" ry="5" fill={mood.stemHi} />
        <ellipse cx="160" cy="408" rx="78" ry="18" fill={mood.baseEdge} />
        <ellipse cx="160" cy="400" rx="78" ry="16" fill={mood.base} />

        <path d={`M112 228 C 86 ${250 + pull * 0.2}, 78 ${300 + pull * 0.35}, 96 ${cordEnd}`} fill="none" stroke={mood.cord} strokeWidth="2.2" strokeLinecap="round" />
      </svg>

      <button
        type="button"
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
        style={{ top: cordEnd - 13 }}
        className={`absolute left-[96px] z-10 h-[26px] w-[26px] -translate-x-1/2 touch-none rounded-full border border-white/50 bg-[#e4e7eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_5px_rgba(0,0,0,0.28)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#121416]" />
      </button>
    </div>
  );
}

function LampFace({ awake, mouth }: { awake: boolean; mouth: string }) {
  if (!awake) {
    return (
      <g fill="none" stroke="#1a1c20" strokeWidth="3" strokeLinecap="round">
        <path d="M118 168 q12 10 24 0" />
        <path d="M178 168 q12 10 24 0" />
      </g>
    );
  }

  return (
    <g>
      <path d="M116 162 q14 -16 26 2" fill="none" stroke="#1c1e18" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M176 162 q14 -16 26 2" fill="none" stroke="#1c1e18" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M132 186 q28 34 56 0 q-10 18 -28 22 q-18 -4 -28 -22 Z" fill={mouth} />
      <ellipse cx="160" cy="206" rx="12" ry="8" fill="#e0898a" />
    </g>
  );
}
