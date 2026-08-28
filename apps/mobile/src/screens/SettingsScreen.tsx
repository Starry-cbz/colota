/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useMemo, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { StyleSheet, View, ScrollView, Linking, DeviceEventEmitter } from "react-native"
import { TRACKING_PRESETS, API_TEMPLATES } from "../types/global"
import type { RootScreenProps } from "../types/navigation"
import NativeLocationService from "../services/NativeLocationService"
import { useTracking } from "../contexts/TrackingProvider"
import { SectionTitle, Card, Container, Divider, StatsCard, ListItem } from "../components"
import {
  ExternalLink,
  Cloud,
  Navigation,
  Braces,
  UserRoundPen,
  Palette,
  Database,
  Download,
  Upload,
  Map,
  ScrollText,
  ShieldCheck,
  Info,
  Heart,
  Clock,
  Share2
} from "lucide-react-native"
import { logger } from "../utils/logger"

type Props = RootScreenProps<"Settings">

export function SettingsScreen({ navigation }: Props) {
  const { settings } = useTracking()

  const [queueCount, setQueueCount] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)

  const updateStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats()
      setQueueCount(stats.queued)
      setSentCount(stats.sent)
      setTodayCount(stats.today)
    } catch (err) {
      logger.error("[SettingsScreen] Failed to get stats:", err)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      updateStats()
      const subs = [
        DeviceEventEmitter.addListener("onLocationUpdate", updateStats),
        DeviceEventEmitter.addListener("onSyncProgress", updateStats),
        DeviceEventEmitter.addListener("onSyncError", updateStats)
      ]
      return () => subs.forEach((s) => s.remove())
    }, [updateStats])
  )

  useEffect(() => {
    updateStats()
  }, [settings.isOfflineMode, settings.endpoint, updateStats])

  const connectionSummary = useMemo(() => {
    if (settings.isOfflineMode) return "离线模式 · 保存到本地"
    if (!settings.endpoint) return "未配置服务器"
    try {
      return new URL(settings.endpoint).host
    } catch {
      return settings.endpoint
    }
  }, [settings.isOfflineMode, settings.endpoint])

  const syncSummary = useMemo(() => {
    const preset = settings.syncPreset
    if (preset !== "custom" && TRACKING_PRESETS[preset]) {
      return `${TRACKING_PRESETS[preset].label} · 每 ${settings.interval} 秒`
    }
    return `自定义 · 每 ${settings.interval} 秒`
  }, [settings.syncPreset, settings.interval])

  const apiSummary = useMemo(() => {
    const template = settings.apiTemplate
    if (template === "custom") {
      const fieldCount = Object.values(settings.fieldMap).filter(Boolean).length + settings.customFields.length
      return `Custom (${fieldCount} field${fieldCount === 1 ? "" : "s"})`
    }
    return API_TEMPLATES[template]?.label ?? "Custom"
  }, [settings.apiTemplate, settings.fieldMap, settings.customFields])

  const handleNavigateDataManagement = useCallback(() => {
    navigation.navigate("Data Management")
  }, [navigation])

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StatsCard
          queueCount={queueCount}
          sentCount={sentCount}
          todayCount={todayCount}
          interval={settings.interval.toString()}
          onManageClick={handleNavigateDataManagement}
        />

        <View style={styles.section}>
          <Card>
            <ListItem
              testID="nav-connection"
              icon={Cloud}
              label="连接"
              sub={connectionSummary}
              onPress={() => navigation.navigate("Connection")}
            />
            <Divider />
            <ListItem
              testID="nav-tracking-sync"
              icon={Navigation}
              label="跟踪与同步"
              sub={syncSummary}
              onPress={() => navigation.navigate("Tracking & Sync")}
            />
            {!settings.isOfflineMode && (
              <>
                <Divider />
                <ListItem
                  testID="nav-api-config"
                  icon={Braces}
                  label="API 字段映射"
                  sub={apiSummary}
                  onPress={() => navigation.navigate("API Config")}
                />
              </>
            )}
            <Divider />
            <ListItem
              testID="nav-tracking-profiles"
              icon={UserRoundPen}
              label="跟踪配置方案"
              sub="根据条件自动切换 GPS 设置"
              onPress={() => navigation.navigate("Tracking Profiles")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>显示</SectionTitle>
          <Card>
            <ListItem
              testID="nav-appearance"
              icon={Palette}
              label="外观"
              sub="主题、单位、时间格式和地图图块"
              onPress={() => navigation.navigate("Appearance")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>数据</SectionTitle>
          <Card>
            <ListItem
              testID="nav-data-management"
              icon={Database}
              label="数据管理"
              sub="查看队列并清理数据"
              onPress={() => navigation.navigate("Data Management")}
            />
            <Divider />
            <ListItem
              testID="nav-import-locations"
              icon={Download}
              label="导入位置"
              sub="从 GeoJSON 或 Google 时间轴文件合并位置"
              onPress={() => navigation.navigate("Import Locations")}
            />
            <Divider />
            <ListItem
              testID="nav-export-locations"
              icon={Upload}
              label="导出位置"
              sub="将位置导出为 CSV、GeoJSON、GPX 或 KML"
              onPress={() => navigation.navigate("Export Locations")}
            />
            <Divider />
            <ListItem
              testID="nav-auto-export"
              icon={Clock}
              label="自动导出"
              sub="安排每日、每周或每月导出"
              onPress={() => navigation.navigate("Auto-Export")}
            />
            <Divider />
            <ListItem
              testID="nav-backup-restore"
              icon={ShieldCheck}
              label="备份与恢复"
              sub="加密备份所有数据"
              onPress={() => navigation.navigate("Backup & Restore")}
            />
            <Divider />
            <ListItem
              testID="nav-share-setup"
              icon={Share2}
              label="分享配置"
              sub="将设置、地理围栏和配置方案作为链接分享"
              onPress={() => navigation.navigate("Share Setup")}
            />
            <Divider />
            <ListItem
              testID="nav-offline-maps"
              icon={Map}
              label="离线地图"
              sub="下载地图图块，以便离线使用"
              onPress={() => navigation.navigate("Offline Maps")}
            />
            <Divider />
            <ListItem
              testID="nav-logging"
              icon={ScrollText}
              label="日志"
              sub="查看活动日志并配置文件日志"
              onPress={() => navigation.navigate("Logging")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <Card>
            <ListItem
              testID="nav-about"
              icon={Info}
              label="关于 Colota"
              sub="版本、许可证和链接"
              onPress={() => navigation.navigate("About Colota")}
            />
            <Divider />
            <ListItem
              testID="nav-support"
              icon={Heart}
              label="支持"
              sub="支持应用开发"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              accessibilityHint="打开外部支持页面"
              onPress={() => Linking.openURL("https://mxd.codes/support")}
            />
          </Card>
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16
  },
  section: {
    marginBottom: 24
  }
})
