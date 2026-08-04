const fs = require('node:fs')
const path = require('node:path')

const { withAppBuildGradle } = require('@expo/config-plugins')

const MARKER = '// react-native-bare-kit: keep addon debug symbols'

// Mirrors escapeAddonName() in shared/link-addons.mjs.
function escapeAddonName(packageName) {
  return packageName.replace(/\//g, '__').replace(/^@/, '')
}

// Mirrors the discovery in shared/link-addons.mjs: an addon is any package
// declaring "addon": true, including nested ones.
function discoverAddonPackages(nodeModules, seen = new Set(), out = []) {
  let entries
  try {
    entries = fs.readdirSync(nodeModules, { withFileTypes: true })
  } catch {
    return out
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.bin') continue

    if (entry.name.startsWith('@')) {
      const scopeDir = path.join(nodeModules, entry.name)
      let scoped
      try {
        scoped = fs.readdirSync(scopeDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const pkg of scoped) {
        if (pkg.isDirectory()) visitPackage(path.join(scopeDir, pkg.name), seen, out)
      }
      continue
    }

    visitPackage(path.join(nodeModules, entry.name), seen, out)
  }

  return out
}

function visitPackage(packageDir, seen, out) {
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  } catch {
    pkg = null
  }

  if (pkg?.addon === true && typeof pkg.name === 'string') {
    if (!seen.has(pkg.name)) {
      seen.add(pkg.name)
      out.push(pkg.name)
    }
  }

  discoverAddonPackages(path.join(packageDir, 'node_modules'), seen, out)
}

function buildPatterns(projectRoot, extraPatterns) {
  const names = discoverAddonPackages(path.join(projectRoot, 'node_modules'))
  const patterns = names.map((name) => `**/lib${escapeAddonName(name)}.*.so`)

  // The runtime itself is also loaded by name and must survive stripping.
  patterns.push('**/libbare-kit.so')

  return [...new Set([...patterns, ...extraPatterns])].sort()
}

/**
 * Bare addons are loaded with dlopen() by filename and their symbol tables are
 * read directly by the bare-kit loader. Stripping them produces a load failure
 * that surfaces as `ADDON_NOT_FOUND` with a truncated `dlopen` cause, and only
 * in builds that strip — so typically release builds only.
 */
const withBareKitAddonSymbols = (config, { extraJniLibPatterns = [] } = {}) =>
  withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') return modConfig
    if (modConfig.modResults.contents.includes(MARKER)) return modConfig

    const patterns = buildPatterns(modConfig.modRequest.projectRoot, extraJniLibPatterns)
    if (patterns.length === 0) return modConfig

    const block = `
    ${MARKER}
    packaging {
        jniLibs {
            keepDebugSymbols += [
${patterns.map((p) => `                "${p}",`).join('\n')}
            ]
        }
    }
`

    // The block must land inside `android { }`; appending to the file would not.
    const anchor = /(\s+androidResources\s*\{)/
    if (anchor.test(modConfig.modResults.contents)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(anchor, `${block}$1`)
    } else {
      const androidBlock = /^android\s*\{/m
      if (!androidBlock.test(modConfig.modResults.contents)) {
        throw new Error(
          'react-native-bare-kit: could not find an `android { }` block in app/build.gradle to add keepDebugSymbols to'
        )
      }
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        androidBlock,
        (match) => `${match}\n${block}`
      )
    }

    return modConfig
  })

module.exports = withBareKitAddonSymbols
