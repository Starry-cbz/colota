/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { MapPin } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { registerDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"

/**
 * Prominent in-app disclosure modal for location data collection.
 * Required by Google Play's User Data policy.
 */
export function LocationDisclosureModal() {
  const { colors } = useTheme()

  return (
    <DisclosureModal
      icon={<MapPin size={28} color={colors.primary} />}
      title="位置数据收集"
      paragraphs={[
        "Colota 会收集位置数据，以便进行 GPS 跟踪并将你的位置发送到所配置的服务器，即使应用已关闭或未在使用。",
        "这些数据只会发送到你设置的服务器，不会与第三方共享。"
      ]}
      confirmLabel="同意"
      registerCallback={registerDisclosureCallback}
    />
  )
}
