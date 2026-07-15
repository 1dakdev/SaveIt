import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds three KYC-verified users and a forming circle with all three as active
 * members, so you can immediately propose an order, vote-to-lock, and run a
 * period. Prints the ids you need for the x-user-id header.
 */
async function main() {
  const [ama, kofi, esi] = await Promise.all(
    [
      { name: 'Ama', email: 'ama@example.com' },
      { name: 'Kofi', email: 'kofi@example.com' },
      { name: 'Esi', email: 'esi@example.com' },
    ].map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: { kycStatus: 'verified' },
        create: { ...u, kycStatus: 'verified' },
      }),
    ),
  );

  const circle = await prisma.circle.create({
    data: {
      name: 'Sunday Savings',
      amount: 5000, // $50.00
      frequency: 'monthly',
      creatorId: ama.id,
      memberships: {
        create: [
          { userId: ama.id, role: 'organizer', state: 'active', termsAcceptedAt: new Date() },
          { userId: kofi.id, role: 'member', state: 'active', termsAcceptedAt: new Date() },
          { userId: esi.id, role: 'member', state: 'active', termsAcceptedAt: new Date() },
        ],
      },
    },
  });

  console.log('Seeded.');
  console.log('Circle:', circle.id);
  console.log('Ama  (organizer):', ama.id);
  console.log('Kofi (member)   :', kofi.id);
  console.log('Esi  (member)   :', esi.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
