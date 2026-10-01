export const HOME_CARD_HOVER_ANIMATIONS = [
  { value: "none", label: "None" },
  { value: "tilt-right", label: "Tilt right" },
  { value: "tilt-left", label: "Tilt left" },
  { value: "shift-up", label: "Shift upward" },
  { value: "shift-down", label: "Shift downward" },
  { value: "slide-left", label: "Slide left" },
  { value: "slide-right", label: "Slide right" },
  { value: "zoom-in", label: "Zoom in" },
  { value: "zoom-out", label: "Zoom out" },
  { value: "rotate-right", label: "Rotate right" },
  { value: "rotate-left", label: "Rotate left" },
  { value: "flip-horizontal", label: "Flip horizontal" },
  { value: "flip-vertical", label: "Flip vertical" },
  { value: "soft-glow", label: "Soft glow" },
  { value: "shrink", label: "Shrink" },
] as const;

export type HomeCardHoverAnimation = (typeof HOME_CARD_HOVER_ANIMATIONS)[number]["value"];

export function isHomeCardHoverAnimation(value: unknown): value is HomeCardHoverAnimation {
  return typeof value === "string" && HOME_CARD_HOVER_ANIMATIONS.some((animation) => animation.value === value);
}