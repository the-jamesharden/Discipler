/**
 * What an inbound text looks like once the transport, the keyboard and the
 * autocorrect have been taken back off it.
 *
 * Its own module because two readers need the identical rule and they are not each
 * other's: `readCheckInReply` matches an answer against the question that is open,
 * and `readExchangeReply` matches a selection against the menu that is open. A
 * second copy of *what counts as the same characters* would drift the day one of
 * them gained a case somebody typed and the other did not, and the drift would show
 * up as a Leader whose `1.` selected a relationship on Monday and did not on
 * Tuesday.
 *
 * Nothing here decides meaning. It hands both readers the same string and stops.
 */

/**
 * Down to words and nothing else: lower case, no punctuation, no emoji, single
 * spaces. An emoji is removed rather than read, because sentiment is never inferred
 * from free text and a thumbs-up on its own is free text with the words taken out.
 *
 * Apostrophes are removed rather than turned into a space, straight and curly
 * alike: `didn't` and `didn’t` both have to reach the one token `didnt`, and a
 * phone's autocorrect must not decide whether a Leader was understood. Every other
 * punctuation mark becomes a space, because it separates words rather than sitting
 * inside one.
 */
export const plainWords = (body: string): string =>
  body
    .toLowerCase()
    .replace(/['’ʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The closed list, and the one invariant it has to keep: **nothing here carries
 * polarity**. Every entry is a greeting or a courtesy, so removing it cannot change
 * what the message said -- which is what makes the ADR's warning about fragments
 * that invert meaning something the list cannot express rather than something a
 * reviewer has to catch.
 *
 * Anything that does mean yes or no is a token in the tables that use this. That is
 * the same treatment ADR-0003 gives `we didn't`: part of a token, never a wrapper.
 */
const PLEASANTRIES: readonly string[] = [
  'hi',
  'hey',
  'hello',
  'ok',
  'okay',
  'thanks',
  'thank you',
  'please',
  'sorry',
]

/**
 * Longest first, so `thank you` is taken as one courtesy rather than matching `you`
 * and leaving `thank` behind. Ordered once here rather than on every reply.
 */
const STRIPPABLE = [...PLEASANTRIES].sort((a, b) => b.length - a.length)

/**
 * The pleasantries off both ends, repeatedly, so `hi yes please` reaches `yes`.
 *
 * Never down to nothing: a message that is only a greeting answered no question,
 * and stripping it to the empty string and then matching would make whichever token
 * the empty string happened to reach the answer to every `hi` ever sent.
 */
export const withoutPleasantries = (words: string): string => {
  let remaining = words

  for (let taken = true; taken; ) {
    taken = false
    for (const pleasantry of STRIPPABLE) {
      const lead = `${pleasantry} `
      const trail = ` ${pleasantry}`
      if (remaining.startsWith(lead)) {
        remaining = remaining.slice(lead.length)
        taken = true
      } else if (remaining.endsWith(trail)) {
        remaining = remaining.slice(0, -trail.length)
        taken = true
      }
    }
  }

  return remaining
}
