/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useCallback, useMemo } from "react"
import { View, PanResponder, LayoutChangeEvent } from "react-native"
import Svg, { Path, Line, Circle, Rect, Text as SvgText } from "react-native-svg"
import { clamp } from "../../../utils/format"

interface InteractiveLineChartProps {
  data: number[]
  color: string
  fillColor?: string
  textColor: string
  backgroundColor: string
  formatValue: (value: number) => string
  height?: number
  activeIndex?: number | null
  onActiveIndexChange?: (index: number | null) => void
}

const CHART_PADDING = { top: 24, bottom: 20, left: 40, right: 0 }
const TOOLTIP_WIDTH = 70
const TOOLTIP_HEIGHT = 22

function buildSmoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return ""
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  let path = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    path += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return path
}

export function InteractiveLineChart({
  data,
  color,
  fillColor,
  textColor,
  backgroundColor,
  formatValue,
  height = 140,
  activeIndex: externalIndex,
  onActiveIndexChange
}: InteractiveLineChartProps) {
  const [chartWidth, setChartWidth] = useState(0)
  const [internalIndex, setInternalIndex] = useState<number | null>(null)
  const activeIndex = externalIndex !== undefined ? externalIndex : internalIndex
  const setActiveIndex = onActiveIndexChange ?? setInternalIndex
  const widthRef = useRef(0)
  const dataRef = useRef(data)
  dataRef.current = data

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    setChartWidth(w)
    widthRef.current = w
  }, [])

  const getIndexFromX = useCallback((x: number): number | null => {
    const w = widthRef.current
    const d = dataRef.current
    if (w === 0 || d.length === 0) return null
    const plotW = w - CHART_PADDING.left - CHART_PADDING.right
    const clampedX = clamp(x - CHART_PADDING.left, 0, plotW)
    const idx = Math.round((clampedX / plotW) * (d.length - 1))
    return clamp(idx, 0, d.length - 1)
  }, [])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setActiveIndex(getIndexFromX(e.nativeEvent.locationX))
        },
        onPanResponderMove: (e) => {
          setActiveIndex(getIndexFromX(e.nativeEvent.locationX))
        },
        onPanResponderRelease: () => {
          setActiveIndex(null)
        },
        onPanResponderTerminate: () => {
          setActiveIndex(null)
        }
      }),
    [getIndexFromX, setActiveIndex]
  )

  if (data.length < 2 || chartWidth === 0) {
    return <View style={{ height }} onLayout={onLayout} />
  }

  const plotW = chartWidth - CHART_PADDING.left - CHART_PADDING.right
  const plotH = height - CHART_PADDING.top - CHART_PADDING.bottom
  const minVal = data.reduce((min, v) => Math.min(min, v), Infinity)
  const maxVal = data.reduce((max, v) => Math.max(max, v), -Infinity)
  const range = maxVal - minVal || 1

  const toX = (i: number) => CHART_PADDING.left + (i / (data.length - 1)) * plotW
  const toY = (v: number) => CHART_PADDING.top + (1 - (v - minVal) / range) * plotH

  // Build SVG path
  const points = data.map((value, index) => [toX(index), toY(value)] as [number, number])
  const linePath = buildSmoothPath(points)

  // Fill path (area under curve)
  const fillPath = `${linePath} L ${toX(data.length - 1)} ${CHART_PADDING.top + plotH} L ${toX(0)} ${CHART_PADDING.top + plotH} Z`

  // Active point
  const activeX = activeIndex !== null ? toX(activeIndex) : 0
  const activeY = activeIndex !== null ? toY(data[activeIndex]) : 0
  const activeValue = activeIndex !== null ? formatValue(data[activeIndex]) : ""

  // Clamp tooltip position
  let tooltipX = activeX - TOOLTIP_WIDTH / 2
  if (tooltipX < 2) tooltipX = 2
  if (tooltipX + TOOLTIP_WIDTH > chartWidth - 2) tooltipX = chartWidth - TOOLTIP_WIDTH - 2

  return (
    <View style={{ height }} onLayout={onLayout} {...panResponder.panHandlers}>
      <Svg width={chartWidth} height={height}>
        {/* Area fill */}
        <Path d={fillPath} fill={fillColor ?? color + "20"} />

        {/* Line */}
        <Path d={linePath} stroke={color} strokeWidth={1.5} fill="none" />

        {/* Y-axis labels and grid lines */}
        {/* Y-axis labels */}
        {[0, 0.33, 0.67, 1].map((frac) => {
          const val = minVal + frac * range
          const y = CHART_PADDING.top + (1 - frac) * plotH
          return (
            <SvgText
              key={frac}
              x={CHART_PADDING.left - 6}
              y={y + 4}
              fill={textColor}
              fontSize={10}
              opacity={0.6}
              textAnchor="end"
            >
              {formatValue(val)}
            </SvgText>
          )
        })}

        {/* Cursor */}
        {activeIndex !== null && (
          <>
            {/* Vertical line */}
            <Line
              x1={activeX}
              y1={CHART_PADDING.top}
              x2={activeX}
              y2={CHART_PADDING.top + plotH}
              stroke={textColor}
              strokeWidth={1}
              opacity={0.4}
              strokeDasharray="4,3"
            />

            {/* Dot */}
            <Circle cx={activeX} cy={activeY} r={4} fill={color} stroke={backgroundColor} strokeWidth={2} />

            {/* Tooltip background */}
            <Rect x={tooltipX} y={2} width={TOOLTIP_WIDTH} height={TOOLTIP_HEIGHT} rx={6} fill={color} />

            {/* Tooltip text */}
            <SvgText
              x={tooltipX + TOOLTIP_WIDTH / 2}
              y={17}
              fill="#fff"
              fontSize={11}
              fontWeight="600"
              textAnchor="middle"
            >
              {activeValue}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  )
}
