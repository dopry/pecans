# Pecans FAQ

### Can I use a private repository?

Yes — that's pecans' main job: it makes release assets from a private GitHub
repository publicly downloadable (and updatable) without exposing a token to
clients. Set `GITHUB_TOKEN` with read access to the repository.

### Can I use a GitHub Enterprise repository?

Yes — pass `baseUrl` to `PecansGitHubBackend` (see
[module usage](module.md)). Other backends can be implemented by extending
the exported `Backend` class; pull requests welcome.

### Can I deploy it to Heroku / Docker?

[Yes you can](deploy.md).

### Can I use it in my Node.js application?

[Yes you can](module.md).

### What files should I upload to the GitHub release?

Pecans detects os, architecture, and package format from filenames — there
is no strict naming policy, but include the platform and arch in each name:

- Windows: `MyApp-1.0.0-win32-x64-setup.exe`, `RELEASES` + `*.nupkg`
  (Squirrel.Windows), `*.msix` / `*.msixbundle` (MSIX)
- macOS: `MyApp-1.0.0-darwin-x64.zip` (Squirrel.Mac updates),
  `MyApp-1.0.0-universal.dmg` (human downloads)
- Linux: `MyApp-1.0.0-linux-x64.tar.gz`, `*.deb`, `*.rpm`

Unmarked architectures default to 64-bit; `arm64`, `ia32`/`i386`/`x86`, and
`universal`/`univ` markers are recognized as delimited tokens.

### How should I tag my releases?

Pecans requires [SemVer](https://semver.org) tags (a leading `v` is fine).
The prerelease identifier is the release channel: `2.0.0-beta.3` lands on
the `beta` channel, `2.0.0` on `stable`. The rule holds when the first
identifier is a number: `2.9.0-1` lands on a channel named `1`. It is a
valid SemVer prerelease, so it is never served as stable, but a named
identifier (`2.9.0-beta.1`) gives you a channel worth pointing clients at.
A published release whose tag is not a version (`nightly`, `latest`,
`docs-1`) is skipped with a warning in the server log; the other releases
are served normally.

### Does pecans provide an Atom feed of versions?

No — the 1.x Atom feeds were removed in 2.0. Poll
[`/api/versions`](api.md) instead.

### I'm upgrading from 1.x — what changed?

See the [migration guide](migrating-2.0.md).
