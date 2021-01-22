import { CompilerOptions } from '@vue/compiler-sfc'

import {
  COMPONENT_PREFIX,
  isBuiltInComponent,
  isNativeTag,
} from '@dcloudio/uni-shared'

import { transformBuiltInComponent } from './transforms/transformBuiltInComponent'
import { transformBuiltInEasycom } from './transforms/transformBuiltInEasycom'
import { transformEasycom } from './transforms/transformEasycom'
import { isEasycomTag } from './easycom'

interface CodegenContext {
  push: (code: string, node: any) => void
  helper: (key: symbol) => string
}
interface VueCompilerOptions extends CompilerOptions {
  onContextCreated: (context: CodegenContext) => void
}

function isAutoImported(tag: string) {
  return (
    isEasycomTag(tag) || isBuiltInComponent(tag.replace(COMPONENT_PREFIX, ''))
  )
}

const resolveComponentRE = /_resolveComponent\("(.*)"\)/
export const vueCompilerOptions: VueCompilerOptions = {
  onContextCreated(context) {
    const oldPush = context.push
    context.push = (code, node) => {
      const matches = code.match(resolveComponentRE)
      // ignore auto imported component
      if (matches && matches.length === 2 && isAutoImported(matches[1])) {
        code = `// ${code}`
      }
      return oldPush(code, node)
    }
  },
  isNativeTag,
  nodeTransforms: [
    transformBuiltInComponent,
    transformBuiltInEasycom,
    transformEasycom,
  ],
}