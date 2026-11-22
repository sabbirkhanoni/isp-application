import type { CreatePackageInput, PackageDto, UpdatePackageInput } from '@isp/contracts';
import { api } from '@/lib/api-client';

export const packagesKey = ['packages'] as const;

export const fetchPackages = async () => (await api.get<PackageDto[]>('/packages')).data;
export const createPackage = (input: CreatePackageInput) =>
  api.post<PackageDto>('/packages', input);
export const updatePackage = (id: string, input: UpdatePackageInput) =>
  api.patch<PackageDto>(`/packages/${id}`, input);
