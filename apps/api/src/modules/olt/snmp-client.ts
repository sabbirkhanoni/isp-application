import snmp from 'net-snmp';

export interface SnmpTarget {
  host: string;
  port: number;
  community: string;
}

export interface SnmpRow {
  oid: string;
  value: unknown;
}

/** Port for reading an SNMP table column; the driver below uses SNMP v2c, read-only. */
export interface SnmpClient {
  walk(target: SnmpTarget, oid: string): Promise<SnmpRow[]>;
}

const TIMEOUT_MS = 5_000;
const MAX_ROWS = 20_000;

export class NetSnmpClient implements SnmpClient {
  walk(target: SnmpTarget, oid: string): Promise<SnmpRow[]> {
    return new Promise((resolve, reject) => {
      const session = snmp.createSession(target.host, target.community, {
        port: target.port,
        version: snmp.Version2c,
        timeout: TIMEOUT_MS,
        retries: 1,
      });
      const rows: SnmpRow[] = [];
      let finished = false;
      const finish = (error?: Error): void => {
        if (finished) return;
        finished = true;
        session.close();
        if (error) reject(error);
        else resolve(rows);
      };
      session.on('error', (error: Error) => finish(error));
      session.subtree(
        oid,
        20,
        // net-snmp stops the walk when the feed callback returns true; ours never does (typings say otherwise).
        ((varbinds: snmp.Varbind[]) => {
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) continue;
            if (rows.length < MAX_ROWS) rows.push({ oid: vb.oid, value: vb.value });
          }
        }) as unknown as snmp.FeedCallback,
        (error?: Error | null) => finish(error ?? undefined),
      );
    });
  }
}
