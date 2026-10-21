# Nexus Office Desktop

Nexus Office Desktop is a native installable window for the production Nexus Office web app. It uses the same account, Supabase project, and backend as the website, so an internet connection is required.

## Build installers

From the repository root, install the JavaScript workspaces, then run `npm run tauri --workspace @nexus-office/desktop icon ../web/public/brand/icon-512.png` to generate platform icons. The release workflow builds Linux AppImage and Debian packages, macOS DMGs for Apple Silicon and Intel, and Windows MSI/NSIS installers.

Linux builds need WebKitGTK 4.1, GTK 3, librsvg, and appindicator development packages. macOS builds need Xcode Command Line Tools. Windows builds need the Microsoft C++ Build Tools and WebView2.

## Install

Download the installer for your system from [GitHub Releases](https://github.com/lekanay2005-coder/Nexus-Office/releases/latest). macOS packages use an ad-hoc signature and are not notarized; macOS may show a Gatekeeper warning until the app is signed and notarized with Apple Developer credentials.
