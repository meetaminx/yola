import type { Network } from "@/lib/payments/types";

/**
 * The verification capability contract.
 *
 * Every network adapter declares, per capability, whether it can actually
 * establish that fact. The verification service refuses to move a payment to
 * "confirmed" unless the adapter supports every capability the payment needs.
 *
 * "simulated" means the capability exists only inside Yola's demo simulator
 * and proves nothing about any blockchain.
 */
export type CapabilitySupport = "supported" | "unsupported" | "simulated" | "not_configured";

export interface VerificationCapabilities {
  addressValidation: CapabilitySupport;
  /** Derive a fresh receiving address per request from a merchant viewing key. */
  perRequestAddresses: CapabilitySupport;
  transactionLookup: CapabilitySupport;
  transparentPaymentDetection: CapabilitySupport;
  /** Trial-decrypt shielded outputs with the merchant's incoming viewing key. */
  shieldedPaymentDetection: CapabilitySupport;
  amountVerification: CapabilitySupport;
  destinationVerification: CapabilitySupport;
  confirmationTracking: CapabilitySupport;
  reorgHandling: CapabilitySupport;
  mempoolDetection: CapabilitySupport;
}

export type CapabilityName = keyof VerificationCapabilities;

/** Facts that must be established before a payment can be confirmed. */
export const REQUIRED_FOR_CONFIRMATION: readonly CapabilityName[] = [
  "amountVerification",
  "destinationVerification",
  "confirmationTracking",
  "reorgHandling",
];

export interface AdapterDescription {
  id: string;
  network: Network;
  label: string;
  capabilities: VerificationCapabilities;
  /** Plain-language reasons for anything not "supported". */
  limitations: string[];
}

/**
 * True only when every required capability is genuinely "supported".
 * A simulated adapter can drive the demo UI but can never confirm a real payment.
 */
export function canConfirmRealPayments(adapter: AdapterDescription): boolean {
  return REQUIRED_FOR_CONFIRMATION.every((c) => adapter.capabilities[c] === "supported");
}

export const DEMO_ADAPTER: AdapterDescription = {
  id: "demo-simulator",
  network: "demo",
  label: "Demo simulator",
  capabilities: {
    addressValidation: "simulated",
    perRequestAddresses: "simulated",
    transactionLookup: "simulated",
    transparentPaymentDetection: "simulated",
    shieldedPaymentDetection: "simulated",
    amountVerification: "simulated",
    destinationVerification: "simulated",
    confirmationTracking: "simulated",
    reorgHandling: "simulated",
    mempoolDetection: "simulated",
  },
  limitations: [
    "No blockchain connection. Every event is generated locally by the simulator.",
    "Simulated payments can never become verified testnet or mainnet payments.",
  ],
};

/**
 * Testnet adapter, as described before infrastructure is configured.
 * Stage 4 replaces "not_configured" with real support once a Zebra + Zaino
 * backend and a view-only wallet scanner are wired up and tested.
 */
export const TESTNET_ADAPTER_UNCONFIGURED: AdapterDescription = {
  id: "zcash-testnet",
  network: "testnet",
  label: "Zcash testnet",
  capabilities: {
    addressValidation: "not_configured",
    perRequestAddresses: "not_configured",
    transactionLookup: "not_configured",
    transparentPaymentDetection: "not_configured",
    shieldedPaymentDetection: "not_configured",
    amountVerification: "not_configured",
    destinationVerification: "not_configured",
    confirmationTracking: "not_configured",
    reorgHandling: "not_configured",
    mempoolDetection: "not_configured",
  },
  limitations: [
    "Needs a Zebra node, a Zaino indexer and a view-only scanner holding the merchant's incoming viewing key.",
    "Until those are configured and checked, testnet requests cannot be verified.",
  ],
};
