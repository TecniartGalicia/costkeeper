import assert from 'node:assert/strict';
import { decideAfterValidation, decideOffline, GRACE_DAYS, looksLikeLicenseKey, REVALIDATE_HOURS, type LicenseState } from '../../core/license';
import { DIAS_GRATIS, recorteGratis } from '../../core/plan';
import { PRO_ACTIVO } from '../../pro/polarConfig';

const H = 3600_000;
const D = 86400_000;
const AHORA = new Date('2026-08-24T12:00:00Z');
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();

describe('plan gratuito', () => {
  it('recorta el histórico a los últimos 30 días', () => {
    const f = recorteGratis({ desde: '2020-01-01', hasta: '2026-08-24' }, false, AHORA);
    assert.equal(f.desde, '2026-07-25');
    assert.equal(DIAS_GRATIS, 30);
  });

  it('no amplía un rango que el usuario pidió más corto', () => {
    const f = recorteGratis({ desde: '2026-08-20' }, false, AHORA);
    assert.equal(f.desde, '2026-08-20');
  });

  it('con Pro no toca nada', () => {
    const f = recorteGratis({ desde: '2020-01-01' }, true, AHORA);
    assert.equal(f.desde, '2020-01-01');
  });
});

describe('extensión gratuita', () => {
  it('con Pro apagado no se cobra nada ni se pide licencia', () => {
    assert.equal(PRO_ACTIVO, false, 'esta versión se publica gratis');
  });

  it('con Pro apagado el histórico no se recorta', () => {
    // recorteGratis solo recorta cuando la decisión dice que no hay Pro, y con
    // PRO_ACTIVO en false proStatus siempre responde que sí.
    const f = recorteGratis({ desde: '2020-01-01' }, true, AHORA);
    assert.equal(f.desde, '2020-01-01');
  });
});

describe('licencia (dormida hasta que se active Pro)', () => {
  it('sin clave no hay Pro y no se toca la red', () => {
    assert.deepEqual(decideOffline({}, AHORA), { pro: false, reason: 'no-key' });
  });

  it('una validación reciente vale sin red', () => {
    const estado: LicenseState = { key: 'k', lastValidatedAt: hace(1 * H) };
    assert.deepEqual(decideOffline(estado, AHORA), { pro: true, source: 'validated' });
  });

  it('pasadas las horas de revalidación toca preguntar', () => {
    const estado: LicenseState = { key: 'k', lastValidatedAt: hace((REVALIDATE_HOURS + 1) * H) };
    assert.equal(decideOffline(estado, AHORA), undefined);
  });

  it('P-14 · sin red se respeta el periodo de gracia', () => {
    const estado: LicenseState = { key: 'k', lastValidatedAt: hace(3 * D) };
    const r = decideAfterValidation(estado, AHORA, { ok: false, kind: 'network' });
    assert.deepEqual(r.decision, { pro: true, source: 'grace' });
  });

  it('P-14 · pasada la gracia se apaga', () => {
    const estado: LicenseState = { key: 'k', lastValidatedAt: hace((GRACE_DAYS + 1) * D) };
    const r = decideAfterValidation(estado, AHORA, { ok: false, kind: 'network' });
    assert.deepEqual(r.decision, { pro: false, reason: 'grace-expired' });
  });

  it('P-14 · un negativo no es una trampa permanente: se vuelve a preguntar', () => {
    const estado: LicenseState = { key: 'k', status: 'revoked', lastCheckedAt: hace((REVALIDATE_HOURS + 1) * H) };
    assert.equal(decideOffline(estado, AHORA), undefined, 'pasadas las horas vuelve a preguntar');
    const reciente: LicenseState = { key: 'k', status: 'revoked', lastCheckedAt: hace(1 * H) };
    assert.deepEqual(decideOffline(reciente, AHORA), { pro: false, reason: 'revoked' });
  });

  it('P-14 · adelantar el reloj no amplía la gracia', () => {
    const estado: LicenseState = { key: 'k', lastValidatedAt: hace(3 * D) };
    const futuro = new Date(AHORA.getTime() + 60 * D);
    const r = decideAfterValidation(estado, futuro, { ok: false, kind: 'network' });
    assert.equal(r.decision.pro, false);
  });

  it('una respuesta positiva renueva la validación', () => {
    const r = decideAfterValidation({ key: 'k' }, AHORA, { ok: true, status: 'granted', expiresAt: null });
    assert.deepEqual(r.decision, { pro: true, source: 'validated' });
    assert.equal(r.next.lastValidatedAt, AHORA.toISOString());
  });

  it('una licencia caducada se apaga aunque el estado sea granted', () => {
    const r = decideAfterValidation({ key: 'k' }, AHORA, { ok: true, status: 'granted', expiresAt: hace(1 * D) });
    assert.deepEqual(r.decision, { pro: false, reason: 'expired' });
  });

  it('el desbloqueo de desarrollo no necesita clave', () => {
    assert.deepEqual(decideOffline({}, AHORA, true), { pro: true, source: 'dev' });
  });

  it('valida la forma de la clave antes de gastar una petición', () => {
    assert.equal(looksLikeLicenseKey('demasiado-corta'), false);
    assert.equal(looksLikeLicenseKey('CK-1234567890ABCDEF-XYZ'), true);
    assert.equal(looksLikeLicenseKey('con espacios y símbolos €'), false);
  });
});
