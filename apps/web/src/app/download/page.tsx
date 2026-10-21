import Link from "next/link";

const RELEASES = "https://github.com/lekanay2005-coder/Nexus-Office/releases/latest";

const systems = [
  { name: "Linux", formats: "AppImage or .deb", detail: "Ubuntu, Debian, and compatible Linux desktops" },
  { name: "macOS", formats: ".dmg", detail: "Apple Silicon and Intel Macs" },
  { name: "Windows", formats: ".msi or .exe", detail: "Windows 10 and 11 PCs" },
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[#0b0d12] px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/projects" className="font-mono text-sm text-neutral-500 hover:text-cyan-300">← Back to Nexus Office</Link>
        <p className="mt-12 font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Nexus Office</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Install the desktop app</h1>
        <p className="mt-4 max-w-2xl text-neutral-400">Use Nexus Office in its own desktop window on Linux, Mac, or Windows. The desktop app connects to the same secure Nexus Office account and needs an internet connection.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {systems.map((system) => (
            <article key={system.name} className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-5">
              <h2 className="text-lg font-medium">{system.name}</h2>
              <p className="mt-2 text-sm text-cyan-300">{system.formats}</p>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">{system.detail}</p>
            </article>
          ))}
        </div>
        <a href={RELEASES} className="mt-8 inline-flex rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Get the latest installers</a>
        <p className="mt-5 text-xs leading-relaxed text-neutral-600">macOS builds are currently unsigned and may show a Gatekeeper warning. Signed and notarized Mac releases require Apple Developer credentials.</p>
      </div>
    </main>
  );
}
