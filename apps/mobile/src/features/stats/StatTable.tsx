import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export interface StatColumn<Row> {
  key: string;
  label: string;
  value: (row: Row) => string | number;
  /** Highlight a cell (e.g. a non-zero error count). */
  emphasize?: (row: Row) => boolean;
}

/** The pinned name column's key in `sort` and `onSort`. */
export const NAME_COLUMN_KEY = 'name';

interface StatTableProps<Row> {
  rows: Row[];
  rowKey: (row: Row) => string;
  rowLabel: (row: Row) => string;
  columns: StatColumn<Row>[];
  /** A totals row under the players, already formatted. */
  totals?: Record<string, string | number>;
  emptyText: string;
  /** Header for the pinned name column. */
  labelHeader?: string;
  /** The pinned name column's width; wider for names carrying a team. */
  labelWidth?: number;
  /** The sorted column, marked with an arrow. Rows arrive already sorted. */
  sort?: { key: string; ascending: boolean };
  /** Makes the headers tappable; the name header sends `NAME_COLUMN_KEY`. */
  onSort?: (key: string) => void;
  /** Makes each name tappable, e.g. to open the player's detail. */
  onPressRow?: (row: Row) => void;
  /** Which rows `onPressRow` applies to (default every row), e.g. teams that have a page. */
  isRowPressable?: (row: Row) => boolean;
  /** Tints a row, e.g. your own team in a league table. */
  highlightRow?: (row: Row) => boolean;
}

const DEFAULT_NAME_WIDTH = 132;
const CELL_WIDTH = 48;

/**
 * A stats table that fits a phone: names stay pinned on the left while the
 * stat columns scroll sideways, so a long line never squeezes the names.
 */
export function StatTable<Row>({
  rows,
  rowKey,
  rowLabel,
  columns,
  totals,
  emptyText,
  labelHeader = 'Player',
  labelWidth = DEFAULT_NAME_WIDTH,
  sort,
  onSort,
  onPressRow,
  isRowPressable,
  highlightRow,
}: StatTableProps<Row>) {
  if (rows.length === 0) return <Text className="text-sm text-gray-400 px-4 py-4">{emptyText}</Text>;

  const rowClass = 'h-10 justify-center border-b border-gray-100';
  const arrow = (key: string) => (sort?.key === key ? (sort.ascending ? ' ↑' : ' ↓') : '');
  // Same class shape on every row: only the background value changes.
  const tint = (row: Row) => (highlightRow?.(row) ? 'bg-blue-50' : 'bg-white');
  const headerText = (key: string) => (sort?.key === key ? 'text-blue-700' : 'text-gray-600');

  return (
    <View className="flex-row bg-white">
      <View style={{ width: labelWidth }}>
        <TouchableOpacity
          disabled={!onSort}
          accessibilityRole={onSort ? 'button' : undefined}
          accessibilityLabel={onSort ? `Sort by ${labelHeader}` : undefined}
          onPress={() => onSort?.(NAME_COLUMN_KEY)}
          className={`${rowClass} bg-gray-50 px-3`}
        >
          <Text className={`text-xs font-semibold ${headerText(NAME_COLUMN_KEY)}`}>
            {labelHeader}
            {arrow(NAME_COLUMN_KEY)}
          </Text>
        </TouchableOpacity>
        {rows.map((row) => {
          const pressable = Boolean(onPressRow) && (isRowPressable?.(row) ?? true);
          return (
            <TouchableOpacity
              key={rowKey(row)}
              disabled={!pressable}
              accessibilityRole={pressable ? 'button' : undefined}
              onPress={() => onPressRow?.(row)}
              className={`${rowClass} px-3 ${tint(row)}`}
            >
              <Text className={`text-sm font-medium ${pressable ? 'text-blue-700' : 'text-gray-900'}`} numberOfLines={1}>
                {rowLabel(row)}
              </Text>
            </TouchableOpacity>
          );
        })}
        {totals && (
          <View className={`${rowClass} px-3 bg-gray-50`}>
            <Text className="text-sm font-semibold text-gray-700">Totals</Text>
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className={`${rowClass} flex-row items-center bg-gray-50`}>
            {columns.map((column) => (
              <TouchableOpacity
                key={column.key}
                disabled={!onSort}
                accessibilityRole={onSort ? 'button' : undefined}
                accessibilityLabel={onSort ? `Sort by ${column.label}` : undefined}
                onPress={() => onSort?.(column.key)}
                style={{ width: CELL_WIDTH }}
                className="h-10 justify-center"
              >
                <Text numberOfLines={1} className={`text-center text-xs font-semibold ${headerText(column.key)}`}>
                  {column.label}
                  {arrow(column.key)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {rows.map((row) => (
            <View key={rowKey(row)} className={`${rowClass} flex-row items-center ${tint(row)}`}>
              {columns.map((column) => (
                <Text
                  key={column.key}
                  style={{ width: CELL_WIDTH }}
                  className={`text-center text-sm ${column.emphasize?.(row) ? 'font-semibold text-red-600' : 'text-gray-800'}`}
                >
                  {column.value(row)}
                </Text>
              ))}
            </View>
          ))}
          {totals && (
            <View className={`${rowClass} flex-row items-center bg-gray-50`}>
              {columns.map((column) => (
                <Text key={column.key} style={{ width: CELL_WIDTH }} className="text-center text-sm font-semibold text-gray-700">
                  {totals[column.key] ?? ''}
                </Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
