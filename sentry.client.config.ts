import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://d6d4ab845afb173e5a9f5807441a4779@o4510930348867584.ingest.us.sentry.io/4510930352734208",
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
