import type { ContactDraft, ContactSubmission } from "./contact.ts";

/** No contact endpoints exist. No requests, persistence, or invented receipt.
 * Implement authenticated submission and trusted receipt lookup here after the API contract is available.
 * Completion must never trust a query parameter or a browser-side "sent" flag.
 */
export interface ContactApi {
  submit(draft: ContactDraft): Promise<ContactSubmission>;
  completion(): Promise<ContactSubmission>;
}
export const contactApi: ContactApi = {
  submit: () => Promise.resolve({ kind: "unavailable" }),
  completion: () => Promise.resolve({ kind: "unavailable" }),
};
