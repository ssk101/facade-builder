import fs from 'fs'
import chokidar from 'chokidar'
import path from 'path'
import { LOG_LEVELS } from '../constants/index.js'

const CWD = process.cwd()

export async function watcherModule(buildResult, configuration) {
  function logFileChange({ filePath, message }, level = 3, kind) {
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
      const dirPath = path.join(CWD, dir)

      try {
        const exists = fs.lstatSync(dirPath)

        if(exists) {
          for(const file of fs.readdirSync(dirPath)) {
            const filePath = path.join(dirPath, file)
            logFileChange({ message: filePath }, 3, 'manually added')
            watcher.add(filePath)
          }
        }
      } catch (e) {
        errors.set('alsoWatchDirs', `path does not exist, skipping`)
      }
    }
  }

  watcher
    .on('change', async(filePath) => {
      logFileChange({ filePath }, 3, 'changed')

      if(buildResult?.rebuild) {
        await buildResult.rebuild()
        logFileChange({ message: 'rebuilt' }, 3)
      }
    })
    .on('add', async(filePath) => {
      logFileChange({ filePath }, 4, 'added')
    })
    .on('unlink', (filePath) => {
      logFileChange({ filePath }, 4, 'unlinked')
    })
    .on('unlinkDir', (filePath) => {
      logFileChange({ filePath }, 4, 'directory unlinked')
    })
    .on('ready', () => {
      logFileChange({ message: 'ready' }, 3)
    })
    .on('raw', async(event, filePath, details) => {
      logFileChange({ filePath, message: { event, details } }, 5)
    })
    .on('error', async(e) => {
      logFileChange({ message: e }, 1)
    })

  return errors
}