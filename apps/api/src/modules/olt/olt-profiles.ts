import type { OltBrand } from '@isp/contracts';

export interface OltProfile {
  /** Column that holds each ONU's received optical power. */
  rxOid: string | null;
  /** Column that holds each ONU's MAC or serial, used to find the customer. Same row index as rxOid. */
  idOid: string | null;
  /** Raw value ÷ divisor = dBm (ignored when the OLT answers with text that already has a decimal point). */
  divisor: number;
  /** Shown to the admin so they know how far to trust the preset. */
  verified: 'MIB' | 'CHECK';
}

/**
 * Presets per brand. rx columns come from the vendors' published MIBs; the "id" columns and the VSOL
 * units were not confirmed on real hardware: the OLT screen's Test button shows raw values so a wrong
 * preset is easy to spot and fix with the OID fields.
 */
export const OLT_PROFILES: Record<OltBrand, OltProfile> = {
  // NMS-EPON-ONU::opModuleRxPower, unit 0.1 dB.
  BDCOM: {
    rxOid: '1.3.6.1.4.1.3320.101.10.5.1.5',
    idOid: '1.3.6.1.4.1.3320.101.10.1.1.3',
    divisor: 10,
    verified: 'MIB',
  },
  // HUAWEI-XPON-MIB::hwGponOntOpticalDdmRxPower, unit 0.01 dBm. idOid = ONT serial number.
  HUAWEI: {
    rxOid: '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4',
    idOid: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3',
    divisor: 100,
    verified: 'MIB',
  },
  // V1600D::onuOpmPowerRx. Units not documented in the MIB.
  VSOL_EPON: {
    rxOid: '1.3.6.1.4.1.37950.1.1.5.12.2.1.14.1.3',
    idOid: null,
    divisor: 10,
    verified: 'CHECK',
  },
  // V1600G::gOnuOpticalInfoRxPwr, an OctetString (text such as "-18.5").
  VSOL_GPON: {
    rxOid: '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.7',
    idOid: null,
    divisor: 1,
    verified: 'CHECK',
  },
  // C-Data publishes no ONU RX column in its public MIB: the OID must be entered by the admin.
  CDATA: { rxOid: null, idOid: null, divisor: 10, verified: 'CHECK' },
};

const strip = (oid: string): string => oid.replace(/^\./, '');

export interface EffectiveProfile {
  rxOid: string;
  idOid: string | null;
  divisor: number;
}

/** The OLT's own OIDs win over the brand preset. null = nothing to read (CDATA without an OID). */
export function effectiveProfile(
  brand: OltBrand,
  own: { rxOid: string | null; idOid: string | null; divisor: number | null },
): EffectiveProfile | null {
  const preset = OLT_PROFILES[brand];
  const rxOid = own.rxOid ?? preset.rxOid;
  if (!rxOid) return null;
  return {
    rxOid: strip(rxOid),
    idOid: own.idOid ? strip(own.idOid) : preset.idOid,
    divisor: own.divisor ?? preset.divisor,
  };
}

/** Anything outside this range is an "invalid" marker (e.g. Huawei 2147483647), not a reading. */
const MIN_DBM = -60;
const MAX_DBM = 15;

/** Raw SNMP value → dBm, or null when the OLT reports no usable reading. */
export function toDbm(raw: unknown, divisor: number): number | null {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  const match = /-?\d+(\.\d+)?/.exec(text);
  if (!match) return null;
  const number = Number(match[0]);
  const value = match[1] ? number : number / divisor;
  if (!Number.isFinite(value) || value < MIN_DBM || value > MAX_DBM) return null;
  return Math.round(value * 100) / 100;
}

/** MAC or serial → comparable key: upper-case letters and digits only. */
export function normalizeOnuKey(raw: unknown): string {
  if (Buffer.isBuffer(raw)) {
    const printable = raw.length > 0 && raw.every((b) => b >= 0x20 && b < 0x7f);
    if (printable) return normalizeText(raw.toString('utf8'));
    // Huawei serial: 4 ASCII vendor letters + 4 binary bytes.
    const vendor = raw.subarray(0, 4);
    if (raw.length === 8 && vendor.every((b) => b >= 0x41 && b <= 0x5a)) {
      return vendor.toString('ascii') + raw.subarray(4).toString('hex').toUpperCase();
    }
    return raw.toString('hex').toUpperCase();
  }
  return normalizeText(String(raw));
}

export const normalizeText = (text: string): string => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Row index of a table value: the part of the OID after the column OID. */
export function indexOf(column: string, fullOid: string): string | null {
  const base = `${strip(column)}.`;
  const oid = strip(fullOid);
  return oid.startsWith(base) ? oid.slice(base.length) : null;
}
