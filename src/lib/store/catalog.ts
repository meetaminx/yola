import { formatZecTrimmed, parseZec } from "@/lib/payments/amount";

/**
 * Catalog for the sample store. Fictional products, prices in exact ZEC
 * decimal strings. Totals are always computed from this catalog, never from
 * prices a browser sends.
 */

export interface Product {
  sku: string;
  name: string;
  blurb: string;
  price: string; // ZEC
  icon: "notebook" | "mug" | "tote" | "compass" | "headlamp" | "map";
}

export const PRODUCTS: readonly Product[] = [
  { sku: "FN-NB-01", name: "Field notebook", blurb: "48 dot-grid pages, water-resistant cover.", price: "0.042", icon: "notebook" },
  { sku: "FN-MG-02", name: "Enamel camp mug", blurb: "350 ml steel mug with a rolled rim.", price: "0.065", icon: "mug" },
  { sku: "FN-TB-03", name: "Waxed canvas tote", blurb: "Heavy canvas, leather handles, inner pocket.", price: "0.18", icon: "tote" },
  { sku: "FN-CP-04", name: "Brass pocket compass", blurb: "Liquid-damped needle in a brass case.", price: "0.11", icon: "compass" },
  { sku: "FN-HL-05", name: "Rechargeable headlamp", blurb: "300 lumens, red night mode, USB-C.", price: "0.24", icon: "headlamp" },
  { sku: "FN-MP-06", name: "Trail map set", blurb: "Four folded topographic maps.", price: "0.035", icon: "map" },
];

export const MAX_QTY = 10;

export function findProduct(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export function priceZatoshis(p: Product): bigint {
  const r = parseZec(p.price);
  if (!r.ok) throw new Error(`Invalid catalog price for ${p.sku}`);
  return r.zatoshis;
}

export interface CartLine {
  sku: string;
  qty: number;
}

export interface PricedLine extends CartLine {
  name: string;
  unit: string;
  lineTotal: string;
  lineTotalZatoshis: bigint;
}

/** Price a cart from the catalog. Unknown SKUs and invalid quantities are rejected. */
export function priceCart(lines: readonly CartLine[]): { lines: PricedLine[]; totalZatoshis: bigint; total: string } {
  if (lines.length === 0) throw new Error("The cart is empty.");
  let total = 0n;
  const priced = lines.map((l) => {
    const product = findProduct(l.sku);
    if (!product) throw new Error(`Unknown product ${l.sku}.`);
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) throw new Error(`Quantity for ${product.name} must be 1-${MAX_QTY}.`);
    const lineTotal = priceZatoshis(product) * BigInt(l.qty);
    total += lineTotal;
    return {
      sku: l.sku,
      qty: l.qty,
      name: product.name,
      unit: product.price,
      lineTotalZatoshis: lineTotal,
      lineTotal: formatZecTrimmed(lineTotal),
    };
  });
  return { lines: priced, totalZatoshis: total, total: formatZecTrimmed(total) };
}
