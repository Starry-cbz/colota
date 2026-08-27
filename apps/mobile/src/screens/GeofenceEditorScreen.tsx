/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { View, Text, StyleSheet, ScrollView, Switch, TextInput, DeviceEventEmitter } from "react-native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { fonts } from "../styles/typography"
import { Container, SectionTitle, Card, SettingRow, Button, FieldMessage } from "../components"
import { Check, Trash2 } from "lucide-react-native"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"
import { parsePositiveInt, isPositiveInt } from "../utils/settingsValidation"
import type { RootScreenProps } from "../types/navigation"

declare function requestIdleCallback(callback: () => void): number
declare function cancelIdleCallback(handle: number): void

export function GeofenceEditorScreen({ navigation, route }: RootScreenProps<"Geofence Editor">) {
  const { colors } = useTheme()
  const geofenceId = route?.params?.geofenceId as number | undefined
  const isEditing = !!geofenceId

  const [name, setName] = useState<string>(route?.params?.name ?? "")
  const initialRadius = route?.params?.radius ?? inputToMeters(50)
  const [radiusStr, setRadiusStr] = useState(String(metersToInput(initialRadius)))
  const [radius, setRadius] = useState<number>(initialRadius)
  const [pauseTracking, setPauseTracking] = useState(true)
  const [pauseOnWifi, setPauseOnWifi] = useState(false)
  const [pauseOnMotionless, setPauseOnMotionless] = useState(false)
  const [motionlessTimeoutStr, setMotionlessTimeoutStr] = useState("1")
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(false)
  const [heartbeatIntervalStr, setHeartbeatIntervalStr] = useState("15")
  const [saving, setSaving] = useState(false)

  const savedState = useRef({
    name: route?.params?.name ?? ("" as string),
    radius: (route?.params?.radius ?? inputToMeters(50)) as number,
    pauseTracking: true,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutStr: "1",
    heartbeatEnabled: false,
    heartbeatIntervalStr: "15"
  })

  const hasChanges = useMemo(() => {
    const s = savedState.current
    return (
      name !== s.name ||
      radius !== s.radius ||
      pauseTracking !== s.pauseTracking ||
      pauseOnWifi !== s.pauseOnWifi ||
      pauseOnMotionless !== s.pauseOnMotionless ||
      parsePositiveInt(motionlessTimeoutStr, 10) !== parsePositiveInt(s.motionlessTimeoutStr, 10) ||
      heartbeatEnabled !== s.heartbeatEnabled ||
      parsePositiveInt(heartbeatIntervalStr, 15) !== parsePositiveInt(s.heartbeatIntervalStr, 15)
    )
  }, [
    name,
    radius,
    pauseTracking,
    pauseOnWifi,
    pauseOnMotionless,
    motionlessTimeoutStr,
    heartbeatEnabled,
    heartbeatIntervalStr
  ])

  useEffect(() => {
    if (!geofenceId) return

    let cancelled = false

    const handle = requestIdleCallback(() => {
      NativeLocationService.getGeofences()
        .then((geofences) => {
          if (cancelled) return
          const existing = geofences.find((g) => g.id === geofenceId)
          if (existing) {
            setName(existing.name)
            setRadiusStr(String(metersToInput(existing.radius)))
            setRadius(existing.radius)
            setPauseTracking(existing.pauseTracking)
            setPauseOnWifi(existing.pauseOnWifi)
            setPauseOnMotionless(existing.pauseOnMotionless)
            setMotionlessTimeoutStr(String(existing.motionlessTimeoutMinutes))
            setHeartbeatEnabled(existing.heartbeatEnabled ?? false)
            setHeartbeatIntervalStr(String(existing.heartbeatIntervalMinutes ?? 15))
            savedState.current = {
              name: existing.name,
              radius: existing.radius,
              pauseTracking: existing.pauseTracking,
              pauseOnWifi: existing.pauseOnWifi,
              pauseOnMotionless: existing.pauseOnMotionless,
              motionlessTimeoutStr: String(existing.motionlessTimeoutMinutes),
              heartbeatEnabled: existing.heartbeatEnabled ?? false,
              heartbeatIntervalStr: String(existing.heartbeatIntervalMinutes ?? 15)
            }
          }
        })
        .catch((err) => {
          if (cancelled) return
          logger.error("[GeofenceEditor] Failed to load geofence:", err)
          showAlert("错误", "加载地理围栏数据失败。", "error")
          navigation.goBack()
        })
    })

    return () => {
      cancelled = true
      cancelIdleCallback(handle)
    }
  }, [geofenceId, navigation])

  const handleRadiusChange = useCallback((val: string) => {
    setRadiusStr(val)
    const num = Number(val)
    if (!isNaN(num) && num > 0) setRadius(inputToMeters(num))
  }, [])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showAlert("缺少名称", "请输入名称。", "warning")
      return
    }
    if (radius <= 0) {
      showAlert("半径无效", "请输入有效半径。", "warning")
      return
    }
    const effectiveHeartbeat = parsePositiveInt(heartbeatIntervalStr, 15)
    const effectiveTimeout = parsePositiveInt(motionlessTimeoutStr, 10)

    setSaving(true)
    try {
      if (isEditing && geofenceId) {
        await NativeLocationService.updateGeofence({
          id: geofenceId,
          name: name.trim(),
          radius,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes: effectiveTimeout,
          heartbeatEnabled,
          heartbeatIntervalMinutes: effectiveHeartbeat
        })
      } else {
        const lat = route?.params?.lat as number
        const lon = route?.params?.lon as number
        await NativeLocationService.createGeofence({
          name: name.trim(),
          lat,
          lon,
          radius,
          enabled: true,
          pauseTracking,
          pauseOnWifi,
          pauseOnMotionless,
          motionlessTimeoutMinutes: effectiveTimeout,
          heartbeatEnabled,
          heartbeatIntervalMinutes: effectiveHeartbeat
        })
      }
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Save failed:", err)
      showAlert("错误", "保存地理围栏失败。", "error")
    } finally {
      setSaving(false)
    }
  }, [
    name,
    radius,
    pauseTracking,
    pauseOnWifi,
    pauseOnMotionless,
    motionlessTimeoutStr,
    heartbeatEnabled,
    heartbeatIntervalStr,
    isEditing,
    geofenceId,
    navigation,
    route
  ])

  const handleDelete = useCallback(async () => {
    if (!geofenceId) return
    const confirmed = await showConfirm({
      title: "删除地理围栏",
      message: `确定删除“${name}”吗？`,
      confirmText: "删除",
      destructive: true
    })
    if (!confirmed) return
    try {
      await NativeLocationService.deleteGeofence(geofenceId)
      DeviceEventEmitter.emit("geofenceUpdated")
      navigation.goBack()
    } catch (err) {
      logger.error("[GeofenceEditor] Delete failed:", err)
      showAlert("错误", "删除地理围栏失败。", "error")
    }
  }, [geofenceId, name, navigation])

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
  ]

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle>常规</SectionTitle>
        <Card style={styles.card}>
          <SettingRow label="名称">
            <TextInput
              testID="geofence-name-input"
              style={[inputStyle, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholder="例如：家、公司..."
              placeholderTextColor={colors.placeholder}
            />
          </SettingRow>
          <SettingRow label={`半径（${shortDistanceUnit()}）`}>
            <TextInput
              testID="geofence-radius-input"
              style={[inputStyle, styles.numInput]}
              value={radiusStr}
              onChangeText={handleRadiusChange}
              placeholder="50"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
            />
          </SettingRow>
        </Card>

        <SectionTitle>GPS 暂停选项</SectionTitle>
        <Card style={styles.card}>
          <SettingRow label="在区域内不记录" hint="暂停保存和同步" style={styles.toggleRow}>
            <Switch
              testID="pause-tracking-toggle"
              value={pauseTracking}
              onValueChange={setPauseTracking}
              trackColor={{ false: colors.border, true: colors.warning + "80" }}
              thumbColor={pauseTracking ? colors.warning : colors.border}
            />
          </SettingRow>

          <SettingRow
            label="WiFi/以太网暂停"
            hint="在非计费网络上停止 GPS"
            style={[styles.toggleRow, !pauseTracking && styles.disabledRow]}
          >
            <Switch
              testID="pause-wifi-toggle"
              value={pauseOnWifi}
              onValueChange={setPauseOnWifi}
              disabled={!pauseTracking}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={pauseOnWifi ? colors.primary : colors.border}
            />
          </SettingRow>

          <SettingRow
            label="静止暂停"
            hint="一段时间没有移动后停止 GPS"
            style={[styles.toggleRow, !pauseTracking && styles.disabledRow]}
          >
            <Switch
              testID="pause-motionless-toggle"
              value={pauseOnMotionless}
              onValueChange={setPauseOnMotionless}
              disabled={!pauseTracking}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={pauseOnMotionless ? colors.primary : colors.border}
            />
          </SettingRow>

          {pauseTracking && pauseOnMotionless && (
            <View style={[styles.nestedSetting, { borderLeftColor: colors.border }]}>
              <SettingRow label="超时（分钟）" hint="无移动多久后停止 GPS">
                <TextInput
                  testID="motionless-timeout-input"
                  style={[inputStyle, styles.numInput]}
                  value={motionlessTimeoutStr}
                  onChangeText={setMotionlessTimeoutStr}
                  placeholder="1"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                />
              </SettingRow>
              {!isPositiveInt(motionlessTimeoutStr) && (
                <FieldMessage variant="error">必须至少为 1 分钟</FieldMessage>
              )}
            </View>
          )}

          <SettingRow
            label="静止心跳"
            hint="暂停时按周期在区域中心记录位置点"
            style={[styles.toggleRow, !pauseTracking && styles.disabledRow]}
          >
            <Switch
              testID="heartbeat-toggle"
              value={heartbeatEnabled}
              onValueChange={setHeartbeatEnabled}
              disabled={!pauseTracking}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={heartbeatEnabled ? colors.primary : colors.border}
            />
          </SettingRow>

          {pauseTracking && heartbeatEnabled && (
            <View style={[styles.nestedSetting, { borderLeftColor: colors.border }]}>
              <SettingRow label="间隔（分钟）" hint="记录位置点的频率">
                <TextInput
                  testID="heartbeat-interval-input"
                  style={[inputStyle, styles.numInput]}
                  value={heartbeatIntervalStr}
                  onChangeText={setHeartbeatIntervalStr}
                  placeholder="15"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="number-pad"
                />
              </SettingRow>
              {!isPositiveInt(heartbeatIntervalStr) && (
                <FieldMessage variant="error">必须至少为 1 分钟</FieldMessage>
              )}
            </View>
          )}

          {pauseTracking && pauseOnWifi && pauseOnMotionless && (
            <View style={[styles.combinedNote, { borderTopColor: colors.border }]}>
              <Text style={[styles.combinedNoteText, { color: colors.textSecondary }]}>
                只有 WiFi 断开且检测到移动时，GPS 才会恢复
              </Text>
            </View>
          )}
        </Card>

        <Button
          title={saving ? "保存中..." : "保存地理围栏"}
          onPress={handleSave}
          disabled={
            saving ||
            (isEditing && !hasChanges) ||
            (heartbeatEnabled && !isPositiveInt(heartbeatIntervalStr)) ||
            (pauseOnMotionless && !isPositiveInt(motionlessTimeoutStr))
          }
          icon={Check}
        />
        {isEditing && <Button title="删除地理围栏" onPress={handleDelete} variant="danger" icon={Trash2} />}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  card: { marginBottom: 16 },
  input: {
    padding: 10,
    borderWidth: 1.5,
    borderRadius: 8,
    fontSize: 15
  },
  nameInput: { flex: 1 },
  numInput: { width: 80, textAlign: "center" },
  toggleRow: { paddingVertical: 10 },
  disabledRow: { opacity: 0.45 },
  nestedSetting: { marginLeft: 16, paddingLeft: 12, borderLeftWidth: 3, marginTop: 4, marginBottom: 4 },
  combinedNote: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  combinedNoteText: {
    fontSize: 12,
    ...fonts.regular,
    lineHeight: 17,
    fontStyle: "italic"
  }
})
