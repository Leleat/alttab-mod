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

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {
    Extension,
    InjectionManager,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as AltTab from 'resource:///org/gnome/shell/ui/altTab.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SwitcherPopup from 'resource:///org/gnome/shell/ui/switcherPopup.js';

function primaryModifier(mask) {
    if (mask === 0) {
        return 0;
    }

    let primary = 1;

    while (mask > 1) {
        mask >>= 1;
        primary <<= 1;
    }

    return primary;
}

function getWindows(workspace) {
    const windows = global.display.get_tab_list(
        Meta.TabList.NORMAL_ALL,
        workspace
    );

    return windows
        .map(w => (w.is_attached_dialog() ? w.get_transient_for() : w))
        .filter((w, i, a) => !w.skip_taskbar && a.indexOf(w) === i);
}

/* eslint-disable no-invalid-this */

export default class AltTabModExtension extends Extension {
    enable() {
        const settings = this.getSettings();

        this._injectionManager = new InjectionManager();

        const that = this;
        const appSwitcherPopupInstance = new AltTab.AppSwitcherPopup();
        const AppSwitcherListPrototype =
            appSwitcherPopupInstance._switcherList.constructor.prototype;

        appSwitcherPopupInstance.destroy();

        // AppSwitcher: Include apps from the current workspace or monitor only
        this._watchAndApplySettings(
            settings,
            ['current-workspace-only', 'current-monitor-only'],
            () => {
                if (
                    settings.get_boolean('current-workspace-only') ||
                    settings.get_boolean('current-monitor-only')
                ) {
                    if (this._alreadyOverriddenAppSwitcherInit) {
                        return;
                    }

                    this._alreadyOverriddenAppSwitcherInit = true;
                    this._injectionManager.overrideMethod(
                        AppSwitcherListPrototype,
                        '_init',
                        () => {
                            return function (apps, altTabPopup) {
                                SwitcherPopup.SwitcherList.prototype._init.call(
                                    this,
                                    true
                                );

                                this.icons = [];
                                this._arrows = [];

                                const onlyCurrentMonitor = settings.get_boolean(
                                    'current-monitor-only'
                                );
                                const onlyCurrentWorkspace =
                                    settings.get_boolean(
                                        'current-workspace-only'
                                    );
                                const workspace = onlyCurrentWorkspace
                                    ? global.workspace_manager.get_active_workspace()
                                    : null;
                                const allWindows = global.display.get_tab_list(
                                    Meta.TabList.NORMAL,
                                    workspace
                                );
                                const windowTracker =
                                    Shell.WindowTracker.get_default();

                                // Construct the AppIcons, add to the popup
                                for (let i = 0; i < apps.length; i++) {
                                    const appIcon = new AltTab.AppIcon(apps[i]);
                                    // Cache the window list now; we don't handle dynamic changes here,
                                    // and we don't want to be continually retrieving it
                                    appIcon.cachedWindows = allWindows.filter(
                                        w =>
                                            windowTracker.get_window_app(w) ===
                                                appIcon.app &&
                                            (!onlyCurrentMonitor ||
                                                w.get_monitor() ===
                                                    global.display.get_current_monitor())
                                    );

                                    if (appIcon.cachedWindows.length > 0)
                                        this._addIcon(appIcon);
                                }

                                this._delayedHighlighted = -1;
                                this._altTabPopup = altTabPopup;
                                this._mouseTimeOutId = 0;

                                this.connect(
                                    'destroy',
                                    this._onDestroy.bind(this)
                                );
                            };
                        }
                    );
                } else {
                    this._alreadyOverriddenAppSwitcherInit = false;
                    this._injectionManager.restoreMethod(
                        AppSwitcherListPrototype,
                        '_init'
                    );
                }
            }
        );

        // AppSwitcher: Only raise first instance of an app
        this._watchAndApplySettings(
            settings,
            ['raise-first-instance-only'],
            () => {
                if (settings.get_boolean('raise-first-instance-only')) {
                    this._injectionManager.overrideMethod(
                        AltTab.AppSwitcherPopup.prototype,
                        '_finish',
                        () => {
                            return function (timestamp) {
                                const appIcon =
                                    this._items[this._selectedIndex];

                                if (this._currentWindow < 0) {
                                    Main.activateWindow(
                                        appIcon.cachedWindows[0],
                                        timestamp
                                    );
                                } else if (
                                    appIcon.cachedWindows[this._currentWindow]
                                ) {
                                    Main.activateWindow(
                                        appIcon.cachedWindows[
                                            this._currentWindow
                                        ],
                                        timestamp
                                    );
                                }

                                SwitcherPopup.SwitcherPopup.prototype._finish.call(
                                    this,
                                    timestamp
                                );
                            };
                        }
                    );
                } else {
                    this._injectionManager.restoreMethod(
                        AltTab.AppSwitcherPopup.prototype,
                        '_finish'
                    );
                }
            }
        );

        // AppSwitcher: WASD and hjkl navigation + Q only quits current window
        this._injectionManager.overrideMethod(
            AltTab.AppSwitcherPopup.prototype,
            '_keyPressHandler',
            () => {
                return function (keysym, action) {
                    if (action === Meta.KeyBindingAction.SWITCH_GROUP) {
                        if (!this._thumbnailsFocused)
                            this._select(this._selectedIndex, 0);
                        else
                            this._select(
                                this._selectedIndex,
                                this._nextWindow()
                            );
                    } else if (
                        action === Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD
                    ) {
                        this._select(
                            this._selectedIndex,
                            this._previousWindow()
                        );
                    } else if (
                        action === Meta.KeyBindingAction.SWITCH_APPLICATIONS
                    ) {
                        this._select(this._next());
                    } else if (
                        action ===
                        Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD
                    ) {
                        this._select(this._previous());
                    } else if (this._thumbnailsFocused) {
                        if (
                            keysym === Clutter.KEY_Left ||
                            keysym === Clutter.KEY_a ||
                            keysym === Clutter.KEY_A ||
                            keysym === Clutter.KEY_h ||
                            keysym === Clutter.KEY_H
                        )
                            this._select(
                                this._selectedIndex,
                                this._previousWindow()
                            );
                        else if (
                            keysym === Clutter.KEY_Right ||
                            keysym === Clutter.KEY_d ||
                            keysym === Clutter.KEY_D ||
                            keysym === Clutter.KEY_l ||
                            keysym === Clutter.KEY_L
                        )
                            this._select(
                                this._selectedIndex,
                                this._nextWindow()
                            );
                        else if (
                            keysym === Clutter.KEY_Up ||
                            keysym === Clutter.KEY_w ||
                            keysym === Clutter.KEY_W ||
                            keysym === Clutter.KEY_k ||
                            keysym === Clutter.KEY_K
                        )
                            this._select(this._selectedIndex, null, true);
                        else if (
                            keysym === Clutter.KEY_q ||
                            keysym === Clutter.KEY_Q ||
                            keysym === Clutter.KEY_F4
                        )
                            this._closeAppWindow(
                                this._selectedIndex,
                                this._currentWindow
                            );
                        else return Clutter.EVENT_PROPAGATE;
                    } else if (
                        keysym === Clutter.KEY_q ||
                        keysym === Clutter.KEY_Q
                    ) {
                        this._quitApplication(this._selectedIndex);
                    } else if (
                        keysym === Clutter.KEY_Left ||
                        keysym === Clutter.KEY_a ||
                        keysym === Clutter.KEY_A ||
                        keysym === Clutter.KEY_h ||
                        keysym === Clutter.KEY_H
                    ) {
                        this._select(this._previous());
                    } else if (
                        keysym === Clutter.KEY_Right ||
                        keysym === Clutter.KEY_d ||
                        keysym === Clutter.KEY_D ||
                        keysym === Clutter.KEY_l ||
                        keysym === Clutter.KEY_L
                    ) {
                        this._select(this._next());
                    } else if (
                        keysym === Clutter.KEY_Down ||
                        keysym === Clutter.KEY_s ||
                        keysym === Clutter.KEY_S ||
                        keysym === Clutter.KEY_j ||
                        keysym === Clutter.KEY_J
                    ) {
                        this._select(this._selectedIndex, 0);
                    } else {
                        return Clutter.EVENT_PROPAGATE;
                    }

                    return Clutter.EVENT_STOP;
                };
            }
        );

        // AppSwitcher/WindowSwitcher: Set hover selection
        this._watchAndApplySettings(settings, ['disable-hover-select'], () => {
            if (settings.get_boolean('disable-hover-select')) {
                this._injectionManager.overrideMethod(
                    AltTab.AppSwitcherPopup.prototype,
                    '_itemEnteredHandler',
                    () => function () {}
                );
                this._injectionManager.overrideMethod(
                    AltTab.WindowSwitcherPopup.prototype,
                    '_itemEnteredHandler',
                    () => function () {}
                );
            } else {
                this._injectionManager.restoreMethod(
                    AltTab.AppSwitcherPopup.prototype,
                    '_itemEnteredHandler'
                );
                this._injectionManager.restoreMethod(
                    AltTab.WindowSwitcherPopup.prototype,
                    '_itemEnteredHandler'
                );
            }
        });

        // WindowSwitcher: Set focus window on select
        this._watchAndApplySettings(
            settings,
            ['focus-on-select-window'],
            () => {
                if (settings.get_boolean('focus-on-select-window')) {
                    this._injectionManager.overrideMethod(
                        AltTab.WindowSwitcherPopup.prototype,
                        '_select',
                        () => {
                            return function (num) {
                                this._selectedIndex = num;
                                this._switcherList.highlight(num);
                                Main.activateWindow(
                                    this._items[this._selectedIndex].window
                                );
                            };
                        }
                    );
                } else {
                    this._injectionManager.restoreMethod(
                        AltTab.WindowSwitcherPopup.prototype,
                        '_select'
                    );
                }
            }
        );

        // WindowSwitcher: WASD/hjkl navigation + Q only quits current window
        this._injectionManager.overrideMethod(
            AltTab.WindowSwitcherPopup.prototype,
            '_keyPressHandler',
            () => {
                return function (keysym, action) {
                    const rtl =
                        Clutter.get_default_text_direction() ===
                        Clutter.TextDirection.RTL;

                    if (action === Meta.KeyBindingAction.SWITCH_WINDOWS)
                        this._select(this._next());
                    else if (
                        action === Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD
                    )
                        this._select(this._previous());
                    else if (
                        keysym === Clutter.KEY_Left ||
                        keysym === Clutter.KEY_a ||
                        keysym === Clutter.KEY_A ||
                        keysym === Clutter.KEY_h ||
                        keysym === Clutter.KEY_H
                    )
                        this._select(rtl ? this._next() : this._previous());
                    else if (
                        keysym === Clutter.KEY_Right ||
                        keysym === Clutter.KEY_d ||
                        keysym === Clutter.KEY_D ||
                        keysym === Clutter.KEY_l ||
                        keysym === Clutter.KEY_L
                    )
                        this._select(rtl ? this._previous() : this._next());
                    else if (
                        keysym === Clutter.KEY_w ||
                        keysym === Clutter.KEY_W ||
                        keysym === Clutter.KEY_F4 ||
                        keysym === Clutter.KEY_q ||
                        keysym === Clutter.KEY_Q
                    )
                        this._closeWindow(this._selectedIndex);
                    else return Clutter.EVENT_PROPAGATE;

                    return Clutter.EVENT_STOP;
                };
            }
        );

        // WindowSwitcher: Maybe include windows from current monitor only
        this._injectionManager.overrideMethod(
            AltTab.WindowSwitcherPopup.prototype,
            '_getWindowList',
            () => {
                return function () {
                    const monitor = global.display.get_current_monitor();
                    const workspace = settings.get_boolean(
                        'current-workspace-only-window'
                    )
                        ? global.workspace_manager.get_active_workspace()
                        : null;
                    const windows = settings.get_boolean(
                        'current-monitor-only-window'
                    )
                        ? getWindows(workspace).filter(
                              w => w.get_monitor() === monitor
                          )
                        : getWindows(workspace);

                    return windows;
                };
            }
        );

        // SwitcherPopup: Override delayed appearance
        // (Basically copy-paste from switcherPopup.js except for switching
        // out the timer duration)
        this._injectionManager.overrideMethod(
            SwitcherPopup.SwitcherPopup.prototype,
            'show',
            () => {
                return function (backward, binding, mask) {
                    if (this._items.length === 0) {
                        return false;
                    }

                    const grab = Main.pushModal(this);
                    // We expect at least a keyboard grab here
                    if (
                        (grab.get_seat_state() & Clutter.GrabState.KEYBOARD) ===
                        0
                    ) {
                        Main.popModal(grab);
                        return false;
                    }
                    this._grab = grab;
                    this._haveModal = true;
                    this._modifierMask = primaryModifier(mask);

                    this.add_child(this._switcherList);
                    this._switcherList.connect(
                        'item-activated',
                        this._itemActivated.bind(this)
                    );
                    this._switcherList.connect(
                        'item-entered',
                        this._itemEntered.bind(this)
                    );
                    this._switcherList.connect(
                        'item-removed',
                        this._itemRemoved.bind(this)
                    );

                    // Need to force an allocation so we can figure out whether we
                    // need to scroll when selecting
                    this.opacity = 0;
                    this.visible = true;
                    this.get_allocation_box();

                    this._initialSelection(backward, binding);

                    // There's a race condition; if the user released Alt before
                    // we got the grab, then we won't be notified. (See
                    // https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
                    // details.) So we check now. (Have to do this after updating
                    // selection.)
                    if (this._modifierMask) {
                        const [, , mods] = global.get_pointer();
                        if (!(mods & this._modifierMask)) {
                            this._finish(global.get_current_time());
                            return true;
                        }
                    } else {
                        this._resetNoModsTimeout();
                    }

                    // We delay showing the popup so that fast Alt+Tab users aren't
                    // disturbed by the popup briefly flashing.
                    this._initialDelayTimeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        settings.get_boolean('remove-delay') ? 0 : 150,
                        () => {
                            this._showImmediately();
                            that._timer = 0;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                    GLib.Source.set_name_by_id(
                        this._initialDelayTimeoutId,
                        '[gnome-shell] Main.osdWindow.cancel'
                    );

                    that._timer = this._initialDelayTimeoutId;
                    that._switcherPopup = this;
                    this.connect('destroy', () => {
                        that._switcherPopup = null;

                        if (that._timer) {
                            GLib.source_remove(that._timer);
                            that._timer = 0;
                        }
                    });

                    return true;
                };
            }
        );
    }

    disable() {
        this._injectionManager.clear();
        this._injectionManager = null;

        // Also removes all timers etc.
        this._switcherPopup?.destroy();
        this._switcherPopup = null;

        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
    }

    _watchAndApplySettings(settings, keys, fn) {
        keys.forEach(key => settings.connect(`changed::${key}`, () => fn()));
        fn();
    }
}
