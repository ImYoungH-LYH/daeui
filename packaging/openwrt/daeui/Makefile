# SPDX-License-Identifier: GPL-2.0-only
#
# DaeUI web panel. The binary (frontend embedded) is built outside the SDK by
# `node scripts/build-server.mjs` and dropped into files/daeui-$(ARCH).

include $(TOPDIR)/rules.mk

PKG_NAME:=daeui
PKG_VERSION:=$(if $(DAEUI_VERSION),$(DAEUI_VERSION),0.1.0)
PKG_RELEASE:=1
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/daeui
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Web panel to configure and run dae
  DEPENDS:=@(x86_64) +dae
endef

define Package/daeui/description
  DaeUI edits /etc/dae/config.dae through a password protected web page,
  validates it with dae, hot-reloads dae and shows its status and logs.
endef

define Package/daeui/conffiles
/etc/config/daeui
/etc/daeui/auth.json
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	[ -x ./files/daeui-$(ARCH) ] || { echo "missing files/daeui-$(ARCH); run scripts/build-server.mjs first" >&2; exit 1; }
	$(CP) ./files/daeui-$(ARCH) $(PKG_BUILD_DIR)/daeui
endef

define Build/Compile
endef

define Package/daeui/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/daeui $(1)/usr/bin/daeui
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/daeui.config $(1)/etc/config/daeui
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/daeui.init $(1)/etc/init.d/daeui
	$(INSTALL_DIR) $(1)/etc/daeui
endef

$(eval $(call BuildPackage,daeui))
