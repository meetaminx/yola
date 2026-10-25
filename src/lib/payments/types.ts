/**
 * Shared payment domain types. Used by the demo adapter, the (Stage 3) API,
 * and the SDK, so all three describe the same contract.
 */

/** "demo" is not a Zcash network. It is Yola's simulator and never touches a chain. */
export type Network = "demo" | "testnet" | "mainnet";

export const PAYMENT_STATUSES = [
  "created",
  "awaiting_payment",
  "payment_detected",
  "confirming",
  "confirmed",
  "expired",
  "cancelled",
  "failed",
  "underpaid",
  "overpaid",
  "verification_required",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * How much a status can be trusted. A payment's trust level is fixed by its
 * network at creation and can never be upgraded: a simulated payment stays
 * simulated forever.
 */
export type TrustLevel = "simulated" | "verified_testnet" | "verified_mainnet";

export function trustLevelFor(network: Network): TrustLevel {
  switch (network) {
    case "demo":
      return "simulated";
    case "testnet":
      return "verified_testnet";
    case "mainnet":
      return "verified_mainnet";
  }
}

export interface StatusEvent {
  status: PaymentStatus;
  at: string; // ISO-8601
  /** What justified the transition. */
  evidence: EvidenceKind;
  note?: string;
}

/** Kinds of evidence that can justify a status transition. */
export type EvidenceKind =
  | "request_created" // the request was persisted
  | "merchant_action" // the merchant cancelled via an authenticated call
  | "observation" // the verification backend observed a matching output
  | "confirmation_depth" // the observed transaction reached N confirmations
  | "clock" // the expiry time passed with no qualifying observation
  | "reorg" // the observed transaction left the best chain or mempool
  | "operator"; // a human resolved a verification_required payment

export interface PaymentRequest {
  id: string;
  /** Exact decimal string with 8 fractional digits, e.g. "0.01000000". */
  amount: string;
  /** Exact integer amount in zatoshis (1 ZEC = 100,000,000 zatoshis), as a string. */
  amount_zatoshis: string;
  currency: "ZEC";
  network: Network;
  trust_level: TrustLevel;
  destination: string;
  description: string | null;
  /** Your own order or invoice ID, echoed back in webhooks. */
  external_reference: string | null;
  /** Your key/value pairs, echoed back. Never shown to the customer or put in the QR. */
  metadata: Record<string, string>;
  status: PaymentStatus;
  created_at: string;
  expires_at: string;
  /** ZIP-321 URI. Null when a standards-conformant URI cannot be built (always null in demo). */
  payment_uri: string | null;
  /** What the QR code encodes. In demo mode this is a clearly non-Zcash payload. */
  qr_payload: string;
  status_url: string;
  /** Confirmations observed / required. Null when the adapter cannot track depth. */
  confirmations: { observed: number; required: number } | null;
  /** Amount actually observed, when known. */
  amount_received_zatoshis: string | null;
  /** Transaction ID once the backend has observed it. In demo mode prefixed "sim_tx_". */
  transaction_id: string | null;
  /** Last time anything about the request changed. */
  updated_at: string;
  history: StatusEvent[];
}

/** Lightweight polling response from GET /payment-requests/:id/status. */
export interface PaymentStatusResponse {
  id: string;
  status: PaymentStatus;
  network: Network;
  trust_level: TrustLevel;
  amount: string;
  amount_received: string | null;
  confirmations: PaymentRequest["confirmations"];
  transaction_id: string | null;
  expires_at: string;
  updated_at: string;
  /** True when nothing further will happen without new evidence or an operator. */
  final: boolean;
}
