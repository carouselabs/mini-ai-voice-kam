/**
 * Vercel entry: the whole API as one Node function (region bom1, Mumbai). The client is served from Vercel's CDN.
 * Conversations, voice calls, the tracker and memory are kept in Upstash Redis there (see kv.ts), because each
 * request can land on a different instance. Built by scripts/build-vercel.mjs.
 */
import { createApp } from './app.ts'
import { getStore } from './data/store.ts'
import { contextFor } from './insights/context.ts'
import { investigateOverview } from './investigations/index.ts'

// Hosting defaults; a value set in the Vercel project wins.
// Vercel's proxy sets the visitor's address, so rate limits apply per visitor.
process.env.TRUST_PROXY ||= '1'
// A fixed chat model avoids looking up the model list on every cold start.
process.env.OPENAI_MODEL ||= 'gpt-5.4-mini'

// Compute the analytics while the instance starts (about 0.2 s), so the first request doesn't wait for them.
investigateOverview(contextFor(getStore()))

export default createApp()
