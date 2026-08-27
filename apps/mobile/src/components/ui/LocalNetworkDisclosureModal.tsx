/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Wifi } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { registerLocalNetworkDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"

/**
 * Disclosure modal for the local network permission.
 * Shown before requesting ACCESS_LOCAL_NETWORK on Android 16+.
 */
export function LocalNetworkDisclosureModal() {
  const { colors } = useTheme()

  return (
    <DisclosureModal
      icon={<Wifi size={28} color={colors.primary} />}
      title="本地网络访问"
      paragraphs={[
        "你的服务器位于本地网络中。Colota 需要本地网络访问权限才能连接该服务器。",
        "此权限仅用于连接你的自托管服务器，不会扫描或发现其他设备。"
      ]}
      confirmLabel="继续"
      registerCallback={registerLocalNetworkDisclosureCallback}
    />
  )
}
