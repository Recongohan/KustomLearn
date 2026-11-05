// Client errors go to Sentry only when NEXT_PUBLIC_SENTRY_DSN is set at build time.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  import("@sentry/nextjs").then((Sentry) => Sentry.init({ dsn, tracesSampleRate: 0.1 }));
}
