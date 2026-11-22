import {
  CONNECTION_TYPES,
  IMPORT_MAX_ROWS,
  addressSchema,
  customerCodeSchema,
  personNameSchema,
  phoneSchema,
  pppoeUsernameSchema,
  type ConnectionType,
  type ImportRowErrorDto,
} from '@isp/contracts';
import { detectDelimiter, normalizeHeader, parseCsv } from '../../shared/utils/csv-reader.js';

/**
 * Reads the owner's existing-customer sheet. Column names are matched loosely (case, spacing and a few
 * common alternatives), so a normal spreadsheet export works without renaming anything.
 */
const HEADER_ALIASES = {
  customerCode: [
    'customer id',
    'customer_id',
    'customerid',
    'customer code',
    'id',
    'code',
    'user id',
  ],
  fullName: ['name', 'full name', 'customer name', 'full_name'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number', 'mobile no', 'contact'],
  address: ['address', 'location'],
  area: ['area', 'zone', 'locality', 'village'],
  packageName: ['package', 'plan', 'package name', 'package_name'],
  connectionType: ['connection type', 'connection_type', 'connection', 'type'],
  pppoeUsername: [
    'pppoe username',
    'pppoe_username',
    'pppoe',
    'username',
    'pppoe user',
    'user name',
  ],
  routerName: ['router', 'router name', 'router_name', 'nas'],
  status: ['status', 'state'],
} as const;

type Field = keyof typeof HEADER_ALIASES;
const REQUIRED: Field[] = ['customerCode', 'fullName', 'phone', 'address', 'packageName'];

export interface ImportRow {
  line: number;
  customerCode: string;
  fullName: string;
  phone: string;
  address: string;
  area: string | null;
  packageId: string;
  connectionType: ConnectionType;
  pppoeUsername: string | null;
  routerId: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
}

/** What already exists in the database, loaded once so each row is checked without extra queries. */
export interface ImportLookups {
  packages: Array<{ id: string; name: string; isActive: boolean }>;
  routers: Array<{ id: string; name: string; isActive: boolean }>;
  existingCodes: Set<string>; // lower-cased
  existingPppoe: Set<string>; // lower-cased
}

export interface ParsedImport {
  totalRows: number;
  rows: ImportRow[];
  errors: ImportRowErrorDto[];
}

export class ImportFormatError extends Error {}

const lower = (value: string) => value.trim().toLowerCase();

function mapHeaders(header: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (map[field] === undefined && (HEADER_ALIASES[field] as readonly string[]).includes(name)) {
        map[field] = index;
      }
    }
  });
  return map;
}

export function parseCustomerImport(text: string, lookups: ImportLookups): ParsedImport {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const table = parseCsv(text, detectDelimiter(firstLine));
  const [header, ...body] = table;
  if (!header) throw new ImportFormatError('The file is empty.');

  const columns = mapHeaders(header);
  const missing = REQUIRED.filter((field) => columns[field] === undefined);
  if (missing.length > 0) {
    throw new ImportFormatError(
      `These columns are missing: ${missing.map((f) => HEADER_ALIASES[f][0]).join(', ')}. Use the template.`,
    );
  }
  if (body.length > IMPORT_MAX_ROWS) {
    throw new ImportFormatError(
      `The file has more than ${IMPORT_MAX_ROWS} customers. Split it in two.`,
    );
  }

  const get = (cells: string[], field: Field): string =>
    columns[field] === undefined ? '' : (cells[columns[field] as number] ?? '').trim();

  const rows: ImportRow[] = [];
  const errors: ImportRowErrorDto[] = [];
  const seenCodes = new Map<string, number>();
  const seenPppoe = new Map<string, number>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const problems: ImportRowErrorDto[] = [];
    const fail = (field: string, message: string) => problems.push({ row: line, field, message });

    const code = customerCodeSchema.safeParse(get(cells, 'customerCode'));
    if (!code.success) fail('customer_id', code.error.issues[0]?.message ?? 'Invalid customer ID');
    else if (
      existsIn(seenCodes, code.data, line, (first) =>
        fail('customer_id', `Same ID as line ${first}`),
      )
    ) {
      // reported above
    } else if (lookups.existingCodes.has(lower(code.data))) {
      fail('customer_id', 'This customer ID already exists in the system');
    }

    const name = personNameSchema.safeParse(get(cells, 'fullName'));
    if (!name.success) fail('name', 'Name is required (2 to 100 letters)');
    const phone = phoneSchema.safeParse(get(cells, 'phone'));
    if (!phone.success) fail('phone', 'Invalid mobile number (e.g. 01712345678)');
    const address = addressSchema.safeParse(get(cells, 'address'));
    if (!address.success) fail('address', 'Address is required');

    const pkgText = get(cells, 'packageName');
    const pkg = lookups.packages.find((p) => lower(p.name) === lower(pkgText));
    if (!pkg) fail('package', pkgText ? `Unknown package "${pkgText}"` : 'Package is required');
    else if (!pkg.isActive) fail('package', `Package "${pkg.name}" is not active`);

    const typeText = get(cells, 'connectionType').toUpperCase();
    const connection = typeText === '' ? 'PPPOE' : typeText;
    if (!(CONNECTION_TYPES as readonly string[]).includes(connection)) {
      fail('connection_type', `Use one of: ${CONNECTION_TYPES.join(', ')}`);
    }

    const pppoeText = get(cells, 'pppoeUsername');
    let pppoe: string | null = null;
    if (pppoeText) {
      const parsed = pppoeUsernameSchema.safeParse(pppoeText);
      if (!parsed.success)
        fail('pppoe_username', parsed.error.issues[0]?.message ?? 'Invalid PPPoE username');
      else if (
        existsIn(seenPppoe, parsed.data, line, (first) =>
          fail('pppoe_username', `Same username as line ${first}`),
        )
      ) {
        // reported above
      } else if (lookups.existingPppoe.has(lower(parsed.data))) {
        fail('pppoe_username', 'This PPPoE username already exists in the system');
      } else pppoe = parsed.data;
    } else if (connection === 'PPPOE') {
      fail('pppoe_username', 'PPPoE username is required for PPPoE customers');
    }

    const routerText = get(cells, 'routerName');
    let routerId: string | null = null;
    if (routerText) {
      const router = lookups.routers.find((r) => lower(r.name) === lower(routerText));
      if (!router) fail('router', `Unknown router "${routerText}"`);
      else if (!router.isActive) fail('router', `Router "${router.name}" is not active`);
      else if (connection !== 'PPPOE') fail('router', 'A router is only used for PPPoE customers');
      else routerId = router.id;
    }

    const statusText = get(cells, 'status').toUpperCase();
    const status = statusText === '' ? 'ACTIVE' : statusText;
    if (status !== 'ACTIVE' && status !== 'SUSPENDED') fail('status', 'Use ACTIVE or SUSPENDED');

    if (problems.length > 0) {
      errors.push(...problems);
      return;
    }
    rows.push({
      line,
      customerCode: (code as { data: string }).data,
      fullName: (name as { data: string }).data,
      phone: (phone as { data: string }).data,
      address: (address as { data: string }).data,
      area: get(cells, 'area').slice(0, 80) || null,
      packageId: (pkg as { id: string }).id,
      connectionType: connection as ConnectionType,
      pppoeUsername: pppoe,
      routerId,
      status: status as 'ACTIVE' | 'SUSPENDED',
    });
  });

  return { totalRows: body.length, rows, errors };
}

/** Remembers the first line a value was seen on; true when it is a repeat (and reports it). */
function existsIn(
  seen: Map<string, number>,
  value: string,
  line: number,
  onRepeat: (firstLine: number) => void,
): boolean {
  const key = lower(value);
  const first = seen.get(key);
  if (first !== undefined) {
    onRepeat(first);
    return true;
  }
  seen.set(key, line);
  return false;
}
