/**
 * Public facts about who runs this deployment, shown on the legal pages.
 * Read at build time on the server. Set them before launch (see
 * docs/DEPLOYMENT.md); these are not secrets.
 */
export const LEGAL_UPDATED = "25 October 2026";

export function operator() {
  return {
    name: process.env.YOLA_OPERATOR_NAME?.trim() || "the operator of this Yola deployment",
    email: process.env.YOLA_CONTACT_EMAIL?.trim() || null,
    configured: Boolean(process.env.YOLA_OPERATOR_NAME?.trim() && process.env.YOLA_CONTACT_EMAIL?.trim()),
  };
}
