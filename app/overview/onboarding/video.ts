/**
 * How a video's address plays inside the modal. Loom and YouTube each want their own
 * embed address, and anything else is taken to be a video file.
 *
 * YouTube goes through its no-cookie address, because nothing else in Discipler lets
 * another company set a cookie on a pastor's browser.
 */
export type VideoPlayer =
  | { readonly kind: 'frame'; readonly src: string }
  | { readonly kind: 'file'; readonly src: string }

const YOUTUBE = /^(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)$/

export const videoPlayerFor = (address: string): VideoPlayer => {
  const url = new URL(address)
  const host = url.hostname

  const youtubeId =
    host === 'youtu.be'
      ? url.pathname.slice(1)
      : YOUTUBE.test(host)
        ? (url.searchParams.get('v') ?? url.pathname.split('/').pop())
        : null
  if (youtubeId) {
    return { kind: 'frame', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0` }
  }

  if (host === 'loom.com' || host === 'www.loom.com') {
    const loomId = url.pathname.split('/').pop() ?? ''
    return { kind: 'frame', src: `https://www.loom.com/embed/${encodeURIComponent(loomId)}?autoplay=1` }
  }

  return { kind: 'file', src: address }
}
