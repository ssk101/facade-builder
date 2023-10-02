import fs from 'fs'
import { SourceMapGenerator } from 'source-map'
import flat from 'flat'
import lex from 'pug-lexer'
import parse from 'pug-parser'

const { unflatten } = flat

function keyPairs(object) {
  if(typeof object !== 'object') {
    return object
  }
  return Object.keys(object)
    .map(attr => {
      const key = JSON.stringify(attr)
      if(typeof object[attr] === 'object') {
        return `${key}: ${objectString(object[attr])}`
      }
      return `${key}: ${object[attr]}`
    })
}

function objectString(object) {
  if(Array.isArray(object)) {
    if(object.length === 1) {
      return keyPairs(object[0])
    }
    return `[${object.map(keyPairs)}]`
  }
  return `{${keyPairs(object)}}`
}

class Compiler {
  compile(tree, opts) {
    this.compileSource(tree, opts)
    const [ code, ast, map ] = [this.code, null, this.map.toJSON()]

    return Object.assign(this, {
      code,
      ast,
      map,
    })
  }

  compileSource(ast, options = {}) {
    this.level = 0
    this.line = 1
    this.options = options
    this.file = options.file || 'template.pug'
    this.ast = ast
    this.map = new SourceMapGenerator({ file: this.file })
    this.code = ''
    this.uid = 0
    this.map.setSourceContent(this.file, options.src)
    return this
      .buffer('function template(__INIT__) {')
      .indent()
      .buffer('let __RESULT__ = $$.init(this, __INIT__)')
      .visit(ast, '__RESULT__')
      .buffer('return $$.end(__RESULT__)')
      .undent()
      .buffer('}')
  }

  indent() {
    return this.level += 1, this
  }

  undent() {
    return this.level -= 1, this
  }

  buffer(code, newline = true) {
    const indent = '  '.repeat(this.level)
    const codeline = `${indent}${code}${newline ? '\n' : ''}`

    if(this.node) {
      this.map.addMapping({
        name: this.node.name,
        source: this.file,
        original: {
          line: this.node.line,
          column: 0,
        },
        generated: {
          line: this.line,
          column: 0,
        },
      })
    }

    this.line += codeline.match(/\n/g).length
    this.code += codeline
    return this
  }

  visit(node, context) {
    const type = 'visit' + node.type

    this.node = node
    this.node.context = context
    if(this[type]) {
      this[type](node, context)
    } else {
      throw new Error(`${node.type} not implemented!`)
    }
    return this
  }

  visitTag(tag, context) {
    const node = `e$${this.uid++}`
    const name = JSON.stringify(tag.name)

    this.buffer(`let ${node} = $$.create(${name})`)

    this.visitAttributes(tag, node)

    if(tag.block) this.visit(tag.block, node)

    const element = `$$.element(${node})`

    return this.buffer(`$$.child(${context}, ${element})`)
  }

  visitBlock(block, context) {
    for(const node of block.nodes) {
      this.visit(node, context)
    }
  }

  visitComment(comment) {
    this.buffer('// ' + comment.val)
  }

  visitBlockComment(comment) {
    this.buffer('/*' + comment.val + '*/')
  }

  visitEach(each, context) {
    const object = each.obj
    const args = [each.val, each.key].filter(k => { return k })

    this.buffer(`$$.each(${object}, (${args}) => {`).indent()
    this.visit(each.block, context)
    this.undent().buffer('})')

    return this
  }

  visitText(text, context) {
    this.visitCode({
      val: `\`${text.val}\``,
      buffer: true,
    }, context)
  }

  visitCode(code, context) {
    if(code.buffer) {
      if(code.mustEscape === false) {
        this.buffer(`$$.child(${context}, $$.text(${code.val}, true))`)
      } else {
        this.buffer(`$$.child(${context}, $$.text(${code.val}))`)
      }
    } else {
      this.buffer(code.val)
    }
  }

  visitConditional(code, context) {
    this.buffer(`if(${code.test}) {`).indent()
    this.visit(code.consequent, context)
    this.undent().buffer('}')
    if(code.alternate) {
      this.buffer(' else {')
        .indent()
        .visit(code.alternate, context)
        .undent()
        .buffer('}')
    }
    return this
  }

  visitMixin(mixin, context) {
    var node = `e$${this.uid++}`

    this.buffer(`let ${node} = $$.create(${mixin.name})`)

    const ATTRIBUTES = {}

    var attributes = ''

    if(mixin.attrs.length) {
      for(let {name, val} of mixin.attrs) {
        ATTRIBUTES[name] = val
      }
      attributes = objectString(ATTRIBUTES)
    }

    if(mixin.args) {
      attributes += (attributes ? ',' : '' ) + mixin.args
    }

    if(mixin.block) this.visit(mixin.block, node)

    if(attributes) {
      return this.buffer(`$$.mixin(${context}, ${node}, ${attributes})`)
    } else {
      return this.buffer(`$$.mixin(${context}, ${node})`)
    }
  }

  visitAttributes(tag, context) {
    const { attrs, attributeBlocks } = tag
    const EVENTS = []
    const ATTRIBUTES = {}
    const PROPERTIES = {}

    for(const { name, val } of attrs) {
      switch(name[0]) {
      case '(':
        EVENTS.push(`[${JSON.stringify(name.slice(1, -1))}, e => ${val}]`)
        break
      case '[':
        PROPERTIES[name.slice(1, -1)] = val
        break
      default:
        if(!ATTRIBUTES[name]) ATTRIBUTES[name] = []
        ATTRIBUTES[name].push(val)
        break
      }
    }

    if(Object.keys(ATTRIBUTES).length) {
      const attributes = objectString(ATTRIBUTES)

      if(attributeBlocks.length) {
        const blocks = attributeBlocks.map(block => { return block.val })
        this.buffer(`$$.attrs(${context}, Object.assign(${attributes}, ${blocks}))`)
      } else {
        this.buffer(`$$.attrs(${context}, ${attributes})`)
      }
    } else if(attributeBlocks.length) {
      const blocks = attributeBlocks.map(block => { return block.val })
      this.buffer(`$$.attrs(${context}, Object.assign({}, ${blocks}))`)
    }

    if(Object.keys(PROPERTIES).length) {
      const properties = objectString(unflatten(PROPERTIES))
      this.buffer(`$$.props(${context}, ${properties})`)
    }

    if(EVENTS.length) {
      this.buffer(`$$.events(${context}, this, [${EVENTS}])`)
    }
  }
}

export function pugPlugin() {
  return {
    name: 'pug',
    setup(build) {
      async function onLoad(template) {
        const filename = template.path
        const src = fs.readFileSync(filename, { encoding: 'utf-8' })

        function compile(ast, options) {
          return new Compiler().compile(ast, options)
        }

        function pug(src, opts) {
          const lexerOpts = {
            plugins: [],
          }

          return compile(
            parse(
              lex(src, lexerOpts),
              opts = Object.assign({ src }, opts),
            ), opts
          )
        }

        const contents = []
        const header = `import { VdomRuntime as $$ } from '@steelskysoftware/facade-builder'`
        const tpl = pug(src, { filename })
        const footer = 'export default template'
        const module = [header, tpl.code, footer].join('\n')
        contents.push(Buffer.from(module))
        const content = Buffer.concat(contents).toString()

        return {
          contents: content,
          loader: 'js',
        }
      }

      build.onLoad({ filter: /\.pug$/ }, onLoad)
    },
  }
}
