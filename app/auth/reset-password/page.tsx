import type { Metadata } from "next";
import { ResetPasswordPanel } from "@/components/auth/reset-password-panel";

/** An account-action page, not content — same reasoning as /custom/[id] and /import/letterboxd. */
export const metadata: Metadata = {
  title: "Set a new password — TierListOnline",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-16 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
      </div>
      <ResetPasswordPanel />
    </div>
  );
}
