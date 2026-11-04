import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { SidebarCourses } from "@/components/SidebarCourses";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["600", "800"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "KustomLearn",
  description: "Describe what you want to learn. Play a course built just for you.",
};

export const viewport: Viewport = { themeColor: "#0e0f12", viewportFit: "cover" };

// Applied before paint so the saved theme never flashes. Also tells the server the learner's time zone, so days
// (streaks, quests) roll over at their midnight. The very first visit reloads once so it renders in that zone too.
const themeScript = `try{var t=localStorage.getItem("kl-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}try{var z=encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone),had=document.cookie.indexOf("kl_tz=")>=0;document.cookie="kl_tz="+z+";path=/;max-age=31536000;samesite=lax";if(!had&&document.cookie.indexOf("kl_tz=")>=0)location.reload()}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <AppShell
          courses={
            <Suspense fallback={null}>
              <SidebarCourses />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
