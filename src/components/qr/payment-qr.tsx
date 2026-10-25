"use client";

import { AnimatePresence, motion } from "motion/react";
import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { qrReveal } from "@/components/motion/tokens";
import { cn } from "@/lib/utils/cn";

interface PaymentQrProps {
  /** Exactly what the payment record says to encode. Never derived from form state. */
  payload: string;
  /** Used in download file names. */
  paymentId: string;
  className?: string;
}

// Dark modules on a light field: the most reliable contrast for phone cameras.
const COLORS = { dark: "#08090D", light: "#F8FAFC" };

export function PaymentQr({ payload, paymentId, className }: PaymentQrProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: COLORS })
      .then((s) => !cancelled && (setSvg(s), setError(null)))
      .catch(() => !cancelled && setError("The QR code could not be generated for this payload."));
    return () => {
      cancelled = true;
    };
  }, [payload]);

  async function downloadPng() {
    const url = await QRCode.toDataURL(payload, { margin: 2, width: 1024, errorCorrectionLevel: "M", color: COLORS });
    trigger(url, `${paymentId}.png`);
  }

  function downloadSvg() {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    trigger(url, `${paymentId}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative aspect-square w-full max-w-[220px] overflow-hidden rounded-[14px] bg-[#F8FAFC] p-2">
        <AnimatePresence mode="wait">
          {svg ? (
            <motion.div
              key={payload}
              {...qrReveal}
              role="img"
              aria-label={`QR code for payment ${paymentId}`}
              className="size-full [&>svg]:size-full"
              // qrcode returns a self-contained SVG string built from the payload.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div key="loading" className="size-full animate-pulse rounded-lg bg-[#e7e9ef]" />
          )}
        </AnimatePresence>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={downloadPng}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-white/[0.06] hover:text-text"
        >
          <Download className="size-3.5" /> PNG
        </button>
        <button
          type="button"
          onClick={downloadSvg}
          disabled={!svg}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-white/[0.06] hover:text-text disabled:opacity-40"
        >
          <Download className="size-3.5" /> SVG
        </button>
      </div>
    </div>
  );
}

function trigger(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
