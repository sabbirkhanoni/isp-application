import type { SearchCustomerDto } from '@isp/contracts';
import type { Database } from '../../shared/database/prisma-client.js';

interface Row {
  id: string;
  code: string;
  name: string;
  phone: string;
  area: string | null;
  status: SearchCustomerDto['status'];
  isFree: boolean;
  pppoe: string | null;
  due: bigint;
  online: boolean | null;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export class SearchRepository {
  constructor(private readonly db: Database) {}

  /** Name, customer ID, mobile number or PPPoE login; best matches (exact, then prefix) first. */
  async customers(text: string, limit: number): Promise<SearchCustomerDto[]> {
    const contains = `%${escapeLike(text)}%`;
    const prefix = `${escapeLike(text)}%`;
    const rows = await this.db.$queryRaw<Row[]>`
      SELECT c.id, c.customer_code AS code, c.full_name AS name, c.phone, c.area, c.status::text AS status,
             c.is_free AS "isFree", s.pppoe_username AS pppoe,
             COALESCE((SELECT SUM(i.amount_poisha - i.paid_poisha) FROM invoices i
                       WHERE i.customer_id = c.id AND i.status IN ('ISSUED', 'PARTIALLY_PAID')), 0) AS due,
             (SELECT l.online FROM line_status l
               WHERE l.router_id = s.router_id AND l.pppoe_username = s.pppoe_username) AS online
      FROM customers c
      LEFT JOIN subscriptions s ON s.customer_id = c.id
      WHERE c.full_name ILIKE ${contains} OR c.customer_code ILIKE ${contains}
         OR c.phone LIKE ${contains} OR s.pppoe_username ILIKE ${contains}
      ORDER BY (lower(c.customer_code) = lower(${text}) OR c.phone = ${text}
                OR lower(s.pppoe_username) = lower(${text})) DESC,
               (c.full_name ILIKE ${prefix} OR c.customer_code ILIKE ${prefix} OR c.phone LIKE ${prefix}) DESC,
               (c.status = 'TERMINATED') ASC, c.full_name
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      customerCode: r.code,
      fullName: r.name,
      phone: r.phone,
      area: r.area,
      status: r.status,
      isFree: r.isFree,
      pppoeUsername: r.pppoe,
      dueAmountPoisha: Number(r.due),
      online: r.online,
    }));
  }
}
