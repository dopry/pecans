# [2.0.0-next.18](https://github.com/dopry/pecans/compare/v2.0.0-next.17...v2.0.0-next.18) (2026-07-21)


* feat!: unified ReleaseService resolution pipeline on discrete os/arch/pkg (Phase 7 PR B) ([#44](https://github.com/dopry/pecans/issues/44)) ([8a2f06a](https://github.com/dopry/pecans/commit/8a2f06ae254bac6c9f03ec848abdb76702fce652))


### Bug Fixes

* **github:** default octokit to native fetch to prevent empty release lists ([#28](https://github.com/dopry/pecans/issues/28)) ([0f6eac6](https://github.com/dopry/pecans/commit/0f6eac6260001ff2aac91a80db0c12ee8193c0aa))
* honor route params in downloads, dead code removal, small fixes (Phase 2) ([#31](https://github.com/dopry/pecans/issues/31)) ([9fd8f79](https://github.com/dopry/pecans/commit/9fd8f79bf0917a67a7c81a8042bdd708d4e71539))
* semantic-release trusted publishing ([4f1ee88](https://github.com/dopry/pecans/commit/4f1ee882d41586551e95a3f606b3433f20285b68))
* semantic-release trusted publishing ([#53](https://github.com/dopry/pecans/issues/53)) ([3d4d4ce](https://github.com/dopry/pecans/commit/3d4d4cee75d91c01ec65b0bbbff51914028f7260))
* working generic refresh webhook; document raw as the backend-private asset slot (Phase 7 PR A) ([#43](https://github.com/dopry/pecans/issues/43)) ([23d1d9f](https://github.com/dopry/pecans/commit/23d1d9fb19a496f9e71c62d688d71551fb5b4134))


### chore

* esm only ([#24](https://github.com/dopry/pecans/issues/24)) ([1b8a546](https://github.com/dopry/pecans/commit/1b8a54618733a9c1d3d3314d78d60e8a4906c844))


### Features

* dependency modernization — Express 5, octokit 22, remove UA autodetection (Phase 5) ([#41](https://github.com/dopry/pecans/issues/41)) ([8ea329a](https://github.com/dopry/pecans/commit/8ea329a4bb4bd442f2f55679653e2e92bc586037))
* modernize packaging and dev tooling (Phase 3) ([#32](https://github.com/dopry/pecans/issues/32)) ([3345ed7](https://github.com/dopry/pecans/commit/3345ed7a0f1b189379f5efc34eafb580d14c4ded))
* recognize .msix / .msixbundle assets and 'msix' package format ([#46](https://github.com/dopry/pecans/issues/46)) ([4f848b9](https://github.com/dopry/pecans/commit/4f848b9529094a70af2a9a301a3a304c26b39f51)), closes [#26](https://github.com/dopry/pecans/issues/26)
* typed HTTP errors with router-scoped error handling (Phase 6) ([#42](https://github.com/dopry/pecans/issues/42)) ([e3b7b54](https://github.com/dopry/pecans/commit/e3b7b540b454c278c99d787950914cb6fd06ad17))


### BREAKING CHANGES

* @dopry/pecans is now ESM-only. require('@dopry/pecans')
is no longer supported; use import (Node >= 22.12).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017zXcPSv6FFTPgD59T4KudM

* refactor: import model types with import type in runtime modules

Follows up on Copilot review: PecansRelease/PecansReleases (and other
names used only in type positions) are classes, so tsc accepts plain
imports, but with verbatimModuleSyntax they would stay in the emitted
JS as runtime imports. Convert the type-only usages to import type to
keep the runtime module graph minimal and cycle-free.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017zXcPSv6FFTPgD59T4KudM
* Pecans no longer exposes a versions property.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* feat!: remove the Versions and resolveReleaseAssetForVersion adapters

The deprecation shims this PR introduced are dropped instead of carried
to 3.0: route handlers and consumers resolve through ReleaseService /
resolveAssetForRelease directly. The table-driven specs that pinned the
legacy composite-id resolution semantics are migrated onto the pipeline
(via platformToQuery) so the behavioral pins survive the adapter
removal; unique Versions coverage moved into service.spec.

Pre-existing deprecations (GitHubBackend, PecansSettings.timeout,
PecansReleaseDTO.channel) keep their 3.0 schedule.
* Versions, VersionFilterOpts, PlatformQuery, and
resolveReleaseAssetForVersion are no longer exported.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM
* getArchFromUserAgent, getOsFromUserAgent, and
getPlatformFromUserAgent now take the internal UserAgentDetails type
instead of express-useragent's Details, and getArchFromUserAgent
defaults Windows and Linux to '64' (32-bit desktops are effectively
extinct; the function is not used internally).

pecans consumed exactly four booleans from the unmaintained
express-useragent package; src/utils/userAgent.ts derives them from the
User-Agent header directly, with mobile exclusions the old library
handled via separate flags (iOS UAs contain 'like Mac OS X', Android
UAs contain 'Linux'). The middleware attaches the same req.useragent
shape. Unit specs cover the parser; the Phase 1 UA-driven download
contract tests pass unchanged.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: validate update-route params through getStringParam consistently

Review feedback: handleUpdateOSX truthiness-checked req.params directly
but read values through getStringParam, and handleUpdateWin had no
version guard at all; a missing tag would have produced a '>=undefined'
range. Validate once through the helper and reuse the validated values.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: exclude Macintosh+Mobile webview UAs from macOS detection

Review feedback (partial): a Mobile token alongside Macintosh indicates
an iPad-class webview masquerading as a Mac; genuine macOS browsers
never send it. Fixture + test added. Note true iPadOS desktop-mode UAs
are byte-identical to Mac Safari and undetectable by any parser.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: short-circuit dlfilename when the filename param is absent

Review feedback: an undefined filename passed into queryReleases matches
every release (the predicate treats undefined as no-filter), which would
serve an arbitrary asset instead of a 404. Unreachable via the current
route but guarded for consistency with the update handlers.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* feat: remove user-agent platform autodetection
* selecting a platform is now the client's
responsibility. GET / is no longer a download route, and the platform
segment is required on /download, /download/version/:tag, and
/download/channel/:channel (a missing platform returns 400). The
user-agent parser, its middleware, and the getPlatformFromUserAgent /
getArchFromUserAgent / getOsFromUserAgent helpers are removed.

Autodetection only ever served bare browser links - Squirrel update
clients and /dl/* always send explicit platforms - and reliable device
detection is better handled client-side where UA Client Hints are
available. Reverting this commit restores the feature wholesale if
anyone misses it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: remove imports orphaned by the autodetection removal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: validate tag ranges early in validateReqQueryTag

Review feedback: validRange's result was discarded, so invalid tags only
failed deep in release matching with a generic 'Invalid Range Specified'
error. Invalid ranges now throw UnsupportedTagError at the parameter
boundary ('latest' stays allowed), and the error message no longer says
'channel' for tags (copy-paste from UnsupportedChannelError).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM
* build output moves from dist/cjs + dist/mjs to a tsup
bundle (dist/index.js CJS, dist/index.mjs ESM). Deep imports into dist
paths no longer resolve; all models (PecansRelease, PecansAsset,
PecansReleases, ...) are now exported from the package root instead.

- replace the dual-tsc + fixup.sh build with tsup (CJS + ESM + d.ts +
  sourcemaps, node22 target); consolidate four tsconfigs into one
  typecheck-only tsconfig.json
- add a proper exports map with types for both module systems; verified
  with publint and arethetypeswrong (all green: node10/node16/bundler)
- declare debug and qs as real dependencies - both are imported directly
  but were only present transitively via express, which broke the ESM
  bundle (inlined CJS require calls)
- guard the run-directly check with typeof require so the ESM build is
  importable; node dist/index.js still starts the server
- ts-node out of runtime dependencies; dev now runs tsx watch; start
  runs the compiled dist; drop nodemon
- ESLint 9 flat config + prettier (replaces the stale mocha-era
  .eslintrc); fix the 19 findings it surfaced (unused imports/vars,
  case-block declarations, error causes, no-useless-assignment)
- add explicit @types/node; add lint/format/typecheck scripts
- package.json: type commonjs, sideEffects false, canonical repo url

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: rank .tar.gz assets by their full extension in resolveForVersion

path.extname reports '.gz' for .tar.gz filenames, so the sort fallback
ranked them at prefs.indexOf(-1) - ahead of every genuine preference -
whenever .tgz and .tar.gz assets coexisted. Use getSupportedExt, which
handles the double extension, matching the Phase 2 fix to
PecansAsset.satisfiesExtensions. Regression test added.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: throw Error from configure(), correct Listening typo

Review feedback: the default switch case in configure() threw a raw
string (no stack trace); the startup log said 'Lisening'. The test that
pinned the typo is updated to match.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

* fix: throw on invalid os in getDownloadExtensionsByOs

Review feedback: the switch had no default, so an invalid OperatingSystem
cast in at runtime silently returned undefined against the declared
SupportedFileExtension[] return type. Fail loudly instead; edge-case test
updated to pin the throw.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015zUyj4PpSog9RkrYxzFRhM

# [2.0.0-next.17](https://github.com/dopry/pecans/compare/v2.0.0-next.16...v2.0.0-next.17) (2025-09-20)


### Bug Fixes

* tests switch to vitest and expand test coverage.  ([#22](https://github.com/dopry/pecans/issues/22)) ([bbd4ccb](https://github.com/dopry/pecans/commit/bbd4ccbe70601e96c77732244b8537dac1cb6c49))

# [2.0.0-next.16](https://github.com/dopry/pecans/compare/v2.0.0-next.15...v2.0.0-next.16) (2025-09-19)


### Features

* cache releases in abstract Backend class with stale-while-revalidate strategy ([#19](https://github.com/dopry/pecans/issues/19)) ([173e74c](https://github.com/dopry/pecans/commit/173e74c043dbee2b087d125d0804dfda171e4960))

# [2.0.0-next.15](https://github.com/dopry/pecans/compare/v2.0.0-next.14...v2.0.0-next.15) (2025-05-09)


### Features

* includeVersionInReleaseNotes setting ([#17](https://github.com/dopry/pecans/issues/17)) ([05449b0](https://github.com/dopry/pecans/commit/05449b0ac83e7860fc8f44d6feec2be0b173a6dc))

# [2.0.0-next.14](https://github.com/dopry/pecans/compare/v2.0.0-next.13...v2.0.0-next.14) (2023-09-13)


### Features

* integration tests for /dl/:filename ([#10](https://github.com/dopry/pecans/issues/10)) ([20f8140](https://github.com/dopry/pecans/commit/20f8140ef05004a9446c16f0f81d1aeefe67075a))

# [2.0.0-next.13](https://github.com/dopry/pecans/compare/v2.0.0-next.12...v2.0.0-next.13) (2023-09-12)


### Bug Fixes

* version and arch resolution ([4e00394](https://github.com/dopry/pecans/commit/4e003949dfd21d802feed57869a40677c49167dc))

# [2.0.0-next.12](https://github.com/dopry/pecans/compare/v2.0.0-next.11...v2.0.0-next.12) (2023-09-12)


### Features

* log requests for debugging ([e8e3b1c](https://github.com/dopry/pecans/commit/e8e3b1cfa5d4bf89b59edd7fcbb1511e940f73c7))

# [2.0.0-next.11](https://github.com/dopry/pecans/compare/v2.0.0-next.10...v2.0.0-next.11) (2023-09-12)


### Bug Fixes

* unrecognized architecture preventing start up ([#9](https://github.com/dopry/pecans/issues/9)) ([8f74b5f](https://github.com/dopry/pecans/commit/8f74b5fe8c46d0590659cd9e1820decabbc1d342))

# [2.0.0-next.10](https://github.com/dopry/pecans/compare/v2.0.0-next.9...v2.0.0-next.10) (2023-09-12)


### Bug Fixes

* fetch missing ([#7](https://github.com/dopry/pecans/issues/7)) ([0bd2aa7](https://github.com/dopry/pecans/commit/0bd2aa7ec8a4380c10284260171dcaccaf7d0d48))

# [2.0.0-next.9](https://github.com/dopry/pecans/compare/v2.0.0-next.8...v2.0.0-next.9) (2023-09-08)


### Bug Fixes

* missing preferUniversal from options ([8dbb31d](https://github.com/dopry/pecans/commit/8dbb31d1b68f508af8c369eea2c7d1d451620a07))

# [2.0.0-next.8](https://github.com/dopry/pecans/compare/v2.0.0-next.7...v2.0.0-next.8) (2023-09-08)


### Features

* preferUniversal option ([#6](https://github.com/dopry/pecans/issues/6)) ([74c4f04](https://github.com/dopry/pecans/commit/74c4f041d572e619e94ab29c3a283255f5e51640))

# [2.0.0-next.7](https://github.com/dopry/pecans/compare/v2.0.0-next.6...v2.0.0-next.7) (2023-08-09)


### Features

* add support for osx universal binaries. ([#5](https://github.com/dopry/pecans/issues/5)) ([902f283](https://github.com/dopry/pecans/commit/902f2836d09025ba096366cbb7195063b3e3a376))

# [2.0.0-next.6](https://github.com/dopry/pecans/compare/v2.0.0-next.5...v2.0.0-next.6) (2022-06-13)


### Bug Fixes

* do not include draft releases ([15cf4c8](https://github.com/dopry/pecans/commit/15cf4c87d169eae054968337701e2d39a205a5fa))

# [2.0.0-next.5](https://github.com/dopry/pecans/compare/v2.0.0-next.4...v2.0.0-next.5) (2022-06-07)


### Features

* make pecans package executable ([558b3fd](https://github.com/dopry/pecans/commit/558b3fdea2315c26efd5f743681843f825cf5c22))

# [2.0.0-next.4](https://github.com/dopry/pecans/compare/v2.0.0-next.3...v2.0.0-next.4) (2022-06-07)


### Bug Fixes

* only include dist in pkg ([d8fdb25](https://github.com/dopry/pecans/commit/d8fdb256503b85c9898a4736f2cac5750d153606))

# [2.0.0-next.3](https://github.com/dopry/pecans/compare/v2.0.0-next.2...v2.0.0-next.3) (2022-06-07)


### Bug Fixes

* platform mapping on RELEASES endpoint ([5aede2a](https://github.com/dopry/pecans/commit/5aede2ad2c50f856d53b99872a7c00a3231b9fd1))


### Features

* automated builds ([d8792b1](https://github.com/dopry/pecans/commit/d8792b1eb3609c1b91a90dd43021ba87298adb96))

# [2.0.0-next.2](https://github.com/dopry/pecans/compare/v2.0.0-next.1...v2.0.0-next.2) (2022-06-06)


### Bug Fixes

* better legacy support ([e2a9e4d](https://github.com/dopry/pecans/commit/e2a9e4dc2beb1ed4ec4eb216359deca158262673))
* download urls on update endpoint ([df4f68c](https://github.com/dopry/pecans/commit/df4f68cf0f8e4e988fb70ca4ab8b112e90ccb748))

# [2.0.0-next.1](https://github.com/dopry/pecans/compare/v1.2.0...v2.0.0-next.1) (2022-05-20)


### Features

* cjs and esm module distribution ([906e725](https://github.com/dopry/pecans/commit/906e7255e86df8b657edfe5dc9c42563534290d8))


### BREAKING CHANGES

* Configuration requires new arguments

# [2.0.0](https://github.com/dopry/pecans/compare/v1.2.0...v2.0.0) (2022-05-20)


### Features

* cjs and esm module distribution ([906e725](https://github.com/dopry/pecans/commit/906e7255e86df8b657edfe5dc9c42563534290d8))


### BREAKING CHANGES

* Configuration requires new arguments

# [1.2.0](https://github.com/dopry/pecans/compare/v1.1.2...v1.2.0) (2021-11-15)


### Features

* Apple Silicon support ([e97a659](https://github.com/dopry/pecans/commit/e97a65915e91595fcbbaa3b3f9059acec8fbd507))

## [1.1.2](https://github.com/dopry/pecans/compare/v1.1.1...v1.1.2) (2021-05-28)


### Bug Fixes

* feed miscategorized as devDependency ([9995025](https://github.com/dopry/pecans/commit/9995025d5f542da97a9b72f10af5c5c507f624d2))

## [1.1.1](https://github.com/dopry/pecans/compare/v1.1.0...v1.1.1) (2021-05-28)


### Bug Fixes

* analytics platform resolution ([c61162b](https://github.com/dopry/pecans/commit/c61162b6b6a8b470bc38623698783d8e06155b52))
* include package-lock.json in release commit ([cd39ea2](https://github.com/dopry/pecans/commit/cd39ea2b37d61a56beedeb7d1cb57b06d40b36cb))
* remove debug logging ([06b4ee2](https://github.com/dopry/pecans/commit/06b4ee210c527b88c8390c8cd23ec001ffccc1fa))
* version filtering without platform ([dda6cc0](https://github.com/dopry/pecans/commit/dda6cc08701f5067f32c6d7b13e13496b8b1ff5e))

# [1.1.0](https://github.com/dopry/pecans/compare/v1.0.0...v1.1.0) (2021-05-28)


### Bug Fixes

* analytics exception and update to latest version ([3faed54](https://github.com/dopry/pecans/commit/3faed54d101e1fd56117a063d05b20f2b3ea6f7f))
* request related security vulnerabilities ([b2a1717](https://github.com/dopry/pecans/commit/b2a171732b13695bbded76c014c1e7ed7959fdce))
* update gitbook links ([b7009e5](https://github.com/dopry/pecans/commit/b7009e5a91bad1ba712de0828a8f91fba75047ca))
* update octocat to address security warnings ([412f8b4](https://github.com/dopry/pecans/commit/412f8b421f5f1fed9667b94e3d091a108a952865))


### Features

* add basePath option ([d3dc33b](https://github.com/dopry/pecans/commit/d3dc33b71f9f9200355fecb06c4818ea75aa5073))

# 1.0.0 (2021-05-23)


### Features

* redirect to private assets ([21f04a7](https://github.com/dopry/pecans/commit/21f04a7d91fa86714ec94de5f7884cbb7f2d6f18))
* fork and rename pecans ([bba5326](https://github.com/dopry/pecans/commit/bba53262d51ab633a9a0299f72360c63bf10da5d))
