import { h } from 'virtual-dom'
import { PugRuntime } from './pug.js'

class EventHook {
  constructor(events) {
    this.events = events
  }

  hook(node, prop, self) {
    const previous = self ? self.events : []
    for(var [event, callback] of previous) {
      node.removeEventListener(event, callback)
    }
    for(var [event, callback] of this.events) {
      node.addEventListener(event, callback)
    }
  }

  unhook(node) {
    for(const [event, callback] of this.events) {
      node.removeEventListener(event, callback)
    }
  }
}

class FunctionHook {
  constructor(subscribe) {
    this.subscribe = subscribe
  }

  hook(node, propertyName, previousValue) {
    if(this.subscribe) {
      this.unsubscribe = this.subscribe(node, propertyName, previousValue)
    }
  }

  unhook() {
    if(typeof this.unsubscribe === 'function') {
      this.unsubscribe()
      delete this.unsubscribe
    }
  }
}

class PropertyHook {
  constructor(value) {
    this.value = value
  }

  hook(node, property, self) {
    const previous = self && self.value
    if(!previous && this.value !== undefined || node[property] !== this.value) {
      node[property] = this.value
    }
  }
}

class HandleHook {
  constructor(context, names) {
    this.context = context
    this.names = names
  }

  hook(node, prop, previous) {
    for(const name of this.names) {
      this.context[name] = node
    }
  }

  unhook() {
    for(const name of this.names) {
      this.context[name] = null
    }
  }
}

class HTMLWidget {
  constructor(value) {
    this.value = value
  }

  update(prev) {
    if(!prev || prev.value === this.value) return

    const next = this.init(prev)

    if(!prev.nodes) return next

    prev.nodes[0].replaceWith(next)
    this.removeNodes(prev.nodes)

    return next
  }

  destroy() {
    this.removeNodes(this.nodes)
  }

  removeNodes(nodes) {
    if(!nodes) return

    const unhook = this.value && this.value.unhook

    for(const node of nodes) {
      if(unhook) this.value.unhook(node)
      node.remove()
    }
  }

  init(prev) {
    const el = document.createElement('template')
    el.innerHTML = this.value + ''

    this.nodes = Array.from(el.content.childNodes)

    if(this.value && this.value.hook) {
      for(const node of this.nodes) {
        this.value.hook(node, 'innerHTML', prev && prev.value)
      }
    }

    return el.content
  }

  get type() {
    return 'Widget'
  }
}

class VDomRuntime extends PugRuntime {
  constructor(h) {
    super()
    this.h = h
  }

  element(properties) {
    const tagName = properties.tagName
    const children = properties.children
    delete properties.tagName
    delete properties.children
    return this.h(tagName, properties, children)
  }

  hooks(context, value) {
    for(var [key, value] of Object.entries(value)) {
      if(typeof value === 'function') {
        context[key] = new FunctionHook(value)
      } else {
        context[key] = value
      }
    }
  }

  events(value, context, events) {
    return value.events = new EventHook(events, context)
  }

  handles(value, context, name) {
    value.handle = new HandleHook(context, name)
  }

  text(text, unescape) {
    if(text && unescape) {
      return new HTMLWidget(text)
    }
    if(text && text.type === 'VirtualNode') {
      return text
    }
    return super.text(text)
  }

  attrs(context, value) {
    if(typeof value.style === 'object') {
      context.style = value.style
      delete value.style
    }

    context.attributes || (context.attributes = {})

    if(value.class) {
      value.class = this.attr(value.class)
    }
    for(const attr in value) {
      if(value[attr] === false || value[attr] == null) continue
      if(value[attr].hook) context[attr] = value[attr]

      context.attributes[attr] = value[attr] + ''
    }
  }

  props(context, value) {
    for(const key of Object.keys(value)) {
      switch(key) {
      case 'class':
        var className = this.attr(value[key])
        if(!className) continue
        if(context.attributes && context.attributes.class) {
          className = context.attributes.class + ' ' + className
          delete context.attributes.class
        }
        if(context.className) {
          className += ' ' + context.className
        }
        context.className = className
        break
      case 'style':
        context[key] = value[key]
        break
      default:
        context[key] = new PropertyHook(value[key])
      }
    }
  }
}

export default new VDomRuntime(h)
