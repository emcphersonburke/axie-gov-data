import { AxisTickProps } from '@nivo/axes'
import React from 'react'

export default function ChartTick<Value extends string>({
  value,
  format,
  x,
  y,
  lineX,
  lineY,
  textX,
  textY,
  textBaseline,
  textAnchor,
  opacity = 1,
  rotate = 0,
  animatedProps,
  onClick,
}: AxisTickProps<Value>) {
  // Ensure the text is split correctly
  const textValue = format ? format(value) : String(value)
  const lines = textValue.split('\n')

  return (
    <g
      transform={`translate(${x},${y})`}
      opacity={opacity}
      onClick={onClick ? (event) => onClick(event, value) : undefined}
    >
      <line x1={0} y1={0} x2={lineX} y2={lineY} stroke="white" />
      <text
        x={textX}
        y={textY + 8}
        textAnchor={textAnchor}
        dominantBaseline={textBaseline}
        style={{
          transform: `rotate(${rotate}deg)`,
          textTransform: animatedProps.textTransform.get() as
            | 'none'
            | 'capitalize'
            | 'uppercase'
            | 'lowercase'
            | 'full-width'
            | 'full-size-kana',
          fill: 'white',
          fontSize: '11px',
        }}
      >
        {lines.map((line, index) => (
          <tspan key={index} x={textX} dy={index === 0 ? 0 : '12px'}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}
