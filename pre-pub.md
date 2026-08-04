# Pre-publish checklist — `@spacesops/react-native-bare-kit`

Use on branch **`repackage`** before publishing to [npmjs.org](https://www.npmjs.com/).

**Context**

| Item                                      | Value                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Upstream fork baseline                    | [holepunchto/react-native-bare-kit](https://github.com/holepunchto/react-native-bare-kit) tag **`v0.11.0`** |
| Public npm today                          | `react-native-bare-kit@0.11.0` (Holepunch)                                                                  |
| Worklet bundle to validate against        | `@spacesops/pear-wrk-wdk@1.1.1-beta.40` (`bare-pack --linked` addon names)                                  |
| `@spacesops/react-native-bare-kit` on npm | Not published yet (create scoped package)                                                                   |

**Why this fork exists:** Stock **`bare-link`** in upstream `android/link.mjs` / `ios/link.mjs` breaks some ELF layouts and does not match the starter’s needs for nested `node_modules` + btc Electrum addons (`bare-tls`, `bare-tcp`, `bare-performance`, …). The starter currently patches Gradle and runs [`relink-bare-addons.js`](https://github.com/spacesops/wdk-starter-react-native/blob/main/scripts/relink-bare-addons.js) — that logic should live **here** instead.

---

## 1. Git and branch

- [ ] Branch **`repackage`**, pushed to `spacesops/react-native-bare-kit`
- [ ] Based on **`v0.11.0`** (or documented commit), not random `main`
- [ ] `.gitignore` includes `android/.gradle/`, `addons/`, `node_modules/`
- [ ] No committed build artifacts under `android/src/main/addons/` or `ios/addons/` (generated at link time)

---

## 2. `package.json` — identity and publishing

- [ ] `"name": "@spacesops/react-native-bare-kit"`
- [ ] **Version** distinct from Holepunch `0.11.0` (e.g. **`0.11.0-spacesops.1`** or **`0.11.1-beta.1`**)
- [ ] `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`
- [ ] `"repository"` → `git+https://github.com/spacesops/react-native-bare-kit.git`
- [ ] Update `"description"` / `"author"` for Spacesops maintainership
- [ ] Keep **`peerDependencies`**: `react`, `react-native` (same as upstream)
- [ ] `"files"` still includes `android`, `ios`, `shared`, `specs`, podspec, `react-native.config.js`
- [ ] **`prepack`** runs `scripts/sync-holepunch-native.mjs` (copies `libbare-kit.so`, `classes.jar`, `BareKit.xcframework` from `react-native-bare-kit@0.11.0` — not in git)

---

## 3. Android linking (`android/link.mjs` + Gradle)

Upstream today:

```js
import link from 'bare-link'
// link(projectRoot, { target: [...], needs: ['libbare-kit.so'], out: .../addons })
```

**Replace or extend with:**

- [ ] Resolve **app project root** (four levels up from `node_modules/@spacesops/react-native-bare-kit/android/link.mjs` → host app root, same as upstream path math)
- [ ] **Recursively** scan `node_modules` for packages with `"addon": true` (include **nested** deps, e.g. `bare-tls` under `@spacesops/wdk-wallet-btc`)
- [ ] For each addon + ABI, copy **`prebuilds/<host>/*.bare`** → **`android/src/main/addons/<arch>/lib<escapedName>.<version>.so`**
  - Naming: `@scope/pkg` → `libscope__pkg.<version>.so` (match starter relink script)
- [ ] **Do not** use full `bare-link` / bare-lief rewrite if it breaks bare-kit loader (`strtab out of bounds`)
- [ ] Apply **minimal SONAME fix** so runtime lookup matches pear bundle `linked:libbare-tls.*.so` names
- [ ] Add **`NEEDED libbare-kit.so`** to every patched addon — prebuilds expect `js_*` / `bare_*` from the linker's global group, which Android does not provide, so a raw copy always fails `dlopen` with `cannot locate symbol "js_create_function"` (surfaces as `ADDON_NOT_FOUND` in wallet creation). `RTLD_GLOBAL` is not a substitute.
- [ ] Targets: `android-arm64`, `android-arm`, `android-ia32`, `android-x64` → `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- [ ] `android/build.gradle`: `preBuild.dependsOn link` runs `node link.mjs` with cwd `android/` (unchanged pattern OK if script path is correct)
- [ ] Optional: emit **`addons-lock.json`** at app root or in package for CI diffing

Reference implementation (starter, to port): `wdk-starter-react-native-develop/scripts/relink-bare-addons.js`

---

## 4. iOS linking (`ios/link.mjs`)

- [ ] Same project-root scan and addon discovery as Android
- [ ] Targets: `ios-arm64`, `ios-arm64-simulator`, `ios-x64-simulator`
- [ ] Output: `ios/addons/` (upstream layout)
- [ ] SONAME / naming consistent with pear `--linked` bundle on iOS if applicable

---

## 5. App-level Android packaging (document or defer)

Gradle **symbol stripping** also corrupted bare addons. Host apps need:

```groovy
packaging {
    jniLibs {
        keepDebugSymbols += [
            "**/libbare*.so",
            "**/libbuildonspark__*.so",
            "**/libsodium-native*.so",
        ]
    }
}
```

- [ ] Document in **`README.md`** (required for Expo/RN host apps)
- [ ] Or ship an Expo config plugin from `@spacesops/wdk-react-native-core` (Phase 4)
- [ ] After this fork is published, **remove** starter Gradle override in `plugins/withBareKitAndroid.js` that points at `relink-bare-addons.js`

---

## 6. Integration test (before publish)

From a host app that uses:

- `@spacesops/pear-wrk-wdk@1.1.1-beta.40`
- `@spacesops/react-native-bare-kit` (this fork, `file:` or npm)

- [ ] `npm install` in app → no manual `wire-worklet` / `relink-bare-addons` scripts
- [ ] `expo prebuild` / `./gradlew :app:assembleDebug` runs **`link`** task successfully
- [ ] APK contains expected `lib/*/libbare*.so` (and spark frost / sodium if in dependency tree)
- [ ] Device: **`initializeFromMnemonic`** succeeds — no **`ADDON_NOT_FOUND`** for `bare-tls`, `bare-performance`, etc.
- [ ] Device: HRPC **`network: "bitcoin"`** (address/balance) with btc-enabled pear bundle

---

## 7. Quality gates

- [ ] `npm run test` (prettier check) passes
- [ ] `npm run sync-native` then `npm run verify-pack` (or `npm pack --dry-run`) lists **`libbare-kit.so`** (all ABIs), **`classes.jar`**, **`ios/BareKit.xcframework`** (~300MB+ unpacked; not `android/.gradle`)
- [ ] Compare addon filenames to names referenced in `@spacesops/pear-wrk-wdk@1.1.1-beta.40` bundle metadata (`linked:lib…`)

---

## 8. Publish and verify

```bash
npm run sync-native
npm run verify-pack
npm login
npm publish --access public   # do not use --ignore-scripts (prepack must run)
npm view @spacesops/react-native-bare-kit version
```

- [ ] Tag git release matching npm version
- [ ] Temp install in clean app: `npm i @spacesops/react-native-bare-kit@<version>`

---

## 9. Downstream (Phase 4)

- [ ] Pin in `@spacesops/wdk-react-native-core` (`repackage`):

```json
"@spacesops/react-native-bare-kit": "<version>"
```

- [ ] Remove dependency on **`react-native-bare-kit@^0.11.0`** (Holepunch)
- [ ] Publish core; starter drops `wire-worklet.js` + relink script when core + bare-kit are wired (Phase 5)

---

## Quick status

| Check                                                | Done? | Notes |
| ---------------------------------------------------- | ----- | ----- |
| Scoped package name + publishConfig                  |       |       |
| Custom Android `link.mjs` (not stock bare-link only) |       |       |
| iOS `link.mjs` updated                               |       |       |
| Nested `node_modules` addon scan                     |       |       |
| SONAME matches pear `--linked` names                 |       |       |
| Addons carry `NEEDED libbare-kit.so`                 |       |       |
| E2E wallet create + bitcoin on device                |       |       |
| Published to npm                                     |       |       |

---

## References

- Upstream: https://github.com/holepunchto/react-native-bare-kit/tree/v0.11.0
- Pear worklet: `@spacesops/pear-wrk-wdk@1.1.1-beta.40`
- Starter workaround to replace: `scripts/relink-bare-addons.js`, `plugins/withBareKitAndroid.js` (Gradle link override)
