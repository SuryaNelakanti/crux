import { getRouteLabel, parseViaAnnotations } from './via';

describe('VIA annotation parsing', () => {
  it('parses VIA v2 polygon regions', () => {
    const parsed = parseViaAnnotations({
      _via_img_metadata: {
        image1: {
          filename: 'wall.jpg',
          regions: [
            {
              shape_attributes: {
                name: 'polygon',
                all_points_x: [1, 4, 4, 1],
                all_points_y: [1, 1, 4, 4],
              },
              region_attributes: { color: 'blue' },
            },
          ],
        },
      },
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0].filename).toBe('wall.jpg');
    expect(parsed[0].regions[0].polygon).toEqual([
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 4 },
      { x: 1, y: 4 },
    ]);
  });

  it('extracts route labels from common attribute names', () => {
    expect(getRouteLabel({ route_id: 4 })).toBe('4');
    expect(getRouteLabel({ color: 'pink' })).toBe('pink');
    expect(getRouteLabel({ irrelevant: 'x' })).toBeNull();
  });
});
