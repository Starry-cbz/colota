/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useRef } from "react"
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  NativeEventEmitter,
  NativeModules
} from "react-native"
import { Lightbulb } from "lucide-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { ScreenProps, DatabaseStats } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { fonts, fontSizes } from "../styles/typography"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { Button, SectionTitle, Card, Container, Divider, FloatingSaveIndicator } from "../components"
import { STATS_REFRESH_FAST, SAVE_SUCCESS_DISPLAY_MS } from "../constants"
import { useTimeout } from "../hooks/useTimeout"
import { showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"

const BACKUP_TIP = "提示：请先备份数据（设置 -> 备份与恢复）。"

export function DataManagementScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const isOfflineMode = settings.isOfflineMode

  const [stats, setStats] = useState<DatabaseStats>({
    queued: 0,
    sent: 0,
    total: 0,
    today: 0,
    databaseSizeMB: 0
  })

  const [daysInput, setDaysInput] = useState("90")
  const [isProcessing, setIsProcessing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const feedbackTimeout = useTimeout()

  // Update stats
  const updateStats = useCallback(async () => {
    try {
      const nativeStats = await NativeLocationService.getStats()
      setStats(nativeStats)
    } catch (err) {
      logger.error("[DataManagementScreen] Failed to update stats:", err)
    }
  }, [])

  // Load debug mode setting
  useFocusEffect(
    useCallback(() => {
      NativeLocationService.getSetting("debug_mode_enabled", "false").then((value) => {
        setDebugMode(value === "true")
      })
      updateStats()
      const interval = setInterval(updateStats, STATS_REFRESH_FAST)
      return () => clearInterval(interval)
    }, [updateStats])
  )

  // Show feedback message
  const showFeedback = useCallback(
    (message: string, duration = SAVE_SUCCESS_DISPLAY_MS) => {
      setFeedback(message)
      feedbackTimeout.set(() => setFeedback(null), duration)
    },
    [feedbackTimeout]
  )

  // Manual flush with progress
  const progressListenerRef = useRef<any>(null)
  const syncEmitter = useRef(new NativeEventEmitter(NativeModules.LocationServiceModule)).current
  const flushTimeout = useTimeout()

  const cleanupFlush = useCallback(async () => {
    progressListenerRef.current?.remove()
    progressListenerRef.current = null
    flushTimeout.clear()
    await updateStats()
    setIsProcessing(false)
  }, [updateStats, flushTimeout])

  const handleManualFlush = useCallback(async () => {
    if (isProcessing || stats.queued === 0) return
    const total = stats.queued

    try {
      setIsProcessing(true)
      setFeedback(`Syncing 0/${total}...`)
      feedbackTimeout.clear()

      const receivedProgress = { current: false }

      progressListenerRef.current = syncEmitter.addListener("onSyncProgress", (rawEvent: any) => {
        const event = rawEvent as { sent: number; failed: number; total: number }
        receivedProgress.current = true
        const processed = event.sent + event.failed
        if (processed >= event.total) {
          // Sync finished - show final result, then clean up
          const msg =
            event.failed > 0
              ? `Synced ${event.sent}/${event.total} (${event.failed} failed)`
              : `Synced ${event.sent}/${event.total}`
          setFeedback(msg)
          flushTimeout.set(async () => {
            await cleanupFlush()
            showFeedback("同步完成")
          }, 1500)
        } else {
          setFeedback(`同步中 ${processed}/${event.total}...`)
        }
      })

      // manualFlush is fire-and-forget; fall back after 30s if no progress events arrive
      await NativeLocationService.manualFlush()
      flushTimeout.set(async () => {
        await cleanupFlush()
        showFeedback(receivedProgress.current ? "同步完成" : "同步失败，请检查连接")
      }, 30000)
    } catch (err) {
      logger.error("[DataManagementScreen] Manual flush error:", err)
      await cleanupFlush()
      showFeedback("同步失败，请检查连接和端点。")
    }
  }, [stats.queued, isProcessing, showFeedback, feedbackTimeout, flushTimeout, syncEmitter, cleanupFlush])

  // Generic delete handler
  const handleDeleteAction = useCallback(
    async (action: () => Promise<number | void>, successMessage: (count: number) => string) => {
      setIsProcessing(true)
      try {
        const deleted = await action()
        await updateStats()
        if (typeof deleted === "number") {
          showFeedback(successMessage(deleted))
        }
      } catch (err) {
        logger.error("[DataManagementScreen] Delete action failed:", err)
        showFeedback("操作失败")
      } finally {
        setIsProcessing(false)
      }
    },
    [updateStats, showFeedback]
  )

  const handleClearSentHistory = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "清除已发送历史",
      message: `确定删除 ${stats.sent} 个已发送位置吗？此操作无法撤销。\n\n${BACKUP_TIP}`,
      confirmText: "清除",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.clearSentHistory().then(() => stats.sent),
      (count) => `已清除 ${count} 个已发送位置`
    )
  }, [handleDeleteAction, stats.sent])

  const handleClearQueue = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "清除队列",
      message: `确定删除 ${stats.queued} 个待发送位置吗？这些位置将不会同步。\n\n${BACKUP_TIP}`,
      confirmText: "清除",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.clearQueue(),
      (count) => `已清除 ${count} 个队列位置`
    )
  }, [handleDeleteAction, stats.queued])

  const handleDeleteAllLocations = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "删除所有位置",
      message: `确定删除全部 ${stats.total} 个已存储位置吗？此操作无法撤销。\n\n${BACKUP_TIP}`,
      confirmText: "全部删除",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.clearAllLocations(),
      (count) => `已删除 ${count} 个位置`
    )
  }, [handleDeleteAction, stats.total])

  const handleDeleteOlderThan = useCallback(async () => {
    const days = parseInt(daysInput, 10)
    if (isNaN(days) || days <= 0) {
      showFeedback("请输入有效的天数")
      return
    }

    const confirmed = await showConfirm({
      title: "删除旧位置",
      message: `确定删除早于 ${days} 天的所有位置吗？此操作无法撤销。\n\n${BACKUP_TIP}`,
      confirmText: "删除",
      destructive: true
    })
    if (!confirmed) return

    handleDeleteAction(
      () => NativeLocationService.deleteOlderThan(days),
      (count) => `已删除 ${days} 天前的 ${count} 个位置`
    )
  }, [daysInput, handleDeleteAction, showFeedback])

  const handleInsertDummyData = useCallback(async () => {
    const confirmed = await showConfirm({
      title: "插入模拟数据",
      message: "插入过去 7 天约 200 个虚拟 GPS 位置？仅用于测试。",
      confirmText: "插入"
    })
    if (!confirmed) return

    setIsProcessing(true)
    try {
      const count = await NativeLocationService.insertDummyData()
      await updateStats()
      showFeedback(`已插入 ${count} 个模拟位置`)
    } catch (err) {
      logger.error("[DataManagementScreen] Insert dummy data failed:", err)
      showFeedback("插入模拟数据失败")
    } finally {
      setIsProcessing(false)
    }
  }, [updateStats, showFeedback])

  const handleVacuum = useCallback(async () => {
    setIsProcessing(true)
    try {
      const sizeBefore = stats.databaseSizeMB
      await NativeLocationService.vacuumDatabase()
      const freshStats = await NativeLocationService.getStats()
      setStats(freshStats)
      const freed = sizeBefore - freshStats.databaseSizeMB
      if (freed > 0.01) {
        showFeedback(`已释放 ${freed.toFixed(2)} MB`)
      } else {
        showFeedback("数据库已经是最佳状态")
      }
    } catch (err) {
      logger.error("[DataManagementScreen] Vacuum failed:", err)
      showFeedback("优化失败")
    } finally {
      setIsProcessing(false)
    }
  }, [stats.databaseSizeMB, showFeedback])

  return (
    <Container>
      <KeyboardAvoidingView style={styles.keyboardAvoid} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>数据管理</Text>
          </View>

          {/* Stats */}
          <View style={styles.section}>
            <SectionTitle>数据库统计</SectionTitle>
            <Card>
              {[
                ["位置总数", stats.total.toLocaleString(), colors.text],
                ...(!isOfflineMode
                  ? [
                      ["已发送", stats.sent.toLocaleString(), colors.success],
                      ["队列中", stats.queued.toLocaleString(), colors.warning]
                    ]
                  : []),
                ["今天", stats.today.toLocaleString(), colors.info],
                ["存储", `${stats.databaseSizeMB.toFixed(2)} MB`, colors.primary]
              ].map(([label, value, color], i, arr) => (
                <React.Fragment key={i}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={[styles.statValue, { color }]}>{value}</Text>
                  </View>
                  {i < arr.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Card>
          </View>

          {/* Queue Actions */}
          {!isOfflineMode && (
            <View style={styles.section}>
              <SectionTitle>队列操作</SectionTitle>
              <Card>
                <Button onPress={handleManualFlush} disabled={isProcessing || stats.queued === 0} title="立即同步" />
                <Text style={[styles.hint, { color: colors.textLight }]}>
                  {stats.queued === 0
                    ? "队列为空"
                    : `立即同步队列中的 ${stats.queued} 个位置`}
                </Text>
              </Card>
            </View>
          )}

          {/* Cleanup Actions */}
          <View style={styles.section}>
            <SectionTitle>清理操作</SectionTitle>
            <Card>
              {!isOfflineMode ? (
                <>
                  {/* Clear Sent History */}
                  <ActionRow
                    label="清除已发送历史"
                    hint="删除所有已成功发送的位置"
                    color={colors.success}
                    textColor={colors.textLight}
                    value={stats.sent.toLocaleString()}
                    onPress={handleClearSentHistory}
                    disabled={isProcessing || stats.sent === 0}
                  />
                  <Divider />

                  {/* Clear Queue */}
                  <ActionRow
                    label="清除队列"
                    hint="删除所有待发送的位置"
                    color={colors.warning}
                    textColor={colors.textLight}
                    value={stats.queued.toLocaleString()}
                    onPress={handleClearQueue}
                    disabled={isProcessing || stats.queued === 0}
                  />
                  <Divider />
                </>
              ) : (
                <>
                  {/* Delete All Locations (offline mode) */}
                  <ActionRow
                    label="删除所有位置"
                    hint="从数据库中移除所有已存储的位置"
                    color={colors.error}
                    textColor={colors.textLight}
                    value={stats.total.toLocaleString()}
                    onPress={handleDeleteAllLocations}
                    disabled={isProcessing || stats.total === 0}
                  />
                  <Divider />
                </>
              )}

              {/* Delete Older Than */}
              <View style={styles.actionColumn}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>删除旧位置</Text>
                <Text style={[styles.actionHint, { color: colors.textLight }]}>
                  删除早于指定天数的位置
                </Text>
                <View style={styles.daysInputRow}>
                  <TextInput
                    style={[
                      styles.daysInput,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.backgroundElevated
                      }
                    ]}
                    keyboardType="numeric"
                    value={daysInput}
                    onChangeText={setDaysInput}
                    placeholder="90"
                    placeholderTextColor={colors.placeholder}
                  />
                  <Text style={[styles.daysLabel, { color: colors.textSecondary }]}>天</Text>
                  <Button
                    style={[isProcessing && styles.buttonDisabled]}
                    onPress={handleDeleteOlderThan}
                    disabled={isProcessing}
                    title="删除"
                  />
                </View>
              </View>
              <Divider />

              {/* Vacuum */}
              <View style={styles.actionColumn}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>优化数据库</Text>
                <Text style={[styles.actionHint, { color: colors.textLight }]}>
                  回收未使用空间并提升性能
                </Text>
                <View style={styles.hintRow}>
                  <Lightbulb size={12} color={colors.textLight} />
                  <Text style={[styles.actionHint, { color: colors.textLight }]}>
                    大量删除后运行以回收空间
                  </Text>
                </View>
                <Button onPress={handleVacuum} disabled={isProcessing} title="优化" variant="secondary" />
              </View>
            </Card>
          </View>
          {/* Dev Tools */}
          {debugMode && (
            <View style={styles.section}>
              <SectionTitle>开发工具</SectionTitle>
              <Card>
                <View style={styles.actionColumn}>
                  <Text style={[styles.actionLabel, { color: colors.text }]}>插入模拟数据</Text>
                  <Text style={[styles.actionHint, { color: colors.textLight }]}>
                    生成过去 7 天约 200 个虚拟 GPS 位置，用于测试行程和日历
                  </Text>
                  <Button onPress={handleInsertDummyData} disabled={isProcessing} title="插入" variant="secondary" />
                </View>
              </Card>
            </View>
          )}
        </ScrollView>

        {/* Floating Feedback */}
        <FloatingSaveIndicator
          saving={isProcessing}
          success={false}
          message={feedback}
          isError={feedback?.includes("失败") ?? false}
          colors={colors}
        />
      </KeyboardAvoidingView>
    </Container>
  )
}

// ActionRow Component
const ActionRow = ({
  label,
  hint,
  color,
  textColor,
  value,
  onPress,
  disabled
}: {
  label: string
  hint: string
  color: string
  textColor: string
  value: string
  onPress: () => void
  disabled: boolean
}) => (
  <Pressable
    style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]}
    onPress={onPress}
    disabled={disabled}
  >
    <View style={styles.actionInfo}>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      <Text style={[styles.actionHint, { color: textColor }]}>{hint}</Text>
    </View>
    <View style={[styles.actionBadge, { backgroundColor: color + "20", borderColor: color }]}>
      <Text style={[styles.actionBadgeText, { color }]}>{value}</Text>
    </View>
  </Pressable>
)

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  header: {
    marginTop: 20,
    marginBottom: 24
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    marginBottom: 4
  },
  section: {
    marginBottom: 24
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8
  },
  statLabel: {
    fontSize: 14,
    ...fonts.medium
  },
  statValue: {
    fontSize: 16,
    ...fonts.bold
  },
  hint: {
    fontSize: 12,
    ...fonts.regular,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 16,
    marginTop: 8
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12
  },
  actionColumn: {
    paddingVertical: 12
  },
  actionInfo: {
    flex: 1
  },
  actionLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 4
  },
  actionHint: {
    fontSize: 12,
    ...fonts.regular,
    lineHeight: 16,
    marginTop: 2
  },
  actionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1
  },
  actionBadgeText: {
    fontSize: 13,
    ...fonts.bold
  },
  daysInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8
  },
  daysInput: {
    flex: 1,
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    fontSize: 15,
    textAlign: "center"
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2
  },
  daysLabel: {
    fontSize: 15,
    ...fonts.medium
  },
  buttonDisabled: {
    opacity: 0.5
  }
})
