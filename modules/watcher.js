import fs from 'fs'
import chokidar from 'chokidar'
import path from 'path'
import { LOG_LEVELS } from '../constants/index.js'

const CWD = process.cwd()

export async function watcherModule(buildResult, configuration) {
  function logChange({ filePath, message }, level = 3, kind) {
    if(LOG_LEVELS.indexOf(configuration.logLevel) < level) return

    const method = LOG_LEVELS[level] || 'info'
    const args = [
      '[facade-builder]',
      kind,
      filePath && path.relative(CWD, filePath),
      message,
    ].filter(a => a)

    console[method](...args)
  }

  const errors = new Map()
  const {
    alsoWatchDirs,
    outdir,
    logLevel,
    followSymlinks,
    ignoreWatch,
  } = configuration

  const watcher = chokidar.watch(CWD, {
    ignored: [
      /(^|[\/\\])\../,
      '*.log',
      `${CWD}/node_modules`,
      `${CWD}/${outdir}`,
      `${CWD}/.git`,
      ...ignoreWatch.map(ignoredPath => {
        return `${CWD}/${ignoredPath}`
      })
    ],
    followSymlinks,
  })

  if(alsoWatchDirs.length) {
    for(const dir of alsoWatchDirs) {
      const fqDir = path.join(CWD, dir)

      try {
        const exists = fs.lstatSync(fqDir)

        if(exists) {
          for(const file of fs.readdirSync(fqDir)) {
            const fqPath = path.join(fqDir, file)
            logChange({ message: fqPath }, 3, 'manually added')
            watcher.add(fqPath)
          }
        }
      } catch (e) {
        errors.set('alsoWatchDirs', `path does not exist, skipping`)
      }
    }
  }

  watcher
    .on('change', async(filePath) => {
      logChange({ filePath }, 3, 'changed')

      if(buildResult?.rebuild) {
        await buildResult.rebuild()
        logChange({ message: 'rebuilt.' }, 3)
      }
    })
    .on('add', async(filePath) => {
      logChange({ filePath }, 4, 'added')
    })
    .on('unlink', (filePath) => {
      logChange({ filePath }, 4, 'unlinked')
    })
    .on('unlinkDir', (filePath) => {
      logChange({ filePath }, 4, 'directory unlinked')
    })
    .on('ready', () => {
      logChange({ message: 'ready.' }, 3)
    })
    .on('raw', async(event, filePath, details) => {
      logChange({ filePath, message: { event, details } }, 5)
    })
    .on('error', async(e) => {
      logChange({ message: e }, 1)
    })

  return errors
}