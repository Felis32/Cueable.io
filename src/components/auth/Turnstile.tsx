"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: Record<string, unknown>
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileProps {
  siteKey: string;
  action?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (errorCode?: string | number) => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) {
    return new Promise((resolve) => {
      loadCallbacks.push(resolve);
    });
  }

  scriptLoading = true;

  return new Promise((resolve) => {
    loadCallbacks.push(resolve);

    const previousScript = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (previousScript) {
      previousScript.dataset.turnstile = "loaded";
      if (window.turnstile) {
        scriptLoaded = true;
        scriptLoading = false;
        loadCallbacks.forEach((cb) => cb());
        loadCallbacks.length = 0;
        return;
      }
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";

    window.onTurnstileLoad = () => {
      scriptLoaded = true;
      scriptLoading = false;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };

    document.head.appendChild(script);
  });
}

export function Turnstile({
  siteKey,
  action,
  onVerify,
  onExpire,
  onError,
  theme = "light",
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const [ready, setReady] = useState(scriptLoaded);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !siteKey || !window.turnstile) return;

    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore
      }
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme,
      action,
      callback: (token: string) => {
        onVerifyRef.current?.(token);
      },
      "expired-callback": () => {
        onExpireRef.current?.();
      },
      "error-callback": (errorCode: string | number) => {
        onErrorRef.current?.(errorCode);
        return true;
      },
    });
  }, [siteKey, theme, action]);

  useEffect(() => {
    if (!siteKey) return;

    loadScript().then(() => {
      setReady(true);
    });
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !ready) return;
    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [ready, renderWidget, siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} className={className} />;
}

export function resetTurnstile(widgetContainer: HTMLElement | null) {
  if (!widgetContainer || !window.turnstile) return;
  const widgetId = widgetContainer.querySelector("iframe")?.id;
  if (widgetId) {
    try {
      window.turnstile.reset(widgetId);
    } catch {
      /* ignore */
    }
  }
}
