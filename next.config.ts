import type { NextConfig } from 'next'
import { assertDeploymentIsSafe } from './src/platform/deployment'

// Refused at build, before anything is compiled, so a staging deployment given a
// production value never goes live and the one before it goes on serving
// (Exponential launch, ticket 02). `instrumentation.ts` checks again at start.
assertDeploymentIsSafe(process.env)

const nextConfig: NextConfig = {}

export default nextConfig
