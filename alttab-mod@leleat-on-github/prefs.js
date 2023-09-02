import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AltTabModPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const builder = new Gtk.Builder();
        const {path} = this;

        builder.add_from_file(`${path}/prefs.ui`);

        window.add(builder.get_object('preference-page'));

        this._bindSwitches(builder, settings);
    }

    _bindSwitches(builder, gioSettings) {
        [
            'current-workspace-only',
            'current-monitor-only',
            'current-workspace-only-window',
            'current-monitor-only-window',
            'focus-on-select-window',
            'remove-delay',
            'disable-hover-select',
            'raise-first-instance-only',
        ].forEach(key => {
            gioSettings.bind(
                key,
                builder.get_object(key),
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );
        });
    }
}
