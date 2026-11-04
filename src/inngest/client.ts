import { Inngest } from "inngest";

// `next dev` talks to the local Inngest dev server; elsewhere INNGEST_DEV / signing keys decide the mode.
export const inngest = new Inngest({ id: "kustomlearn", isDev: process.env.NODE_ENV === "development" ? true : undefined });
