import fs from 'fs'
import stylus from 'stylus'

export function stylusPlugin() {
  return {
    name: 'stylus',
    setup(build) {
      async function onLoad(template) {
        const src = fs.readFileSync(template.path, { encoding: 'utf-8' })
        try {
          const compiled = await stylus.render(src)
          return {
            contents: 'export default \`' + compiled + '\`',
            loader: 'js',
          }
        } catch (e) {
          console.error(e)
          return {
            contents: 'export default () => {}',
            loader: 'js',
          }
        }

      }

      build.onLoad({ filter: /\.styl$/ }, onLoad)
    },
  }
}