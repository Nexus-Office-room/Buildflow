"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { DEFAULT_PET_ID, getPet, PET_STORAGE_KEY, type NexusPet } from "@/lib/pets";

export default function PatchCompanion() {
  const [open, setOpen] = useState(false);
  const [pet, setPet] = useState<NexusPet>(() => getPet(DEFAULT_PET_ID));

  useEffect(() => {
    const syncPet = () => {
      try {
        setPet(getPet(localStorage.getItem(PET_STORAGE_KEY)));
      } catch {
        setPet(getPet(DEFAULT_PET_ID));
      }
    };
    syncPet();
    window.addEventListener("storage", syncPet);
    window.addEventListener("nexus-companion-change", syncPet);
    return () => {
      window.removeEventListener("storage", syncPet);
      window.removeEventListener("nexus-companion-change", syncPet);
    };
  }, []);

  return (
    <aside
      className={`patch-companion${open ? " patch-companion--open" : ""}`}
      aria-label={`${pet.name}, your Nexus companion`}
    >
      {open && (
        <div className="patch-companion__bubble" id="patch-companion-message">
          <button
            className="patch-companion__close"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Patch message"
          >
            ×
          </button>
          <span className="patch-companion__eyebrow">YOUR NEXUS SIDEKICK</span>
          <p>{pet.greeting}</p>
          <Link className="patch-companion__choose" href="/companions" onClick={() => setOpen(false)}>
            Meet the other companions →
          </Link>
        </div>
      )}
      <button
        className="patch-companion__button"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? `Close ${pet.name} message` : `Meet ${pet.name}, your Nexus sidekick`}
        aria-expanded={open}
      >
        {pet.id === "patch" ? (
          <span className="patch-companion__sprite" aria-hidden="true" />
        ) : (
          <span
            className="patch-companion__emoji"
            aria-hidden="true"
            style={{ "--pet-color": pet.color, "--pet-accent": pet.accent } as CSSProperties & Record<`--${string}`, string>}
          >
            {pet.emoji}
          </span>
        )}
        <span className="patch-companion__status" aria-hidden="true" />
      </button>
    </aside>
  );
}
