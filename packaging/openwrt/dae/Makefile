# SPDX-License-Identifier: GPL-2.0-only
#
# Packages the official prebuilt dae release (a static Go binary with the eBPF
# objects embedded) together with a procd service and the bundled geo data.

include $(TOPDIR)/rules.mk

PKG_NAME:=dae
PKG_VERSION:=2.1.1
PKG_RELEASE:=1

ifeq ($(ARCH),x86_64)
  DAE_ASSET:=x86_64
  PKG_HASH:=1ca3c423901298d0b341ae2fa02d5a0eca67c254e7f2b6ce94af8328019abb43
endif

PKG_SOURCE:=dae-linux-$(DAE_ASSET)-$(PKG_VERSION).zip
PKG_SOURCE_URL_FILE:=dae-linux-$(DAE_ASSET).zip
PKG_SOURCE_URL:=https://github.com/daeuniverse/dae/releases/download/v$(PKG_VERSION)/

PKG_LICENSE:=AGPL-3.0-only

include $(INCLUDE_DIR)/package.mk

define Package/dae
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=eBPF-based transparent proxy (official build)
  URL:=https://github.com/daeuniverse/dae
  DEPENDS:=@(x86_64) +kmod-sched-core +kmod-sched-bpf +kmod-veth +ca-bundle
endef

define Package/dae/description
  dae, means goose, is a high-performance transparent proxy that splits
  traffic inside the Linux kernel with eBPF. This package ships the
  upstream release binary. The kernel needs BTF: either
  CONFIG_DEBUG_INFO_BTF or the matching vmlinux-btf package.
endef

define Package/dae/conffiles
/etc/config/dae
/etc/dae/config.dae
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	unzip -q -o -d $(PKG_BUILD_DIR) $(DL_DIR)/$(PKG_SOURCE)
endef

define Build/Compile
endef

define Package/dae/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/dae-linux-$(DAE_ASSET) $(1)/usr/bin/dae
	$(INSTALL_DIR) $(1)/usr/share/dae
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geoip.dat $(1)/usr/share/dae/geoip.dat
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/geosite.dat $(1)/usr/share/dae/geosite.dat
	$(INSTALL_DIR) $(1)/etc/dae
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/dae.config $(1)/etc/config/dae
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/dae.init $(1)/etc/init.d/dae
endef

$(eval $(call BuildPackage,dae))
