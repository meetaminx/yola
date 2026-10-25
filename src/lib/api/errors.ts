/**
 * Structured API errors. One shape everywhere:
 *   { "error": { "code", "message", "fields"?, "request_id" } }
 */

export type ApiErrorCode =
  | "invalid_json"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_request"
  | "amount_empty"
  | "amount_format"
  | "amount_precision"
  | "amount_not_positive"
  | "amount_too_large"
  | "destination_not_accepted"
  | "unauthenticated"
  | "invalid_api_key"
  | "api_key_revoked"
  | "forbidden"
  | "network_not_allowed"
  | "simulation_not_allowed"
  | "not_found"
  | "method_not_allowed"
  | "invalid_state"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "invalid_idempotency_key"
  | "rate_limited"
  | "network_unavailable"
  | "network_disabled"
  | "webhook_endpoint_missing"
  | "viewing_key_required"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
    request_id: string;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
    /** Extra response headers, e.g. Retry-After. */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(requestId: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        request_id: requestId,
      },
    };
  }
}

export const notFound = (what = "payment request") =>
  new ApiError(404, "not_found", `No ${what} with that ID exists in this project.`);
