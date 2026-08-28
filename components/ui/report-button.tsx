"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import type { ReportSubjectType } from "@/lib/types/custom-list";
import { ReportDialog } from "@/components/ui/report-dialog";
import { cn } from "@/lib/utils/cn";

interface ReportButtonProps {
  subjectType: ReportSubjectType;
  subjectId: string;
  label: string;
  /** Overrides the trigger's background treatment — see the default below. */
  className?: string;
}

/**
 * The way somebody says a picture, a post or a comment should not be here.
 *
 * Nothing on this site inspects any of those automatically, so this is the
 * only signal that exists. It asks for a sentence rather than offering a menu
 * of categories: a menu would need a taxonomy nobody has agreed on yet, and
 * the person who has to act on this will read the sentence either way.
 */
export function ReportButton({ subjectType, subjectId, label, className }: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "rounded-md p-1 text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          // The default suits a trigger floating over an image; a trigger sitting
          // in a plain list row (a comment) passes its own, lighter className.
          className ?? "bg-background/80 backdrop-blur"
        )}
        aria-label={label}
        title={label}
      >
        <Flag className="h-3.5 w-3.5" />
      </button>

      <ReportDialog
        open={open}
        onClose={() => setOpen(false)}
        subjectType={subjectType}
        subjectId={subjectId}
        label={label}
      />
    </>
  );
}
