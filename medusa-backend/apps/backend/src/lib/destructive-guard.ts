// Scripts that delete or overwrite live data (seeders, catalog rewrites, purges)
// must not run against production by accident. Opt in explicitly:
//   ALLOW_DESTRUCTIVE=1 npx medusa exec ./src/scripts/<script>.ts
export function assertDestructiveAllowed(script: string) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE !== "1") {
    throw new Error(
      `${script} changes or deletes live data. Refusing in production — ` +
      `take a backup, then re-run with ALLOW_DESTRUCTIVE=1 if you really mean it.`,
    );
  }
}
