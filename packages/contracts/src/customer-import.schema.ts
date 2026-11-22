import { z } from 'zod';

/** Largest file accepted, in characters (about 10,000 customers). */
export const IMPORT_MAX_CHARS = 2_000_000;
export const IMPORT_MAX_ROWS = 5000;

export const importCustomersSchema = z.object({
  csv: z.string().min(1).max(IMPORT_MAX_CHARS),
  /** false = only check the file and report problems; true = save, but only if the file has no problems. */
  commit: z.boolean().default(false),
  fileName: z.string().trim().max(200).default('customers.csv'),
});
export type ImportCustomersInput = z.infer<typeof importCustomersSchema>;

export interface ImportRowErrorDto {
  /** Line number in the file (the header is line 1). */
  row: number;
  field: string;
  message: string;
}

export interface CustomerImportResultDto {
  committed: boolean;
  totalRows: number;
  validRows: number;
  created: number;
  errorCount: number;
  /** The first 200 problems; fix them and upload again. */
  errors: ImportRowErrorDto[];
}
