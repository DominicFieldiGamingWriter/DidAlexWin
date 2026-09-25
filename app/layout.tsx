import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://didalexwin.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Did Alex Eala Win? See the latest results for Alexandra Eala",
    template: "%s | Did Alex Win?",
  },
  description:
    "Did Alexandra Eala win her latest match? See her results, scores and details about her next match. Learn more about the Filipino tennis star and her career.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Did Alex Win?",
    title: "Did Alex Win?",
    description:
      "Did Alexandra Eala win her latest match? Check her latest result, next match, current ranking, 2026 record and Grand Slam record.",
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
      "Did Alexandra Eala win her latest match? Check her latest result, next match, current ranking, 2026 record and Grand Slam record.",
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
      <body>
        {children}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-H8V2X3F2SX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-H8V2X3F2SX');
          `}
        </Script>
      </body>
    </html>
  );
}
