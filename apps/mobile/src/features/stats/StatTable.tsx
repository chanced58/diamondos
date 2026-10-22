import { ScrollView, Text, View } from 'react-native';

export interface StatColumn<Row> {
  key: string;
  label: string;
  value: (row: Row) => string | number;
  /** Highlight a cell (e.g. a non-zero error count). */
  emphasize?: (row: Row) => boolean;
}

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
}

const NAME_WIDTH = 132;
const CELL_WIDTH = 48;

/**
 * A box-score table that fits a phone: names stay pinned on the left while the
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
}: StatTableProps<Row>) {
  if (rows.length === 0) return <Text className="text-sm text-gray-400 px-4 py-4">{emptyText}</Text>;

  const rowClass = 'h-10 justify-center border-b border-gray-100';
  return (
    <View className="flex-row bg-white">
      <View style={{ width: NAME_WIDTH }}>
        <View className={`${rowClass} bg-gray-50 px-3`}>
          <Text className="text-xs font-semibold text-gray-600">{labelHeader}</Text>
        </View>
        {rows.map((row) => (
          <View key={rowKey(row)} className={`${rowClass} px-3`}>
            <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
              {rowLabel(row)}
            </Text>
          </View>
        ))}
        {totals && (
          <View className={`${rowClass} px-3 bg-gray-50`}>
            <Text className="text-sm font-semibold text-gray-700">Totals</Text>
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className={`${rowClass} flex-row bg-gray-50`}>
            {columns.map((column) => (
              <Text key={column.key} style={{ width: CELL_WIDTH }} className="text-center text-xs font-semibold text-gray-600">
                {column.label}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View key={rowKey(row)} className={`${rowClass} flex-row`}>
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
            <View className={`${rowClass} flex-row bg-gray-50`}>
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
