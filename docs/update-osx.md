# Auto-updater on macOS

Pecans serves the [Squirrel.Mac](https://github.com/Squirrel/Squirrel.Mac)
JSON feed consumed by Electron's built-in `autoUpdater` on macOS. Ship a
`.zip` of your signed app among the release assets (Squirrel.Mac updates
from zips; `.dmg` assets serve human downloads).

## Electron example

```js
import { app, autoUpdater } from "electron";

const platform = `${process.platform}-${process.arch}`; // e.g. darwin-arm64
const version = app.getVersion();

autoUpdater.setFeedURL({
  url: `https://download.myapp.com/update/${platform}/${version}`,
});
```

Release channels: `https://download.myapp.com/update/channel/beta/${platform}/${version}`.

The update.electronjs.org-style form
(`/update/${platform}/squirrel/${version}`) is equivalent — see
[URL Routing](urls.md).

The feed responds `204` when the client is current, or `200` with
`{url, name, notes, pub_date}`; macOS requires the app to be signed for
Squirrel.Mac to apply updates.
