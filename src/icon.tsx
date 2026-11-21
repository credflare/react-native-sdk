import React from "react";
import Svg, { Path } from "react-native-svg";
import { icons } from "@credflare/sdk-javascript";
import type { IconName } from "@credflare/sdk-javascript";

export function SpecIcon({ name, color, size }: { name: IconName; color: string; size?: number }) {
  const icon = icons[name];
  const side = size ?? icon.viewBox;
  return (
    <Svg width={side} height={side} viewBox={`0 0 ${icon.viewBox} ${icon.viewBox}`} accessible={false}>
      {icon.paths.map((path, index) => (
        <Path
          key={index}
          d={path.d}
          stroke={path.stroke ? color : "none"}
          strokeWidth={path.strokeWidth}
          strokeOpacity={path.strokeOpacity}
          fill={path.fill ? color : "none"}
          fillOpacity={path.fillOpacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
