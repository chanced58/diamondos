import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { hasMoreBelow } from './book-scroll';

/** On phones the book (count, bases, order) never shrinks below this, in points. */
export const BOOK_MIN_HEIGHT_PHONE = 200;

/**
 * The phone book's scroll view, with a "more below" chip while anything is
 * out of sight under the pad: a still ScrollView gives no sign that it
 * scrolls, and their pitcher and the batting order controls live down there.
 * Tapping the chip scrolls to the end.
 */
export function PhoneBookPane({ moreLabel, children }: { moreLabel: string; children: ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const showMore = hasMoreBelow({ viewportHeight, contentHeight, offsetY });
  return (
    <View testID="book-pane-phone" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: BOOK_MIN_HEIGHT_PHONE }}>
      <ScrollView
        indicatorStyle="black"
        ref={scrollRef}
        style={{ flex: 1 }}
        scrollEventThrottle={32}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_width, height) => setContentHeight(height)}
        onScroll={(event) => setOffsetY(event.nativeEvent.contentOffset.y)}
      >
        {children}
      </ScrollView>
      {showMore && (
        <View pointerEvents="box-none" className="absolute bottom-2 left-0 right-0 items-center">
          <TouchableOpacity
            testID="book-more-below"
            accessibilityRole="button"
            accessibilityLabel={`Scroll down to ${moreLabel}`}
            onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
            className="flex-row items-center px-3 py-1.5 rounded-full bg-slate-700"
          >
            <Text className="text-score-xs font-semibold text-white">{moreLabel} ▾</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
