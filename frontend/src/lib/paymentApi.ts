import type { Payment, PaymentData, PaymentInquiry, PaymentMethod } from "./payments.ts";

/** Connection boundary. No payment read/retry/inquiry endpoints exist yet.
 * Replace these methods with authenticated, validated API reads when available.
 * Never synthesize billing records from tasks or persist inquiries in the browser.
 * API 404 -> not-found; network/server failure -> error; empty list -> ready [].
 */
export interface PaymentReader {
  list(): Promise<PaymentData<{ payments: Payment[]; method: PaymentMethod | null }>>;
  payment(id: string): Promise<PaymentData<Payment>>;
  inquiry(id: string): Promise<PaymentData<PaymentInquiry>>;
}
export const paymentReader: PaymentReader = {
  list: () => Promise.resolve({ kind: "unavailable" }),
  payment: () => Promise.resolve({ kind: "unavailable" }),
  inquiry: () => Promise.resolve({ kind: "unavailable" }),
};
