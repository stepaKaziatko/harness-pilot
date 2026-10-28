import { describe, expect, it } from 'vitest';
import { OrderRejectedError } from './portfolio.js';
import { priceAt } from './quotes/simulator.js';
import { appFor, fakeDeps, NOW, orderRequest } from './testing/fakes.js';

const valid = { symbol: 'AAA', side: 'buy', quantity: 3 };

function setup() {
  const deps = fakeDeps();
  return {
    deps,
    post: (body: unknown, extra = {}) => appFor(deps)('/api/orders', orderRequest(body, extra)),
  };
}

describe('POST /api/orders', () => {
  it('fills at the server price and answers 201 with the operation', async () => {
    const { deps, post } = setup();
    const res = await post(valid, {
      headers: { 'content-type': 'application/json', 'x-pilot-user': 'u-b' },
    });
    const price = priceAt(5, 'AAA', 10_000, NOW).priceCents;
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      symbol: 'AAA',
      side: 'buy',
      quantity: 3,
      priceCents: price,
      totalCents: 3 * price,
    });
    expect(deps.portfolio.placed).toEqual([
      { userId: 'u-b', symbol: 'AAA', side: 'buy', quantity: 3, priceCents: price },
    ]);
  });

  it('accepts a charset on the content type and sells too', async () => {
    const { deps, post } = setup();
    const res = await post(
      { symbol: 'BBB', side: 'sell', quantity: 1 },
      { headers: { 'content-type': 'Application/JSON; charset=utf-8' } },
    );
    expect(res.status).toBe(201);
    expect(deps.portfolio.placed[0]).toMatchObject({ side: 'sell', symbol: 'BBB' });
  });

  it('ignores a price sent by the client', async () => {
    const { deps, post } = setup();
    await post({ ...valid, priceCents: 1, price: 1, totalCents: 3 });
    const price = priceAt(5, 'AAA', 10_000, NOW).priceCents;
    expect(deps.portfolio.placed[0]?.priceCents).toBe(price);
  });

  it('is 400 INVALID_SIDE for anything but buy or sell', async () => {
    for (const side of ['hold', 'BUY', 1, null, undefined]) {
      const { deps, post } = setup();
      const res = await post({ ...valid, side });
      expect(res).toMatchObject({ status: 400, body: { code: 'INVALID_SIDE' } });
      expect(deps.portfolio.placed).toEqual([]);
    }
  });

  it('is 400 INVALID_QUANTITY unless a whole number from 1 to 10000', async () => {
    for (const quantity of [0, -1, 1.5, 10_001, '3', null, undefined, Number.NaN]) {
      const { deps, post } = setup();
      const res = await post({ ...valid, quantity });
      expect(res, String(quantity)).toMatchObject({
        status: 400,
        body: { code: 'INVALID_QUANTITY' },
      });
      expect(deps.portfolio.placed).toEqual([]);
    }
    expect((await setup().post({ ...valid, quantity: 10_000 })).status).toBe(201);
  });

  it('is 404 UNKNOWN_SYMBOL for a symbol that does not exist', async () => {
    for (const symbol of ['ZZZ', '', 5, null, undefined, '__proto__']) {
      const { deps, post } = setup();
      const res = await post({ ...valid, symbol });
      expect(res).toMatchObject({ status: 404, body: { code: 'UNKNOWN_SYMBOL' } });
      expect(deps.portfolio.placed).toEqual([]);
    }
  });

  it('is 400 UNKNOWN_USER for an unknown X-Pilot-User', async () => {
    const { deps, post } = setup();
    const res = await post(valid, {
      headers: { 'content-type': 'application/json', 'x-pilot-user': 'nobody' },
    });
    expect(res).toMatchObject({ status: 400, body: { code: 'UNKNOWN_USER' } });
    expect(deps.portfolio.placed).toEqual([]);
  });

  it('is 409 for the two rejections a store can raise', async () => {
    for (const code of ['INSUFFICIENT_FUNDS', 'INSUFFICIENT_POSITION'] as const) {
      const { deps, post } = setup();
      deps.portfolio.failWith = new OrderRejectedError(code);
      expect(await post(valid)).toMatchObject({ status: 409, body: { code } });
    }
  });

  it('is 500 INTERNAL_ERROR when the store fails unexpectedly', async () => {
    const { deps, post } = setup();
    deps.portfolio.failWith = new Error('bug');
    expect(await post(valid)).toMatchObject({ status: 500, body: { code: 'INTERNAL_ERROR' } });
  });
});

describe('POST body checks run before the handler', () => {
  const post = (extra: object) => {
    const deps = fakeDeps();
    return appFor(deps)('/api/orders', { method: 'POST', ...extra }).then((res) => ({ res, deps }));
  };

  it('is 415 for text/plain, forms, multipart and a missing content type', async () => {
    const types: (string | undefined)[] = [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      'application/jsonp',
      undefined,
    ];
    for (const type of types) {
      const { res, deps } = await post({
        headers: type ? { 'content-type': type } : {},
        body: JSON.stringify(valid),
      });
      expect(res, String(type)).toMatchObject({
        status: 415,
        body: { code: 'UNSUPPORTED_MEDIA_TYPE' },
      });
      expect(deps.portfolio.placed).toEqual([]);
    }
  });

  it('is 413 PAYLOAD_TOO_LARGE when the adapter flags an oversized body', async () => {
    const { res, deps } = await post({
      headers: { 'content-type': 'application/json' },
      bodyTooLarge: true,
    });
    expect(res).toMatchObject({ status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(deps.portfolio.placed).toEqual([]);
  });

  it('is 400 INVALID_JSON for broken, empty and non-object bodies', async () => {
    for (const body of ['{', '', 'null', '[]', '"x"', '12', undefined]) {
      const { res, deps } = await post({
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body }),
      });
      expect(res, String(body)).toMatchObject({ status: 400, body: { code: 'INVALID_JSON' } });
      expect(deps.portfolio.placed).toEqual([]);
    }
  });
});
