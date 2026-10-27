"use client";

import { useEffect, useRef, useState } from "react";
import BuildflowLogo from "@/components/brand/BuildflowLogo";

const projects = [
  { name: "Studio site", detail: "Next.js · Updated just now", tone: "blue" },
  { name: "Mobile launch", detail: "Design review · 2 min ago", tone: "red" },
  { name: "API service", detail: "Build complete · 8 min ago", tone: "blue" },
] as const;

function WorkspacePreview() {
  return (
    <div className="preview-window">
      <div className="preview-topbar">
        <div className="preview-dots" aria-hidden="true"><i /><i /><i /></div>
        <span className="preview-path">buildflow / workspace</span>
        <span className="preview-live"><i /> LIVE</span>
      </div>
      <div className="preview-content">
        <div className="preview-sidebar" aria-hidden="true">
          <span className="preview-sidebar-mark"><BuildflowLogo surface="watermark" /></span>
          <i className="selected" /><i /><i /><i />
          <span className="preview-sidebar-bottom" />
        </div>
        <div className="preview-main">
          <div className="preview-heading">
            <div><span className="preview-kicker">YOUR WORKSPACE</span><h2>Good morning, builder.</h2></div>
            <span className="preview-create">＋ New project</span>
          </div>
          <div className="preview-team">
            <div className="preview-team-copy"><span>ACTIVE TEAM</span><strong>Five roles. One shared context.</strong></div>
            <div className="preview-role-stack" aria-hidden="true"><b>St</b><b>Bu</b><b>An</b><b>QA</b><b>Op</b></div>
          </div>
          <div className="preview-section-title"><span>Recent projects</span><span>View all&nbsp; ↗</span></div>
          <div className="preview-projects">
            {projects.map((project, index) => (
              <div className="preview-project" key={project.name}>
                <span className={`project-symbol ${project.tone}`} aria-hidden="true">{index === 0 ? "⌘" : index === 1 ? "◈" : "⌁"}</span>
                <span className="project-info"><strong>{project.name}</strong><small>{project.detail}</small></span>
                <span className="project-arrow" aria-hidden="true">↗</span>
              </div>
            ))}
          </div>
          <div className="preview-terminal"><span className="terminal-prompt">$</span><span>builder</span><span className="terminal-cursor" aria-hidden="true" /></div>
        </div>
      </div>
    </div>
  );
}

export default function MaskRevealHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || reduceMotion) return;
      const bounds = stage.getBoundingClientRect();
      stage.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
      stage.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
      setRevealed(true);
    };
    const leave = () => {
      if (!pinned) setRevealed(false);
    };
    stage.addEventListener("pointermove", move, { passive: true });
    stage.addEventListener("pointerleave", leave);
    return () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
    };
  }, [pinned]);

  function toggleReveal() {
    setPinned((value) => !value);
    setRevealed((value) => !value);
  }

  return (
    <div
      ref={stageRef}
      className={`mask-hero-stage${revealed ? " is-revealed" : ""}${pinned ? " is-pinned" : ""}`}
      role="group"
      aria-label="Buildflow workspace preview. Move your pointer to reveal the highlighted view."
    >
      <div className="stage-orbit stage-orbit-one" aria-hidden="true" />
      <div className="stage-orbit stage-orbit-two" aria-hidden="true" />
      <div className="preview-layer preview-layer-base" aria-hidden="true"><WorkspacePreview /></div>
      <div className="preview-layer preview-layer-reveal" aria-hidden="true"><WorkspacePreview /></div>
      <div className="stage-caption"><span><i /> PROJECT RELAY</span><span>CONTEXT KEPT IN FLOW</span></div>
      <button
        type="button"
        className="reveal-toggle"
        onClick={toggleReveal}
        aria-pressed={pinned}
        aria-label={pinned ? "Turn off the highlighted workspace view" : "Keep the highlighted workspace view on"}
      >
        <span className="reveal-toggle-dot" />{pinned ? "Reveal on" : "Move to reveal"}
      </button>
    </div>
  );
}
