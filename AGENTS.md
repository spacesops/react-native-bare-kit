# AGENTS.md — @spacesops/react-native-bare-kit

Fork of Holepunch's `react-native-bare-kit`. It owns the **native side**: the bare runtime (`libbare-kit.so`, `BareKit.xcframework`), addon discovery and linking, and the Android packaging constraints addons impose on host apps.

`libbare-kit.so` and the xcframework are **not in git**. `prepack` copies them from the upstream npm release pinned in `scripts/sync-holepunch-native.mjs`. Never publish with `--ignore-scripts`.

## Non-obvious invariants — breaking these produces bugs that look like something else

**Every addon must have `NEEDED libbare-kit.so`.** Prebuilt addons expect `js_*` / `bare_*` symbols from the linker's global group. That holds for the `bare` CLI, where the runtime is the main executable, but not on Android, where the runtime is a `DT_NEEDED` of React Native's merged library. Addons are built `BIND_NOW`, so without that entry every load fails instantly. `shared/link-addons.mjs` adds it while patching the SONAME. `RTLD_GLOBAL` is **not** an alternative — promoting an already-loaded library does not add it to the global group on Android.

**Addons must not be stripped.** The loader reads their symbol tables directly, so stripping corrupts them. Only some builds strip, so this fails in **release only**. `app.plugin.js` owns this for Expo consumers.

**`app.plugin.js` must derive its pattern list, never hardcode prefixes.** It discovers `"addon": true` packages exactly as `link.mjs` does. A hand-written list of `libbare*` / `libsodium-native*` silently missed `libudx-native` for months.

**Do not raise `UPSTREAM_VERSION` to 0.15.x.** It adds `NEEDED libnativehelper.so`, an ART-internal library that app linker namespaces cannot resolve. The build succeeds, then `libappmodules.so` fails to load and every TurboModule disappears — it presents as `TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found`, which looks like a stale Metro cache. Raising it is still sometimes necessary: an addon needing a newer runtime ABI fails with `cannot locate symbol "js_…"` *despite* having the `NEEDED` entry. Current pin is 0.14.5.

## Before changing linking or packaging

`TROUBLESHOOTING.md` documents the NDK `dlopen` harness that recovers the real `dlerror()` bare truncates at 1024 bytes. Use it instead of inferring from logcat — a listed candidate in `ADDON_NOT_FOUND` means the file was found and `dlopen` failed, so filenames and `linked:` alignment are the wrong thing to chase.

## Release

`pre-pub.md` is the checklist. `files` must include `app.plugin.js` and `TROUBLESHOOTING.md`; omitting the plugin breaks Expo consumers **only in release builds**, so nothing catches it earlier. Publish before bumping `wdk-react-native-core`, which pins this package exactly.
