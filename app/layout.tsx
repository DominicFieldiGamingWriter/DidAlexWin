import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://didalexwin.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Did Alex Win?",
    template: "%s | Did Alex Win?",
  },
  description:
    "Alexandra Eala match results, rankings, upcoming fixtures and Grand Slam record.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Did Alex Win?",
    title: "Did Alex Win?",
    description:
      "Alexandra Eala match results, rankings, upcoming fixtures and Grand Slam record.",
    images: [
      {
        url: "/alex-bio.webp",
        width: 360,
        height: 321,
        alt: "Alexandra Eala",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Did Alex Win?",
    description:
      "Alexandra Eala match results, rankings, upcoming fixtures and Grand Slam record.",
    images: ["/alex-bio.webp"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
