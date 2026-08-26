# Reports

`latest.md` in this folder is the closing report for the most recently
completed task — the same text normally given at the end of a chat turn: what
changed, what was verified, the PR link, and CI status. Overwritten every time
a task finishes. Not a log: history already lives in `git log` and in the PRs
themselves, and keeping one here too would just be a second copy going stale.

`shots/` holds whatever screenshots went with that report — before/after
comparisons, geometry captures, close-ups. Cleared and replaced before every
new round, so nothing from an earlier task lingers next to the current one.
Named for what they show — `menu-mobile-before.png`, not `screenshot-1.png` —
since the filename is how Denis picks the right one without opening each.

Both are committed with the rest of the work, not left as scratch output:
Denis reads them straight off disk through the bridge to his machine, not from
chat.
