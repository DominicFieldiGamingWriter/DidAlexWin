import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Did Alex Win?",
  description: "Alexandra Eala match results, rankings and Grand Slam record."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
