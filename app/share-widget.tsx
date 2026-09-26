"use client";

type ShareWidgetProps = {
  result: string;
  tournament: string;
  round: string;
  opponent: string;
  score: string;
  siteUrl: string;
};

export default function ShareWidget({
  result,
  tournament,
  round,
  opponent,
  score,
  siteUrl,
}: ShareWidgetProps) {
  const shareText = result === "YES"
    ? "Alex Eala won her latest match! She beat " + opponent + (score ? " " + score : "") + " at the " + tournament + ", " + round + ". Visit " + siteUrl + " to see who she plays next."
    : "Did Alex Eala win her last match? No. Sadly, Alex lost to " + opponent + (score ? " " + score : "") + " at the " + tournament + ", " + round + ". Visit " + siteUrl + " to see who she plays next.";

  const xUrl =
    "https://x.com/intent/post?text=" +
    encodeURIComponent(shareText);

  const facebookUrl =
    "https://www.facebook.com/sharer/sharer.php?u=" +
    encodeURIComponent(siteUrl);

  function trackShare(platform: "facebook" | "x") {
    if (typeof window === "undefined") return;

    const gtag = (window as typeof window & {
      gtag?: (command: string, action: string, params?: Record<string, unknown>) => void;
    }).gtag;

    gtag?.("event", "share_click", {
      platform,
      result,
      tournament,
      round,
    });
  }

  return (
    <section className="share-section" aria-labelledby="share-widget-title">
      <div className="share-widget">
        <div className="share-widget-header">
          <h2 className="share-widget-title" id="share-widget-title">
            Show your support for Alex - share this result
          </h2>
        </div>
        <div className="share-buttons">
          <a
            className="share-button share-button-facebook"
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this result on Facebook"
            onClick={() => trackShare("facebook")}
          >
            FACEBOOK
          </a>
          <a
            className="share-button share-button-x"
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this result on X"
            onClick={() => trackShare("x")}
          >
            X (TWITTER)
          </a>
        </div>
      </div>
    </section>
  );
}
