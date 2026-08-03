import path from 'path'
import { fileURLToPath } from 'url'
import {
  linkAndroidAddons,
  projectRootFromLinkScript,
  writeAddonsLock
} from '../shared/link-addons.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = projectRootFromLinkScript(__dirname)
const out = path.join(__dirname, 'src', 'main', 'addons')

const { addons, written } = await linkAndroidAddons(projectRoot, out)

for (const resource of written) {
  console.log('Wrote', resource)
}

const lockPath = await writeAddonsLock(projectRoot, 'android', addons, written)
console.log('Wrote', lockPath)
