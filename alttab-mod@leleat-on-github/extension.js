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

'use strict';

const { altTab, main, switcherPopup } = imports.ui;
const { Clutter, Meta, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

class Extension {
    enable() {
        this._settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);

        this._saveOriginals();

        // Include apps from the current workspace or current monitor only
        const setCurrentWSorDisplayOnly = () => {
            if (this._settings.get_boolean('current-workspace-only') ||
                    this._settings.get_boolean('current-monitor-only'))
                this._overrideAppSwitcherInit();
            else
                altTab.AppSwitcher.prototype._init = this._oldAppSwitcherInit;
        };
        this._settings.connect('changed::current-workspace-only', setCurrentWSorDisplayOnly.bind(this));
        this._settings.connect('changed::current-monitor-only', setCurrentWSorDisplayOnly.bind(this));
        setCurrentWSorDisplayOnly();

        // Maybe include windows from current monitor only
        this._overrideWindowSwitcherPopupGetWindowList();

        // Set App Switcher delay
        const setDelay = () => {
            if (this._settings.get_boolean('remove-delay'))
                this._overrideAppSwitcherPopupDelay();
            else
                switcherPopup.POPUP_DELAY_TIMEOUT = this._oldPopupDelay;
        };
        this._settings.connect('changed::remove-delay', setDelay.bind(this));
        setDelay();

        // Only raise first instance of an app
        const setRaiseFirstInstanceOnly = () => {
            if (this._settings.get_boolean('raise-first-instance-only'))
                this._overrideAppSwitcherPopupFinish();
            else
                altTab.AppSwitcherPopup.prototype._finish = this._oldAppSwitcherPopupFinish;
        };
        this._settings.connect('changed::raise-first-instance-only', setRaiseFirstInstanceOnly.bind(this));
        setRaiseFirstInstanceOnly();

        // Set focus window on select
        const setFocusOnSelectWindow = () => {
            if (this._settings.get_boolean('focus-on-select-window'))
                this._overrideWindowSwitcherPopupSelect();
            else
                altTab.WindowSwitcherPopup.prototype._select = this._oldWindowSwitcherPopupSelect
        };
        this._settings.connect('changed::focus-on-select-window', setFocusOnSelectWindow.bind(this));
        setFocusOnSelectWindow();

        // Set hover selection
        const setAppSwitcherHoverSelection = () => {
            if (this._settings.get_boolean('disable-hover-select')) {
                this._overrideAppSwitcherItemEnteredHandler();
                this._overrideWindowSwitcherItemEnteredHandler();
            } else {
                altTab.AppSwitcherPopup.prototype._itemEnteredHandler = this._oldAppSwitcherPopupItemEnteredHandler;
                altTab.WindowSwitcherPopup.prototype._itemEnteredHandler = this._oldWindowSwitcherPopupItemEnteredHandler;
            }
        };
        this._settings.connect('changed::disable-hover-select', setAppSwitcherHoverSelection.bind(this));
        setAppSwitcherHoverSelection();

        // WASD and hjkl navigation + Q only quits current window
        this._overrideAppSwitcherPopupKeyPressHandler();
        this._overrideWindowSwitcherPopupKeyPressHandler();
    }

    _saveOriginals() {
        this._oldAppSwitcherInit = altTab.AppSwitcher.prototype._init;
        this._oldPopupDelay = switcherPopup.POPUP_DELAY_TIMEOUT;
        this._oldAppSwitcherPopupFinish = altTab.AppSwitcherPopup.prototype._finish;
        this._oldAppSwitcherPopupItemEnteredHandler = altTab.AppSwitcherPopup.prototype._itemEnteredHandler;
        this._oldAppSwitcherPopupKeyPressHandler = altTab.AppSwitcherPopup.prototype._keyPressHandler;

        this._oldWindowSwitcherPopupSelect = altTab.WindowSwitcherPopup.prototype._select;
        this._oldWindowSwitcherPopupItemEnteredHandler = altTab.WindowSwitcherPopup.prototype._itemEnteredHandler;
        this._oldWindowSwitcherPopupKeyPressHandler = altTab.WindowSwitcherPopup.prototype._keyPressHandler;
        this._oldWindowSwitcherPopupGetWindowList = altTab.WindowSwitcherPopup.prototype._getWindowList;
    }

    disable() {
        altTab.AppSwitcher.prototype._init = this._oldAppSwitcherInit;
        switcherPopup.POPUP_DELAY_TIMEOUT = this._oldPopupDelay;
        altTab.AppSwitcherPopup.prototype._finish = this._oldAppSwitcherPopupFinish;
        altTab.AppSwitcherPopup.prototype._itemEnteredHandler = this._oldAppSwitcherPopupItemEnteredHandler;
        altTab.AppSwitcherPopup.prototype._keyPressHandler = this._oldAppSwitcherPopupKeyPressHandler;

        altTab.WindowSwitcherPopup.prototype._itemEnteredHandler = this._oldWindowSwitcherPopupItemEnteredHandler;
        altTab.WindowSwitcherPopup.prototype._keyPressHandler = this._oldWindowSwitcherPopupKeyPressHandler;
        altTab.WindowSwitcherPopup.prototype._getWindowList = this._oldWindowSwitcherPopupGetWindowList;

        this._settings = null;
    }

    _overrideAppSwitcherInit() {
        altTab.AppSwitcher.prototype._init = function (apps, altTabPopup) {
            switcherPopup.SwitcherList.prototype._init.call(this, true);

            this.icons = [];
            this._arrows = [];

            const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
            const onlyCurrentMonitor = settings.get_boolean('current-monitor-only');
            const onlyCurrentWorkspace = settings.get_boolean('current-workspace-only');
            const workspace = onlyCurrentWorkspace ? global.workspace_manager.get_active_workspace() : null;
            const allWindows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
            const windowTracker = Shell.WindowTracker.get_default();

            // Construct the AppIcons, add to the popup
            for (let i = 0; i < apps.length; i++) {
                let appIcon = new altTab.AppIcon(apps[i]);
                // Cache the window list now; we don't handle dynamic changes here,
                // and we don't want to be continually retrieving it
                appIcon.cachedWindows = allWindows.filter(w => windowTracker.get_window_app(w) === appIcon.app &&
                        (!onlyCurrentMonitor || w.get_monitor() === global.display.get_current_monitor()));
                if (appIcon.cachedWindows.length > 0)
                    this._addIcon(appIcon);
            }

            this._delayedHighlighted = -1;
            this._altTabPopup = altTabPopup;
            this._mouseTimeOutId = 0;

            this.connect('destroy', this._onDestroy.bind(this));
        };
    }

    _overrideAppSwitcherPopupDelay() {
        switcherPopup.POPUP_DELAY_TIMEOUT = 0;
    }

    _overrideAppSwitcherPopupFinish() {
        altTab.AppSwitcherPopup.prototype._finish = function (timestamp) {
            const appIcon = this._items[this._selectedIndex];
            if (this._currentWindow < 0)
                main.activateWindow(appIcon.cachedWindows[0], timestamp);
            else if (appIcon.cachedWindows[this._currentWindow])
                main.activateWindow(appIcon.cachedWindows[this._currentWindow], timestamp);

            switcherPopup.SwitcherPopup.prototype._finish.call(this, timestamp);
        };
    }

    _overrideWindowSwitcherPopupSelect() {
        altTab.WindowSwitcherPopup.prototype._select = function(num) {
            this._selectedIndex = num;
            this._switcherList.highlight(num);
            main.activateWindow(this._items[this._selectedIndex].window);
        };
    }

    _overrideAppSwitcherItemEnteredHandler() {
        altTab.AppSwitcherPopup.prototype._itemEnteredHandler = () => {};
    }

    _overrideWindowSwitcherItemEnteredHandler() {
        altTab.WindowSwitcherPopup.prototype._itemEnteredHandler = () => {};
    }

    _overrideAppSwitcherPopupKeyPressHandler() {
        altTab.AppSwitcherPopup.prototype._keyPressHandler = function (keysym, action) {
            if (action === Meta.KeyBindingAction.SWITCH_GROUP) {
                if (!this._thumbnailsFocused)
                    this._select(this._selectedIndex, 0);
                else
                    this._select(this._selectedIndex, this._nextWindow());
            } else if (action === Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD) {
                this._select(this._selectedIndex, this._previousWindow());
            } else if (action === Meta.KeyBindingAction.SWITCH_APPLICATIONS) {
                this._select(this._next());
            } else if (action === Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD) {
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
            } else if (keysym === Clutter.KEY_q || keysym === Clutter.KEY_Q) {
                this._quitApplication(this._selectedIndex);
            } else if (keysym === Clutter.KEY_Left || keysym === Clutter.KEY_a || keysym === Clutter.KEY_A || keysym === Clutter.KEY_h || keysym === Clutter.KEY_H) {
                this._select(this._previous());
            } else if (keysym === Clutter.KEY_Right || keysym === Clutter.KEY_d || keysym === Clutter.KEY_D || keysym === Clutter.KEY_l || keysym === Clutter.KEY_L) {
                this._select(this._next());
            } else if (keysym === Clutter.KEY_Down || keysym === Clutter.KEY_s || keysym === Clutter.KEY_S || keysym === Clutter.KEY_j || keysym === Clutter.KEY_J) {
                this._select(this._selectedIndex, 0);
            } else {
                return Clutter.EVENT_PROPAGATE;
            }

            return Clutter.EVENT_STOP;
        };
    }

    _overrideWindowSwitcherPopupKeyPressHandler() {
        altTab.WindowSwitcherPopup.prototype._keyPressHandler = function (keysym, action) {
            const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;

            if (action == Meta.KeyBindingAction.SWITCH_WINDOWS)
                this._select(this._next());
            else if (action == Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD)
                this._select(this._previous());
            else if (keysym == Clutter.KEY_Left || keysym === Clutter.KEY_a || keysym === Clutter.KEY_A || keysym === Clutter.KEY_h || keysym === Clutter.KEY_H)
                this._select(rtl ? this._next() : this._previous());
            else if (keysym == Clutter.KEY_Right || keysym === Clutter.KEY_d || keysym === Clutter.KEY_D || keysym === Clutter.KEY_l || keysym === Clutter.KEY_L)
                this._select(rtl ? this._previous() : this._next());
            else if (keysym === Clutter.KEY_w || keysym === Clutter.KEY_W || keysym === Clutter.KEY_F4 || keysym === Clutter.KEY_q || keysym === Clutter.KEY_Q)
                this._closeWindow(this._selectedIndex);
            else
                return Clutter.EVENT_PROPAGATE;

            return Clutter.EVENT_STOP;
        }
    }

    _overrideWindowSwitcherPopupGetWindowList() {
        const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);

        altTab.WindowSwitcherPopup.prototype._getWindowList = function () {
            const workspace = settings.get_boolean('current-workspace-only-window')
                ? global.workspace_manager.get_active_workspace()
                : null;
            const monitor = global.display.get_current_monitor();
            const windows = settings.get_boolean('current-monitor-only-window')
                ? altTab.getWindows(workspace).filter(w => w.get_monitor() === monitor)
                : altTab.getWindows(workspace);

            return windows;
        }
    }
}

function init() {
    return new Extension();
}
