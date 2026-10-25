/**
 * Yola motion system.
 *
 * Rule: motion explains a change, communicates a result, or makes an
 * interaction feel responsive. Nothing loops without a reason.
 * Durations mirror the CSS tokens in globals.css.
 */
export const duration = {
  instant: 0.09,
  quick: 0.16,
  base: 0.24,
  slow: 0.48,
  /** Only for the hero rail's single traversal. */
  journey: 1.1,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

/** Named transitions. Components reference these, never raw numbers. */
export const transition = {
  press: { duration: duration.instant, ease: ease.out },
  hover: { duration: duration.quick, ease: ease.out },
  reveal: { duration: duration.base, ease: ease.out },
  panel: { duration: duration.slow, ease: ease.out },
  /** A genuine status change from the backend (or the labelled simulator). */
  statusChange: { type: "spring", stiffness: 420, damping: 30, mass: 0.8 } as const,
  journey: { duration: duration.journey, ease: ease.inOut },
};

/** Revealing a freshly generated QR: opacity + slight scale only, so it stays scannable. */
export const qrReveal = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0 },
  transition: transition.reveal,
};

export const panelSwap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: transition.reveal,
};
