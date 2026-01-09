
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tags = [
    { slug: 'personality', label: 'Personality' },
    { slug: 'trivia', label: 'Trivia' },
    { slug: 'relationship', label: 'Relationship' },
    { slug: 'fun', label: 'Fun' },
  ]

  console.log('Seeding quiz tags...')

  for (const tag of tags) {
    const upsertedTag = await prisma.quizTag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    })
    console.log(`  Processed tag: ${upsertedTag.label}`)
  }

  // Optionally assign tags to existing quizzes if any exist
  // For now, let's just create the tags
  
  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
