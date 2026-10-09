import { StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { spacing } from '../../theme';
import { formatCompactCurrency } from '../../utils/format';
import type { SalesTrendPoint } from '../../types';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface SalesTrendProps {
  data: SalesTrendPoint[];
  /** Rendered on the dark hero card, so the palette is inverted. */
  onDark?: boolean;
  height?: number;
}

/**
 * Seven-day sales as bars.
 *
 * Deliberately a bar chart, not a line: the question a shopkeeper asks of this
 * is "which days were good", which is a comparison of discrete quantities.
 * Bars are also legible at 56px tall, where a line would be noise.
 *
 * Heights are relative to the best day, so the shape stays readable whether the
 * store took ₹800 or ₹80,000.
 */
export const SalesTrend = ({ data, onDark = false, height = 56 }: SalesTrendProps) => {
  if (data.length === 0) return null;

  const peak = Math.max(...data.map((point) => point.total), 1);
  const best = data.reduce((max, point) => (point.total > max.total ? point : max), data[0]!);

  const barColor = onDark ? 'rgba(255,255,255,0.34)' : 'rgba(23,166,115,0.22)';
  const bestColor = onDark ? '#FFFFFF' : undefined;
  const labelTone = onDark ? undefined : 'muted';

  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {data.map((point) => {
          const isBest = point.day === best.day && point.total > 0;
          // A floor of 3px keeps a zero day visible as a baseline tick rather
          // than a gap that reads as missing data.
          const barHeight = Math.max((point.total / peak) * height, 3);

          return (
            <View key={point.day} style={styles.column}>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isBest ? (bestColor ?? undefined) : barColor,
                  },
                  isBest && !onDark && styles.bestBar,
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.labels}>
        {data.map((point) => (
          <View key={`label-${point.day}`} style={styles.column}>
            <Text
              variant="caption"
              tone={labelTone}
              style={onDark ? styles.darkLabel : undefined}
              numberOfLines={1}
            >
              {DAY_INITIALS[new Date(point.day).getDay()]}
            </Text>
          </View>
        ))}
      </View>

      <Text
        variant="caption"
        tone={labelTone}
        style={[styles.caption, onDark ? styles.darkLabel : undefined]}
      >
        Best day {formatCompactCurrency(best.total)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  column: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', borderRadius: 4, minHeight: 3 },
  bestBar: { backgroundColor: 'rgba(23,166,115,0.85)' },
  labels: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  darkLabel: { color: 'rgba(255,255,255,0.7)' },
  caption: { marginTop: spacing.sm },
});
