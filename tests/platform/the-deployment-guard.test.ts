import { describe, expect, it } from 'vitest'
import {
  assertDeploymentIsSafe,
  deploymentOf,
  deploymentRefusals,
  messageTransportKind,
} from '~/platform/deployment'

/**
 * What a deployment refuses to run with (Exponential launch, ticket 02).
 *
 * Staging exists so that Checkout, the Portal and Stripe's webhooks are first tried
 * somewhere no real church can be touched. That promise is only as good as the
 * environment a staging deployment is given, and an environment is typed by hand
 * into a dashboard: one pasted production value and staging writes to real
 * churches' rows, texts real phones or takes real money. So the deployment reads
 * its own environment before it serves anything and refuses to start on a wrong one.
 *
 * Pure functions of an environment, so every case is a literal here and no test
 * touches the process's own.
 */

const productionRef = 'vmdiddtxvmaflmrrqwmo'

/** A staging environment as the provisioning checklist sets it up. */
const staging = {
  DISCIPLER_ENVIRONMENT: 'staging',
  MESSAGE_TRANSPORT: 'record',
  NEXT_PUBLIC_APP_URL: 'https://staging.trydiscipler.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://stagingrefabcdefghij.supabase.co',
  DATABASE_URL:
    'postgresql://postgres.stagingrefabcdefghij:pw@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  STRIPE_SECRET_KEY: 'rk_test_51abc',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_51abc',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc',
  STAGING_SMS_SIGNING_SECRET: 'a-staging-only-secret',
}

/** A JWT whose payload names a Supabase project, the shape of a legacy service role key. */
const aKeyFor = (ref: string) => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase', ref, role: 'service_role' })}.signature`
}

describe('which deployment this is', () => {
  it('is staging when the environment says so', () => {
    expect(deploymentOf({ DISCIPLER_ENVIRONMENT: 'staging' })).toBe('staging')
  })

  it('is staging when Vercel deploys it to the custom environment named staging, even with the variable forgotten', () => {
    expect(deploymentOf({ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' })).toBe('staging')
  })

  it('is production when Vercel deploys it to production', () => {
    expect(deploymentOf({ VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production' })).toBe(
      'production',
    )
  })

  it('is neither on a developer’s machine or an ordinary preview', () => {
    expect(deploymentOf({})).toBe('other')
    expect(deploymentOf({ VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' })).toBe('other')
  })
})

describe('a staging deployment', () => {
  it('runs on the environment the checklist gives it', () => {
    expect(deploymentRefusals(staging)).toEqual([])
    expect(() => assertDeploymentIsSafe(staging)).not.toThrow()
  })

  it('refuses production’s database', () => {
    const refusals = deploymentRefusals({
      ...staging,
      DATABASE_URL: `postgresql://postgres.${productionRef}:pw@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`,
    })
    expect(refusals).toEqual([expect.stringContaining('DATABASE_URL')])
  })

  it('refuses production’s database by its direct address as well as the pooler', () => {
    const refusals = deploymentRefusals({
      ...staging,
      DATABASE_URL: `postgresql://postgres:pw@db.${productionRef}.supabase.co:5432/postgres`,
    })
    expect(refusals).toEqual([expect.stringContaining('DATABASE_URL')])
  })

  it('refuses production’s Supabase under any name, a key that only names it inside included', () => {
    const refusals = deploymentRefusals({
      ...staging,
      NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: aKeyFor(productionRef),
    })
    expect(refusals).toHaveLength(2)
    expect(refusals.join('\n')).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(refusals.join('\n')).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('accepts its own project’s key', () => {
    expect(
      deploymentRefusals({ ...staging, SUPABASE_SERVICE_ROLE_KEY: aKeyFor('stagingrefabcdefghij') }),
    ).toEqual([])
  })

  it('refuses any Twilio credential at all, because staging has no business with the account', () => {
    const refusals = deploymentRefusals({
      ...staging,
      TWILIO_ACCOUNT_SID: 'AC0123',
      TWILIO_AUTH_TOKEN: 'token',
    })
    expect(refusals).toHaveLength(2)
    expect(refusals.join('\n')).toContain('TWILIO_ACCOUNT_SID')
    expect(refusals.join('\n')).toContain('TWILIO_AUTH_TOKEN')
  })

  it('does not count a Twilio variable left empty', () => {
    expect(deploymentRefusals({ ...staging, TWILIO_AUTH_TOKEN: '' })).toEqual([])
  })

  it('refuses a Stripe live key, secret, restricted or publishable, whatever it is called', () => {
    const refusals = deploymentRefusals({
      ...staging,
      STRIPE_SECRET_KEY: 'sk_live_51abc',
      STRIPE_RESTRICTED_KEY: 'rk_live_51abc',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_51abc',
    })
    expect(refusals).toHaveLength(3)
    // Named, never quoted: a refusal is printed in a build log.
    expect(refusals.join('\n')).not.toContain('51abc')
  })

  it('refuses to send texts, so it must be set to record them', () => {
    expect(deploymentRefusals({ ...staging, MESSAGE_TRANSPORT: undefined })).toEqual([
      expect.stringContaining('MESSAGE_TRANSPORT'),
    ])
    expect(deploymentRefusals({ ...staging, MESSAGE_TRANSPORT: 'twilio' })).toEqual([
      expect.stringContaining('MESSAGE_TRANSPORT'),
    ])
  })

  it('refuses production’s address for the links it puts in texts and emails', () => {
    expect(
      deploymentRefusals({ ...staging, NEXT_PUBLIC_APP_URL: 'https://app.trydiscipler.com' }),
    ).toEqual([expect.stringContaining('NEXT_PUBLIC_APP_URL')])
  })

  it('refuses to be deployed as production', () => {
    expect(
      deploymentRefusals({ ...staging, VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production' }),
    ).toEqual([expect.stringContaining('production')])
  })

  it('says every refusal at once, so a dashboard is fixed in one pass', () => {
    expect(() =>
      assertDeploymentIsSafe({
        ...staging,
        DATABASE_URL: `postgresql://postgres:pw@db.${productionRef}.supabase.co:5432/postgres`,
        TWILIO_AUTH_TOKEN: 'token',
      }),
    ).toThrow(/DATABASE_URL[\s\S]*TWILIO_AUTH_TOKEN|TWILIO_AUTH_TOKEN[\s\S]*DATABASE_URL/)
  })
})

describe('a production deployment', () => {
  const production = {
    VERCEL_ENV: 'production',
    VERCEL_TARGET_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://app.trydiscipler.com',
    DATABASE_URL: `postgresql://postgres:pw@db.${productionRef}.supabase.co:5432/postgres`,
    TWILIO_ACCOUNT_SID: 'AC0123',
    TWILIO_AUTH_TOKEN: 'token',
  }

  it('runs on its own environment', () => {
    expect(deploymentRefusals(production)).toEqual([])
  })

  it('refuses to record texts, which would drop every one without a word', () => {
    expect(deploymentRefusals({ ...production, MESSAGE_TRANSPORT: 'record' })).toEqual([
      expect.stringContaining('MESSAGE_TRANSPORT'),
    ])
  })
})

describe('any deployment', () => {
  it('runs with nothing set, as a developer’s machine does', () => {
    expect(deploymentRefusals({})).toEqual([])
  })

  it('refuses a deployment name it does not know, so a typo is not quietly production-like', () => {
    expect(deploymentRefusals({ DISCIPLER_ENVIRONMENT: 'Staging ' })).toEqual([
      expect.stringContaining('DISCIPLER_ENVIRONMENT'),
    ])
  })

  it('refuses a transport it does not know', () => {
    expect(deploymentRefusals({ MESSAGE_TRANSPORT: 'recording' })).toEqual([
      expect.stringContaining('MESSAGE_TRANSPORT'),
    ])
  })
})

describe('how a text leaves', () => {
  it('goes to Twilio unless told otherwise', () => {
    expect(messageTransportKind({})).toBe('twilio')
    expect(messageTransportKind({ MESSAGE_TRANSPORT: 'twilio' })).toBe('twilio')
  })

  it('is recorded when the environment says so', () => {
    expect(messageTransportKind({ MESSAGE_TRANSPORT: 'record' })).toBe('record')
  })

  it('refuses a transport it does not know rather than guessing', () => {
    expect(() => messageTransportKind({ MESSAGE_TRANSPORT: 'recording' })).toThrow(/MESSAGE_TRANSPORT/)
  })

  it('is always recorded on staging, whatever the variable says', () => {
    // The startup guard refuses this environment; this is the second line, for a
    // process that got past it.
    expect(messageTransportKind({ DISCIPLER_ENVIRONMENT: 'staging', MESSAGE_TRANSPORT: 'twilio' })).toBe(
      'record',
    )
  })
})
