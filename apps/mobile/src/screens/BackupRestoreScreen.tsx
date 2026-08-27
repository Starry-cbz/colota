/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useState } from "react"
import { Modal, ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native"
import { Eye, EyeOff } from "lucide-react-native"
import type { RootScreenProps } from "../types/navigation"
import { useTheme } from "../hooks/useTheme"
import { Button, Card, Container, SectionTitle } from "../components"
import BackupService, {
  MIN_BACKUP_PASSWORD_LENGTH,
  MIN_BACKUP_PASSWORD_BITS,
  type PasswordStrengthResult
} from "../services/BackupService"
import { showAlert, showConfirm, showChoice } from "../services/modalService"
import { logger } from "../utils/logger"
import { fonts } from "../styles/typography"
import { fontSizes } from "@colota/shared"
import type { ThemeColors } from "../types/global"

type Props = RootScreenProps<"Backup & Restore">

const SEGMENT_COUNT = 4

function strengthColor(score: number, colors: ThemeColors): string {
  if (score <= 1) return colors.error
  if (score === 2) return colors.warning
  return colors.success
}

function restoreErrorMessage(e: unknown): string {
  const code = (e as { code?: string }).code
  switch (code) {
    case "E_BACKUP_WRONG_PASSWORD":
      return "密码不正确，或备份文件开头已损坏。"
    case "E_BACKUP_BAD_MAGIC":
      return "此文件不是 Colota 备份。"
    case "E_BACKUP_UNSUPPORTED_SCHEMA":
      return "此备份由更新版本的 Colota 创建，请先更新应用。"
    case "E_BACKUP_UNSUPPORTED_VERSION":
    case "E_BACKUP_UNSUPPORTED_KDF":
      return "此备份由不同版本的 Colota 创建。"
    case "E_BACKUP_INTEGRITY_FAIL":
      return "备份文件已损坏。"
    case "E_BACKUP_TRUNCATED":
      return "备份文件不完整。"
    case "E_BACKUP_TAMPERED":
      return "备份文件已被修改或损坏。"
    case "E_BACKUP_MISSING_ENTRY":
      return "备份文件缺少必要数据。"
    case "E_BACKUP_SECRETS_PARTIAL":
      return "数据已恢复，但无法应用已保存的凭据。请在连接设置中重新输入。"
    case "E_BUSY":
      return "另一个备份或恢复操作正在进行。"
    default:
      return e instanceof Error ? e.message : "未知错误"
  }
}

type PasswordFieldProps = {
  value: string
  onChangeText: (v: string) => void
  placeholder: string
  editable: boolean
  autoComplete: "password" | "new-password"
  colors: ThemeColors
}

function PasswordField({ value, onChangeText, placeholder, editable, autoComplete, colors }: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const Icon = revealed ? EyeOff : Eye
  return (
    <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <TextInput
        style={[styles.inputField, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!revealed}
        autoComplete={autoComplete}
        editable={editable}
      />
      <Pressable
        onPressIn={() => setRevealed(true)}
        onPressOut={() => setRevealed(false)}
        hitSlop={8}
        style={styles.eyeButton}
        accessibilityLabel="Hold to show password"
      >
        <Icon size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  )
}

function PasswordPromptModal({
  visible,
  filename,
  busy,
  onSubmit,
  onCancel,
  colors
}: {
  visible: boolean
  filename: string
  busy: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
  colors: ThemeColors
}) {
  const [pw, setPw] = useState("")

  useEffect(() => {
    if (!visible) {
      setPw("")
    }
  }, [visible])

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>输入密码</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            For {filename}
          </Text>
          <PasswordField
            value={pw}
            onChangeText={setPw}
            placeholder="备份密码"
            editable={!busy}
            autoComplete="password"
            colors={colors}
          />
          <View style={styles.modalButtonsRow}>
            <View style={styles.modalButton}>
              <Button title="取消" onPress={onCancel} disabled={busy} variant="secondary" />
            </View>
            <View style={styles.modalButton}>
              <Button
                title={busy ? "恢复中..." : "恢复"}
                onPress={() => pw && onSubmit(pw)}
                disabled={!pw || busy}
                loading={busy}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function BackupRestoreScreen({}: Props) {
  const { colors } = useTheme()

  const [backupPassword, setBackupPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null)
  const [pendingRestore, setPendingRestore] = useState<{ uri: string; filename: string } | null>(null)

  const [strength, setStrength] = useState<PasswordStrengthResult>({ score: 0, label: "", bits: 0 })
  useEffect(() => {
    let cancelled = false
    BackupService.passwordStrength(backupPassword)
      .then((result) => {
        if (!cancelled) setStrength(result)
      })
      .catch((err) => {
        if (!cancelled) logger.warn("[BackupRestoreScreen] passwordStrength failed", err)
      })
    return () => {
      cancelled = true
    }
  }, [backupPassword])
  const passwordAcceptable = strength.bits >= MIN_BACKUP_PASSWORD_BITS
  const passwordsMatch = backupPassword === confirmPassword
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch
  const canSubmitBackup = passwordAcceptable && passwordsMatch && backupPassword.length > 0

  const onCreateBackup = async () => {
    if (!canSubmitBackup) {
      showAlert("密码未准备好", "两次密码必须一致，请使用更长或更随机的密码。", "warning")
      return
    }

    const acknowledged = await showConfirm({
      title: "无法找回密码",
      message: "如果忘记密码，将无法打开备份。继续前请将密码妥善保存。",
      confirmText: "我明白了",
      cancelText: "取消",
      destructive: true
    })
    if (!acknowledged) return

    const uri = await BackupService.pickBackupDestination()
    if (!uri) return

    setBusy("backup")
    try {
      await BackupService.createBackup(uri, backupPassword)
      setBackupPassword("")
      setConfirmPassword("")
      showAlert("备份已创建", "加密备份已写入。", "success")
    } catch (e: unknown) {
      logger.error("[BackupRestoreScreen] backup failed", e)
      const message = e instanceof Error ? e.message : "Unknown error"
      showAlert("备份失败", message, "error")
    } finally {
      setBusy(null)
    }
  }

  const onChooseBackupFile = async () => {
    const source = await BackupService.pickBackupSource()
    if (!source) return
    setPendingRestore({
      uri: source.uri,
      filename: source.displayName ?? "the selected backup"
    })
  }

  const onRestorePasswordCancel = () => {
    if (busy === "restore") return
    setPendingRestore(null)
  }

  const onRestorePasswordSubmit = async (password: string) => {
    if (!pendingRestore) return
    const { uri } = pendingRestore

    const acknowledged = await showConfirm({
      title: "替换全部数据？",
      message: "恢复操作将覆盖当前的位置、设置和凭据，且无法撤销。",
      confirmText: "替换",
      cancelText: "取消",
      destructive: true
    })
    if (!acknowledged) return

    setBusy("restore")
    try {
      await BackupService.restoreBackup(uri, password)
      setPendingRestore(null)
      // Block on dismissal; applyRestore reloads the bridge and would wipe an unawaited alert.
      await showChoice({
        title: "恢复完成",
        message: "数据已恢复。跟踪已暂停，请在首页重新启用。",
        variant: "success",
        buttons: [{ text: "重启应用", style: "primary" }]
      })
      await BackupService.applyRestore()
    } catch (e: unknown) {
      logger.error("[BackupRestoreScreen] restore failed", e)
      showAlert("恢复失败", restoreErrorMessage(e), "error")
      setPendingRestore(null)
    } finally {
      setBusy(null)
    }
  }

  const meterColor = strengthColor(strength.score, colors)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionTitle>加密备份</SectionTitle>
          <Card>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Bundle your locations, settings and credentials into a single encrypted file you can store anywhere.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>密码</Text>
            <PasswordField
              value={backupPassword}
              onChangeText={setBackupPassword}
              placeholder={`At least ${MIN_BACKUP_PASSWORD_LENGTH} characters`}
              editable={busy === null}
              autoComplete="new-password"
              colors={colors}
            />
            {backupPassword.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBar}>
                  {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        {
                          backgroundColor: i < strength.score ? meterColor : colors.borderLight
                        }
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: meterColor }]}>{strength.label}</Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.text }]}>确认密码</Text>
            <PasswordField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            placeholder="再次输入相同密码"
              editable={busy === null}
              autoComplete="new-password"
              colors={colors}
            />
            {showMismatch && <Text style={[styles.errorText, { color: colors.error }]}>两次密码不一致。</Text>}

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              A random password from a password manager or a long passphrase is safest. Common words and phrases are
              easy to crack. There is no recovery if forgotten.
            </Text>
            <Button
              title={busy === "backup" ? "创建备份中..." : "创建备份"}
              onPress={onCreateBackup}
              disabled={busy !== null || !canSubmitBackup}
              loading={busy === "backup"}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>从备份恢复</SectionTitle>
          <Card>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Replace all current data with a previous .colota backup file. You'll be asked for the backup password
              after choosing the file.
            </Text>
            <Button title="选择备份文件" onPress={onChooseBackupFile} disabled={busy !== null} variant="danger" />
          </Card>
        </View>
      </ScrollView>
      <PasswordPromptModal
        visible={pendingRestore !== null}
        filename={pendingRestore?.filename ?? ""}
        busy={busy === "restore"}
        onSubmit={onRestorePasswordSubmit}
        onCancel={onRestorePasswordCancel}
        colors={colors}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  section: {
    marginTop: 24
  },
  intro: {
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8
  },
  strengthBar: {
    flex: 1,
    flexDirection: "row",
    gap: 4
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right"
  },
  errorText: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  modalCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1
  },
  modalTitle: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 4
  },
  modalSubtitle: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginBottom: 16
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4
  },
  modalButton: {
    flex: 1
  }
})
