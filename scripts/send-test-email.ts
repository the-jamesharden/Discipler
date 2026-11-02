/**
 * Sends one email to support@trydiscipler.com through the sender every email
 * leaves Discipler by (Exponential launch, ticket 10), so whoever runs Discipler
 * can see that `notify.trydiscipler.com` is set up: the email arrives, and its
 * headers say SPF, DKIM and DMARC passed.
 *
 * Run it once the three DNS records Resend shows are in at GoDaddy and Resend
 * calls the domain verified. It reads the same two variables the running app
 * reads and nothing else, so it is pointed at Resend by exporting those for the
 * one command, never by editing a file:
 *
 *   RESEND_API_KEY=re_... RESEND_EMAIL_DOMAIN=notify.trydiscipler.com \
 *     npm run email:check
 *
 * Then open the email in support@'s inbox, choose "Show original" (Gmail) or
 * "View message source", and look for `spf=pass`, `dkim=pass` and `dmarc=pass`.
 */

const [{ emailBody, emailSubject }, { createEmailSender }, { createResendTransport }] =
  await Promise.all([
    import('../src/domain/email'),
    import('../src/service/email-sender'),
    import('../src/platform/resend/email-transport'),
  ])

const sender = createEmailSender(createResendTransport())

await sender.send({
  kind: 'deliverabilityCheck',
  subject: emailSubject`Discipler can send email`,
  body: emailBody`This is the test email from scripts/send-test-email.ts.

If it reached support@trydiscipler.com, Discipler can send email from notify.trydiscipler.com. Open its original to check that SPF, DKIM and DMARC all say pass.

A reply to it should land back in support@trydiscipler.com.`,
  // A fresh key each run: the check is meant to be sent again whenever it is run.
  once: crypto.randomUUID(),
})

console.log('Sent. Look in support@trydiscipler.com.')
