import React, { Children, Fragment } from 'react';
import { View } from 'react-native';

/** Groups ListRows into one rounded card with hairline dividers between them. */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="rounded-xl overflow-hidden border border-gray-200 bg-white">
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <View className="h-px bg-gray-100 ml-4" />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}
