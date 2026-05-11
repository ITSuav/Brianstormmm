import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const defaultBlenderExecutable = 'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe'
const blenderExecutable = process.env.BLENDER_EXE || defaultBlenderExecutable
const blenderScript = path.join('scripts', 'render_blender_terrain.py')

if (!existsSync(blenderExecutable)) {
  console.error(`Blender executable not found: ${blenderExecutable}`)
  console.error('Set BLENDER_EXE to a local Blender executable path and rerun npm run assets:blender.')
  process.exit(1)
}

const result = spawnSync(blenderExecutable, ['--background', '--python', blenderScript], {
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

const statusCode = result.status ?? 1
process.exit(statusCode)