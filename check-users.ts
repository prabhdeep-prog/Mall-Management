import { db } from "./src/lib/db/index"
import { users } from "./src/lib/db/schema"

async function main() {
  const result = await db.select().from(users)
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
