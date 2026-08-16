import { PrismaClient, Platform, SaleStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const bulk = await prisma.bulkBuy.create({
    data: {
      name: "July Clothing Buy",
      purchaseDate: new Date("2026-07-15"),
      totalCost: 900,
      purchasedQty: 300,
      unlistedQty: 275,
      notes: "Mixed clothing and shoes"
    }
  });

  const items = [
    { sku: "NKE-001", title: "Nike Air Max 90 Men's Size 10", cogs: 3.00, location: "A01", bulkBuyId: bulk.id },
    { sku: "CAR-002", title: "Carhartt Men's Work Jacket Brown", cogs: 3.00, location: "A02", bulkBuyId: bulk.id },
    { sku: "LEV-003", title: "Levi's 501 Jeans Men's 34x32", cogs: 3.00, location: "A03", bulkBuyId: bulk.id },
    { sku: "PAT-004", title: "Patagonia Better Sweater Women's Medium", cogs: 3.00, location: "B01", bulkBuyId: bulk.id }
  ];

  for (const item of items) {
    await prisma.inventoryItem.create({ data: item });
  }

  const nike = await prisma.inventoryItem.findUnique({ where: { sku: "NKE-001" } });

  await prisma.listing.create({
    data: {
      platform: Platform.EBAY,
      externalId: "EBAY-10001",
      title: nike!.title,
      quantity: 1,
      inventoryItemId: nike!.id
    }
  });

  await prisma.sale.create({
    data: {
      platform: Platform.POSHMARK,
      externalOrderId: "PM-50001",
      buyerUsername: "buyer123",
      saleAmount: 42,
      fees: 8.4,
      status: SaleStatus.MATCHED,
      lines: {
        create: [{
          inventoryItemId: nike!.id,
          title: nike!.title,
          quantity: 1,
          unitPrice: 42
        }]
      }
    }
  });

  console.log("Seed complete");
}

main().finally(() => prisma.$disconnect());
