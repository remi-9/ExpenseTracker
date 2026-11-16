import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start" });
const vt323 = VT323({ weight: "400", subsets: ["latin"], variable: "--font-vt323" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A personal expense tracker that plays like a handheld RPG.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${pressStart.variable} ${vt323.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
