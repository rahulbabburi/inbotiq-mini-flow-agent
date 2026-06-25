import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Home Loan Enquiry Assistant — JSON Flow Engine",
  description:
    "A conversational AI-powered home loan enquiry assistant built with Next.js 15 and a JSON-driven flow engine. Demonstrates Prompt, Condition, and Collect node types.",
  keywords: [
    "home loan",
    "AI chatbot",
    "conversational agent",
    "JSON flow engine",
    "Next.js",
  ],
  authors: [{ name: "Flow Agent" }],
  openGraph: {
    title: "Home Loan Enquiry Assistant — JSON Flow Engine",
    description:
      "AI-powered conversational assistant driven by a JSON flow engine. Demonstrates condition branching, variable collection, and prompt substitution.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1117",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${inter.variable} antialiased h-full`}>
        {children}
      </body>
    </html>
  );
}
