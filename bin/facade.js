#!/usr/bin/env node

import esbuild from 'esbuild'
import {
  NodeModulesPolyfillPlugin,
} from '@esbuild-plugins/node-modules-polyfill'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import {
  LOG_LEVELS,
  VALID_BUILD_OPTIONS,
} from '../constants/index.js'

const CWD = process.cwd()

const options = yargs(hideBin(process.argv))
  .usage('Usage: $0 -i [input file] -o [output dir]')
  .command('build', 'Build')
  .options({
    e: {
      alias: 'entry',
      describe: 'Path to the input file',
      type: 'string',
      demandOption: true,
    },
    o: {
      alias: 'outdir',
      describe: 'Output directory path',
      type: 'string',
      default: 'build',
    },
    n: {
      alias: 'outfile',
      describe: 'Output file name',
      type: 'string',
      default: 'bundle',
    },
    b: {
      alias: 'bundle',
      describe: 'Enable bundling',
      boolean: true,
      default: true,
    },
    f: {
      alias: 'format',
      describe: 'Set the output format',
      type: 'string',
      choices: ['esm', 'iife', 'cjs'],
      default: 'esm',
    },
    d: {
      alias: 'dist',
      describe: 'Output bundles for distribution (minified and no splitting)',
      boolean: true,
      default: false,
    },
    splitting: {
      describe: 'Enable code splitting',
      boolean: true,
      default: false,
    },
    t: {
      alias: 'treeShaking',
      describe: 'Forcibly enable or disable tree shaking',
      boolean: true,
    },
    s: {
      alias: 'sourcemap',
      describe: 'Enable sourcemap',
      boolean: true,
      default: false,
    },
    m: {
      alias: 'minify',
      describe: 'Enable minification',
      boolean: true,
      default: false,
    },
    p: {
      alias: 'pretty',
      describe: 'Output pretty-printed alongside minified',
      boolean: true,
      default: false,
    },
    w: {
      alias: 'watch',
      describe: 'Watch for file changes',
      boolean: true,
      default: false,
    },
    alsoWatchDirs: {
      describe: 'Also watch these directories',
      type: 'array',
      default: [],
    },
    ignoreWatch: {
      describe: 'Do not watch these files/paths',
      type: 'array',
      default: [],
    },
    l: {
      alias: 'logLevel',
      describe: 'Set log level verbosity',
      type: 'string',
      choices: LOG_LEVELS,
      default: 'info',
    },
    plugins: {
      describe: 'Load extra plugins',
      type: 'array',
      choices: ['pug', 'stylus'],
      default: ['pug', 'stylus'],
    },
    followSymlinks: {
      describe: 'Also watch symlinked directories and files',
      boolean: true,
      default: false,
    },
    keepNames: {
      describe: `Don't let terser mangle function and class names`,
      boolean: true,
      default: true,
    },
  })
  .demandCommand(1)
  .argv

const ERRORS = new Proxy({}, {
  set: (target, key, error) => {
    if(LOG_LEVELS.indexOf(options.logLevel) >= 1) {
      console.error(`[${key}]: ${error}`)
    }
    return true
  }
})

setup({
  entryPoints: [options.entry],
  outdir: options.outdir,
  outfile: options.outfile,
  bundle: options.bundle,
  format: options.format,
  dist: options.dist,
  splitting: options.splitting,
  treeShaking: options.treeShaking,
  sourcemap: options.sourcemap,
  minify: options.minify,
  pretty: options.pretty,
  watch: options.watch,
  alsoWatchDirs: options.alsoWatchDirs,
  ignoreWatch: options.ignoreWatch,
  logLevel: options.logLevel,
  plugins: options.plugins,
  followSymlinks: options.followSymlinks,
  keepNames: options.keepNames,
  define: { global: 'window' },
})

export default async function setup(opts) {
  const plugins = [
    NodeModulesPolyfillPlugin(),
  ]

  for(const plugin of opts.plugins) {
    if(plugin === 'pug') {
      const { pugPlugin } = await import('../plugins/pug.js')
      plugins.push(pugPlugin())
    }

    if(plugin === 'stylus') {
      const { stylusPlugin } = await import('../plugins/stylus.js')
      plugins.push(stylusPlugin())
    }
  }

  const buildResult = await build(
    Object.assign(
      Object.keys(opts).reduce((acc, key) => {
        if(VALID_BUILD_OPTIONS.indexOf(key) !== -1) {
          acc[key] = opts[key]
        }
        return acc
      }, {}),
      {
        entryNames: opts.outfile,
        minify: opts.dist,
        splitting: opts.dist ? false : opts.splitting,
        ...typeof treeShaking !== 'undefined' && { treeShaking: opts.treeShaking },
        incremental: opts.watch,
        loader: { '.js': 'ts' },
        absWorkingDir: CWD,
        keepNames: opts.keepNames,
        format: opts.format,
        plugins,
      }
    )
  )

  if(opts.watch) {
    const { watcherModule } = await import('../modules/watcher.js')
    const watcherErrors = await watcherModule(buildResult, {
      ...opts,
      alsoWatchDirs: !ERRORS.alsoWatchDirs ? opts.alsoWatchDirs : [],
    })

    for(const [kind, error] of watcherErrors) {
      ERRORS[kind] = error
    }

  }
}

async function build(opts) {
  let buildResult

  try {
    buildResult = await esbuild.build(opts)
    console.info('Built', opts)
  } catch (e) {
    console.error(e)
  }

  return buildResult
}