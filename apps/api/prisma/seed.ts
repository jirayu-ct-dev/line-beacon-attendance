import 'dotenv/config'
// Idempotent seed: creates the admin user if missing (values overridable via env).
//   ADMIN_EMAIL    (default admin@example.com)
//   ADMIN_USERNAME (default admin)
//   ADMIN_PASSWORD (default change-me-admin) — change it before real use!
import { hash } from 'argon2'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, UserRole } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com'
  const username = process.env.ADMIN_USERNAME ?? 'admin'
  const password = process.env.ADMIN_PASSWORD ?? 'change-me-admin'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Seed: admin user ${email} already exists — nothing to do`)
    return
  }

  await prisma.user.create({
    data: { email, username, passwordHash: await hash(password), role: UserRole.ADMIN },
  })
  console.log(`Seed: created admin user ${email} (username: ${username})`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
