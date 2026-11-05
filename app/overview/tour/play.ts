import { COPIED, DONE, INVITATION_SENT, JUST_NOW, NEXT, TOUR_NOTES, TOUR_STEPS } from './copy'

/**
 * What the tour does on its pages (Exponential launch, ticket 27), following
 * `.lavish/onboarding/demo.mjs`: a cursor moves and clicks, the camera glides to what it
 * clicked, and each page plays its scene and then its one note.
 *
 * Everything here acts on a copy of the server's markup and nothing goes to the server, so
 * it cannot touch a church's data. The only thing that leaves is pressing Done, which is
 * an ordinary form in the page.
 */

const PHONE_WIDTH = 760
/** The width the pages are captured and laid out at, before the camera scales them. */
const PAGE_WIDTH = 1280

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

const need = <T extends Element>(found: T | null | undefined, what: string): T => {
  if (!found) throw new Error(`The tour's pages have no ${what}. Run npm run tour:capture and look again.`)
  return found
}

export const startTour = (root: HTMLElement): (() => void) => {
  const $ = <T extends Element = HTMLElement>(query: string, within: ParentNode = root) =>
    within.querySelector<T>(query)
  const all = <T extends Element = HTMLElement>(query: string, within: ParentNode = root) => [
    ...within.querySelectorAll<T>(query),
  ]
  const one = <T extends Element = HTMLElement>(query: string, within: ParentNode = root) =>
    need($<T>(query, within), query)

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const isPhone = () => innerWidth < PHONE_WIDTH

  const viewport = one('.tour-viewport')
  const camera = one('.tour-camera')
  const cursor = one('.tour-cursor')
  const bar = one('.tour-bar')
  const caption = one('.tour-caption')
  const captionBody = one('.tour-caption-body')
  const title = one('.tour-caption h2')
  const text = one('.tour-caption p')
  const dots = all('.tour-dots span')
  const count = one('.tour-count')
  const countNow = one('.tour-count-now')
  const back = one<HTMLButtonElement>('.tour-arrow.back')
  const forward = one<HTMLButtonElement>('.tour-arrow.fwd')
  const forwardWord = one('.tour-arrow.fwd .word')
  const phone = one('.tour-phone')
  const pair = one('#tour-pair')
  const doneForm = one<HTMLFormElement>('.tour-done')

  // Each scene starts from a clean copy of what it changes, so Back and Next can start any
  // of them, and a stale one is stopped where it stands.
  let run = 0
  let at = 0
  let shot = { ty: 0, s: 1, H: 0, room: 0 }

  const wait = (ms: number) => {
    const mine = run
    return new Promise<void>((ok, stale) =>
      setTimeout(() => (mine === run ? ok() : stale(new Error('stale'))), still ? 0 : ms),
    )
  }

  /** Where an element sits on the page, untouched by the camera. Measured and divided back out. */
  const place = (element: HTMLElement): Box => {
    const box = element.getBoundingClientRect()
    const page = camera.getBoundingClientRect()
    const scale = page.width / camera.offsetWidth
    return {
      x: (box.left - page.left) / scale,
      y: (box.top - page.top) / scale,
      w: element.offsetWidth,
      h: element.offsetHeight,
    }
  }

  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

  /**
   * Glides to an element or a box on the page. The room it frames is measured from the
   * bar's real height and the caption's, so nothing ends up under either.
   */
  const look = (target: HTMLElement | Box, zoom = 1.3, aside = 0, whole = false) => {
    const box = target instanceof HTMLElement ? place(target) : target
    const W = viewport.clientWidth
    const H = viewport.clientHeight
    const phoneNow = isPhone()
    const T = bar.offsetHeight + (phoneNow ? 14 : 24)
    const G = phoneNow ? 0 : 92
    const room = Math.max(200, H - caption.offsetHeight - (phoneNow ? 30 : 40))

    let s: number
    let tx: number
    let ty: number
    if (phoneNow) {
      // The app's own phone layout at full size, and the camera only glides up and down.
      s = 1
      tx = 0
      ty = clamp(
        box.h > room - T ? T - box.y : (T + room) / 2 - (box.y + box.h / 2),
        Math.min(T, H - camera.offsetHeight),
        T,
      )
    } else {
      const fit = (W - 2 * G) / PAGE_WIDTH
      const roomW = W - aside - G
      s = whole
        ? Math.min(fit * 0.88, (room - T) / box.h)
        : Math.max(aside ? 0 : fit, Math.min((roomW - G - 60) / box.w, (room - T) / box.h, fit * zoom))
      tx = whole
        ? W / 2 - (box.x + box.w / 2) * s
        : aside
          ? G + (roomW - G) / 2 - (box.x + box.w / 2) * s
          : clamp(W / 2 - (box.x + box.w / 2) * s, Math.min(G, W - G - PAGE_WIDTH * s), G)
      ty = whole
        ? // Never down past the top of the page, which would leave bare paper under the bar.
          Math.min(T, (T + room) / 2 - (box.y + box.h / 2) * s)
        : clamp((T + room) / 2 - (box.y + box.h / 2) * s, Math.min(T, H - 24 - camera.offsetHeight * s), T)
    }
    camera.style.transform = `translate(${tx}px,${ty}px) scale(${s})`
    shot = { ty, s, H, room }
    return wait(900)
  }

  /** The pop-up opens over whatever the camera shows, the way a real one opens over the screen. */
  const openOver = (background: HTMLElement) => {
    const { ty, s, H, room } = shot
    background.style.top = `${-ty / s}px`
    background.style.height = `${H / s}px`
    background.style.paddingBottom = `${(H - room) / s}px`
    background.classList.add('open')
  }

  const point = (element: HTMLElement, fx = 0.5, fy = 0.55) => {
    const box = place(element)
    cursor.style.transform = `translate(${box.x + box.w * fx}px,${box.y + box.h * fy}px)`
    return wait(650)
  }

  const click = async () => {
    cursor.classList.add('down')
    const ring = document.createElement('span')
    ring.className = 'tour-ripple'
    cursor.append(ring)
    setTimeout(() => ring.remove(), 600)
    await wait(140)
    cursor.classList.remove('down')
    await wait(185)
  }

  const tabs = all('nav .tab')
  const tab = (label: string) =>
    need(
      tabs.find((candidate) => candidate.textContent?.trim().startsWith(label)),
      `${label} tab`,
    )
  const paneOf = (name: string) => one(`[data-pane="${name}"]`)
  const panes = all('.tour-pane')

  const markTab = (label: string | null) => {
    for (const each of tabs) each.removeAttribute('aria-current')
    if (label) tab(label).setAttribute('aria-current', 'page')
  }

  const show = async (name: string, label: string | null) => {
    const now = panes.find((candidate) => !candidate.hidden)
    const next = paneOf(name)
    if (now && now !== next) {
      now.classList.add('fading')
      await wait(180)
      now.hidden = true
      now.classList.remove('fading')
    }
    next.classList.add('fading')
    next.hidden = false
    void next.offsetWidth
    next.classList.remove('fading')
    markTab(label)
    await wait(200)
  }

  const removeNotes = () => {
    for (const note of all('.tour-note')) note.remove()
  }

  /** One explanation at a time, beside what it explains. The step's last stays until moving on. */
  const note = async (
    element: HTMLElement,
    words: string,
    side: 'below' | 'above' = 'below',
    fx = 0.5,
    read = 1700,
  ) => {
    for (const old of all('.tour-note')) {
      old.classList.remove('on')
      setTimeout(() => old.remove(), 400)
    }
    const box = place(element)
    const half = 145
    const x = box.x + box.w * fx
    const left = Math.min(camera.offsetWidth - half - 8, Math.max(half + 8, x))
    const added = document.createElement('div')
    added.className = `tour-note ${side}`
    added.textContent = words
    added.style.left = `${left}px`
    added.style.top = `${side === 'below' ? box.y + box.h + 12 : box.y - 12}px`
    added.style.setProperty('--ax', `calc(50% + ${x - left}px)`)
    camera.append(added)
    // A note the caption would hide goes above what it points at instead (phones, mostly).
    if (side === 'below' && added.getBoundingClientRect().bottom > caption.getBoundingClientRect().top - 8) {
      added.className = 'tour-note above'
      added.style.top = `${box.y - 12}px`
    }
    void added.offsetWidth
    added.classList.add('on')
    await wait(read)
  }

  const countUp = async (element: HTMLElement, to: number, suffix = '') => {
    const frames = 22
    for (let frame = 1; frame <= frames; frame++) {
      element.textContent = `${Math.round((to * frame) / frames)}${suffix}`
      await wait(32)
    }
  }

  const bump = (element: HTMLElement, value: string) => {
    element.textContent = value
    element.classList.remove('tour-bump')
    void element.offsetWidth
    element.classList.add('tour-bump')
  }

  const numberIn = (element: HTMLElement) => Number.parseInt(element.textContent ?? '', 10)

  // What the scenes act on.
  const rosterRow = (name: string) =>
    need(
      all<HTMLTableRowElement>('[data-pane="roster"] tr').find(
        (row) => $('[data-testid="roster-name"]', row)?.textContent?.trim() === name,
      ),
      `Roster row for ${name}`,
    )
  const grace: HTMLElement = rosterRow('Grace Lee')
  const graceName = one('[data-testid="roster-name"]', grace)
  const graceCell = one('.paired-with', grace)
  const graceWas = graceCell.innerHTML
  const emilyCell = one('.paired-with', rosterRow('Emily Davis'))
  const emilyWas = emilyCell.innerHTML
  const pairedWith = (name: string) =>
    `<ul class="bare"><li><span class="nowrap">${name} <span class="size">1:1</span></span><span class="pill tour-sent">${INVITATION_SENT}</span></li></ul><a class="btn small sec" href="#">Pair</a>`

  const tableWrap = one('[data-pane="roster"] .tbl-wrap')
  const pairedLeft = () => (need(graceCell.closest('td'), 'Paired with cell') as HTMLElement).offsetLeft - 12
  const [, pairedCount, unpairedCount] = all('[data-pane="roster"] .stats-line b')
  const pairedWere = numberIn(need(pairedCount, 'paired count'))
  const unpairedWere = numberIn(need(unpairedCount, 'unpaired count'))

  const checkIns = paneOf('checkins')
  const checkInValues = all('.ci-stat-val', checkIns)
  const answeredCount = need(checkInValues[0], 'answered count')
  const pendingCount = need(checkInValues[1], 'pending count')
  const answeredWere = numberIn(answeredCount)
  const pendingWere = numberIn(pendingCount)
  const outstandingCount = one('.ci-col-head.a span:last-child', checkIns)
  const outstandingWere = numberIn(outstandingCount)
  const outstandingList = one('.ci-list', checkIns)
  const newCard = (arriving: boolean) =>
    `<li class="ci-card${arriving ? ' tour-arrive' : ''}" id="tour-new-check-in"><div>Mark Wilson → Jordan Ellis</div><div class="ci-when">${JUST_NOW}</div></li>`

  const stats = all('[data-pane="overview"] .stat-value')
  const statsWere = stats.map((stat) => stat.textContent ?? '')

  const copyButton = need(
    all('[data-pane="intake"] button').find((button) => button.textContent?.trim().startsWith('Copy')),
    'Copy link button',
  )
  const copyWas = copyButton.textContent ?? ''

  const [helpMenu, accountMenu] = all<HTMLDetailsElement>('header details.top-menu') as [
    HTMLDetailsElement,
    HTMLDetailsElement,
  ]
  const settings = one('header a[aria-label="Settings"]')
  const panelOf = (menu: HTMLDetailsElement) => one('.top-menu-panel', menu)
  // The two share a `name` on the real pages, so only one is open at a time. Each is
  // opened by a scene as well, in turn, so that stays as the real menus behave.
  const menusBox = (): Box => {
    const top = place(one('header')).y
    let bottom = 0
    for (const menu of [helpMenu, accountMenu]) {
      menu.open = true
      const panel = place(panelOf(menu))
      bottom = Math.max(bottom, panel.y + panel.h)
      menu.open = false
    }
    return { x: 0, y: top - 16, w: PAGE_WIDTH, h: bottom - top + 110 }
  }
  /** The Roster from its top where her row still clears the caption, and her row itself where not. */
  const lookAtGrace = async (zoom: number) => {
    if (!isPhone()) await look(rosterTop(), zoom)
    const clear = grace.getBoundingClientRect().bottom < caption.getBoundingClientRect().top - 110
    if (isPhone() || !clear) await look(grace, zoom)
  }
  const topOfPage = (): Box => ({ x: 0, y: 0, w: PAGE_WIDTH, h: 720 })
  const topOf = (element: HTMLElement, h = 720): Box => ({
    x: 0,
    y: Math.max(0, place(element).y - 40),
    w: PAGE_WIDTH,
    h,
  })
  const rosterTop = (): Box => ({
    x: 0,
    y: place(one('[data-pane="roster"] .stats-line')).y - 16,
    w: PAGE_WIDTH,
    h: 720,
  })

  /** The page as each step finds it. */
  const setScene = (step: number) => {
    const pane = ['overview', 'overview', 'roster', 'roster', 'checkins', 'followup', 'intake'][step]
    for (const each of panes) {
      each.hidden = each.dataset.pane !== pane
      each.classList.remove('fading')
    }
    markTab(['Overview', 'Overview', 'Roster', 'Roster', 'Check-Ins', 'Follow-Up'][step] ?? null)

    pair.classList.remove('open')
    for (const box of all<HTMLInputElement>('input[type=checkbox]', pair)) box.checked = false
    tableWrap.scrollLeft = step > 2 && isPhone() ? pairedLeft() : 0

    const paired = step > 2
    graceCell.innerHTML = paired ? pairedWith('Emily Davis') : graceWas
    emilyCell.innerHTML = paired ? pairedWith('Grace Lee') : emilyWas
    need(pairedCount, 'paired count').textContent = String(pairedWere + (paired ? 2 : 0))
    need(unpairedCount, 'unpaired count').textContent = String(unpairedWere - (paired ? 2 : 0))
    for (const lit of all('.tour-spot')) lit.classList.remove('tour-spot')

    const answered = step > 3
    answeredCount.textContent = String(answeredWere + (answered ? 1 : 0))
    pendingCount.textContent = String(pendingWere - (answered ? 1 : 0))
    outstandingCount.textContent = String(outstandingWere + (answered ? 1 : 0))
    $('#tour-new-check-in')?.remove()
    if (answered) outstandingList.insertAdjacentHTML('afterbegin', newCard(false))
    phone.classList.remove('on')
    for (const message of all('.tour-message', phone)) message.classList.remove('on')

    stats.forEach((stat, index) => {
      stat.textContent = statsWere[index] ?? ''
    })
    helpMenu.open = false
    accountMenu.open = false
    copyButton.textContent = copyWas
    copyButton.classList.remove('tour-copied')
    removeNotes()
  }

  const scenes: readonly (() => Promise<void>)[] = [
    async () => {
      cursor.style.transform = 'translate(980px, 520px)'
      await look(topOfPage(), 1)
      stats.forEach((stat, index) => {
        const value = /^(\d+)(%?)$/.exec(statsWere[index] ?? '')
        if (value) void countUp(stat, Number(value[1]), value[2]).catch(() => undefined)
      })
      await wait(450)
      const rate = need(stats[1]?.closest<HTMLElement>('.stat'), 'Meeting Rate tile')
      await point(rate, 0.5, 0.6)
      await note(rate, TOUR_NOTES.meetingRate)
    },
    async () => {
      await look(topOfPage(), 1)
      await point(tab('Roster'))
      await click()
      await show('roster', 'Roster')
      await lookAtGrace(1.1)
      await point(graceName, 0.4, 0.6)
      grace.classList.add('tour-spot')
      await note(graceName, TOUR_NOTES.grace)
    },
    async () => {
      grace.classList.add('tour-spot')
      await lookAtGrace(1.4)
      if (isPhone()) {
        tableWrap.scrollTo({ left: pairedLeft(), behavior: 'smooth' })
        await wait(450)
      }
      await point(one('.btn', graceCell))
      await click()
      openOver(pair)
      await wait(300)
      if (isPhone()) await look(one<HTMLElement>('.modal', pair), 1)
      const emily = need(
        all('.pair-opt', pair).find((option) => option.textContent?.includes('Emily Davis')),
        'Emily Davis in the Pair pop-up',
      )
      await point(emily, 0.3, 0.5)
      await click()
      one<HTMLInputElement>('input', emily).checked = true
      await wait(200)
      await point(one('button[type=submit]', pair))
      await click()
      pair.classList.remove('open')
      removeNotes()
      if (isPhone()) await look(grace, 1.4)
      graceCell.innerHTML = pairedWith('Emily Davis')
      one('li', graceCell).classList.add('tour-arrive')
      await wait(150)
      emilyCell.innerHTML = pairedWith('Grace Lee')
      one('li', emilyCell).classList.add('tour-arrive')
      bump(need(pairedCount, 'paired count'), String(pairedWere + 2))
      bump(need(unpairedCount, 'unpaired count'), String(unpairedWere - 2))
      await note(graceCell, TOUR_NOTES.invited, 'below', 0.3)
    },
    async () => {
      await point(tab('Check-Ins'))
      await click()
      await show('checkins', 'Check-Ins')
      await look(one<HTMLElement>('.card', checkIns), 1.15, isPhone() ? 0 : 330)
      phone.classList.add('on')
      await wait(450)
      for (const message of all('.tour-message', phone)) {
        message.classList.add('on')
        await wait(message.classList.contains('out') ? 350 : 550)
      }
      if (isPhone()) {
        await wait(450)
        phone.classList.remove('on')
        await wait(350)
      }
      bump(pendingCount, String(pendingWere - 1))
      bump(answeredCount, String(answeredWere + 1))
      await wait(450)
      bump(outstandingCount, String(outstandingWere + 1))
      outstandingList.insertAdjacentHTML('afterbegin', newCard(true))
      const card = one('#tour-new-check-in')
      await point(card, 0.5, 0.6)
      await note(card, TOUR_NOTES.mark)
    },
    async () => {
      phone.classList.remove('on')
      await point(tab('Follow-Up'))
      await click()
      await show('followup', 'Follow-Up')
      const pane = paneOf('followup')
      await look(topOf(pane, 680), 1.25)
      // The list's own row: what Resolve belongs to, and what opening it would show.
      const concern = need($<HTMLElement>('.fu.care-concern', pane), 'a concern on Follow-Up')
      await point(concern)
      await note(concern, TOUR_NOTES.resolve)
    },
    async () => {
      // Up to the header first, so the account menu and its Intake forms click are in view.
      await look(menusBox(), 1, 0, true)
      await point(one('summary', accountMenu))
      await click()
      accountMenu.open = true
      await wait(350)
      const intakeItem = need(
        all('a', accountMenu).find((link) => link.textContent?.includes('Intake forms')),
        'Intake forms in the account menu',
      )
      await point(intakeItem)
      intakeItem.classList.add('hl')
      await wait(450)
      await click()
      await wait(250)
      accountMenu.open = false
      intakeItem.classList.remove('hl')
      await show('intake', null)
      await look(topOf(copyButton.closest<HTMLElement>('.form-tile') ?? paneOf('intake'), 640), 1.25)
      await point(copyButton)
      await click()
      copyButton.textContent = COPIED
      copyButton.classList.add('tour-copied')
      await note(copyButton, TOUR_NOTES.copied)
    },
    async () => {
      // Three stops along the top right: Help, Settings, your account.
      await look(menusBox(), 1, 0, true)
      await point(one('summary', helpMenu))
      await click()
      helpMenu.open = true
      await wait(300)
      await note(panelOf(helpMenu), TOUR_NOTES.help)
      helpMenu.open = false
      await point(settings)
      await click()
      await note(settings, TOUR_NOTES.settings, 'below', 0.5, 1900)
      await point(one('summary', accountMenu))
      await click()
      accountMenu.open = true
      await wait(300)
      await note(panelOf(accountMenu), TOUR_NOTES.account, 'below', 0)
    },
  ]

  const writeCaption = (step: number) => {
    const words = TOUR_STEPS[step]
    if (!words) return
    countNow.textContent = String(step + 1)
    title.textContent = words.title
    text.textContent = words.text
  }

  const showCaption = (step: number) => {
    captionBody.classList.add('fading')
    setTimeout(
      () => {
        writeCaption(step)
        captionBody.classList.remove('fading')
      },
      still ? 0 : 280,
    )
    dots.forEach((dot, index) => dot.classList.toggle('on', index <= step))
  }

  const go = (step: number) => {
    run++
    at = step
    camera.classList.add('instant')
    cursor.classList.add('instant')
    setScene(step)
    // From where the last scene left the camera and the cursor, so nothing jumps.
    requestAnimationFrame(() => {
      camera.classList.remove('instant')
      cursor.classList.remove('instant')
      void (async () => {
        try {
          // The camera frames the room above the caption, so the new caption lands first.
          await wait(300)
          await scenes[step]?.()
          if (at === step) forward.classList.add('ready')
        } catch {
          // A scene left behind by Back or Next stops where it stands.
        }
      })()
    })
    showCaption(step)
    const last = step === scenes.length - 1
    forward.classList.remove('ready')
    forwardWord.textContent = last ? DONE : NEXT
    forward.setAttribute('aria-label', last ? DONE : NEXT)
    back.hidden = step === 0
  }

  const pressBack = () => {
    if (at > 0) go(at - 1)
  }
  const pressNext = () => {
    if (at < scenes.length - 1) go(at + 1)
    else doneForm.requestSubmit()
  }

  // Nothing moves behind the Start your demo button.
  let started = false
  const start = one<HTMLButtonElement>('.tour-start')
  const intro = one('.tour-intro')
  const pressStart = () => {
    started = true
    count.hidden = false
    intro.classList.add('gone')
    setTimeout(() => intro.remove(), 400)
    go(0)
  }
  const pressKey = (event: KeyboardEvent) => {
    if (!started) return
    if (event.key === 'ArrowRight') pressNext()
    if (event.key === 'ArrowLeft') pressBack()
  }
  const resized = () => {
    if (started) go(at)
  }

  back.addEventListener('click', pressBack)
  forward.addEventListener('click', pressNext)
  start.addEventListener('click', pressStart)
  addEventListener('keydown', pressKey)
  addEventListener('resize', resized)

  // Behind the button, the first step waits where it will start, captioned.
  camera.classList.add('instant')
  setScene(0)
  void look(topOfPage(), 1).catch(() => undefined)
  cursor.style.transform = 'translate(980px, 520px)'
  writeCaption(0)
  dots.forEach((dot, index) => dot.classList.toggle('on', index === 0))
  back.hidden = true
  start.focus()

  return () => {
    run++
    back.removeEventListener('click', pressBack)
    forward.removeEventListener('click', pressNext)
    start.removeEventListener('click', pressStart)
    removeEventListener('keydown', pressKey)
    removeEventListener('resize', resized)
  }
}
