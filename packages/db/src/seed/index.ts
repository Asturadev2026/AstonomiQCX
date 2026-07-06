import { getPrisma } from '../client';

/**
 * Minimal dev seed — just enough for local API calls to have a tenant to
 * scope to. Subdomain matches APP_URL in .env.example (shopnova.localtest.me).
 * Full demo data per view is a separate, much larger effort (Plan §3.3).
 */
async function main() {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'shopnova' },
    update: {},
    create: { name: 'Shopnova', subdomain: 'shopnova' },
  });
  console.log(`Seeded tenant: ${tenant.name} (${tenant.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
