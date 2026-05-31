# Agora

GitHub Discussions in your editor, with a Claude Code / Copilot Chat aesthetic.

Browse, read, post, and moderate Discussions on the active repository without
leaving VS Code.

## Status

**Alpha (`v0.1.0`).** The core read / write loop is in:

- Browse discussions on the detected repo, filter by category, paginate.
- Open a thread to read the discussion + comments + nested replies, with
  Markdown rendered via the editor's own theme.
- Post a new discussion, reply at the top of a thread, reply inline to
  any comment or reply (with `replyToId` threading where the API allows).
- Edit / delete your own content; mark-as-answer in Q&A categories;
  lock / unlock / delete the discussion itself when you have permission.
- Selection-based quote reply: highlight any text in a comment, press
  `R` (or click the floating "Quote reply" button) and the selection
  gets `> `-quoted into the appropriate reply composer.
- Drafts persist between panel closes for both new posts and replies.

Roadmap (subsequent `0.1.x` / `0.2` iterations): reactions, search /
advanced filters, `@mention` autocomplete, pin / transfer / label
management, automated tests.

Treat this as dogfood-grade — issues welcome.

## Install

The fastest path is the latest [GitHub Release](../../releases/latest):
download the attached `agora-<version>.vsix`, then in VS Code press
`Cmd/Ctrl+Shift+P` → **Extensions: Install from VSIX…** and pick the
file. Reload the window when prompted.

If you want to track an in-flight pull request instead, every push to a
PR produces a `.vsix` available from the PR's sticky comment (direct
download link, no zip).

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
