import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import {
  FIELDER_SPRAY_POSITIONS,
  FIELDING_POSITION_NUMBERS,
  SPRAY_FIELD,
  fieldPointFromSpray,
  sprayFromFieldPoint,
} from '@baseball/shared';

/** Fielder markers are tap targets thumbed in a dugout — 40pt, not a dot. */
const MARKER_SIZE = 40;

/**
 * The field web's SprayChartPicker draws, in the same 240×200 drawing space,
 * so a location tapped here is the same sprayX / sprayY web would record.
 *
 * The drawing never takes touches itself: a Pressable over it turns a tap into
 * a point in the drawing (scaled from the measured size), and the fielder
 * markers sit above that as ordinary buttons, so tapping a marker picks a
 * fielder without also moving the ball.
 */
export function FieldDiagram({
  location,
  selectedFielder,
  showFielders = true,
  onPlaceBall,
  onPressFielder,
}: {
  location: { sprayX: number; sprayY: number } | null;
  selectedFielder: number | null;
  /** False on a home run: nobody fielded it, so there is nobody to pick. */
  showFielders?: boolean;
  onPlaceBall: (point: { sprayX: number; sprayY: number }) => void;
  onPressFielder: (position: number) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function handlePress(event: GestureResponderEvent) {
    if (size.width === 0 || size.height === 0) return;
    const { locationX, locationY } = event.nativeEvent;
    onPlaceBall(
      sprayFromFieldPoint(
        (locationX / size.width) * SPRAY_FIELD.width,
        (locationY / size.height) * SPRAY_FIELD.height,
      ),
    );
  }

  const ball = location ? fieldPointFromSpray(location.sprayX, location.sprayY) : null;

  return (
    <View
      testID="field-diagram-frame"
      style={{ width: '100%', aspectRatio: SPRAY_FIELD.width / SPRAY_FIELD.height }}
      onLayout={handleLayout}
    >
      <Pressable
        testID="field-diagram"
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        onPress={handlePress}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SPRAY_FIELD.width} ${SPRAY_FIELD.height}`}
          pointerEvents="none"
        >
          <Rect x={0} y={0} width={240} height={200} fill="#e0f2fe" />
          <Path d="M 120 185 L 14 79 A 150 150 0 0 1 226 79 Z" fill="#86efac" />
          <Circle cx={120} cy={132} r={52} fill="#d4a76a" />
          <Polygon points="120,185 165,140 120,95 75,140" fill="#a3c97c" />
          <Polygon points="120,185 165,140 120,95 75,140" fill="none" stroke="#374151" strokeWidth={1.5} />
          <Path d="M 14 79 A 150 150 0 0 1 226 79" stroke="#374151" strokeWidth={2.5} fill="none" />
          <Line x1={120} y1={185} x2={14} y2={79} stroke="#6b7280" strokeWidth={1} strokeDasharray="5 3" />
          <Line x1={120} y1={185} x2={226} y2={79} stroke="#6b7280" strokeWidth={1} strokeDasharray="5 3" />
          <Circle cx={120} cy={131} r={7} fill="#c8956c" stroke="#92644e" strokeWidth={1.5} />
          <Polygon points="165,134 171,140 165,146 159,140" fill="white" stroke="#374151" strokeWidth={1.5} />
          <Polygon points="120,89 126,95 120,101 114,95" fill="white" stroke="#374151" strokeWidth={1.5} />
          <Polygon points="75,134 81,140 75,146 69,140" fill="white" stroke="#374151" strokeWidth={1.5} />
          <Polygon points="120,196 130,188 127,178 113,178 110,188" fill="white" stroke="#374151" strokeWidth={1.5} />
          {ball && (
            <>
              <Circle cx={ball.x} cy={ball.y} r={11} fill="#ef4444" opacity={0.25} />
              <Circle cx={ball.x} cy={ball.y} r={5} fill="#ef4444" />
              <Circle cx={ball.x} cy={ball.y} r={2} fill="white" />
            </>
          )}
        </Svg>
      </Pressable>

      {showFielders && size.width > 0 &&
        FIELDING_POSITION_NUMBERS.map(({ number, abbr }) => {
          const spot = FIELDER_SPRAY_POSITIONS[number];
          const point = fieldPointFromSpray(spot.sprayX, spot.sprayY);
          const left = (point.x / SPRAY_FIELD.width) * size.width - MARKER_SIZE / 2;
          const top = (point.y / SPRAY_FIELD.height) * size.height - MARKER_SIZE / 2;
          const selected = selectedFielder === number;
          return (
            <TouchableOpacity
              key={number}
              testID={`fielder-marker-${number}`}
              accessibilityRole="button"
              accessibilityLabel={abbr}
              accessibilityState={{ selected }}
              onPress={() => onPressFielder(number)}
              style={{
                position: 'absolute',
                left,
                top,
                width: MARKER_SIZE,
                height: MARKER_SIZE,
                borderRadius: MARKER_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                backgroundColor: selected ? '#1d4ed8' : 'rgba(255,255,255,0.9)',
                borderColor: selected ? '#1e3a8a' : '#475569',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? '#ffffff' : '#0f172a' }}>
                {abbr}
              </Text>
            </TouchableOpacity>
          );
        })}
    </View>
  );
}
