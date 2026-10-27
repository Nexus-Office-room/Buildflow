"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const BACKGROUND_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_132544_b6ef0174-ed95-45ad-9a2f-ccb8acfbdce8.mp4";
const WORKSPACE_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_124724_bc041163-d651-425f-aea3-2acc1efc2c96.mp4";

/** One shared video plate; the project workspace gets its own supplied clip. */
export default function AmbientVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pathname = usePathname();
  const isWorkspace = pathname?.startsWith("/projects/") ?? false;
  const videoSource = isWorkspace ? WORKSPACE_VIDEO : BACKGROUND_VIDEO;

  useEffect(() => {
    const video = videoRef.current;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    if (!video) return;
    video.load();

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
  }, [videoSource]);

  return (
    <div aria-hidden="true" className="nx-ambient">
      <video
        ref={videoRef}
        src={videoSource}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        poster={isWorkspace ? undefined : "/background.png"}
        className={`nx-ambient__video${isWorkspace ? " nx-ambient__video--workspace" : ""}`}
      />
      <div className={`nx-ambient__scrim${isWorkspace ? " nx-ambient__scrim--workspace" : ""}`} />
    </div>
  );
}
