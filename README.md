# Agora

GitHub Discussions in your editor, with a Claude Code / Copilot Chat aesthetic.

Browse, read, post, and moderate Discussions on the active repository without
leaving VS Code.

## Status

Early scaffold. See the project's PR history for what lands in each iteration.

## Install (preview builds)

Every push and pull request produces an installable `.vsix` as a GitHub
Actions artifact:

1. Open the latest [Actions run](../../actions/workflows/ci.yml) for the
   branch you want to try.
2. Scroll to **Artifacts** at the bottom of the run summary and download
   `agora-vsix`.
3. Unzip to reveal `agora.vsix`.
4. In VS Code: `Cmd/Ctrl+Shift+P` → **Extensions: Install from VSIX…** →
   pick the `.vsix`.

Tagged releases (`v*`) attach the `.vsix` to a GitHub Release for easy
download without browsing CI runs.

## Development

```bash
npm install
npm run typecheck
npm run build       # bundles extension + webview into dist/
npm run package     # produces agora.vsix
```

Press **F5** in VS Code to launch an Extension Development Host with the
extension loaded.

## License

MIT
