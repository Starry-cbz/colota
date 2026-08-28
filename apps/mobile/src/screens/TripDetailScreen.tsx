/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo, useState, useCallback, useLayoutEffect, useEffect, useRef } from "react"
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, PanResponder, useWindowDimensions } from "react-native"
import {
  Route,
  Clock,
  Gauge,
  TrendingUp,
  TrendingDown,
  MapPin,
  Share,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  type LucideIcon
} from "lucide-react-native"
import { useTheme } from "../hooks/useTheme"
import { fonts } from "../styles/typography"
import { Card } from "../components/ui/Card"
import { Container } from "../components/ui/Container"
import { TrackMap } from "../components/features/inspector/TrackMap"
import { InteractiveLineChart } from "../components/features/inspector/InteractiveLineChart"
import { getTripColor, computeTripStats, buildBoundaryOverrideMap, splitBlockedReason } from "../utils/trips"
import { formatDate, formatDistance, formatDuration, formatSpeed, formatTime } from "../utils/geo"
import { EXPORT_FORMATS, EXPORT_FORMAT_KEYS, type ExportFormat } from "../utils/exportConverters"
import { HIT_SLOP_LG } from "../constants"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import NativeLocationService from "../services/NativeLocationService"
import { BOUNDARY_ACTION_SPLIT } from "../types/global"
import type { Trip, ThemeColors, BoundaryAction } from "../types/global"
import type { RootScreenProps } from "../types/navigation"

const MAX_BARS = 120

/** Downsample an array to at most maxBars entries by averaging buckets. */
function downsample(values: number[], maxBars: number): number[] {
  if (values.length <= maxBars) return values
  const bucketSize = values.length / maxBars
  const result: number[] = []
  for (let i = 0; i < maxBars; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.floor((i + 1) * bucketSize)
    let sum = 0
    for (let j = start; j < end; j++) sum += values[j]
    result.push(sum / (end - start))
  }
  return result
}

export function TripDetailScreen({ route, navigation }: RootScreenProps<"Trip Detail">) {
  const { colors } = useTheme()
  const trip: Trip = route.params.trip
  const trips: Trip[] = route.params.trips
  const tripColor = getTripColor(trip.index)
  const [deleting, setDeleting] = useState(false)
  // The map reads a note back when the point is re-tapped, and the chevrons swap in a trip from
  // route.params, so a saved note has to be held here rather than inside the map.
  const [noteOverrides, setNoteOverrides] = useState<Record<number, string | undefined>>({})

  const stats = useMemo(() => computeTripStats(trip.locations), [trip])
  const duration = trip.endTime - trip.startTime
  const displayName = `行程 ${trip.index}`

  const [showExport, setShowExport] = useState(false)
  const [chartActiveIndex, setChartActiveIndex] = useState<number | null>(null)
  const [expandedChart, setExpandedChart] = useState<"speed" | "elevation" | null>(null)
  const { height: windowHeight } = useWindowDimensions()
  const screenHeight = Math.max(windowHeight || 800, 600)
  const collapsedSheetHeight = Math.min(390, screenHeight * 0.48)
  const expandedSheetHeight = Math.min(720, screenHeight * 0.88)
  const collapsedOffset = expandedSheetHeight - collapsedSheetHeight
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const sheetOffset = useRef(new Animated.Value(collapsedOffset)).current
  const sheetStartOffset = useRef(collapsedOffset)

  useEffect(() => {
    const target = sheetExpanded ? 0 : collapsedOffset
    sheetStartOffset.current = target
    Animated.spring(sheetOffset, {
      toValue: target,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.8
    }).start()
  }, [sheetExpanded, collapsedOffset, sheetOffset])

  const toggleSheet = useCallback(() => setSheetExpanded((expanded) => !expanded), [])
  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        sheetOffset.stopAnimation((value) => {
          sheetStartOffset.current = value
        })
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(0, Math.min(collapsedOffset, sheetStartOffset.current + gesture.dy))
        sheetOffset.setValue(next)
      },
      onPanResponderRelease: (_, gesture) => {
        const current = sheetStartOffset.current + gesture.dy
        const shouldExpand = gesture.vy < -0.35 || current < collapsedOffset / 2
        setSheetExpanded(shouldExpand)
      },
      onPanResponderTerminate: () => setSheetExpanded(sheetStartOffset.current < collapsedOffset / 2)
    })
  ).current
  // Without these, a boundary the user merged reads as a plain gap and refuses to split
  const [boundaryOverrides, setBoundaryOverrides] = useState<Map<string, BoundaryAction>>(() => new Map())
  // Splitting before they arrive would judge a merged boundary as a plain gap and refuse a legal split
  const [boundariesLoaded, setBoundariesLoaded] = useState(false)

  useEffect(() => {
    let active = true
    NativeLocationService.getBoundaryOverrides()
      .then((o) => {
        if (active) setBoundaryOverrides(buildBoundaryOverrideMap(o))
      })
      // Split stays available on plain gaps; only merged boundaries stop being offered
      .catch((error) => logger.error("[TripDetail] Boundary override load failed:", error))
      .finally(() => {
        if (active) setBoundariesLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const currentIdx = trips.findIndex((t) => t.index === trip.index)
  const prevTrip = currentIdx > 0 ? trips[currentIdx - 1] : null
  const nextTrip = currentIdx >= 0 && currentIdx < trips.length - 1 ? trips[currentIdx + 1] : null

  // Reset transient UI state when switching to a different trip.
  useEffect(() => {
    setChartActiveIndex(null)
    setExpandedChart(null)
    setShowExport(false)
  }, [trip.index])

  const goToTrip = useCallback(
    (target: Trip | null) => {
      if (!target) return
      navigation.setParams({ trip: target })
    },
    [navigation]
  )

  const handlePointNoteChange = useCallback(async (id: number, note: string | null) => {
    try {
      await NativeLocationService.updateLocationNote(id, note)
      setNoteOverrides((prev) => ({ ...prev, [id]: note ?? undefined }))
    } catch (error) {
      logger.error("[TripDetail] Note update failed:", error)
      showAlert("保存失败", "无法保存备注，请重试。", "error")
    }
  }, [])

  const splittingRef = useRef(false)
  const handlePointSplit = useCallback(
    async (id: number) => {
      if (splittingRef.current) return
      if (!boundariesLoaded) {
        showAlert("无法在此拆分", "仍在加载此行程的编辑记录，请稍后重试。", "info")
        return
      }
      // A trip's locations are a contiguous run of the day, so the preceding point is the one
      // that ends the trip.
      const idx = trip.locations.findIndex((l) => l.id === id)
      const blocked = splitBlockedReason(trip.locations, idx, boundaryOverrides)
      if (blocked) {
        showAlert("无法在此拆分", blocked, "info")
        return
      }
      const at = trip.locations[idx].timestamp
      const confirmed = await showConfirm({
        // The confirm covers the popup, so name the point in it
        title: at ? `从 ${formatTime(at, true)} 开始新行程？` : "拆分行程？",
        message: "从此位置点开始的内容将成为单独行程。位置数据不会改变，之后可重新合并两个行程来撤销。",
        confirmText: "拆分"
      })
      if (!confirmed) return
      splittingRef.current = true
      try {
        await NativeLocationService.addBoundaryOverrides([
          {
            before_timestamp: trip.locations[idx - 1].timestamp ?? 0,
            after_timestamp: trip.locations[idx].timestamp ?? 0,
            action: BOUNDARY_ACTION_SPLIT
          }
        ])
        // This trip no longer exists in the form we are showing, and the day view refetches
        // on focus, so going back is what applies the new boundary.
        navigation.goBack()
      } catch (error) {
        logger.error("[TripDetail] Split failed:", error)
        showAlert("拆分失败", "无法在此处拆分行程，请重试。", "error")
      } finally {
        splittingRef.current = false
      }
    },
    [trip, boundaryOverrides, boundariesLoaded, navigation]
  )

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      try {
        const dateStr = new Date(trip.startTime * 1000).toISOString().slice(0, 10)
        const fileName = `colota_trip${trip.index}_${dateStr}${EXPORT_FORMATS[format].extension}`
        const filePath = await NativeLocationService.exportTripsToFile(
          [{ index: trip.index, color: getTripColor(trip.index), startTs: trip.startTime, endTs: trip.endTime }],
          format,
          fileName
        )
        await NativeLocationService.shareFile(
          filePath,
          EXPORT_FORMATS[format].mimeType,
          `Colota ${displayName} - ${dateStr}`
        )
        setShowExport(false)
      } catch (error) {
        logger.error("[TripDetail] Export failed:", error)
        showAlert("导出失败", "无法导出，请重试。", "error")
      }
    },
    [trip, displayName]
  )

  const handleDelete = useCallback(async () => {
    const confirmed = await showConfirm({
      title: `删除${displayName}？`,
      message: `这会从设备中永久删除 ${trip.locationCount} 个位置点。尚未发送的位置点将不会上传。`,
      confirmText: "删除",
      destructive: true
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await NativeLocationService.deleteLocationsInRange(trip.startTime, trip.endTime)
      navigation.goBack()
    } catch (error) {
      logger.error("[TripDetail] Delete failed:", error)
      showAlert("删除失败", "无法删除行程，请重试。", "error")
      setDeleting(false)
    }
  }, [trip, displayName, navigation])

  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={handleDelete}
        disabled={deleting}
        hitSlop={8}
        style={({ pressed }) => [styles.headerBtn, (pressed || deleting) && { opacity: colors.pressedOpacity }]}
      >
        <Trash2 size={20} color={colors.error} />
      </Pressable>
    ),
    [handleDelete, deleting, colors.error, colors.pressedOpacity]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  const speedProfile = useMemo(() => {
    const raw = trip.locations.filter((loc) => loc.speed != null).map((loc) => loc.speed ?? 0)
    return downsample(raw, MAX_BARS)
  }, [trip])

  const elevationProfile = useMemo(() => {
    const raw = trip.locations.filter((loc) => loc.altitude != null).map((loc) => loc.altitude ?? 0)
    return downsample(raw, MAX_BARS)
  }, [trip])

  const maxSpeed = useMemo(() => speedProfile.reduce((max, v) => Math.max(max, v), 0), [speedProfile])
  const minElevation = useMemo(
    () => elevationProfile.reduce((min, v) => Math.min(min, v), Infinity),
    [elevationProfile]
  )
  const maxElevation = useMemo(
    () => elevationProfile.reduce((max, v) => Math.max(max, v), -Infinity),
    [elevationProfile]
  )
  const elevationRange = maxElevation - minElevation

  return (
    <Container>
      <View style={styles.screen}>
        <View style={styles.mapContainer}>
        <TrackMap
          locations={trip.locations}
          colors={colors}
          trackColor={tripColor}
          fitVersion={trip.index}
          noteOverrides={noteOverrides}
          onPointNoteChange={handlePointNoteChange}
          onPointSplit={handlePointSplit}
        />
        </View>
        <Animated.View
          testID="trip-detail-sheet"
          style={[
            styles.sheet,
            {
              height: expandedSheetHeight,
              backgroundColor: colors.background,
              transform: [{ translateY: sheetOffset }]
            }
          ]}
        >
          <View
            testID="trip-detail-sheet-handle"
            style={styles.sheetHandleArea}
            {...sheetPanResponder.panHandlers}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sheetExpanded ? "收起行程详情" : "展开行程详情"}
              accessibilityState={{ expanded: sheetExpanded }}
              onPress={toggleSheet}
              style={({ pressed }) => [styles.sheetHandleButton, pressed && { opacity: colors.pressedOpacity }]}
              hitSlop={8}
            >
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetHandleText, { color: colors.textSecondary }]}>
                {sheetExpanded ? "收起详情" : "向上展开详情"}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
        {/* Header */}
        <View style={styles.section}>
          <View style={styles.headerTitleRow}>
            <Pressable
              onPress={() => goToTrip(prevTrip)}
              disabled={!prevTrip}
              hitSlop={HIT_SLOP_LG}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: colors.pressedOpacity }]}
            >
              <ChevronLeft size={24} color={prevTrip ? colors.primary : colors.textDisabled} />
            </Pressable>
            <View style={styles.headerTitleCenter}>
              <View style={styles.headerTitleLine}>
                <View style={[styles.dot, { backgroundColor: tripColor }]} />
                <Text style={[styles.title, { color: colors.text }]}>{displayName}</Text>
              </View>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {formatDate(trip.startTime)} · {formatTime(trip.startTime, true)} - {formatTime(trip.endTime, true)}
              </Text>
            </View>
            <Pressable
              onPress={() => goToTrip(nextTrip)}
              disabled={!nextTrip}
              hitSlop={HIT_SLOP_LG}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: colors.pressedOpacity }]}
            >
              <ChevronRight size={24} color={nextTrip ? colors.primary : colors.textDisabled} />
            </Pressable>
          </View>
        </View>

        {/* Stats grid */}
        <View style={[styles.statsGrid, styles.section]}>
          <StatCard icon={Route} label="距离" value={formatDistance(trip.distance)} colors={colors} />
          <StatCard icon={Clock} label="时长" value={formatDuration(duration)} colors={colors} />
          <StatCard icon={Gauge} label="平均速度" value={formatSpeed(stats.avgSpeed)} colors={colors} />
          <StatCard icon={MapPin} label="位置点" value={String(trip.locationCount)} colors={colors} />
          {stats.elevationGain > 0 && (
            <StatCard
              icon={TrendingUp}
              label="累计爬升"
              value={`${Math.round(stats.elevationGain)}m`}
              colors={colors}
            />
          )}
          {stats.elevationLoss > 0 && (
            <StatCard
              icon={TrendingDown}
              label="累计下降"
              value={`${Math.round(stats.elevationLoss)}m`}
              colors={colors}
            />
          )}
        </View>

        {/* Speed profile */}
        {speedProfile.length > 2 && (
          <View style={styles.section}>
            <Card style={styles.chartCard}>
              <View style={styles.chartTitleRow}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>速度</Text>
                <View style={styles.chartTitleActions}>
                  <Text style={[styles.chartRange, { color: colors.textSecondary }]}>最高 {formatSpeed(maxSpeed)}</Text>
                  <Pressable
                    accessibilityLabel={expandedChart === "speed" ? "收起速度图表" : "展开速度图表"}
                    onPress={() => setExpandedChart((current) => (current === "speed" ? null : "speed"))}
                    hitSlop={8}
                    style={({ pressed }) => [styles.chartExpandBtn, pressed && { opacity: colors.pressedOpacity }]}
                  >
                    {expandedChart === "speed" ? (
                      <Minimize2 size={16} color={colors.textSecondary} />
                    ) : (
                      <Maximize2 size={16} color={colors.textSecondary} />
                    )}
                  </Pressable>
                </View>
              </View>
              <InteractiveLineChart
                data={speedProfile}
                color={colors.info}
                textColor={colors.text}
                backgroundColor={colors.card}
                height={expandedChart === "speed" ? 280 : 140}
                formatValue={(v) => formatSpeed(v).replace(/\.\d+/, "")}
                activeIndex={chartActiveIndex}
                onActiveIndexChange={setChartActiveIndex}
              />
              <View style={styles.chartLabels}>
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                  <Text key={frac} style={[styles.chartLabel, { color: colors.textSecondary }]}>
                    {formatTime(Math.round(trip.startTime + frac * duration))}
                  </Text>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* Elevation profile */}
        {elevationProfile.length > 2 && elevationRange > 0 && (
          <View style={styles.section}>
            <Card style={styles.chartCard}>
              <View style={styles.chartTitleRow}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>海拔</Text>
                <View style={styles.chartTitleActions}>
                  <Text style={[styles.chartRange, { color: colors.textSecondary }]}>
                    {Math.round(minElevation)}m - {Math.round(maxElevation)}m
                  </Text>
                  <Pressable
                    accessibilityLabel={expandedChart === "elevation" ? "收起海拔图表" : "展开海拔图表"}
                    onPress={() => setExpandedChart((current) => (current === "elevation" ? null : "elevation"))}
                    hitSlop={8}
                    style={({ pressed }) => [styles.chartExpandBtn, pressed && { opacity: colors.pressedOpacity }]}
                  >
                    {expandedChart === "elevation" ? (
                      <Minimize2 size={16} color={colors.textSecondary} />
                    ) : (
                      <Maximize2 size={16} color={colors.textSecondary} />
                    )}
                  </Pressable>
                </View>
              </View>
              <InteractiveLineChart
                data={elevationProfile}
                color={colors.primary}
                textColor={colors.text}
                backgroundColor={colors.card}
                height={expandedChart === "elevation" ? 280 : 140}
                formatValue={(v) => `${Math.round(v)}m`}
                activeIndex={chartActiveIndex}
                onActiveIndexChange={setChartActiveIndex}
              />
              <View style={styles.chartLabels}>
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                  <Text key={frac} style={[styles.chartLabel, { color: colors.textSecondary }]}>
                    {formatDistance(trip.distance * frac)}
                  </Text>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* Export */}
        <View style={styles.section}>
          <Pressable
            onPress={() => setShowExport((prev) => !prev)}
            style={({ pressed }) => [
              styles.exportBtn,
              { backgroundColor: colors.primary, borderRadius: colors.borderRadius },
              pressed && { opacity: 0.8 }
            ]}
          >
            <Share size={16} color={colors.textOnPrimary} />
            <Text style={[styles.exportBtnText, { color: colors.textOnPrimary }]}>导出行程</Text>
          </Pressable>

          {showExport && (
            <View style={styles.exportRow}>
              {EXPORT_FORMAT_KEYS.map((fmt) => (
                <Pressable
                  key={fmt}
                  onPress={() => handleExport(fmt)}
                  style={({ pressed }) => [
                    styles.exportChip,
                    { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                >
                  <Text style={[styles.exportChipText, { color: colors.primary }]}>{EXPORT_FORMATS[fmt].label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Container>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  colors
}: {
  icon: LucideIcon
  label: string
  value: string
  colors: ThemeColors
}) {
  return (
    <Card style={styles.statCard}>
      <Icon size={16} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 12
  },
  mapContainer: {
    flex: 1
  },
  screen: {
    flex: 1,
    overflow: "hidden"
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 12
  },
  sheetHandleArea: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 2
  },
  sheetHandleButton: {
    alignItems: "center",
    minHeight: 30,
    minWidth: 150,
    justifyContent: "center",
    gap: 4
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2
  },
  sheetHandleText: {
    fontSize: 11,
    ...fonts.regular
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: "center",
    gap: 4
  },
  headerTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  navBtn: {
    padding: 4
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  title: {
    fontSize: 20,
    ...fonts.bold
  },
  subtitle: {
    fontSize: 13,
    ...fonts.regular,
    textAlign: "center"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statCard: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: "30%",
    flex: 1
  },
  statValue: {
    fontSize: 16,
    ...fonts.bold
  },
  statLabel: {
    fontSize: 11,
    ...fonts.regular,
    textTransform: "uppercase"
  },
  chartCard: {
    padding: 12
  },
  chartTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  chartTitleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  chartExpandBtn: {
    padding: 2
  },
  chartTitle: {
    fontSize: 14,
    ...fonts.semiBold
  },
  chartRange: {
    fontSize: 11,
    ...fonts.regular
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingLeft: 40
  },
  chartLabel: {
    fontSize: 10,
    ...fonts.regular
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14
  },
  exportBtnText: {
    fontSize: 15,
    ...fonts.semiBold
  },
  exportRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12
  },
  exportChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1
  },
  exportChipText: {
    fontSize: 12,
    ...fonts.bold
  },
  headerBtn: {
    padding: 8
  }
})
