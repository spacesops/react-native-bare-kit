/**
 * Copy Holepunch native artifacts into this fork (android/libs/bare-kit, ios xcframework).
 * Upstream keeps these out of git; they ship in react-native-bare-kit@0.11.0 on npm.
 *
 * Runs automatically via npm `prepack` before `npm pack` / `npm publish`.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

// Must be new enough to export the js_* symbols the bare-* addon prebuilds link against
// (e.g. js_get_function_id for bare-module 6.4, js_enable_garbage_collection_tracking for
// bare-performance 2.1). Too old and every addon fails dlopen as ADDON_NOT_FOUND.
//
// Do not move to 0.15.x: it adds NEEDED libnativehelper.so, which app linker namespaces
// cannot resolve, so libappmodules.so fails to load and every TurboModule disappears.
const UPSTREAM_VERSION = '0.14.5'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.join(__dirname, '..')

const REQUIRED_ARTIFACTS = [
  'android/libs/bare-kit/classes.jar',
  'android/libs/bare-kit/jni/arm64-v8a/libbare-kit.so',
  'android/libs/bare-kit/jni/armeabi-v7a/libbare-kit.so',
  'android/libs/bare-kit/jni/x86/libbare-kit.so',
  'android/libs/bare-kit/jni/x86_64/libbare-kit.so',
  'ios/BareKit.xcframework/Info.plist'
]

function verifyNativeArtifacts() {
  const missing = []

  for (const rel of REQUIRED_ARTIFACTS) {
    const abs = path.join(packageRoot, rel)
    if (!fs.existsSync(abs)) missing.push(rel)
  }

  if (missing.length === 0) return true

  console.error('[sync-holepunch-native] Missing native artifacts:')
  for (const rel of missing) console.error('  -', rel)
  return false
}

if (verifyNativeArtifacts()) {
  console.log('[sync-holepunch-native] Holepunch native libs present — skipping download')
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-bare-kit-'))
const packDir = path.join(tmp, 'pack')
fs.mkdirSync(packDir)

console.log('[sync-holepunch-native] Downloading react-native-bare-kit@' + UPSTREAM_VERSION + '…')
execSync(`npm pack react-native-bare-kit@${UPSTREAM_VERSION} --pack-destination "${packDir}"`, {
  stdio: 'inherit',
  cwd: packDir
})

const tgz = fs.readdirSync(packDir).find((f) => f.endsWith('.tgz'))
if (!tgz) {
  console.error('[sync-holepunch-native] npm pack did not produce a tarball')
  process.exit(1)
}

const extractDir = path.join(tmp, 'extract')
fs.mkdirSync(extractDir)
execSync(`tar -xzf "${path.join(packDir, tgz)}" -C "${extractDir}"`, { stdio: 'inherit' })

const upstreamRoot = path.join(extractDir, 'package')
const androidLibs = path.join(upstreamRoot, 'android/libs/bare-kit')
const iosFramework = path.join(upstreamRoot, 'ios/BareKit.xcframework')

if (!fs.existsSync(androidLibs)) {
  console.error('[sync-holepunch-native] upstream tarball missing android/libs/bare-kit')
  process.exit(1)
}

if (!fs.existsSync(iosFramework)) {
  console.error('[sync-holepunch-native] upstream tarball missing ios/BareKit.xcframework')
  process.exit(1)
}

const destAndroid = path.join(packageRoot, 'android/libs/bare-kit')
fs.rmSync(destAndroid, { recursive: true, force: true })
fs.mkdirSync(path.dirname(destAndroid), { recursive: true })
fs.cpSync(androidLibs, destAndroid, { recursive: true })

const destIos = path.join(packageRoot, 'ios/BareKit.xcframework')
fs.rmSync(destIos, { recursive: true, force: true })
fs.cpSync(iosFramework, destIos, { recursive: true })

fs.rmSync(tmp, { recursive: true, force: true })

if (!verifyNativeArtifacts()) {
  console.error('[sync-holepunch-native] Sync finished but artifacts are still missing')
  process.exit(1)
}

console.log(
  '[sync-holepunch-native] Installed native libs from react-native-bare-kit@' + UPSTREAM_VERSION
)
