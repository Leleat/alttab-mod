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

const {altTab} = imports.ui;
const {Clutter, Meta} = imports.gi;

class Extension {
    constructor() {
    }

    enable() {
        this.old_keyPressHandler = altTab.AppSwitcherPopup.prototype._keyPressHandler;
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
                if (keysym === Clutter.KEY_Left || keysym === Clutter.KEY_a || keysym === Clutter.KEY_A)
                    this._select(this._selectedIndex, this._previousWindow());
                else if (keysym === Clutter.KEY_Right || keysym === Clutter.KEY_d || keysym === Clutter.KEY_D)
                    this._select(this._selectedIndex, this._nextWindow());
                else if (keysym === Clutter.KEY_Up || keysym === Clutter.KEY_w || keysym === Clutter.KEY_W)
                    this._select(this._selectedIndex, null, true);
                else if (keysym === Clutter.KEY_q || keysym === Clutter.KEY_Q || keysym === Clutter.KEY_F4)
                    this._closeAppWindow(this._selectedIndex, this._currentWindow);
                else
                    return Clutter.EVENT_PROPAGATE;
                    
            } else if (keysym == Clutter.KEY_q || keysym === Clutter.KEY_Q) {
                this._quitApplication(this._selectedIndex);
            } else if (keysym == Clutter.KEY_Left || keysym === Clutter.KEY_a || keysym === Clutter.KEY_A) {
                this._select(this._previous());
            } else if (keysym == Clutter.KEY_Right || keysym === Clutter.KEY_d || keysym === Clutter.KEY_D) {
                this._select(this._next());
            } else if (keysym == Clutter.KEY_Down || keysym === Clutter.KEY_s || keysym === Clutter.KEY_S) {
                this._select(this._selectedIndex, 0);
            } else {
                return Clutter.EVENT_PROPAGATE;
            }
    
            return Clutter.EVENT_STOP;
        }
    }

    disable() {
        altTab.AppSwitcherPopup.prototype._keyPressHandler = this.old_keyPressHandler;
    }
}

function init() {
    return new Extension();
}
