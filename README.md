# @spacesops/react-native-bare-kit

Fork of [holepunchto/react-native-bare-kit](https://github.com/holepunchto/react-native-bare-kit) for Spacesops WDK apps. Based on upstream **v0.11.0**, with custom native addon linking for nested `node_modules` (e.g. `bare-tls`, `bare-tcp`, Electrum/BTC addons) and minimal Android SONAME handling aligned with `@spacesops/pear-wrk-wdk` `--linked` bundles.

```
npm i @spacesops/react-native-bare-kit
```

## Usage

```js
import { Worklet } from '@spacesops/react-native-bare-kit'
import b4a from 'b4a'

const worklet = new Worklet()

const source = `\
const { IPC } = BareKit

IPC.on('data', (data) => console.log(data.toString()))
IPC.write(Buffer.from('Hello from Bare!'))
`

worklet.start('/app.js', source)

const { IPC } = worklet

IPC.on('data', (data) => console.log(b4a.toString(data)))
IPC.write(b4a.from('Hello from React Native!'))
```

Alternatively to load from a bundle:

```js
import { Worklet } from '@spacesops/react-native-bare-kit'

// Bundle output by `bare-pack`
// Extension can be .bundle, .js, .cjs, .mjs
import bundle from './my.bundle.js'

const worklet = new Worklet()
// First arg (filename)'s extension *must* be .bundle
worklet.start('/app.bundle', source)

// [...]
```

Refer to <https://github.com/holepunchto/bare-expo> for an example of using the library in an Expo application.

### Logging

The `console.*` logging APIs used in the worklet write to the system log using <https://github.com/holepunchto/liblog> with the `bare` identifier. Refer to <https://github.com/holepunchto/liblog#consuming-logs> for instructions on how to consume the logs.

## Native addon linking

On `npm install`, host apps do not need separate relink scripts. Gradle **`preBuild`** runs `android/link.mjs`, which:

- Walks **all** nested `node_modules` for packages with `"addon": true`
- Copies Android prebuilds to `android/src/main/addons/<abi>/lib<name>.<version>.so` (scoped names use `libscope__pkg.<version>.so`)
- Applies a **minimal SONAME / RUNPATH** patch (no full `bare-link` ELF rewrite that breaks some layouts)

iOS uses the same addon discovery via `ios/link.mjs`.

## Android packaging (host app)

Addons are `dlopen`ed by filename and the loader reads their symbol tables directly, so **stripping JNI debug symbols corrupts them**. Because only some builds strip, this typically fails in release only, and surfaces as `ADDON_NOT_FOUND` with a truncated `dlopen` cause.

Expo apps get this from the bundled config plugin — add it to `app.json`:

```json
{ "expo": { "plugins": ["@spacesops/react-native-bare-kit"] } }
```

The plugin derives the pattern list by discovering every `"addon": true` package in the tree, the same way `link.mjs` does, so it stays correct as addons come and go. Do not hand-maintain a list of prefixes: `libudx-native` is a real counter-example that a `libbare*` glob silently misses. Pass `extraJniLibPatterns` if you have addons the discovery cannot see.

Consumers of `@spacesops/wdk-react-native-core` do not need this entry — its plugin applies this one.

Bare React Native apps without Expo config plugins should keep the equivalent in `android/app/build.gradle`:

```groovy
android {
  packaging {
    jniLibs {
      // every addon, plus the runtime itself
      keepDebugSymbols += ["**/libbare*.so", "**/libsodium-native.*.so", "**/libudx-native.*.so"]
    }
  }
}
```

See **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** when addons fail to load.

## Publishing (maintainers)

Holepunch **`libbare-kit.so`** and **`BareKit.xcframework`** are not stored in this git repo (same as upstream). They are copied from the upstream **`react-native-bare-kit`** version pinned in `scripts/sync-holepunch-native.mjs` (currently **0.14.5**; do not raise it to 0.15.x — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)) before pack:

```bash
npm run sync-native
npm run verify-pack
npm publish --access public
```

`prepack` runs those steps automatically; never publish with `--ignore-scripts`.

## License

Apache-2.0
