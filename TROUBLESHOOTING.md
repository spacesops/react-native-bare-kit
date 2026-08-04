# Troubleshooting Android addon loading

Symptoms here are almost always **symbol resolution**, not missing files. Paths in the examples are written from a consuming app; run them there.

## `ADDON_NOT_FOUND` on Android is usually a symbol error, not a missing file

```
E bare: AddonError: ADDON_NOT_FOUND: Cannot find addon '.' imported from
        'file:///wdk-worklet.bundle/node_modules/bare-crypto/binding.js'
E bare: Candidates:
E bare: - linked:libbare-crypto.1.12.0.so
E bare:   [cause]: Error: dlope        <-- truncated
```

If a candidate is listed, resolution **worked** and the file **was found** — `dlopen` failed. Bare truncates that log message at **1024 bytes**, so the real reason never reaches logcat. Don’t chase filenames, pear `linked:` alignment, or `nativeLibraryDir` on this symptom alone; get the `dlerror()` first (harness below).

Root cause found 2026-08-03 (fixed in **`@spacesops/react-native-bare-kit@0.11.0-beta.47`**): prebuilt addons expect `js_*` / `bare_*` symbols from the linker’s **global group**, which holds for the `bare` CLI (runtime is the main executable) but not on Android, where the runtime is `libbare-kit.so` pulled in as a `DT_NEEDED` of React Native’s merged library. Addons declared no dependency on it and are built `BIND_NOW`, so every load failed immediately. `link-addons.mjs` now adds **`NEEDED libbare-kit.so`** while patching the SONAME. `RTLD_GLOBAL` is **not** an alternative — promoting an already-loaded library does not add it to the global group on Android.

Two things this rules out as causes, so they’re not worth re-testing: **`expo.useLegacyPackaging`** (bare calls `bare.loadDynamicAddon('libbare-crypto.1.12.0.so')`, a `dlopen` by bare name, so addons load straight from the APK and need no extraction) and the **`BareKitApp`** turbo module’s `nativeLibraryDir` (the `assets` path applies to `file:` addons, not `linked:` ones).

### Check an addon’s dependencies

```bash
RE=$(ls "$ANDROID_HOME"/ndk/*/toolchains/llvm/prebuilt/*/bin/llvm-readelf | head -1)
"$RE" -d node_modules/@spacesops/react-native-bare-kit/android/src/main/addons/arm64-v8a/libbare-crypto.*.so | rg 'NEEDED|SONAME'
```

Every addon must list **`libbare-kit.so`**. To audit all of them:

```bash
D=node_modules/@spacesops/react-native-bare-kit/android/src/main/addons/arm64-v8a
for f in $D/*.so; do
  "$RE" -d "$f" | rg -q 'NEEDED.*libbare-kit.so' || echo "MISSING: $(basename $f)"
done
```

### NDK `dlopen` harness (gets the real `dlerror()`)

```c
// dltest.c — arg prefixed with '+' loads RTLD_GLOBAL
#include <dlfcn.h>
#include <stdio.h>
int main(int argc, char **argv) {
  for (int i = 1; i < argc; i++) {
    char *n = argv[i]; int f = RTLD_NOW | RTLD_LOCAL;
    if (n[0] == '+') { n++; f = RTLD_NOW | RTLD_GLOBAL; }
    void *h = dlopen(n, f);
    printf(h ? "OK   %s\n" : "FAIL %s\n  %s\n", n, h ? "" : dlerror());
  }
}
```

```bash
CC=$ANDROID_HOME/ndk/25.1.8937393/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android29-clang
$CC -o dltest dltest.c

# Pull the exact libraries the device runs, from the APK
unzip -o -j android/app/build/outputs/apk/debug/app-debug.apk \
  'lib/arm64-v8a/libc++_shared.so' 'lib/arm64-v8a/libbare-kit.so' \
  'lib/arm64-v8a/libbare-crypto.*.so' -d libs

adb shell mkdir -p /data/local/tmp/dlt
adb push dltest libs/. /data/local/tmp/dlt/
adb shell 'cd /data/local/tmp/dlt && chmod 755 dltest \
  && LD_LIBRARY_PATH=/data/local/tmp/dlt ./dltest libbare-crypto.*.so'
```

A patched addon loads on its own. If it fails with `cannot locate symbol "js_…"`, confirm the diagnosis with `LD_PRELOAD=libbare-kit.so ./dltest …` — that puts the runtime in the global group and the addon will load.

### Test every addon at once

Addons fail one at a time as the app reaches them (`bare-crypto` at worklet start, `bare-performance` only at `initializeWDK`), so always sweep the whole set instead of chasing them individually:

```bash
unzip -o -j android/app/build/outputs/apk/debug/app-debug.apk 'lib/arm64-v8a/*.so' -d libs
adb shell mkdir -p /data/local/tmp/all
adb push dltest libs/. /data/local/tmp/all/
adb shell 'cd /data/local/tmp/all && chmod 755 dltest && export LD_LIBRARY_PATH=/data/local/tmp/all \
  && ls *.so | grep -E "\.[0-9]+\.[0-9]+\.[0-9]+\.so$" | tr "\n" " " | xargs ./dltest'
```

To test a candidate runtime, overwrite `/data/local/tmp/all/libbare-kit.so` and re-run — no app rebuild needed.

### Second cause: runtime older than the addon prebuilds

`cannot locate symbol "js_…"` on an addon that _does_ have `NEEDED libbare-kit.so` means the bundled bare runtime predates the prebuild's ABI. Seen 2026-08-03 with `bare-module@6.4.0` (`js_get_function_id`) and `bare-performance@2.1.1` (`js_enable_garbage_collection_tracking`) against upstream `0.11.0`.

Fix by raising **`UPSTREAM_VERSION`** in `react-native-bare-kit/scripts/sync-holepunch-native.mjs` (fixed in **`0.11.0-beta.48`**, now `0.14.5`). Check a candidate before adopting it:

```bash
npm pack react-native-bare-kit@<version>
tar -xzf react-native-bare-kit-<version>.tgz package/android/libs/bare-kit/jni/arm64-v8a/libbare-kit.so
"$RE" --dyn-syms package/.../libbare-kit.so | rg ' js_get_function_id$'
"$RE" -d package/.../libbare-kit.so | rg NEEDED   # must NOT list libnativehelper.so
```

**Do not use 0.15.x.** It adds `NEEDED libnativehelper.so`, an ART-internal library app linker namespaces cannot resolve. The build succeeds, then `libappmodules.so` fails to load and every TurboModule vanishes — it shows up as `TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found`, which looks like a stale Metro cache but is not. The real cause is only visible in logcat as `SoLoader: Running a recovery step for libappmodules.so due to ... couldn't find DSO to load: libnativehelper.so`.

Also confirm the hand-declared C API in `shared/BareKitModule.cc` still matches upstream (`bare_worklet_options_s` was `{ size_t memory_limit; const char *assets; }` through 0.15.0) and that all 22 `bare_worklet_*` / `bare_ipc_*` functions are still exported.
