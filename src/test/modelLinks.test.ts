import { describe, expect, it } from 'vitest';
import { cleanModelLinks, readModelLinks, safePageHost } from '../utils/modelLinks';

describe('model links on a card', () => {
  it('only offers https pages with a host', () => {
    expect(safePageHost('https://www.live2d.com/en/learn/sample/hatsune-miku/')).toBe('www.live2d.com');
    expect(safePageHost('http://example.com/')).toBeNull();
    expect(safePageHost('javascript:alert(1)')).toBeNull();
    expect(safePageHost('file:///C:/Windows')).toBeNull();
    expect(safePageHost('https:///etc/passwd')).toBeNull();
    expect(safePageHost('https://exa mple.com')).toBeNull();
  });

  it('reads valid links and drops the rest', () => {
    const links = readModelLinks({
      otakusoul_model_links: [
        { kind: 'live2d', page_url: 'https://www.live2d.com/en/learn/sample/hatsune-miku/', name: ' Hatsune Miku ', license: '' },
        { kind: 'vrm', page_url: 'ftp://example.com/model.vrm' },
        { kind: 'pmx', page_url: 'https://example.com/' },
        'https://example.com/',
        null,
      ],
    });
    expect(links).toEqual([
      { kind: 'live2d', page_url: 'https://www.live2d.com/en/learn/sample/hatsune-miku/', name: 'Hatsune Miku', license: undefined },
    ]);
    expect(readModelLinks({ otakusoul_model_links: 'https://example.com/' })).toEqual([]);
    expect(readModelLinks(undefined)).toEqual([]);
  });

  it('saves nothing for empty rows', () => {
    expect(cleanModelLinks([{ kind: 'vrm', page_url: '  ' }])).toBeUndefined();
    expect(cleanModelLinks([{ kind: 'vrm', page_url: ' https://hub.vroid.com/x ', name: '' }])).toEqual([
      { kind: 'vrm', page_url: 'https://hub.vroid.com/x', name: undefined, license: undefined },
    ]);
  });
});
