# Upload assets for releases

Pecans uses GitHub Releases and assets to serve the right file to the right user.

See GitHub guides: [About Releases](https://help.github.com/articles/about-releases/) & [Creating Releases](https://help.github.com/articles/creating-releases/).

## Naming

Pecans github backend uses some filename/extension conventions to serve the correct asset to a specific request. Assets are matched by platform, architecture, channel, and version. Pecans expects these details to be emebedded in the asset name. The asset name is delimited by dashes and each column is analyzed to determine what information it holds to provide some flexibilty in nameing.

- **platform** inherited from electron-packager ['linux' | 'win32' | 'darwin' | 'mas'](https://github.com/electron/electron-packager/blob/33b60b6334471e08cbf7c0392a0cc272ac23d8d8/src/index.d.ts#L50), we have added `win` and `mac` as aliases of `win32` and `darwin` for consumer friendliness. Ensure this string is in your asset name delimited by `-`
- **architecture** inherited from electron-packager ['ia32' | 'x64' | 'armv7l' | 'arm64' | 'mips64el'](https://github.com/electron/electron-packager/blob/33b60b6334471e08cbf7c0392a0cc272ac23d8d8/src/index.d.ts#L46), by default releases will be tagged as 64-bit
- **channel and version** are parsed from a semver version in the form of {major}.{minor}.{patch}-{channel}.{iteration}. The version is identified first, then the channel is parsed from the version.

Filetype and usage will be detected from the extension:

- **exe** - windows installer
- **nupkg** - windows nuget package
- **zip** - OSx/Linux/Windows Portable Archive
- **deb** - linux debian package
- **rpm** - linux redhat package

### Example

Here is a list of files in one of the latest release of our [GitBook Editor](https://www.gitbook.com/editor):

```sh
Visibox-1.3.0-next.7-x64-setup.exe
Visibox-1.3.0-next.7-x64.dmg
Visibox-1.3.0-next7-full.nupkg
Visibox-darwin-x64-1.3.0-next.7.zip

gitbook-editor-5.0.0-beta.10-linux-ia32.deb
gitbook-editor-5.0.0-beta.10-linux-x64.deb
gitbook-editor-5.0.0-beta.10-osx-x64.dmg
gitbook-editor-5.0.0-beta.10-osx-x64.zip
GitBook.Editor.Setup.exe
GitBook_Editor-5.0.0.2010-full.nupkg
RELEASES
```
