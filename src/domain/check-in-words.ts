import { KEYWORDS } from './keywords'
import { CHECK_IN_SENTENCE } from './launch-terms'
import { readWording } from './wording'

/**
 * The four sentences of the check-in a church may rewrite, and the rules for what
 * may be typed into them (Exponential launch, ticket 40; ADR-0034).
 *
 * Text an Admin types is data. It goes inside the frame, which `outbound-copy.ts`
 * composes and which nothing here can reach: the start, the reply choices and the
 * rates line are added around whatever these sentences say. So the frame stays true
 * whatever is saved, and these rules exist for what is left: a sentence that sits
 * inside a real text on a number every church shares must not read as though it
 * were the frame.
 *
 * Nothing in this module reaches a database or a clock, and the settings screen's
 * own phone runs these same functions, so what an Admin sees as they type and what
 * the save decides cannot differ.
 */

/** The four lines, in the order the conversation reaches them and the form asks. */
export const CHECK_IN_LINES = ['question', 'rating', 'concern', 'thanks'] as const

export type CheckInLine = (typeof CHECK_IN_LINES)[number]

/** All four sentences, ready to compose: what a conversation goes out in. */
export type CheckInWords = Readonly<Record<CheckInLine, string>>

/**
 * What a church has saved. Null on a line it has not rewritten, and null rather
 * than a copy of Discipler's words, so a church that never touched a line goes on
 * sending whatever Discipler's words are.
 */
export type SavedCheckInWords = Readonly<Record<CheckInLine, string | null>>

/** The four boxes as they arrive off the form. */
export type SubmittedCheckInWords = Readonly<Record<CheckInLine, string | null>>

/**
 * Discipler's words, as they go out today: a church with nothing saved sends
 * exactly these. The thank-you's apostrophe is the curly one it has always gone out
 * with, whatever a ticket typed.
 */
export const DISCIPLERS_CHECK_IN_WORDS: CheckInWords = {
  question: 'Did you meet with [name] this week?',
  rating: 'How did the meeting go?',
  concern: 'Please tell us more about the concern.',
  thanks: 'Thank you. We’ll check in with you next week.',
}

export const NO_SAVED_CHECK_IN_WORDS: SavedCheckInWords = {
  question: null,
  rating: null,
  concern: null,
  thanks: null,
}

/** What a saved set of words sends: the church's on its lines, Discipler's on the rest. */
export const checkInWordsInForce = (saved: SavedCheckInWords): CheckInWords => ({
  question: saved.question ?? DISCIPLERS_CHECK_IN_WORDS.question,
  rating: saved.rating ?? DISCIPLERS_CHECK_IN_WORDS.rating,
  concern: saved.concern ?? DISCIPLERS_CHECK_IN_WORDS.concern,
  thanks: saved.thanks ?? DISCIPLERS_CHECK_IN_WORDS.thanks,
})

/** Where whoever the check-in is about goes in a sentence. */
export const NAME_BLANK = '[name]'

/**
 * A sentence with the name in it. Split and joined rather than `replaceAll`, whose
 * replacement string reads `$&` and `$1`, because a name is a Ministry's data and
 * cannot be allowed to mean anything.
 */
export const fillingInTheName = (sentence: string, subject: string): string =>
  sentence.split(NAME_BLANK).join(subject)

/** `[Name]` and `[ NAME ]`, which are somebody meaning the blank. */
const THE_BLANK_HOWEVER_TYPED = /\[\s*name\s*\]/gi

/**
 * A sentence as it would actually go out: as `readWording` reads any box (on one
 * line, with invisible and control characters taken out), and the blank in its one
 * spelling. Null for nothing at all.
 */
export const checkInSentenceAsSent = (raw: string | null | undefined): string | null =>
  readWording(raw)?.replace(THE_BLANK_HOWEVER_TYPED, NAME_BLANK) ?? null

/** Why one sentence could not be taken. The screen owns the words for each. */
export type CheckInSentenceRefusal =
  | 'settings.check_in_sentence_too_long'
  /**
   * The question names nobody. A Leader of three is asked it three times, and a `1`
   * sent to a question that does not say who it is about is recorded against
   * somebody the Leader may not have had in mind.
   */
  | 'settings.check_in_question_names_nobody'
  /** Any `[...]` or `{...}` but `[name]`, which would go out on a phone as typed. */
  | 'settings.check_in_sentence_unknown_blank'
  /** It offers replies, names an opt-out word, or reads as the start of a text. */
  | 'settings.check_in_sentence_says_the_frame'
  /** A link or a phone number, on a number every church shares. */
  | 'settings.check_in_sentence_has_a_link'

/**
 * The words a carrier or the reply router acts on, beyond the router's own. A word
 * here in capitals is an instruction whatever it is beside.
 */
const REPLY_WORDS: ReadonlySet<string> = new Set([
  ...KEYWORDS,
  'STOPALL',
  'UNSTOP',
  'UNSUBSCRIBE',
  'OPTOUT',
  'CANCEL',
  'END',
  'QUIT',
  'REVOKE',
])

/** What a sentence does to ask somebody to send a token. */
const REPLY_VERBS: ReadonlySet<string> = new Set([
  'reply',
  'replying',
  'respond',
  'text',
  'txt',
  'texting',
  'send',
  'answer',
  'type',
  'press',
])

/** What may stand between such a verb and the token it asks for. */
const BETWEEN_THE_VERB_AND_THE_TOKEN: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'with',
  'us',
  'me',
  'back',
  'just',
  'only',
  'either',
  'to',
  'by',
  'word',
  'number',
  'letter',
  'please',
])

/** Whether one word is what a reply would be: a number, a rating letter or a keyword. */
const isAToken = (word: string): boolean =>
  /^\d+$/.test(word) ||
  /^[A-D]$/.test(word) ||
  REPLY_WORDS.has(word.toUpperCase()) ||
  word.toUpperCase() === 'YES' ||
  word.toUpperCase() === 'NO'

/**
 * `Reply 1`, `text back YES`, `reply with a 2`. Read word by word so that what
 * stands between has to be filler: `did you text [name] 2 times` is a question, and
 * `please reply with more detail` is what the concern line is for.
 */
const asksForAToken = (sentence: string): boolean => {
  const words = sentence.match(/[\p{L}\p{N}]+/gu) ?? []

  return words.some((word, index) => {
    if (!REPLY_VERBS.has(word.toLowerCase())) return false

    // A capital `A` is the rating and not the article, so a token is looked for first.
    const rest = words.slice(index + 1)
    const token = rest.find(
      (each) => isAToken(each) || !BETWEEN_THE_VERB_AND_THE_TOKEN.has(each.toLowerCase()),
    )
    return token !== undefined && isAToken(token)
  })
}

/** `1 for yes`, `A = great`, `2 means no`: reply choices with no verb in front. */
const OFFERS_A_CHOICE = /(?<![\p{L}\p{N}])(?:\d|[A-D])\s*(?:for|=|means|if)\s+\S/u

/** The rates line and the start of a text, in the words they go out in. */
const QUOTES_THE_FRAME =
  /\bvia\s+discipler\b|\bopt(?:s|ed|ing)?[\s-]?out\b|\bunsubscribe\b|\b(?:msg|message)s?\s*(?:&|and)\s*data\b|\bdata\s+rates\b/i

/**
 * Whether a sentence reads as though it were the frame.
 *
 * The frame goes on every text whatever this says, so this is what keeps a church's
 * sentence from contradicting it: *Reply 2 if you did*, followed by *Reply 1 for
 * yes, 2 for no*, gets a wrong answer recorded, and *Do not reply STOP* sits badly
 * on a carrier registration every church depends on.
 *
 * It reads for what an Admin would plausibly type, and it is not a filter against
 * somebody determined to get past it: the frame is the guarantee, and an Admin has
 * signed in as the church it speaks for.
 */
const saysTheFrame = (sentence: string): boolean =>
  QUOTES_THE_FRAME.test(sentence) ||
  OFFERS_A_CHOICE.test(sentence) ||
  asksForAToken(sentence) ||
  (sentence.match(/[\p{L}\p{N}]+/gu) ?? []).some(
    (word) => word === word.toUpperCase() && REPLY_WORDS.has(word),
  )

const A_LINK =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|church|edu|ly|io|co|app|link|gg|me)(?:\b|\/)(?!['’])/i

/** The shapes `email.ts` takes a phone number out of. */
const A_PHONE_NUMBER =
  /(?<![\w+])(?:\+\d{8,15}|\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?!\w)/

/**
 * Everything wrong with one line, as it would go out. Empty for a line that is fine
 * and for a blank one, which is Discipler's words. The settings screen calls this
 * as an Admin types, so a line is marked before the form is ever sent.
 */
export const checkInSentenceRefusals = (
  line: CheckInLine,
  raw: string | null | undefined,
): readonly CheckInSentenceRefusal[] => {
  const sentence = checkInSentenceAsSent(raw)
  if (sentence === null) return []

  const refusals: CheckInSentenceRefusal[] = []

  // Characters and not UTF-16 units, so an emoji counts as the one character the
  // database's `char_length` counts it as.
  if (Array.from(sentence).length > CHECK_IN_SENTENCE.longest) {
    refusals.push('settings.check_in_sentence_too_long')
  }
  if (line === 'question' && !sentence.includes(NAME_BLANK)) {
    refusals.push('settings.check_in_question_names_nobody')
  }
  if (/\[[^\]]*\]|\{[^}]*\}/.test(sentence.split(NAME_BLANK).join(''))) {
    refusals.push('settings.check_in_sentence_unknown_blank')
  }
  if (saysTheFrame(sentence.split(NAME_BLANK).join(' '))) {
    refusals.push('settings.check_in_sentence_says_the_frame')
  }
  if (A_LINK.test(sentence) || A_PHONE_NUMBER.test(sentence)) {
    refusals.push('settings.check_in_sentence_has_a_link')
  }

  return refusals
}

export type CheckInWordsReading =
  | { readonly words: SavedCheckInWords }
  | { readonly refusals: readonly CheckInSentenceRefusal[] }

/**
 * The four lines off the form. A blank line, and a line left exactly as Discipler
 * wrote it, is nothing saved: the form shows Discipler's words in the box for
 * editing, so a church that pressed Save without touching them has not rewritten
 * anything. Each problem is said once, however many lines have it.
 */
export const readCheckInWords = (submitted: SubmittedCheckInWords): CheckInWordsReading => {
  const refusals = new Set(
    CHECK_IN_LINES.flatMap((line) => checkInSentenceRefusals(line, submitted[line])),
  )
  if (refusals.size > 0) return { refusals: [...refusals] }

  const saved = (line: CheckInLine): string | null => {
    const sentence = checkInSentenceAsSent(submitted[line])
    return sentence === DISCIPLERS_CHECK_IN_WORDS[line] ? null : sentence
  }

  return {
    words: {
      question: saved('question'),
      rating: saved('rating'),
      concern: saved('concern'),
      thanks: saved('thanks'),
    },
  }
}
