/**
 * Public types shared by the SDK, the React component and the API.
 * Kept free of server-only imports so it is safe in any bundle.
 */
export type {
  Network,
  PaymentRequest,
  PaymentStatus,
  PaymentStatusResponse,
  StatusEvent,
  TrustLevel,
} from "@/lib/payments/types";
