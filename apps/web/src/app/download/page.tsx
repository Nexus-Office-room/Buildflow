import Link from "next/link";

const systems = [
  {
    name: "Linux",
    detail: "Ubuntu, Debian, and compatible Linux desktops",
    downloads: [{ label: "Linux ZIP", target: "linux" }],
  },
  {
    name: "macOS",
    detail: "Choose the ZIP that matches your Mac",
    downloads: [
      { label: "Apple Silicon ZIP", target: "macos-arm64" },
      { label: "Intel Mac ZIP", target: "macos-x64" },
    ],
  },
  {
    name: "Windows",
    detail: "Windows 10 and 11 PCs",
    downloads: [{ label: "Windows ZIP", target: "windows" }],
  },
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-transparent px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/projects" className="font-mono text-sm text-neutral-500 hover:text-blue-300">← Back to Buildflow</Link>
        <p className="mt-12 font-mono text-xs uppercase tracking-[0.25em] text-blue-300">Buildflow</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Install the desktop app</h1>
        <p className="mt-4 max-w-2xl text-neutral-400">Download the ZIP for your computer. Each ZIP contains the installer and quick installation steps. Buildflow connects to your account and needs an internet connection.</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {systems.map((system) => (
            <article key={system.name} className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-5">
              <h2 className="text-lg font-medium">{system.name}</h2>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">{system.detail}</p>
              <div className="mt-5 flex flex-col items-start gap-3">
                {system.downloads.map((download) => (
                  <a
                    key={download.target}
                    href={`/api/download/${download.target}`}
                    className="text-sm font-medium text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200"
                  >
                    Download {download.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-neutral-600">macOS builds are currently unsigned and may show a Gatekeeper warning. Signed and notarized Mac releases require Apple Developer credentials.</p>
      </div>
    </main>
  );
}
