import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";

// Generation functions are registered here from milestone 3.
export const { GET, POST, PUT } = serve({ client: inngest, functions: [] });
