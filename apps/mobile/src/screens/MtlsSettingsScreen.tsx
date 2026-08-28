/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, ScrollView } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { fonts } from "../styles/typography"
import { Container } from "../components"
import { MtlsSection } from "../components/features/settings/MtlsSection"

export function MtlsSettingsScreen({}: ScreenProps) {
  const { colors } = useTheme()

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>客户端证书（mTLS）</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            适用于需要双向 TLS 身份验证的反向代理服务器端点
          </Text>
        </View>

        <MtlsSection />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40
  },
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    letterSpacing: -0.5,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    ...fonts.regular,
    lineHeight: 20
  }
})
