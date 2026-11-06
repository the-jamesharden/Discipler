/**
 * Words with a hyphen in them kept on one line. A browser may break a line after
 * any hyphen, so a narrow box leaves "check-" at the end of one line and "ins"
 * alone on the next: the Overview's empty rings at phone width, and the onboarding
 * window's ticked test card. Every other word still wraps where it likes.
 */
export const WholeWords = ({ text }: { readonly text: string }) => (
  <>
    {text
      .split(/(\S*-\S*)/)
      .filter((part) => part !== '')
      .map((part, at) =>
        part.includes('-') ? (
          <span key={at} className="nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
  </>
)
