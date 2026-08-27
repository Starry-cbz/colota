/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { ProfileService } from "../services/ProfileService"
import { showAlert } from "../services/modalService"
import { TrackingProfile, ProfileConditionType } from "../types/global"
import { fonts } from "../styles/typography"
import { Container, SectionTitle, Card, Divider, SettingRow, NumericInput, FieldMessage } from "../components"
import { Check } from "lucide-react-native"
import { logger } from "../utils/logger"
import { shortDistanceUnit, inputToMeters, metersToInput } from "../utils/geo"
import {
  MS_TO_KMH,
  PROFILE_CONDITIONS,
  SYNC_INTERVAL_PRESETS,
  SYNC_INTERVAL_LABELS,
  STATIONARY_MAX_INTERVAL_SECONDS,
  defaultProfileDelays
} from "../constants"
import type { RootScreenProps } from "../types/navigation"

function formatSyncDefault(seconds: number): string {
  if (SYNC_INTERVAL_LABELS[seconds]) return SYNC_INTERVAL_LABELS[seconds]
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)} min`
}

export function ProfileEditorScreen({ navigation, route }: RootScreenProps<"Profile Editor">) {
  const { colors } = useTheme()
  const { settings } = useTracking()
  const profileId = route?.params?.profileId as number | undefined
  const isEditing = !!profileId

  const [profile, setProfile] = useState<Omit<TrackingProfile, "id" | "createdAt">>({
    name: "",
    interval: settings.interval,
    distance: settings.distance,
    syncInterval: settings.syncInterval,
    priority: 10,
    condition: { type: "charging" },
    ...defaultProfileDelays("charging"),
    enabled: true
  })
  const [speedKmh, setSpeedKmh] = useState("30")
  const [saving, setSaving] = useState(false)

  // String representations for numeric inputs
  const [intervalStr, setIntervalStr] = useState(String(settings.interval))
  const [distanceStr, setDistanceStr] = useState(String(metersToInput(settings.distance)))
  const [priorityStr, setPriorityStr] = useState("10")
  const [activationDelayStr, setActivationDelayStr] = useState("0")
  const [delayStr, setDelayStr] = useState("60")
  const [syncIntervalStr, setSyncIntervalStr] = useState(String(settings.syncInterval))

  useEffect(() => {
    if (!profileId) return

    ProfileService.getProfiles()
      .then((profiles) => {
        const existing = profiles.find((p) => p.id === profileId)
        if (existing) {
          setProfile({
            name: existing.name,
            interval: existing.interval,
            distance: existing.distance,
            syncInterval: existing.syncInterval,
            priority: existing.priority,
            condition: existing.condition,
            activationDelay: existing.activationDelay,
            deactivationDelay: existing.deactivationDelay,
            enabled: existing.enabled
          })
          setIntervalStr(String(existing.interval))
          setDistanceStr(String(metersToInput(existing.distance)))
          setPriorityStr(String(existing.priority))
          setActivationDelayStr(String(existing.activationDelay))
          setDelayStr(String(existing.deactivationDelay))
          setSyncIntervalStr(String(existing.syncInterval))
          if (existing.condition.speedThreshold) {
            setSpeedKmh((existing.condition.speedThreshold * MS_TO_KMH).toFixed(0))
          }
        }
      })
      .catch((err) => {
        logger.error("[ProfileEditor] Failed to load profile:", err)
        showAlert("错误", "加载配置方案数据失败。", "error")
        navigation.goBack()
      })
  }, [profileId, navigation])

  const handleNumericChange = useCallback(
    (setter: (v: string) => void, field: keyof typeof profile, value: string, min = 0) => {
      setter(value)
      const num = Number(value)
      if (!isNaN(num) && num >= min) {
        const stored = field === "distance" ? inputToMeters(num) : num
        setProfile((prev) => ({ ...prev, [field]: stored }))
      }
    },
    []
  )

  const setConditionType = useCallback(
    (type: ProfileConditionType) => {
      const isSpeed = type === "speed_above" || type === "speed_below"
      const isStationary = type === "stationary"
      const { activationDelay: defaultActivation, deactivationDelay: defaultDeactivation } = defaultProfileDelays(type)
      setProfile((prev) => ({
        ...prev,
        // A distance filter is ignored for a stationary profile; store 0 so UI, DB and runtime agree.
        distance: isStationary ? 0 : prev.distance,
        deactivationDelay: prev.condition.type !== type ? defaultDeactivation : prev.deactivationDelay,
        activationDelay: prev.condition.type !== type ? defaultActivation : prev.activationDelay,
        condition: {
          type,
          ...(isSpeed ? { speedThreshold: Number(speedKmh) / MS_TO_KMH } : {})
        }
      }))
      if (isStationary) setDistanceStr("0")
      if (profile.condition.type !== type) {
        setDelayStr(String(defaultDeactivation))
        setActivationDelayStr(String(defaultActivation))
      }
    },
    [speedKmh, profile.condition.type]
  )

  const handleSpeedChange = useCallback((val: string) => {
    setSpeedKmh(val)
    const num = Number(val)
    if (!isNaN(num) && num > 0) {
      setProfile((prev) => ({
        ...prev,
        condition: { ...prev.condition, speedThreshold: num / MS_TO_KMH }
      }))
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!profile.name.trim()) {
      showAlert("缺少名称", "请输入配置方案名称。", "warning")
      return
    }
    if (profile.interval < 1) {
      showAlert("间隔无效", "跟踪间隔必须至少为 1 秒。", "warning")
      return
    }
    const isSpeed = profile.condition.type === "speed_above" || profile.condition.type === "speed_below"
    if (isSpeed && (!profile.condition.speedThreshold || profile.condition.speedThreshold <= 0)) {
      showAlert("缺少速度", "速度条件需要填写大于 0 的速度阈值。", "warning")
      return
    }

    setSaving(true)
    try {
      if (isEditing && profileId) {
        await ProfileService.updateProfile({ id: profileId, ...profile })
      } else {
        await ProfileService.createProfile(profile)
      }
      navigation.goBack()
    } catch (err) {
      logger.error("[ProfileEditor] Save failed:", err)
      showAlert("错误", "保存配置方案失败。", "error")
    } finally {
      setSaving(false)
    }
  }, [profile, isEditing, profileId, navigation])

  const isSpeed = profile.condition.type === "speed_above" || profile.condition.type === "speed_below"
  const isCustomSyncInterval = !SYNC_INTERVAL_PRESETS.includes(profile.syncInterval)

  const inputStyle = [
    styles.numInput,
    { backgroundColor: colors.backgroundElevated, color: colors.text, borderColor: colors.border }
  ]

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{isEditing ? "编辑配置方案" : "新建配置方案"}</Text>
        </View>

        {/* Name & Priority */}
        <SectionTitle>配置方案</SectionTitle>
        <Card>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>名称</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
              ]}
              placeholder="例如：驾车、骑行..."
              placeholderTextColor={colors.placeholder}
              value={profile.name}
              onChangeText={(val) => setProfile((prev) => ({ ...prev, name: val }))}
            />
          </View>

          <Divider />

          <SettingRow label="优先级" hint="多个配置方案匹配时，数字越大优先级越高">
            <TextInput
              style={inputStyle}
              keyboardType="numeric"
              value={priorityStr}
              onChangeText={(val) => handleNumericChange(setPriorityStr, "priority", val, 0)}
              placeholder="10"
              placeholderTextColor={colors.placeholder}
            />
          </SettingRow>
        </Card>

        {/* Condition */}
        <SectionTitle style={styles.sectionGap}>激活条件</SectionTitle>
        <Card>
          <View style={styles.conditionGrid}>
            {PROFILE_CONDITIONS.map((opt) => {
              const Icon = opt.icon
              const selected = profile.condition.type === opt.type
              return (
                <Pressable
                  key={opt.type}
                  style={({ pressed }) => [
                    styles.conditionOption,
                    {
                      backgroundColor: selected ? colors.primary + "15" : colors.background,
                      borderColor: selected ? colors.primary : colors.border
                    },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                  onPress={() => setConditionType(opt.type)}
                >
                  <Icon size={20} color={selected ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.conditionLabel, { color: selected ? colors.primary : colors.text }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.conditionDesc, { color: colors.textLight }]}>{opt.description}</Text>
                </Pressable>
              )
            })}
          </View>

          {isSpeed && (
            <>
              <Divider />
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>速度阈值（公里/小时）</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
                  ]}
                  placeholder="30"
                  placeholderTextColor={colors.placeholder}
                  value={speedKmh}
                  onChangeText={handleSpeedChange}
                  keyboardType="numeric"
                />
              </View>
            </>
          )}
        </Card>

        {/* Tracking Settings */}
        <SectionTitle style={styles.sectionGap}>跟踪设置</SectionTitle>
        <Card>
          <SettingRow label="跟踪间隔" hint={`默认：${settings.interval} 秒`}>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={inputStyle}
                keyboardType="numeric"
                value={intervalStr}
                onChangeText={(val) => handleNumericChange(setIntervalStr, "interval", val, 1)}
                placeholder="5"
                placeholderTextColor={colors.placeholder}
              />
              <Text style={[styles.unit, { color: colors.textSecondary }]}>秒</Text>
            </View>
          </SettingRow>

          {profile.condition.type === "stationary" && profile.interval > STATIONARY_MAX_INTERVAL_SECONDS && (
            <FieldMessage variant="warning">
              使用当前间隔开始移动时，设备可能会漏掉行程最初的 {Math.floor(profile.interval / 60)} 分钟！
            </FieldMessage>
          )}

          <Divider />

          {profile.condition.type === "stationary" ? (
            <FieldMessage>
              静止配置方案不使用移动阈值，系统会在每个间隔记录一个位置点。
            </FieldMessage>
          ) : (
            <SettingRow
              label="移动阈值"
              hint={`默认：${metersToInput(settings.distance)} ${shortDistanceUnit()}`}
            >
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={inputStyle}
                  keyboardType="numeric"
                  value={distanceStr}
                  onChangeText={(val) => handleNumericChange(setDistanceStr, "distance", val, 0)}
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>{shortDistanceUnit()}</Text>
              </View>
            </SettingRow>
          )}

          {!settings.isOfflineMode && (
            <>
              <Divider />

              <View style={styles.syncLabelRow}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>同步间隔</Text>
                <Text style={[styles.settingHint, { color: colors.textSecondary }]}>默认：{formatSyncDefault(settings.syncInterval)}
                </Text>
              </View>
              <View style={styles.syncGrid}>
                {SYNC_INTERVAL_PRESETS.map((sec) => {
                  const isSelected =
                    profile.syncInterval === sec && SYNC_INTERVAL_PRESETS.includes(profile.syncInterval)
                  return (
                    <Pressable
                      key={sec}
                      style={({ pressed }) => [
                        styles.syncOption,
                        {
                          backgroundColor: isSelected ? colors.primary + "15" : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border
                        },
                        pressed && { opacity: colors.pressedOpacity }
                      ]}
                      onPress={() => setProfile((prev) => ({ ...prev, syncInterval: sec }))}
                    >
                      <Text style={[styles.syncOptionLabel, { color: isSelected ? colors.primary : colors.text }]}>
                        {SYNC_INTERVAL_LABELS[sec]}
                      </Text>
                    </Pressable>
                  )
                })}
                <Pressable
                  style={({ pressed }) => [
                    styles.syncOption,
                    {
                      backgroundColor: isCustomSyncInterval ? colors.primary + "15" : colors.background,
                      borderColor: isCustomSyncInterval ? colors.primary : colors.border
                    },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                  onPress={() => {
                    if (!isCustomSyncInterval) {
                      const customValue = 1800
                      setSyncIntervalStr(customValue.toString())
                      setProfile((prev) => ({ ...prev, syncInterval: customValue }))
                    }
                  }}
                >
                  <Text
                    style={[styles.syncOptionLabel, { color: isCustomSyncInterval ? colors.primary : colors.text }]}
                  >
                    自定义
                  </Text>
                </Pressable>
              </View>

              {isCustomSyncInterval && (
                <View style={styles.customSyncInput}>
                  <NumericInput
                    label="自定义同步间隔"
                    value={syncIntervalStr}
                    onChange={(val) => {
                      setSyncIntervalStr(val)
                      const num = Number(val)
                      if (!isNaN(num) && num >= 0) {
                        setProfile((prev) => ({ ...prev, syncInterval: num }))
                      }
                    }}
                    onBlur={() => {
                      const num = Number(syncIntervalStr)
                      if (isNaN(num) || num < 0) {
                        setSyncIntervalStr("0")
                        setProfile((prev) => ({ ...prev, syncInterval: 0 }))
                      }
                    }}
                    unit="秒"
                    placeholder="1800"
                    hint="自定义间隔（秒）"
                    colors={colors}
                  />
                </View>
              )}
            </>
          )}
        </Card>

        <SectionTitle style={styles.sectionGap}>切换</SectionTitle>
        <Card>
          {profile.condition.type === "stationary" ? (
            <SettingRow
              label="激活延迟"
              hint="设备需要静止多久后启用此配置方案。再次移动时，硬件运动传感器会立即恢复跟踪。"
            >
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={inputStyle}
                  keyboardType="numeric"
                  value={activationDelayStr}
                  onChangeText={(val) => handleNumericChange(setActivationDelayStr, "activationDelay", val, 0)}
                  placeholder="60"
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={[styles.unit, { color: colors.textSecondary }]}>秒</Text>
              </View>
            </SettingRow>
          ) : (
            <>
              <SettingRow
                label="激活延迟"
                hint="条件需持续多久后此配置方案才接管，避免因短暂变化频繁切换。0 表示立即。"
              >
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={inputStyle}
                    keyboardType="numeric"
                    value={activationDelayStr}
                    onChangeText={(val) => handleNumericChange(setActivationDelayStr, "activationDelay", val, 0)}
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                  />
                  <Text style={[styles.unit, { color: colors.textSecondary }]}>秒</Text>
                </View>
              </SettingRow>

              <Divider />

              <SettingRow
                label="停用延迟"
                hint="条件停止后等待多久再恢复默认设置，避免快速来回切换。"
              >
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={inputStyle}
                    keyboardType="numeric"
                    value={delayStr}
                    onChangeText={(val) => handleNumericChange(setDelayStr, "deactivationDelay", val, 0)}
                    placeholder="60"
                    placeholderTextColor={colors.placeholder}
                  />
                  <Text style={[styles.unit, { color: colors.textSecondary }]}>秒</Text>
                </View>
              </SettingRow>
            </>
          )}
        </Card>

        {/* Save Button */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary },
            saving && styles.saveBtnDisabled,
            pressed && { opacity: colors.pressedOpacity }
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          <Check size={20} color={colors.textOnPrimary} />
          <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>
            {saving ? "保存中..." : isEditing ? "保存更改" : "创建配置方案"}
          </Text>
        </Pressable>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, ...fonts.bold, letterSpacing: -0.5 },
  inputGroup: { marginBottom: 4 },
  label: {
    fontSize: 12,
    ...fonts.semiBold,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  input: { padding: 14, borderWidth: 1.5, borderRadius: 10, fontSize: 15, ...fonts.regular },
  numInput: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    fontSize: 15,
    textAlign: "center",
    width: 64,
    ...fonts.regular
  },
  inputWithUnit: { flexDirection: "row", alignItems: "center", gap: 6 },
  unit: { fontSize: 14, ...fonts.medium, minWidth: 28 },
  conditionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  conditionOption: {
    width: "47%",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 4
  },
  conditionLabel: { fontSize: 13, ...fonts.semiBold },
  conditionDesc: { fontSize: 11, ...fonts.regular, textAlign: "center" },
  syncLabelRow: { marginBottom: 8 },
  settingLabel: { fontSize: 16, ...fonts.semiBold, marginBottom: 2 },
  settingHint: { fontSize: 13, ...fonts.regular, lineHeight: 18 },
  syncGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  syncOption: { width: "31%", padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" }, // ~3 per row with gap
  syncOptionLabel: { fontSize: 13, ...fonts.semiBold },
  customSyncInput: { marginTop: 12 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 16
  },
  saveBtnText: { fontSize: 16, ...fonts.semiBold },
  saveBtnDisabled: { opacity: 0.6 },
  sectionGap: { marginTop: 24 }
})
