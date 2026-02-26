#!/usr/bin/env node
import { QuotaService } from './index.js'

const userId = process.argv[2]
if (!userId) {
  console.error('Missing user id')
  process.exit(1)
}

const quota = new QuotaService()
const result = await quota.check(userId)
if (!result.allow) {
  console.log('Your quota has been exhausted. Please contact an admin or complete the required task to obtain more turns.')
  process.exit(1)
}

console.log(`ALLOW ${result.remaining}`)
process.exit(0)
