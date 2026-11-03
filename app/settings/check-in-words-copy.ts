import type { CheckInSentenceRefusal } from '~/domain/check-in-words'
import { CHECK_IN_SENTENCE } from '~/domain/launch-terms'

/**
 * What the screen says when a check-in sentence cannot be taken: in the toast after
 * a save, and beside the line as an Admin types. Its own module, because the phone
 * beside the lines runs in the browser and has no business carrying the rest of the
 * page's copy.
 *
 * The limit is read from where it is enforced, as the page's other refusals read
 * theirs.
 */
export const CHECK_IN_SENTENCE_REFUSALS: Record<CheckInSentenceRefusal, string> = {
  'settings.check_in_sentence_too_long': `A check-in sentence can be at most ${CHECK_IN_SENTENCE.longest} characters.`,
  'settings.check_in_question_names_nobody':
    'The question needs [name] in it, so a leader with several people knows which one it is asking about.',
  'settings.check_in_sentence_unknown_blank':
    '[name] is the only word a check-in sentence can fill in.',
  'settings.check_in_sentence_says_the_frame':
    'A check-in sentence can’t offer its own replies or opt-out words, such as “Reply 1” or “STOP”. Discipler adds those to every text.',
  'settings.check_in_sentence_has_a_link':
    'A check-in sentence can’t carry a link or a phone number.',
}
