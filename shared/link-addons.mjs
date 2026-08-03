import fs from 'fs/promises'
import path from 'path'
import { ELF } from 'bare-lief'
import link from 'bare-link'

const ANDROID_HOSTS = [
  ['android-arm64', 'arm64-v8a'],
  ['android-arm', 'armeabi-v7a'],
  ['android-ia32', 'x86'],
  ['android-x64', 'x86_64']
]

const IOS_TARGETS = ['ios-arm64', 'ios-arm64-simulator', 'ios-x64-simulator']

export function projectRootFromLinkScript(linkDir) {
  const normalized = linkDir.split(path.sep)
  const nodeModulesIndex = normalized.lastIndexOf('node_modules')

  if (nodeModulesIndex !== -1) {
    return normalized.slice(0, nodeModulesIndex).join(path.sep) || path.sep
  }

  return path.resolve(linkDir, '..')
}

export function escapeAddonName(packageName) {
  return packageName.replace(/\//g, '__').replace(/^@/, '')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readPackage(packageDir) {
  try {
    const raw = await fs.readFile(path.join(packageDir, 'package.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function discoverAddons(projectRoot) {
  const nodeModules = path.join(projectRoot, 'node_modules')
  const seen = new Set()
  const addons = []

  async function walk(nodeModulesDir) {
    if (!(await exists(nodeModulesDir))) return

    let entries
    try {
      entries = await fs.readdir(nodeModulesDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.bin') continue

      if (entry.name.startsWith('@')) {
        const scopeDir = path.join(nodeModulesDir, entry.name)
        let scoped
        try {
          scoped = await fs.readdir(scopeDir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const pkg of scoped) {
          if (!pkg.isDirectory()) continue
          await visitPackage(path.join(scopeDir, pkg.name))
        }
        continue
      }

      await visitPackage(path.join(nodeModulesDir, entry.name))
    }
  }

  async function visitPackage(packageDir) {
    const pkg = await readPackage(packageDir)
    if (pkg?.addon === true && typeof pkg.name === 'string' && typeof pkg.version === 'string') {
      const key = `${pkg.name}@${pkg.version}`
      if (!seen.has(key)) {
        seen.add(key)
        addons.push({ base: packageDir, pkg })
      }
    }

    await walk(path.join(packageDir, 'node_modules'))
  }

  await walk(nodeModules)
  addons.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))
  return addons
}

async function copySiblingSharedObjects(prebuildPath, escapedName, outDir, written) {
  const siblingDir = path.resolve(prebuildPath, '..', escapedName)

  let dir
  try {
    dir = await fs.opendir(siblingDir)
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }

  try {
    for await (const file of dir) {
      if (path.extname(file.name) !== '.so') continue
      const dest = path.join(outDir, file.name)
      await fs.mkdir(outDir, { recursive: true })
      await fs.copyFile(path.join(file.parentPath, file.name), dest)
      written.push(dest)
    }
  } finally {
    await dir.close()
  }
}

async function writeAndroidPrebuild(prebuildPath, escapedName, version, outPath) {
  const soname = `lib${escapedName}.${version}.so`
  const binary = new ELF.Binary(await fs.readFile(prebuildPath))

  const sonameEntry = binary.getDynamicEntry(ELF.DynamicEntry.TAG.SONAME)
  if (sonameEntry) sonameEntry.name = soname

  const runpath = binary.getDynamicEntry(ELF.DynamicEntry.TAG.RUNPATH)
  if (runpath) runpath.runpath = '$ORIGIN'

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  binary.toDisk(outPath)
}

export async function linkAndroidAddons(projectRoot, outDir) {
  await fs.rm(outDir, { recursive: true, force: true })
  const addons = await discoverAddons(projectRoot)
  const written = []

  for (const { base, pkg } of addons) {
    const escapedName = escapeAddonName(pkg.name)

    for (const [host, arch] of ANDROID_HOSTS) {
      const prebuild = path.join(base, 'prebuilds', host, `${escapedName}.bare`)
      if (!(await exists(prebuild))) continue

      const archDir = path.join(outDir, arch)
      await copySiblingSharedObjects(prebuild, escapedName, archDir, written)

      const outPath = path.join(archDir, `lib${escapedName}.${pkg.version}.so`)
      try {
        await writeAndroidPrebuild(prebuild, escapedName, pkg.version, outPath)
        written.push(outPath)
      } catch (err) {
        await fs.mkdir(archDir, { recursive: true })
        await fs.copyFile(prebuild, outPath)
        written.push(outPath)
        console.warn(
          `WARN: SONAME patch failed for ${pkg.name} (${arch}); copied raw prebuild:`,
          err.message
        )
      }
    }
  }

  return { addons, written }
}

export async function linkIOSAddons(projectRoot, outDir) {
  const addons = await discoverAddons(projectRoot)
  const written = []
  const visited = new Set()

  for (const { base, pkg } of addons) {
    for await (const resource of link(base, { target: IOS_TARGETS, out: outDir }, pkg, visited)) {
      written.push(resource)
      console.log('Wrote', resource)
    }
  }

  return { addons, written }
}

export async function writeAddonsLock(projectRoot, platform, addons, written) {
  const lock = {
    platform,
    generatedAt: new Date().toISOString(),
    addons: addons.map(({ pkg }) => ({
      name: pkg.name,
      version: pkg.version,
      file: `lib${escapeAddonName(pkg.name)}.${pkg.version}.so`
    })),
    files: written.map((file) => path.relative(projectRoot, file))
  }

  const lockPath = path.join(projectRoot, 'addons-lock.json')
  await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  return lockPath
}
