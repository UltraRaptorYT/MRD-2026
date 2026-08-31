import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC, Space_Grotesk } from "next/font/google";
import "./globals.css";

const displayFont = Space_Grotesk({ variable: "--font-display", subsets: ["latin"] });
const chineseFont = Noto_Sans_SC({
  variable: "--font-chinese",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "Move Together · MRD 2026 Quiz",
  description: "A bilingual physical multiplayer quiz with browser-local camera processing.",
};

export const viewport: Viewport = { themeColor: "#071613", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${displayFont.variable} ${chineseFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
