# Upload assets for releases

Pecans serves assets straight from GitHub Releases. See GitHub's guides:
[About Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

## Naming

Pecans detects os, package format, and architecture from each asset's
filename. There is no strict policy, but every marker must appear as a
delimited token (`-x64`, `_arm64`) — letters inside words don't count.

**Operating system** — `win32`/`win64`/`.exe`/`.nupkg`/`.msix` → windows;
`linux`/`ubuntu`/`.deb`/`.rpm`/`.tgz`/`.tar.gz` → linux;
`mac`/`osx`/`darwin`/`.dmg` → osx. `RELEASES` is the Squirrel.Windows
manifest.

**Architecture** — `x64`/`x86_64`/`amd64`/`64` → 64-bit;
`ia32`/`i386`/`x86`/`32` → 32-bit; `arm64`/`armv7l` → arm64;
`universal`/`univ` → mac universal. Unmarked filenames default to 64-bit;
`.msixbundle` is always multi-arch. electron-packager's `win32-x64` naming
reads correctly (`win32` is the platform id, `x64` the arch).

**Package format** — `.deb`, `.rpm`, `.msix`/`.msixbundle`. An asset with
none of these is the platform's default package.

**Download priority by platform** (first match wins):

| Platform | Extensions (by priority) |
| -------- | ------------------------ |
| Windows | `.exe` (default), `.msixbundle`/`.msix` (`?pkg=msix`) |
| macOS | `.dmg` (downloads), `.zip` (Squirrel.Mac updates) |
| Linux | `.tgz`/`.tar.gz` (default), `.deb` (`?pkg=deb`), `.rpm` (`?pkg=rpm`) |

## Example

```
myapp-2.4.0-darwin-x64.zip
myapp-2.4.0-darwin-arm64.zip
myapp-2.4.0-universal.dmg
myapp-2.4.0-win32-x64-setup.exe
myapp-2.4.0-win32-arm64-setup.exe
MyApp_2.4.0_x64.msix
myapp-2.4.0-linux-x64.tar.gz
myapp-2.4.0-linux-arm64.deb
myapp-2.4.0-full.nupkg
RELEASES
```
