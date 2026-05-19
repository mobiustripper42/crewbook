/**
 * Build-time version tag. Renders e.g. "v1.2.3 (a1b2c3)".
 *
 * Reads:
 *   - process.env.NEXT_PUBLIC_APP_VERSION  (forwarded in next.config.mjs)
 *   - process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA  (Vercel sets automatically)
 *
 * Both are inlined at build time. No runtime cost.
 *
 * Local dev fallback: when NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is undefined
 * (running `npm run dev` outside Vercel), the commit hash is omitted.
 *
 * See CLAUDE.md §Versioning for setup details.
 */

type VersionTagProps = {
  className?: string
  showCommit?: boolean
}

export function VersionTag({ className, showCommit = true }: VersionTagProps) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"
  const commit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  const display = showCommit && commit ? `v${version} (${commit})` : `v${version}`

  return (
    <span className={className} data-testid="version-tag">
      {display}
    </span>
  )
}
