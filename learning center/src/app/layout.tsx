import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

/**
 * Fonts:
 *  - Display / headings: Agrandir (self-hosted or system) → Poppins fallback
 *  - Body / UI:          Poppins (Google Fonts, loaded here)
 *
 * Agrandir is a licensed font. If you have it, place the woff2 files in
 * public/fonts/ and uncomment the @font-face block in globals.css.
 * Until then, Poppins covers both roles perfectly.
 */

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nakconel Examinations",
  description: "Nakconel student examination portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
