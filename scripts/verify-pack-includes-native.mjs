/**
 * Fail if `npm pack --dry-run` would omit Holepunch native binaries.
 * Runs a full dry-run pack (prepack syncs natives first).
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.join(__dirname, '..')

const REQUIRED_IN_TARBALL = [
  'android/libs/bare-kit/jni/arm64-v8a/libbare-kit.so',
  'ios/BareKit.xcframework/Info.plist'
]

const out = execSync('npm pack --dry-run 2>&1', {
  cwd: packageRoot,
  encoding: 'utf8'
})

const missing = REQUIRED_IN_TARBALL.filter((rel) => !out.includes(rel))

if (missing.length > 0) {
  console.error('[verify-pack-includes-native] npm pack would omit:')
  for (const rel of missing) console.error('  -', rel)
  process.exit(1)
}

console.log('[verify-pack-includes-native] Tarball includes libbare-kit.so and BareKit.xcframework')
