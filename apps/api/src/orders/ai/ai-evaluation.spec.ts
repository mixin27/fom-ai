import { evaluateLocalAi } from '../../../scripts/evaluate-local-ai';
import { AppHttpException } from '../../common/http/app-http.exception';

describe('current prototype evaluation adapter', () => {
  it('scores the actual reviewed service response without filling unknowns', async () => {
    const result = {
      schema_version: '1.0' as const,
      draft: {
        customer: {
          name: null,
          phone: '0900123',
          township: null,
          address: null,
        },
        items: [{ product_name: 'Shirt', qty: 2, unit_price: null }],
        delivery_fee: 0,
        note: null,
      },
      evidence: [{ field: 'customer.phone', quote: '0900123' }],
      review_warnings: ['Price withheld'],
      model: 'local',
      elapsed_ms: 5,
    };
    const extract = jest.fn().mockResolvedValue(result);
    const row = await evaluateLocalAi(
      { id: 'test', text: 'message' },
      { extract },
    );
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledWith('message');
    expect(row).toMatchObject({ ...result, id: 'test', error: null });
  });

  it('retains rejected requests once, without exposing source/error text', async () => {
    const extract = jest.fn().mockRejectedValue(
      new AppHttpException(502, {
        code: 'AI_DRAFT_INVALID',
        message: 'private source text',
        context: { reason: 'unsupported_phone', field: 'customer.phone' },
      }),
    );
    const row = await evaluateLocalAi(
      { id: 'test', text: 'private' },
      { extract },
    );
    expect(extract).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({
      id: 'test',
      error: 'AI_DRAFT_INVALID',
      reason: 'unsupported_phone',
    });
    expect(JSON.stringify(row)).not.toContain('private');
    expect(row).not.toHaveProperty('draft');
  });
});
