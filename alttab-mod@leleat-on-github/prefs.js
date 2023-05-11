'use strict';

const { Gio, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { ListRow } = Me.imports.src.js.listRow;

function init() {
}

function buildPrefsWidget() {
    return new PrefsWidget();
}

const PrefsWidget = GObject.registerClass({
    GTypeName: 'AltTabModPrefs',
    Template: Gio.File.new_for_path(`${Me.path}/src/ui/prefs.ui`).get_uri(),
    InternalChildren: [
        'current_workspace_only',
        'current_monitor_only',
        'current_workspace_only_window',
        'current_monitor_only_window',
        'remove_delay',
        'disable_hover_select',
        'raise_first_instance_only'
    ]
}, class AltTabModPrefs extends Gtk.Box {
    _init(params) {
        super._init(params);

        this._settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
        this.connect('destroy', () => this._settings.run_dispose());

        // Bind settings to GUI
        this._bindSwitches();
    }

    _onListRowActivated(listBox, row) {
        row.activate();
    }

    _bindSwitches() {
        const settings = [
            'current-workspace-only',
            'current-monitor-only',
            'current-workspace-only-window',
            'current-monitor-only-window',
            'remove-delay',
            'disable-hover-select',
            'raise-first-instance-only'
        ];

        settings.forEach(key => {
            const widget = this[`_${key.replaceAll('-', '_')}`];
            this._settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
        });
    }
});
