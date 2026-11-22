import type { PackageDto } from '@isp/contracts';
import type { Package } from '../../generated/prisma/client.js';

export function toPackageDto(pkg: Package): PackageDto {
  return {
    id: pkg.id,
    name: pkg.name,
    speedMbps: pkg.speedMbps,
    monthlyPricePoisha: Number(pkg.monthlyPricePoisha),
    pppProfile: pkg.pppProfile,
    isActive: pkg.isActive,
  };
}
