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

Release builds that strip JNI debug symbols can corrupt Bare `.so` addons. In the **host app** `android/app/build.gradle`, keep debug symbols for Bare-related libraries:

```groovy
android {
  packaging {
    jniLibs {
      keepDebugSymbols += [
        "**/libbare*.so",
        "**/libbuildonspark__*.so",
        "**/libsodium-native*.so",
      ]
    }
  }
}
```

Expo apps should apply the same via a config plugin (e.g. `@spacesops/wdk-react-native-core`).

## Publishing (maintainers)

Holepunch **`libbare-kit.so`** and **`BareKit.xcframework`** are not stored in this git repo (same as upstream). They are copied from **`react-native-bare-kit@0.11.0`** on npm before pack:

```bash
npm run sync-native
npm run verify-pack
npm publish --access public
```

`prepack` runs those steps automatically; never publish with `--ignore-scripts`.

## License

Apache-2.0
