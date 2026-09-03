import type { Metadata } from "next";
import { ChangePasswordPanel } from "@/components/auth/change-password-panel";

/** An account-action page, not content — same reasoning as /custom/[id], /import/letterboxd and /auth/reset-password. */
export const metadata: Metadata = {
  title: "Change password — TierListOnline",
  robots: { index: false, follow: false },
};

export default function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-16 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Change password</h1>
      </div>
      <ChangePasswordPanel />
    </div>
  );
}
