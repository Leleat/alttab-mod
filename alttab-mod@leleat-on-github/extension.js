/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

"use strict";

const {altTab, main, switcherPopup} = imports.ui;
const {Clutter, Meta, Shell} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

class Extension {
	constructor() {
	}

	enable() {
		this.settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.altTab-mod");

		this.old_keyPressHandler = altTab.AppSwitcherPopup.prototype._keyPressHandler;
		this.navigationAndUniformQuit();

		this.old_finish = altTab.AppSwitcherPopup.prototype._finish;
		this.raiseFirstWindowOnly();

		this.old_appSwitcherInit = altTab.AppSwitcher.prototype._init;
		this.customAppSwitcherList();

		this.old_delay = switcherPopup.POPUP_DELAY_TIMEOUT;
		switcherPopup.POPUP_DELAY_TIMEOUT = this.settings.get_boolean("remove-delay") ? 0 : this.old_delay
		this.settings.connect("changed::remove-delay", () =>
				switcherPopup.POPUP_DELAY_TIMEOUT = this.settings.get_boolean("remove-delay") ? 0 : this.old_delay);
	}

	disable() {
		altTab.AppSwitcherPopup.prototype._keyPressHandler = this.old_keyPressHandler;
		altTab.AppSwitcherPopup.prototype._finish = this.old_finish;
		altTab.AppSwitcher.prototype._init = this.old_appSwitcherInit;
		switcherPopup.POPUP_DELAY_TIMEOUT = this.old_delay;

		this.settings.run_dispose();
		this.settings = null;
	}

	navigationAndUniformQuit() {
		altTab.AppSwitcherPopup.prototype._keyPressHandler =  function(keysym, action) {
			if (action == Meta.KeyBindingAction.SWITCH_GROUP) {
				if (!this._thumbnailsFocused)
					this._select(this._selectedIndex, 0);
				else
					this._select(this._selectedIndex, this._nextWindow());
			} else if (action == Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD) {
				this._select(this._selectedIndex, this._previousWindow());
			} else if (action == Meta.KeyBindingAction.SWITCH_APPLICATIONS) {
				this._select(this._next());
			} else if (action == Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD) {
				this._select(this._previous());
			} else if (this._thumbnailsFocused) {
				if (keysym === Clutter.KEY_Left || keysym === Clutter.KEY_a || keysym === Clutter.KEY_A || keysym === Clutter.KEY_h || keysym === Clutter.KEY_H)
					this._select(this._selectedIndex, this._previousWindow());
				else if (keysym === Clutter.KEY_Right || keysym === Clutter.KEY_d || keysym === Clutter.KEY_D || keysym === Clutter.KEY_l || keysym === Clutter.KEY_L)
					this._select(this._selectedIndex, this._nextWindow());
				else if (keysym === Clutter.KEY_Up || keysym === Clutter.KEY_w || keysym === Clutter.KEY_W || keysym === Clutter.KEY_k || keysym === Clutter.KEY_K)
					this._select(this._selectedIndex, null, true);
				else if (keysym === Clutter.KEY_q || keysym === Clutter.KEY_Q || keysym === Clutter.KEY_F4)
					this._closeAppWindow(this._selectedIndex, this._currentWindow);
				else
					return Clutter.EVENT_PROPAGATE;

			} else if (keysym == Clutter.KEY_q || keysym === Clutter.KEY_Q) {
				this._quitApplication(this._selectedIndex);
			} else if (keysym == Clutter.KEY_Left || keysym === Clutter.KEY_a || keysym === Clutter.KEY_A || keysym === Clutter.KEY_h || keysym === Clutter.KEY_H) {
				this._select(this._previous());
			} else if (keysym == Clutter.KEY_Right || keysym === Clutter.KEY_d || keysym === Clutter.KEY_D || keysym === Clutter.KEY_l || keysym === Clutter.KEY_L) {
				this._select(this._next());
			} else if (keysym == Clutter.KEY_Down || keysym === Clutter.KEY_s || keysym === Clutter.KEY_S || keysym === Clutter.KEY_j || keysym === Clutter.KEY_J) {
				this._select(this._selectedIndex, 0);
			} else {
				return Clutter.EVENT_PROPAGATE;
			}

			return Clutter.EVENT_STOP;
		}
	}

	raiseFirstWindowOnly() {
		altTab.AppSwitcherPopup.prototype._finish =  function(timestamp) {
			let appIcon = this._items[this._selectedIndex];
			if (this._currentWindow < 0)
				main.activateWindow(appIcon.cachedWindows[0], timestamp);
			else if (appIcon.cachedWindows[this._currentWindow])
				main.activateWindow(appIcon.cachedWindows[this._currentWindow], timestamp);

			switcherPopup.SwitcherPopup.prototype._finish.call(this, timestamp);
		}
	}

	customAppSwitcherList() {
		altTab.AppSwitcher.prototype._init = function(apps, altTabPopup) {
			switcherPopup.SwitcherList.prototype._init.call(this, true);

			this.icons = [];
			this._arrows = [];

			const settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.altTab-mod");
			this.connect("destroy", () => settings.run_dispose());
			const onlyCurrentMonitor = settings.get_boolean("current-monitor-only");
			const onlyCurrentWorkspace = settings.get_boolean("current-workspace-only");
			const workspace = onlyCurrentWorkspace ? global.workspace_manager.get_active_workspace() : null;
			const allWindows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
			const windowTracker = Shell.WindowTracker.get_default();

			// Construct the AppIcons, add to the popup
			for (let i = 0; i < apps.length; i++) {
				let appIcon = new altTab.AppIcon(apps[i]);
				// Cache the window list now; we don't handle dynamic changes here,
				// and we don't want to be continually retrieving it
				appIcon.cachedWindows = allWindows.filter(w => windowTracker.get_window_app(w) === appIcon.app
						&& (!onlyCurrentMonitor || w.get_monitor() === global.display.get_current_monitor()));
				if (appIcon.cachedWindows.length > 0)
					this._addIcon(appIcon);
			}

			this._curApp = -1;
			this._altTabPopup = altTabPopup;
			this._mouseTimeOutId = 0;

			this.connect("destroy", this._onDestroy.bind(this));
		}
	}
}

function init() {
	return new Extension();
}
