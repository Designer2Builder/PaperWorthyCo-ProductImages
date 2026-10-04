import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  variable: "--font-google-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Paper Worthy Photo Catalog",
  description: "Browse, rename, and categorize product photos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${googleSans.variable} h-full antialiased`}>
      <body
        className={`${googleSans.className} min-h-full flex flex-col bg-neutral-50 text-neutral-900`}
      >
        {children}
      </body>
    </html>
  );
}
