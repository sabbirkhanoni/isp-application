import type { CreatePackageInput, UpdatePackageInput } from '@isp/contracts';
import type { Package } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';

export interface PackageRepository {
  list(includeInactive: boolean): Promise<Package[]>;
  findById(id: string): Promise<Package | null>;
  findByName(name: string): Promise<Package | null>;
  create(input: CreatePackageInput): Promise<Package>;
  update(id: string, input: UpdatePackageInput): Promise<Package>;
}

export class PrismaPackageRepository implements PackageRepository {
  constructor(private readonly db: Database) {}

  list(includeInactive: boolean): Promise<Package[]> {
    return this.db.package.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ speedMbps: 'asc' }, { name: 'asc' }],
    });
  }

  findById(id: string): Promise<Package | null> {
    return this.db.package.findUnique({ where: { id } });
  }

  findByName(name: string): Promise<Package | null> {
    return this.db.package.findUnique({ where: { name } });
  }

  create(input: CreatePackageInput): Promise<Package> {
    return this.db.package.create({
      data: {
        name: input.name,
        speedMbps: input.speedMbps,
        monthlyPricePoisha: BigInt(input.monthlyPricePoisha),
        pppProfile: input.pppProfile ?? null,
      },
    });
  }

  update(id: string, input: UpdatePackageInput): Promise<Package> {
    const { monthlyPricePoisha, ...rest } = input;
    return this.db.package.update({
      where: { id },
      data: {
        ...rest,
        ...(monthlyPricePoisha === undefined
          ? {}
          : { monthlyPricePoisha: BigInt(monthlyPricePoisha) }),
      },
    });
  }
}
