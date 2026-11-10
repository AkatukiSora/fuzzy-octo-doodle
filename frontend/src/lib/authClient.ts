import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Same-origin /api/auth is forwarded to NestJS by the existing reverse proxy.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { termsAccepted: { type: "boolean", required: true } } })],
});

export function clearProfileCache() {
  for (const key of ["profile-avatar", "profile-nickname"]) localStorage.removeItem(key);
}

export function readFormText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
