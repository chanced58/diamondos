import { fitStatTableColumns } from '../stat-table-layout';

describe('fitStatTableColumns', () => {
  it('should keep the widths when the columns overflow a phone', () => {
    expect(fitStatTableColumns(375, 132, Array(14).fill(48))).toEqual({ labelWidth: 132, columnWidths: Array(14).fill(48) });
  });

  it('should keep the widths before the table has been measured', () => {
    expect(fitStatTableColumns(0, 150, [48, 64])).toEqual({ labelWidth: 150, columnWidths: [48, 64] });
  });

  it('should widen the name column first, up to double, then share the rest', () => {
    // 834 wide: 150 + 7×48 + 64 = 550 used, 284 spare → name +150, 134 over 8 columns → +16 each.
    const columns = [48, 48, 48, 48, 48, 48, 48, 64];
    expect(fitStatTableColumns(834, 150, columns)).toEqual({
      labelWidth: 300,
      columnWidths: [64, 64, 64, 64, 64, 64, 64, 80],
    });
  });

  it('should give a little spare width all to the name column', () => {
    expect(fitStatTableColumns(260, 150, [48, 48])).toEqual({ labelWidth: 164, columnWidths: [48, 48] });
  });
});
