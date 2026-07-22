# Auto-updater on Windows

## Squirrel.Windows

Pecans serves the `RELEASES` manifest and NuGet packages consumed by
[Squirrel.Windows](https://github.com/Squirrel/Squirrel.Windows) (Electron's
built-in `autoUpdater` for traditionally installed apps).

Configure the feed url **without a trailing slash or query parameters** —
Squirrel.Windows appends `/RELEASES` itself:

```js
import { app, autoUpdater } from "electron";

const platform = `${process.platform}-${process.arch}`; // e.g. win32-x64
const version = app.getVersion();

autoUpdater.setFeedURL({
  url: `https://download.myapp.com/update/${platform}/${version}`,
});
```

Channel variant: `/update/channel/beta/${platform}/${version}`.

Upload the files the Squirrel.Windows releaser generates as release assets:
`RELEASES`, `*-full.nupkg`, and `*-delta.nupkg`.

## MSIX (Electron 39.5+ / 40.2+ / 41+)

For apps packaged as MSIX, Electron's `autoUpdater` consumes a
Squirrel.Mac-shaped JSON feed selected with the `msix` format segment:

```js
autoUpdater.setFeedURL({
  url: `https://download.myapp.com/update/${platform}/msix/${version}`,
});
```

Channel variant: `/update/channel/beta/${platform}/msix/${version}`.

Upload `.msix` (single-arch, e.g. `MyApp_1.0.0_x64.msix`) and/or
`.msixbundle` assets. A `.msixbundle` is multi-arch by definition and
satisfies any Windows architecture; when both are published the bundle is
preferred. MSIX packages must be signed.

Default Windows downloads keep resolving the `.exe` installer, and the
Squirrel.Windows flow is unaffected by MSIX assets. On the discrete download
route msix is a package format: `/dl/windows/64?pkg=msix` serves the x64
`.msix`, `/dl/windows/universal?pkg=msix` the `.msixbundle`.

The 2.0-prerelease-era `?filetype=msix` query was removed — the format
segment is the only way to select the MSIX feed (see the
[migration guide](migrating-2.0.md)).
