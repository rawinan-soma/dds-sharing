import { describe, expect, it } from 'vitest';
import { describeArea } from './area';

describe('describeArea', () => {
  const lookup = [
    { provinceId: '10', nameTh: 'กรุงเทพมหานคร', healthRegion: 13 },
    { provinceId: '50', nameTh: 'เชียงใหม่', healthRegion: 1 },
    { provinceId: '51', nameTh: 'ลำพูน', healthRegion: 1 },
    { provinceId: '52', nameTh: 'ลำปาง', healthRegion: 1 },
  ];

  it('is national when no province is stored', () => {
    expect(describeArea([], lookup)).toEqual({ kind: 'national' });
  });

  it('names one province, with no region claimed', () => {
    expect(describeArea(['50'], lookup)).toEqual({
      kind: 'provinces',
      provinces: [{ id: '50', name: 'เชียงใหม่' }],
      region: null,
    });
  });

  it('recognises a whole health region as that region', () => {
    expect(describeArea(['52', '50', '51'], lookup)).toMatchObject({
      kind: 'provinces',
      region: 1,
      provinces: [
        { id: '50', name: 'เชียงใหม่' },
        { id: '51', name: 'ลำพูน' },
        { id: '52', name: 'ลำปาง' },
      ],
    });
  });

  it('does not call part of a region the region', () => {
    expect(describeArea(['50', '51'], lookup)).toMatchObject({ region: null });
  });
});
