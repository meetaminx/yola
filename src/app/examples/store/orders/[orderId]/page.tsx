import { Suspense } from "react";
import { OrderView } from "@/components/store/order-view";

export const metadata = { title: "Order" };

// The order lives in the browser session, so the ID is read on the client,
// inside a Suspense boundary so the shell can still be prerendered.
export default function OrderPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-black/[0.05]" aria-busy="true" aria-label="Loading order" />}>
      <OrderView />
    </Suspense>
  );
}
