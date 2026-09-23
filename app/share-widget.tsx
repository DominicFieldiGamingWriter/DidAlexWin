"use client";

import { useState } from "react";

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
  const [status, setStatus] = useState("");

  const answer = result === "YES" ? "Yes" : result === "NO" ? "No" : result;
  const action = result === "YES" ? "Eala beat" : result === "NO" ? "Eala lost to" : "Eala played";
  const shareText =
    "Did Alex Eala win? " +
    answer +
    ". " +
    action +
    " " +
    opponent +
    " at " +
    tournament +
    ", " +
    round +
    (score ? " (" + score + ")." : ".");

  const xUrl =
    "https://x.com/intent/post?text=" +
    encodeURIComponent(shareText) +
    "&url=" +
    encodeURIComponent(siteUrl);

  const facebookUrl =
    "https://www.facebook.com/sharer/sharer.php?u=" +
    encodeURIComponent(siteUrl);

  async function shareToInstagram() {
    const textToCopy = shareText + "\n" + siteUrl;
    const instagramWindow = window.open(
      "https://www.instagram.com/",
      "_blank",
      "noopener,noreferrer"
    );

    try {
      await navigator.clipboard.writeText(textToCopy);
      setStatus("Share text copied. Instagram opened in a new tab.");
    } catch {
      setStatus("Instagram opened. Copy the result text and site link manually.");
    }

    if (!instagramWindow) {
      setStatus("Popup blocked. Allow popups to open Instagram.");
    }
  }

  return (
    <section className="share-section" aria-labelledby="share-widget-title">
      <div className="share-widget">
        <div className="share-widget-header">
          <h2 className="share-widget-title" id="share-widget-title">
            SHARE THIS RESULT
          </h2>
          <p className="share-widget-copy">
            Share the latest result from Did Alex Win?
          </p>
        </div>
        <div className="share-buttons">
          <a
            className="share-button share-button-facebook"
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this result on Facebook"
          >
            Facebook
          </a>
          <a
            className="share-button share-button-x"
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this result on X"
          >
            X
          </a>
          <button
            className="share-button share-button-instagram"
            type="button"
            onClick={shareToInstagram}
            aria-label="Share this result on Instagram"
          >
            Instagram
          </button>
        </div>
        <p className="share-widget-status" aria-live="polite">
          {status}
        </p>
      </div>
    </section>
  );
}
