"use client";

import { useEffect, useRef } from "react";

const BACKGROUND_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_132544_b6ef0174-ed95-45ad-9a2f-ccb8acfbdce8.mp4";

/** One shared, decorative video plate for every web route. */
export default function AmbientVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    if (!video) return;

    const syncMotionPreference = () => {
      if (motionPreference.matches) {
        video.pause();
        return;
      }

      void video.play().catch(() => {
        // The poster and static backdrop remain visible if autoplay is blocked.
      });
    };

    syncMotionPreference();
    motionPreference.addEventListener("change", syncMotionPreference);
    return () =>
      motionPreference.removeEventListener("change", syncMotionPreference);
  }, []);

  return (
    <div aria-hidden="true" className="nx-ambient">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/background.png"
        className="nx-ambient__video"
      >
        <source src={BACKGROUND_VIDEO} type="video/mp4" />
      </video>
      <div className="nx-ambient__scrim" />
    </div>
  );
}
