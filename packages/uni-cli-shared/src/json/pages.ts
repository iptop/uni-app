import fs from 'fs'
import path from 'path'
import { extend, hasOwn, isArray, isPlainObject } from '@vue/shared'
import { once, TABBAR_HEIGHT } from '@dcloudio/uni-shared'
import { normalizePath } from '../utils'
import { parseJson } from './json'
import { initWebpackNVueEntry } from './app/pages'

export const parsePagesJson = (
  inputDir: string,
  platform: UniApp.PLATFORM,
  normalize: boolean = true
) => {
  const jsonStr = fs.readFileSync(path.join(inputDir, 'pages.json'), 'utf8')
  if (normalize) {
    return normalizePagesJson(jsonStr, platform)
  }
  return parseJson(jsonStr, true) as UniApp.PagesJson
}

export const parsePagesJsonOnce = once(parsePagesJson)

export function normalizePagesJson(jsonStr: string, platform: UniApp.PLATFORM) {
  let pagesJson: UniApp.PagesJson = {
    pages: [],
    globalStyle: {
      navigationBar: {},
    },
  }
  // preprocess
  try {
    pagesJson = parseJson(jsonStr, true)
  } catch (e) {
    console.error(`[vite] Error: pages.json parse failed.\n`, jsonStr, e)
  }
  // pages
  validatePages(pagesJson, jsonStr)
  // subpackages
  pagesJson.pages.push(
    ...normalizeSubpackages(pagesJson.subPackages || pagesJson.subpackages)
  )
  // pageStyle
  normalizePages(pagesJson.pages, platform)

  if (platform === 'app' && process.env.UNI_NVUE_COMPILER !== 'vue') {
    initWebpackNVueEntry(pagesJson.pages)
  }

  // globalStyle
  pagesJson.globalStyle = normalizePageStyle(
    null,
    pagesJson.globalStyle!,
    platform
  )
  // tabBar
  if (pagesJson.tabBar) {
    const tabBar = normalizeTabBar(pagesJson.tabBar!)
    if (tabBar) {
      pagesJson.tabBar = tabBar
    } else {
      delete pagesJson.tabBar
    }
  }
  return pagesJson
}

function validatePages(pagesJson: Record<string, any>, jsonStr: string) {
  if (!Array.isArray(pagesJson.pages)) {
    pagesJson.pages = []
    throw new Error(`[uni-app] Error: pages.json->pages parse failed.`)
  } else if (!pagesJson.pages.length) {
    throw new Error(
      `[uni-app] Error: pages.json->pages must contain at least 1 page.`
    )
  }
}

function normalizePages(
  pages: UniApp.PagesJsonPageOptions[],
  platform: UniApp.PLATFORM
) {
  return pages.filter((page) => {
    page.style = normalizePageStyle(page.path, page.style!, platform)
    return true
  })
}

function normalizeSubpackages(
  subpackages?: UniApp.PagesJsonSubpackagesOptions[]
) {
  const pages: UniApp.PagesJsonPageOptions[] = []
  if (Array.isArray(subpackages)) {
    subpackages.forEach(({ root, pages: subPages }) => {
      if (root && subPages.length) {
        subPages.forEach((subPage) => {
          subPage.path = normalizePath(path.join(root, subPage.path))
          subPage.style = normalizeSubpackageSubNVues(root, subPage.style)
          pages.push(subPage)
        })
      }
    })
  }
  return pages
}

function normalizeSubpackageSubNVues(
  root: string,
  style: UniApp.PagesJsonPageStyle
) {
  const platformStyle = style['app'] || style['app-plus']
  if (!platformStyle) {
    return style
  }
  if (Array.isArray(platformStyle.subNVues)) {
    platformStyle.subNVues.forEach((subNVue) => {
      if (subNVue.path) {
        subNVue.path = normalizePath(path.join(root, subNVue.path))
      }
    })
  }
  return style
}

function normalizePageStyle(
  pagePath: string | null,
  pageStyle: UniApp.PagesJsonPageStyle | undefined,
  platform: UniApp.PLATFORM
) {
  const isNVue =
    pagePath &&
    process.env.UNI_INPUT_DIR &&
    process.env.UNI_NVUE_COMPILER !== 'vue' &&
    fs.existsSync(path.join(process.env.UNI_INPUT_DIR, pagePath + '.nvue'))
      ? true
      : undefined

  if (pageStyle) {
    if (platform === 'h5') {
      extend(pageStyle, pageStyle['app'] || pageStyle['app-plus'])
    }
    if (platform === 'app') {
      extend(pageStyle, pageStyle['app'] || pageStyle['app-plus'])
    } else {
      extend(pageStyle, pageStyle[platform])
    }
    if (['h5', 'app'].includes(platform)) {
      pageStyle.navigationBar = normalizeNavigationBar(pageStyle)
      if (isEnablePullDownRefresh(pageStyle)) {
        pageStyle.enablePullDownRefresh = true
        pageStyle.pullToRefresh = normalizePullToRefresh(pageStyle)
      }
    }
    pageStyle.isNVue = isNVue
    return removePlatformStyle(pageStyle)
  }
  return { navigationBar: {}, isNVue }
}

const navigationBarMaps = {
  navigationBarBackgroundColor: 'backgroundColor',
  navigationBarTextStyle: 'textStyle',
  navigationBarTitleText: 'titleText',
  navigationStyle: 'style',
  titleImage: 'titleImage',
  titlePenetrate: 'titlePenetrate',
}

function normalizeNavigationBar(
  pageStyle: Record<string, any>
): UniApp.PageNavigationBar {
  const navigationBar = Object.create(null) as UniApp.PageNavigationBar

  Object.keys(navigationBarMaps).forEach((name) => {
    if (hasOwn(pageStyle, name)) {
      navigationBar[navigationBarMaps[name] as keyof UniApp.PageNavigationBar] =
        pageStyle[name]
      delete pageStyle[name]
    }
  })

  const { titleNView } = pageStyle
  if (isPlainObject(titleNView)) {
    extend(navigationBar, titleNView)
    delete pageStyle.titleNView
  } else if (titleNView === false) {
    navigationBar.style = 'custom'
  }

  if (hasOwn(navigationBar, 'transparentTitle')) {
    const transparentTitle = (navigationBar as any).transparentTitle as
      | 'none'
      | 'auto'
      | 'always'
    if (transparentTitle === 'always') {
      navigationBar.style = 'custom'
      navigationBar.type = 'float'
    } else if (transparentTitle === 'auto') {
      navigationBar.type = 'transparent'
    } else {
      navigationBar.type = 'default'
    }
    delete (navigationBar as any).transparentTitle
  }

  if (navigationBar.titleImage && navigationBar.titleText) {
    delete navigationBar.titleText
  }

  if (!navigationBar.titleColor && hasOwn(navigationBar, 'textStyle')) {
    navigationBar.titleColor =
      (navigationBar as any).textStyle === 'black' ? '#000000' : '#ffffff'
    delete (navigationBar as any).textStyle
  }

  if (
    pageStyle.navigationBarShadow &&
    pageStyle.navigationBarShadow.colorType
  ) {
    navigationBar.shadowColorType = pageStyle.navigationBarShadow.colorType
    delete pageStyle.navigationBarShadow
  }

  if (isArray(navigationBar.buttons)) {
    navigationBar.buttons = navigationBar.buttons.map((btn) =>
      normalizeNavigationBarButton(
        btn,
        navigationBar.type,
        navigationBar.titleColor!
      )
    )
  }
  if (isPlainObject(navigationBar.searchInput)) {
    navigationBar.searchInput = normalizeNavigationBarSearchInput(
      navigationBar.searchInput
    )
  }
  if (navigationBar.type === 'transparent') {
    navigationBar.coverage = navigationBar.coverage || '132px'
  }
  return navigationBar
}

function normalizeNavigationBarButton(
  btn: UniApp.PageNavigationBarButton,
  type: UniApp.PageNavigationBar['type'],
  titleColor: UniApp.PageNavigationBar['titleColor']
) {
  btn.color = type === 'transparent' ? '#ffffff' : btn.color || titleColor!
  if (!btn.fontSize) {
    btn.fontSize =
      type === 'transparent' || (btn.text && /\\u/.test(btn.text))
        ? '22px'
        : '27px'
  } else if (/\d$/.test(btn.fontSize)) {
    btn.fontSize += 'px'
  }
  btn.text = btn.text || ''
  return btn
}

function normalizeNavigationBarSearchInput(
  searchInput: UniApp.PageNavigationBarSearchInput
) {
  return extend(
    {
      autoFocus: false,
      align: 'center',
      color: '#000',
      backgroundColor: 'rgba(255,255,255,0.5)',
      borderRadius: '0px',
      placeholder: '',
      placeholderColor: '#CCCCCC',
      disabled: false,
    },
    searchInput
  )
}

const DEFAULT_TAB_BAR: Partial<UniApp.TabBarOptions> = {
  position: 'bottom',
  color: '#999',
  selectedColor: '#007aff',
  borderStyle: 'black',
  blurEffect: 'none',
  fontSize: '10px',
  iconWidth: '24px',
  spacing: '3px',
  height: TABBAR_HEIGHT + 'px',
}

function normalizeTabBar(tabBar: UniApp.TabBarOptions) {
  const { list, midButton } = tabBar
  if (!list || !list.length) {
    return
  }
  tabBar = extend({}, DEFAULT_TAB_BAR, tabBar)
  const len = list.length
  if (len % 2 === 0 && isPlainObject(midButton)) {
    list.splice(
      Math.floor(len / 2),
      0,
      extend(
        {
          type: 'midButton',
          width: '50px',
          height: '50px',
          iconWidth: '24px',
        },
        midButton
      )
    )
  } else {
    delete tabBar.midButton
  }
  list.forEach((item) => {
    if (item.iconPath) {
      item.iconPath = normalizeFilepath(item.iconPath)
    }
    if (item.selectedIconPath) {
      item.selectedIconPath = normalizeFilepath(item.selectedIconPath)
    }
    if (item.type === 'midButton' && item.backgroundImage) {
      item.backgroundImage = normalizeFilepath(item.backgroundImage)
    }
  })
  tabBar.selectedIndex = 0
  tabBar.shown = true
  return tabBar
}
const SCHEME_RE = /^([a-z-]+:)?\/\//i
const DATA_RE = /^data:.*,.*/
function normalizeFilepath(filepath: string) {
  if (
    !(SCHEME_RE.test(filepath) || DATA_RE.test(filepath)) &&
    filepath.indexOf('/') !== 0
  ) {
    return '/' + filepath
  }
  return filepath
}

const platforms = ['h5', 'app', 'mp-', 'quickapp']

function removePlatformStyle(pageStyle: UniApp.PagesJsonPageStyle) {
  Object.keys(pageStyle).forEach((name) => {
    if (platforms.find((prefix) => name.startsWith(prefix))) {
      delete pageStyle[name as UniApp.PLATFORM]
    }
  })
  return pageStyle
}

export function normalizePagesRoute(
  pagesJson: UniApp.PagesJson
): UniApp.UniRoute[] {
  const firstPagePath = pagesJson.pages[0].path
  const tabBarList = (pagesJson.tabBar && pagesJson.tabBar.list) || []
  return pagesJson.pages.map((pageOptions) => {
    const pagePath = pageOptions.path
    const isEntry = firstPagePath === pagePath ? true : undefined
    const tabBarIndex = tabBarList.findIndex(
      (tabBarPage: { pagePath: string }) => tabBarPage.pagePath === pagePath
    )
    const isTabBar = tabBarIndex !== -1 ? true : undefined
    let windowTop = 0
    const meta = extend(
      {
        isQuit: isEntry || isTabBar ? true : undefined,
        isEntry: isEntry || undefined,
        isTabBar: isTabBar || undefined,
        tabBarIndex: isTabBar ? tabBarIndex : undefined,
        windowTop: windowTop || undefined,
      },
      pageOptions.style
    ) as UniApp.PageRouteMeta
    return {
      path: pageOptions.path,
      meta,
    }
  })
}

function isEnablePullDownRefresh(pageStyle: Record<string, any>) {
  return pageStyle.enablePullDownRefresh || pageStyle.pullToRefresh?.support
}

function normalizePullToRefresh(
  pageStyle: Record<string, any>
): UniApp.PageRefreshOptions | undefined {
  return pageStyle.pullToRefresh
}
