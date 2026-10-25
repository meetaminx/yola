import { createRoute, paymentRoute } from "@/lib/server/v1-routes";

/** POST: create a payment request. GET: list payment requests (cursor pagination). */
export const POST = createRoute;
export const GET = paymentRoute;
