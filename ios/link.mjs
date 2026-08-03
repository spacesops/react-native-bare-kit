import path from 'path'
import { fileURLToPath } from 'url'
import {
  linkIOSAddons,
  projectRootFromLinkScript,
  writeAddonsLock
} from '../shared/link-addons.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = projectRootFromLinkScript(__dirname)
const out = path.join(__dirname, 'addons')

const { addons, written } = await linkIOSAddons(projectRoot, out)

const lockPath = await writeAddonsLock(projectRoot, 'ios', addons, written)
console.log('Wrote', lockPath)
