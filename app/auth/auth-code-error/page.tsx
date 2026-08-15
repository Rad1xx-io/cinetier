import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Не удалось войти — TierListOnline",
};

const REASONS: Record<string, string> = {
  "no-code": "Ссылка для входа неполная — в ней нет кода подтверждения.",
  "not-configured": "Облачные аккаунты не настроены на этом развёртывании.",
};

/**
 * Where the callback sends a failed exchange. Without this the failure was
 * invisible: the user was redirected into the app as if sign-in had worked and
 * simply stayed logged out.
 */
export default async function AuthCodeErrorPage(props: PageProps<"/auth/auth-code-error">) {
  const { reason } = await props.searchParams;
  const raw = Array.isArray(reason) ? reason[0] : reason;
  const detail = raw ? (REASONS[raw] ?? raw) : null;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <TriangleAlert className="h-10 w-10 text-tier-s" aria-hidden />
      <h1 className="text-lg font-semibold">Не удалось завершить вход</h1>
      <p className="text-sm text-muted">
        Ссылка для входа действует один раз и недолго — если вы открыли её повторно или спустя
        время, запросите новую.
      </p>
      {detail && (
        <p className="max-w-sm break-words rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          {detail}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/settings">Попробовать снова</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
