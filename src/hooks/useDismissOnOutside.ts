"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useDismissOnOutside(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !ref.current?.contains(target)) {
        dismissRef.current();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, ref]);
}
