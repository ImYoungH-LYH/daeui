# SPDX-License-Identifier: GPL-2.0-only
#
# Detached BTF for the SDK's own kernel, so CO-RE eBPF (dae) loads on official
# firmware built without CONFIG_DEBUG_INFO_BTF.
#
# Built inside the official buildroot (the SDK ships no kernel sources), which holds the
# release's patched kernel tree and .config. We rebuild vmlinux from a copy of it with ONLY the debug-info options changed (struct
# layouts must stay identical to the running kernel), then let pahole encode
# the BTF. The build aborts if any other kernel option would change.

include $(TOPDIR)/rules.mk
include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/version.mk

PKG_NAME:=vmlinux-btf
PKG_VERSION:=$(LINUX_VERSION)
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-only
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/vmlinux-btf
  SECTION:=kernel
  CATEGORY:=Kernel
  TITLE:=Detached BTF for kernel $(LINUX_VERSION)
endef

define Package/vmlinux-btf/description
  Kernel BTF type information for $(LINUX_VERSION) ($(REVISION)), installed
  where libbpf / cilium-ebpf look when /sys/kernel/btf/vmlinux is missing.
  Only valid for exactly this kernel build.
endef

SHADOW:=$(PKG_BUILD_DIR)/linux

# Options we are allowed to change; anything else in the diff fails the build.
BTF_ALLOWED_DIFF:=^[-+ ]?(DEBUG_INFO|PAHOLE_|BTF_|DEBUG_INFO_BTF|MODULE_ALLOW_BTF_MISMATCH|RUSTC_|TOOLCHAIN_)

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	if [ ! -f $(LINUX_DIR)/kernel/sched/core.c ]; then \
		echo "SDK kernel tree at $(LINUX_DIR) has no sources; cannot build vmlinux" >&2; exit 1; \
	fi
	rm -rf $(SHADOW)
	cp -a $(LINUX_DIR) $(SHADOW)
	# Changing debug-info flags rebuilds everything anyway; drop the copied objects to save disk.
	$(MAKE) -C $(SHADOW) $(KERNEL_MAKE_FLAGS) clean
endef

define Build/Compile
	cp $(SHADOW)/.config $(PKG_BUILD_DIR)/config.orig
	$(SHADOW)/scripts/config --file $(SHADOW)/.config \
		--enable DEBUG_INFO \
		--disable DEBUG_INFO_NONE \
		--disable DEBUG_INFO_REDUCED \
		--disable DEBUG_INFO_SPLIT \
		--enable DEBUG_INFO_BTF
	$(MAKE) -C $(SHADOW) $(KERNEL_MAKE_FLAGS) olddefconfig
	grep -q '^CONFIG_DEBUG_INFO_BTF=y' $(SHADOW)/.config || { echo "DEBUG_INFO_BTF did not stick (pahole missing or too old?)" >&2; exit 1; }
	$(SHADOW)/scripts/diffconfig $(PKG_BUILD_DIR)/config.orig $(SHADOW)/.config | tee $(PKG_BUILD_DIR)/config.diff
	if grep -Ev '$(BTF_ALLOWED_DIFF)' $(PKG_BUILD_DIR)/config.diff | grep -q .; then \
		echo "Refusing to build: kernel options other than debug info changed (see above)" >&2; exit 1; \
	fi
	$(MAKE) -C $(SHADOW) $(KERNEL_MAKE_FLAGS) $(PKG_JOBS) vmlinux
	pahole --btf_encode_detached=$(PKG_BUILD_DIR)/vmlinux.btf $(SHADOW)/vmlinux
	echo '$(REVISION)' > $(PKG_BUILD_DIR)/revision
endef

define Package/vmlinux-btf/install
	$(INSTALL_DIR) $(1)/usr/lib/debug/boot
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/vmlinux.btf $(1)/usr/lib/debug/boot/vmlinux-$(LINUX_VERSION)
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/revision $(1)/usr/lib/debug/boot/vmlinux-$(LINUX_VERSION).revision
endef

define Package/vmlinux-btf/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
want='$(LINUX_VERSION)'
have="$$(uname -r)"
if [ "$$have" != "$$want" ]; then
	echo "vmlinux-btf: built for kernel $$want but this system runs $$have; dae would read wrong type info." >&2
	rm -f "/usr/lib/debug/boot/vmlinux-$$want"
	exit 1
fi
. /etc/openwrt_release 2>/dev/null
if [ -n "$$DISTRIB_REVISION" ] && [ "$$DISTRIB_REVISION" != '$(REVISION)' ]; then
	echo "vmlinux-btf: WARNING built from $(REVISION), firmware is $$DISTRIB_REVISION" >&2
fi
exit 0
endef

$(eval $(call BuildPackage,vmlinux-btf))
