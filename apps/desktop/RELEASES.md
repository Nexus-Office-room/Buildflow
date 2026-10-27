# Desktop release publishing

The `desktop-release.yml` workflow runs when a `desktop-v*` tag is pushed. It builds platform installers, creates a GitHub Release in `Nexus-Office-room/Buildflow-Downloads`, and uploads a ZIP for each supported system. The organization’s displayed name is Buildflow; GitHub’s URL handle remains unchanged because `Buildflow` is already in use. The public website links only to these installer archives; application source remains in the separate private repository.

## One-time workflow setup

The source repo's default `GITHUB_TOKEN` cannot publish releases in a different repository. Add a fine-grained GitHub personal access token as the source repository Actions secret named `DOWNLOADS_REPO_TOKEN`. Limit the token to `Buildflow-Downloads` and grant **Contents: Read and write**. Do not put the token in source files or release notes.

After setting the secret, push a version tag such as `desktop-v0.1.1` to start the next build. The website's `/api/download/*` routes resolve the corresponding files from the latest release in the downloads-only repository.
