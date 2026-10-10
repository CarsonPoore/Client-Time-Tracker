import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", weight: ["400", "600", "700", "900"] });

export const metadata: Metadata = {
  title: { default: "CPC OS", template: "%s · CPC OS" },
  description: "Carson Poore Consulting client portal and operating system.",
  icons: { icon: "/brand/cpc-mark-royalblue.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
