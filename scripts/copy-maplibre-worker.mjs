// The map's tile worker is served from this site, not a CDN: copies MapLibre's worker files
// (same version as the installed library) into public/assets/maplibre on every install.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'maplibre-gl', 'dist')
const to = join(root, 'public', 'assets', 'maplibre')
mkdirSync(to, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(from, file), join(to, file))
