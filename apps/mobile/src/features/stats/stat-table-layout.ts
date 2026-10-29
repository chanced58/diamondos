/**
 * Column widths for `StatTable`. On a phone the columns keep their own widths
 * and scroll sideways. On a wider screen (an iPad) the spare width goes first
 * to the pinned name column, up to double its width, so names stop being cut
 * short, and the rest is shared evenly by the stat columns, so the table fills
 * the screen instead of stopping part-way across.
 */
export interface StatTableLayout {
  labelWidth: number;
  columnWidths: number[];
}

export function fitStatTableColumns(tableWidth: number, labelWidth: number, columnWidths: number[]): StatTableLayout {
  const used = labelWidth + columnWidths.reduce((sum, width) => sum + width, 0);
  const spare = Math.floor(tableWidth - used);
  if (spare <= 0) return { labelWidth, columnWidths };

  const labelExtra = Math.min(spare, labelWidth);
  const perColumn = columnWidths.length > 0 ? Math.floor((spare - labelExtra) / columnWidths.length) : 0;
  return {
    labelWidth: labelWidth + labelExtra,
    columnWidths: columnWidths.map((width) => width + perColumn),
  };
}
