import {
  B2B_MANAGER_COMMISSION_RATE,
  B2B_PAYMENT_TAX_RATE,
} from "@/lib/partner/b2bConstants";

export function computeB2BCommissionFromPaymentKop(amountKop: number): {
  amountKop: number;
  taxRate: number;
  netAfterTaxKop: number;
  commissionRate: number;
  commissionAmountKop: number;
  amountRub: number;
  netAfterTaxRub: number;
  commissionAmountRub: number;
} {
  const kop = Math.round(Number(amountKop));
  const safeKop = Number.isFinite(kop) && kop > 0 ? kop : 0;
  const netAfterTaxKop = Math.round(safeKop * (1 - B2B_PAYMENT_TAX_RATE));
  const commissionAmountKop = Math.round(netAfterTaxKop * B2B_MANAGER_COMMISSION_RATE);
  return {
    amountKop: safeKop,
    taxRate: B2B_PAYMENT_TAX_RATE,
    netAfterTaxKop,
    commissionRate: B2B_MANAGER_COMMISSION_RATE,
    commissionAmountKop,
    amountRub: safeKop / 100,
    netAfterTaxRub: netAfterTaxKop / 100,
    commissionAmountRub: commissionAmountKop / 100,
  };
}
